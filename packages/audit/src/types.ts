import type { ActorType, AuditResult, RiskLevel } from '@edrion/shared-types';

/**
 * The audit contract. Every state-changing action in the platform produces one of these.
 * Construction is centralised so no field (actor, institution, support session, before/after,
 * correlation ids, AI involvement) is ever silently dropped.
 */
export interface AuditEventInput {
  actorType: ActorType;
  actorId?: string;
  actorName?: string;
  actorRole?: string;

  institutionId?: string;
  institutionName?: string;
  campusId?: string;
  supportSessionId?: string;
  caseRef?: string;

  action: string;
  module: string;
  entityType?: string;
  entityId?: string;

  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  reason?: string;

  result?: AuditResult;
  riskLevel?: RiskLevel;
  errorDetail?: string;

  ip?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  apiEndpoint?: string;

  aiInvolved?: boolean;
  aiRunId?: string;
  confirmation?: Record<string, unknown>;
}

export interface SecurityEventInput {
  eventType: string;
  actorType: ActorType;
  actorId?: string;
  institutionId?: string;
  riskLevel?: RiskLevel;
  ip?: string;
  userAgent?: string;
  detail?: Record<string, unknown>;
  flagged?: boolean;
}

export interface ActivityEventInput {
  category: string;
  summary: string;
  actorName?: string;
  institutionId?: string;
  entityType?: string;
  entityId?: string;
  riskLevel?: RiskLevel;
  metadata?: Record<string, unknown>;
}
