import { ActorType } from '@edrion/shared-types';
import type { AuditEventInput } from '@edrion/audit';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import type { EdrionRequestContext } from '../../common/request-context';

/**
 * Everything a portal service needs to author an audit event for the current tenant request.
 * The portal equivalent of the platform `ActionContext`: the actor is an INSTITUTION user (not an
 * Edrion employee), and the active scope rides along so the event records which campus it touched.
 */
export interface PortalActionContext {
  principal: InstitutionPrincipal;
  scope: InstitutionScope;
  request: EdrionRequestContext;
}

/**
 * Build the common audit fields (actor, institution, request correlation) for an
 * institution-portal action. The actor is always `institution_user`; the institution is taken
 * from the principal (never the request body) so an event can never be misattributed.
 */
export function basePortalAudit(ctx: PortalActionContext): Partial<AuditEventInput> {
  return {
    actorType: ActorType.InstitutionUser,
    actorId: ctx.principal.institutionUserId,
    actorName: ctx.principal.fullName,
    actorRole: ctx.principal.roleKeys[0],
    institutionId: ctx.principal.institutionId,
    ip: ctx.request.ip,
    userAgent: ctx.request.userAgent,
    requestId: ctx.request.requestId,
    correlationId: ctx.request.correlationId,
    apiEndpoint: ctx.request.apiEndpoint,
  };
}
