import { Inject, Injectable } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import { AiMode, FeatureScope } from '@edrion/shared-types';import {
  resolveStudentTutorPolicy,
  type ResolvedStudentTutorPolicy,
  type StudentTutorPolicyInput,
} from '@edrion/copilot';
import { learnPolicyV1Schema, type LearnPolicyV1 } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class StudentTutorPolicyService {
  private cache: { key: string; policy: ResolvedStudentTutorPolicy; at: number } | null = null;
  private readonly ttlMs = 30_000;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(principal: StudentPrincipal): Promise<LearnPolicyV1> {
    const context = {
      institutionId: principal.kind === 'institutional' ? principal.institutionId : null,
      independentUserId: principal.kind === 'independent' ? principal.independentUserId : null,
      institutionUserId: principal.kind === 'institutional' ? principal.studentId : null,
    };
    const cacheKey = JSON.stringify(context);
    const now = Date.now();
    if (this.cache && this.cache.key === cacheKey && now - this.cache.at < this.ttlMs) {
      const cached = this.cache.policy;
      if (!cached.kill_switch) return this.toLearnPolicyV1(cached);
    }

    const rows = await this.db.select().from(schema.aiPolicies).where(eq(schema.aiPolicies.policyDomain, 'student_tutor'));
    const policies: StudentTutorPolicyInput[] = rows.map((r) => ({
      scope: r.scope as FeatureScope,
      scopeId: r.scopeId,
      enabled: r.enabled,
      mode: r.mode as AiMode,
      killSwitch: r.killSwitch,
      domainConfig: r.domainConfig ?? {},
      policyDomain: 'student_tutor',
      setAt: r.updatedAt,
      setByName: r.setByName,
    }));

    const resolved = resolveStudentTutorPolicy(policies, context);
    if (!resolved.kill_switch) {
      this.cache = { key: cacheKey, policy: resolved, at: now };
    } else {
      this.cache = null;
    }
    return this.toLearnPolicyV1(resolved);
  }

  private toLearnPolicyV1(resolved: ResolvedStudentTutorPolicy): LearnPolicyV1 {
    return learnPolicyV1Schema.parse({
      v: 1,
      curriculum_bounds: resolved.curriculum_bounds,
      answer_directness: resolved.answer_directness,
      session_visibility: resolved.session_visibility,
      effective_mode: resolved.effective_mode,
      resolved_layers: resolved.resolved_layers,
      version: resolved.version,
    });
  }
}
