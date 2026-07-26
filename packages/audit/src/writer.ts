import { AuditResult, RiskLevel } from '@edrion/shared-types';
import type { Database } from '@edrion/database';
import { schema } from '@edrion/database';
import { classifyRisk } from './risk';
import type { ActivityEventInput, AuditEventInput, SecurityEventInput } from './types';

/**
 * The single writer for append-only records. All audit/security/activity inserts go through
 * here — never a raw table write elsewhere. The DB additionally blocks UPDATE/DELETE on these
 * tables (see migrations/sql/zzz_grants.sql), so this is the only legitimate mutation path.
 */
export class AuditWriter {
  constructor(private readonly db: Database) {}

  /** Write an audit event, deriving risk from the action when not supplied. */
  async logAudit(input: AuditEventInput): Promise<void> {
    await this.db.insert(schema.auditEvents).values({
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      actorRole: input.actorRole ?? null,
      institutionId: input.institutionId ?? null,
      institutionName: input.institutionName ?? null,
      campusId: input.campusId ?? null,
      supportSessionId: input.supportSessionId ?? null,
      caseRef: input.caseRef ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      previousState: input.previousState ?? null,
      newState: input.newState ?? null,
      reason: input.reason ?? null,
      result: input.result ?? AuditResult.Success,
      riskLevel: input.riskLevel ?? classifyRisk(input.action),
      errorDetail: input.errorDetail ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      correlationId: input.correlationId ?? null,
      apiEndpoint: input.apiEndpoint ?? null,
      aiInvolved: input.aiInvolved ?? false,
      aiRunId: input.aiRunId ?? null,
      confirmation: input.confirmation ?? null,
    });
  }

  async logSecurity(input: SecurityEventInput): Promise<void> {
    await this.db.insert(schema.securityEvents).values({
      eventType: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      institutionId: input.institutionId ?? null,
      riskLevel: input.riskLevel ?? RiskLevel.Low,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      detail: input.detail ?? null,
      flagged: input.flagged ?? false,
    });
  }

  async logActivity(input: ActivityEventInput): Promise<void> {
    await this.db.insert(schema.activityEvents).values({
      category: input.category,
      summary: input.summary,
      actorName: input.actorName ?? null,
      institutionId: input.institutionId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      riskLevel: input.riskLevel ?? RiskLevel.Low,
      metadata: input.metadata ?? null,
    });
  }
}

export function createAuditWriter(db: Database): AuditWriter {
  return new AuditWriter(db);
}
