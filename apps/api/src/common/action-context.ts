import { ActorType } from '@edrion/shared-types';
import type { AuditEventInput } from '@edrion/audit';
import type { PrincipalContext } from '@edrion/auth';
import type { EdrionRequestContext } from './request-context';

/** Everything a service needs to authoring an audit event for the current request. */
export interface ActionContext {
  principalContext: PrincipalContext;
  request: EdrionRequestContext;
  /**
   * Present when an AI-confirmed action is dispatched through the SAME audited service a human
   * uses. Every audit event written under this context carries `aiInvolved: true` + the run id —
   * the AI cannot reach the service without it being recorded (docs/AI-GUARDRAILS.md).
   */
  ai?: { aiRunId: string };
}

/** Build the common audit fields (actor, ids, support session, AI involvement) from the request. */
export function baseAudit(ctx: ActionContext): Partial<AuditEventInput> {
  const { principal, support } = ctx.principalContext;
  return {
    actorType: ActorType.PlatformEmployee,
    actorId: principal.employeeId,
    actorName: principal.fullName,
    actorRole: principal.roleKeys[0],
    supportSessionId: support?.sessionId,
    caseRef: support?.caseRef,
    institutionId: support?.institutionId,
    ip: ctx.request.ip,
    userAgent: ctx.request.userAgent,
    requestId: ctx.request.requestId,
    correlationId: ctx.request.correlationId,
    apiEndpoint: ctx.request.apiEndpoint,
    aiInvolved: ctx.ai ? true : undefined,
    aiRunId: ctx.ai?.aiRunId,
  };
}
