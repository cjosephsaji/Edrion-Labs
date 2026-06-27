import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AiResolutionContext } from '@edrion/copilot';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { RedisService } from '../../common/redis/redis.service';
import { AiGovernanceService } from '../ai-governance/ai-governance.service';

const DAY_TTL_SECONDS = 24 * 60 * 60;

function dayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
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

  private limited(message: string): HttpException {
    return new HttpException({ code: 'AI_RATE_LIMITED', message }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
