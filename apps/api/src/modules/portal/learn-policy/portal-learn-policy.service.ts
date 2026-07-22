import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AiMode, ActorType, AuditResult, FeatureScope, RiskLevel } from '@edrion/shared-types';
import type { AuditWriter } from '@edrion/audit';
import { and, eq, schema, type Database } from '@edrion/database';
import {
  DEFAULT_LEARN_POLICY_V1,
  portalLearnPolicyDtoSchema,
  upsertPortalLearnPolicySchema,
  type PortalLearnPolicyDto,
} from '@edrion/schemas';
import { resolveStudentTutorPolicy } from '@edrion/copilot';
import { AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';

const MODULE = 'learn_policy';

@Injectable()
export class PortalLearnPolicyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async get(institutionId: string): Promise<PortalLearnPolicyDto> {
    const [row] = await this.db
      .select()
      .from(schema.aiPolicies)
      .where(
        and(
          eq(schema.aiPolicies.scope, FeatureScope.Institution),
          eq(schema.aiPolicies.scopeId, institutionId),
          eq(schema.aiPolicies.policyDomain, 'student_tutor'),
        ),
      )
      .limit(1);

    const domain = row?.domainConfig ?? {};
    const preview = resolveStudentTutorPolicy(
      row
        ? [
            {
              scope: FeatureScope.Institution,
              scopeId: institutionId,
              enabled: row.enabled,
              mode: row.mode as AiMode,
              killSwitch: row.killSwitch,
              policyDomain: 'student_tutor',
              domainConfig: domain,
              setAt: row.updatedAt,
            },
          ]
        : [],
      { institutionId },
    );

    return portalLearnPolicyDtoSchema.parse({
      id: row?.id,
      curriculum_bounds: (domain.curriculum_bounds as string) ?? DEFAULT_LEARN_POLICY_V1.curriculum_bounds,
      answer_directness: (domain.answer_directness as string) ?? DEFAULT_LEARN_POLICY_V1.answer_directness,
      session_visibility: (domain.session_visibility as string) ?? DEFAULT_LEARN_POLICY_V1.session_visibility,
      enabled: row?.enabled ?? true,
      killSwitch: row?.killSwitch ?? false,
      version: row?.version ?? 0,
      effectivePreview: {
        curriculum_bounds: preview.curriculum_bounds,
        answer_directness: preview.answer_directness,
        session_visibility: preview.session_visibility,
        effective_mode: preview.effective_mode,
      },
    });
  }

  async upsert(ctx: PortalActionContext, raw: unknown): Promise<PortalLearnPolicyDto> {
    const institutionId = ctx.principal.institutionId;
    const input = upsertPortalLearnPolicySchema.parse(raw);
    const domainConfig = {
      curriculum_bounds: input.curriculum_bounds,
      answer_directness: input.answer_directness,
      session_visibility: input.session_visibility,
    };

    const [existing] = await this.db
      .select()
      .from(schema.aiPolicies)
      .where(
        and(
          eq(schema.aiPolicies.scope, FeatureScope.Institution),
          eq(schema.aiPolicies.scopeId, institutionId),
          eq(schema.aiPolicies.policyDomain, 'student_tutor'),
        ),
      )
      .limit(1);

    if (existing && input.version != null && input.version !== existing.version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Policy changed — refresh and retry.' });
    }

    const values = {
      enabled: input.enabled,
      mode: input.enabled ? AiMode.Full : AiMode.Disabled,
      killSwitch: input.killSwitch,
      domainConfig,
      reason: input.reason,
      setByName: ctx.principal.fullName,
      updatedBy: ctx.principal.institutionUserId,
      policyDomain: 'student_tutor' as const,
    };

    if (existing) {
      await this.db
        .update(schema.aiPolicies)
        .set({ ...values, version: existing.version + 1, updatedAt: new Date() })
        .where(eq(schema.aiPolicies.id, existing.id));
    } else {
      await this.db.insert(schema.aiPolicies).values({
        scope: FeatureScope.Institution,
        scopeId: institutionId,
        ...values,
        createdBy: ctx.principal.institutionUserId,
      });
    }

    const result = await this.get(institutionId);
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'learn_policy.upsert',
      module: MODULE,
      entityType: 'ai_policy',
      entityId: result.id ?? institutionId,
      result: AuditResult.Success,
      riskLevel: input.killSwitch ? RiskLevel.High : RiskLevel.Medium,
      newState: {
        curriculum_bounds: input.curriculum_bounds,
        answer_directness: input.answer_directness,
        session_visibility: input.session_visibility,
        enabled: input.enabled,
        killSwitch: input.killSwitch,
      },
    });

    return result;
  }
}
