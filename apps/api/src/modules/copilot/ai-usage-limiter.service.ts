import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AiResolutionContext } from '@edrion/copilot';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { RedisService } from '../../common/redis/redis.service';
import { AiGovernanceService } from '../ai-governance/ai-governance.service';
import type { StudentPrincipal } from '../student/student.types';

const DAY_TTL_SECONDS = 24 * 60 * 60;

export type StudentAiScope = keyof ApiEnv['AI_STUDENT_SCOPE_LIMITS_JSON'];

export interface StudentQuotaState {
  limit: number;
  used: number;
  remaining: number;
  resets_at: string;
}

export interface StudentQuotaAcquireResult extends StudentQuotaState {
  enforced: boolean;
}

function dayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

function utcMidnightPlusHour(now = new Date()): string {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 1, 0, 0));
  return reset.toISOString();
}

function ttlUntilResetSeconds(now = new Date()): number {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 1, 0, 0));
  return Math.max(60, Math.ceil((reset.getTime() - now.getTime()) / 1000) + 3600);
}

export function studentSubjectKey(principal: StudentPrincipal): string {
  return principal.kind === 'institutional'
    ? `student:${principal.studentId}`
    : `independent:${principal.independentUserId}`;
}

/**
 * Enforces AI usage limits — the rate/usage ceiling deferred in 9b. Two daily counters in Redis:
 * one per employee and one per resolved policy scope. Limits come from the effective `ai_policies`
 * row (`maxRunsPerEmployeePerDay` / `maxRunsPerDay`) and fall back to env defaults. Fail-open when
 * Redis is unavailable or the feature is disabled. A breach is a 429 `AI_RATE_LIMITED` — the AI
 * cannot create a run past its budget, and a human hitting the same path is throttled identically.
 */
@Injectable()
export class AiUsageLimiter {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly redis: RedisService,
    private readonly aiGov: AiGovernanceService,
  ) {}

  async check(employeeId: string, context: AiResolutionContext): Promise<void> {
    if (!this.env.AI_RATE_LIMIT_ENABLED || !this.redis.enabled) return;

    const policy = await this.aiGov.effectivePolicy(context);
    const empLimit = policy.maxRunsPerEmployeePerDay ?? this.env.AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY;
    const scopeLimit = policy.maxRunsPerDay ?? this.env.AI_MAX_RUNS_PER_SCOPE_PER_DAY;
    const day = dayBucket();
    const scopeKey = `${policy.modeScope}:${policy.modeScopeId ?? 'global'}`;

    const empCount = await this.redis.incrementWindow(`ai:emp:${employeeId}:${day}`, DAY_TTL_SECONDS);
    if (empCount !== null && empCount > empLimit) {
      throw this.limited(`Daily AI usage limit reached (${empLimit} runs/employee).`);
    }

    const scopeCount = await this.redis.incrementWindow(`ai:scope:${scopeKey}:${day}`, DAY_TTL_SECONDS);
    if (scopeCount !== null && scopeCount > scopeLimit) {
      throw this.limited(`Daily AI usage limit reached for this scope (${scopeLimit} runs).`);
    }
  }

  /** Read-only student quota peek — does not increment counters. */
  async peekStudent(principal: StudentPrincipal): Promise<Record<string, StudentQuotaState>> {
    const limits = this.env.AI_STUDENT_SCOPE_LIMITS_JSON;
    const resetsAt = utcMidnightPlusHour();
    const subject = studentSubjectKey(principal);
    const day = dayBucket();
    const globalKey = `ai:student:${subject}:${day}`;
    const globalUsed = (await this.redis.getInt(globalKey)) ?? 0;
    const globalLimit = this.env.AI_MAX_RUNS_PER_STUDENT_PER_DAY;

    const scopes: Record<string, StudentQuotaState> = {};
    for (const [scope, limit] of Object.entries(limits)) {
      const scopeUsed = (await this.redis.getInt(`ai:student-scope:${subject}:${scope}:${day}`)) ?? 0;
      const effectiveUsed = Math.max(scopeUsed, globalUsed > globalLimit ? globalLimit : 0);
      const used = Math.min(scopeUsed, limit);
      const remaining = Math.max(0, Math.min(limit - used, globalLimit - globalUsed));
      scopes[scope] = {
        limit,
        used,
        remaining,
        resets_at: resetsAt,
      };
      void effectiveUsed;
    }
    return scopes;
  }

  /**
   * Acquire one student AI call against global + scope ceilings. Idempotent on `idempotencyKey`.
   * Fail-open when Redis is disabled/unavailable.
   */
  async acquireStudentCall(
    principal: StudentPrincipal,
    scope: StudentAiScope,
    idempotencyKey: string,
  ): Promise<StudentQuotaAcquireResult> {
    const limits = this.env.AI_STUDENT_SCOPE_LIMITS_JSON;
    const scopeLimit = limits[scope] ?? 0;
    const globalLimit = this.env.AI_MAX_RUNS_PER_STUDENT_PER_DAY;
    const resetsAt = utcMidnightPlusHour();
    const ttl = ttlUntilResetSeconds();
    const subject = studentSubjectKey(principal);
    const day = dayBucket();
    const globalKey = `ai:student:${subject}:${day}`;
    const scopeKey = `ai:student-scope:${subject}:${scope}:${day}`;
    const idemKey = `ai:student-call:${idempotencyKey}`;

    if (!this.redis.enabled) {
      return {
        limit: scopeLimit,
        used: 0,
        remaining: scopeLimit,
        resets_at: resetsAt,
        enforced: false,
      };
    }

    const result = await this.redis.acquireStudentQuota({
      globalKey,
      scopeKey,
      idempotencyKey: idemKey,
      globalLimit,
      scopeLimit,
      ttlSeconds: ttl,
    });

    if (!result) {
      return {
        limit: scopeLimit,
        used: 0,
        remaining: scopeLimit,
        resets_at: resetsAt,
        enforced: false,
      };
    }

    if (!result.allowed) {
      throw new HttpException(
        {
          code: 'AI_LIMIT_REACHED',
          message: 'Daily AI limit reached for this action.',
          meta: {
            scope,
            limit: scopeLimit,
            used: result.scopeUsed,
            remaining: 0,
            resetsAt,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      limit: scopeLimit,
      used: result.scopeUsed,
      remaining: Math.max(0, scopeLimit - result.scopeUsed),
      resets_at: resetsAt,
      enforced: true,
    };
  }

  private limited(message: string): HttpException {
    return new HttpException({ code: 'AI_RATE_LIMITED', message }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
