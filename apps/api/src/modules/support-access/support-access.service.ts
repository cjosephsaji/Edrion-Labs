import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ActorType, RiskLevel } from '@edrion/shared-types';
import {
  computeExpiry,
  computeExtendedExpiry,
  isSessionExpired,
  type EndSupportSessionInput,
  type ExtendSupportSessionInput,
  type ListSupportSessionsQuery,
  type StartSupportSessionInput,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { SupportAccessSession } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { SupportAccessRepository, type SupportSessionRow } from './support-access.repository';

const MODULE = 'support-access';
const ENTITY = 'support_access_session';
const SWEEP_INTERVAL_MS = 60_000;

/** Institution states in which a support employee may not enter the portal. */
const BLOCKED_INSTITUTION_STATUSES = new Set(['archived']);

@Injectable()
export class SupportAccessService implements OnApplicationBootstrap, OnModuleDestroy {
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly repo: SupportAccessRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Background expiry sweep -------------------------------------------------

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SUPPORT_SWEEP === '1') return;
    // Phase 10e: when the queue framework is on, the tracked `support-session.expiry` job owns
    // this sweep. Fall back to the in-process timer only when queues are disabled.
    const queuesOn =
      process.env.REDIS_ENABLED !== 'false' && process.env.QUEUE_WORKERS_ENABLED !== 'false';
    if (queuesOn) return;
    this.sweepTimer = setInterval(() => {
      void this.sweepExpired().catch(() => undefined);
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** Mark every live session past its hard expiry as `expired` and audit each transition. */
  async sweepExpired(now: Date = new Date()): Promise<number> {
    const lapsed = await this.repo.findLapsed(now);
    for (const session of lapsed) {
      await this.repo.update(session.id, { status: 'expired', endedAt: now });
      await this.audit.logAudit(this.systemLifecycleAudit(session, 'support_access.expired'));
    }
    return lapsed.length;
  }

  // --- Reads -------------------------------------------------------------------

  list(q: ListSupportSessionsQuery) {
    return this.repo.list(q);
  }

  async get(id: string): Promise<SupportSessionRow> {
    const session = await this.repo.findById(id);
    if (!session) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Support session not found' });
    }
    return session;
  }

  // --- Lifecycle ---------------------------------------------------------------

  /**
   * Enter an institution portal. Self-service request → approve → start collapsed into one
   * audited action: the employee holds the sensitive `institutions.access_portal` permission
   * (recent-auth enforced by the guard) and acts as themselves. Writes the full lifecycle
   * trail (requested, approved, started) so platform- and portal-side activity correlate.
   */
  async start(input: StartSupportSessionInput, ctx: ActionContext): Promise<SupportSessionRow> {
    const institution = await this.repo.findInstitution(input.institutionId);
    if (!institution) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution not found' });
    }
    if (BLOCKED_INSTITUTION_STATUSES.has(institution.status)) {
      throw new BadRequestException({
        code: 'INSTITUTION_NOT_ACCESSIBLE',
        message: `Cannot start a support session for an ${institution.status} institution`,
      });
    }

    const now = new Date();
    const expiresAt = computeExpiry(now, input.durationMinutes);
    const { principal } = ctx.principalContext;

    const session = await this.repo.insert({
      institutionId: input.institutionId,
      employeeId: principal.employeeId,
      employeeName: principal.fullName,
      employeeRole: principal.roleKeys[0] ?? null,
      accessLevel: input.accessLevel,
      reason: input.reason,
      caseRef: input.caseRef ?? null,
      campusId: input.campusId ?? null,
      status: 'active',
      riskLevel: RiskLevel.High,
      requestedAt: now,
      approvedAt: now,
      startedAt: now,
      expiresAt,
      durationMinutes: input.durationMinutes,
      ip: ctx.request.ip ?? null,
      userAgent: ctx.request.userAgent ?? null,
    });

    await this.lifecycleAudit(ctx, session, institution.displayName, 'support_access.requested', {
      riskLevel: RiskLevel.Low,
      newState: { accessLevel: session.accessLevel, durationMinutes: session.durationMinutes },
    });
    await this.lifecycleAudit(ctx, session, institution.displayName, 'support_access.approved', {
      riskLevel: RiskLevel.Medium,
    });
    await this.lifecycleAudit(ctx, session, institution.displayName, 'support_access.start', {
      reason: session.reason,
      newState: { status: session.status, expiresAt: session.expiresAt },
    });

    return { ...session, institutionName: institution.displayName };
  }

  /** Audited "the portal was actually opened" marker, fired when the banner mounts. */
  async portalEntered(id: string, ctx: ActionContext): Promise<SupportSessionRow> {
    const session = await this.getActive(id, ctx);
    await this.lifecycleAudit(
      ctx,
      session,
      session.institutionName,
      'support_access.portal_entered',
      { riskLevel: RiskLevel.Low },
    );
    return session;
  }

  async extend(
    id: string,
    input: ExtendSupportSessionInput,
    ctx: ActionContext,
  ): Promise<SupportSessionRow> {
    const session = await this.getActive(id, ctx);
    const newExpiresAt = computeExtendedExpiry(session.expiresAt, input.addMinutes);
    const updated = await this.repo.update(id, {
      expiresAt: newExpiresAt,
      durationMinutes: session.durationMinutes + input.addMinutes,
    });
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session vanished' });

    await this.lifecycleAudit(ctx, session, session.institutionName, 'support_access.extended', {
      reason: input.reason,
      previousState: { expiresAt: session.expiresAt },
      newState: { expiresAt: newExpiresAt },
    });
    return { ...updated, institutionName: session.institutionName };
  }

  async end(
    id: string,
    input: EndSupportSessionInput,
    ctx: ActionContext,
  ): Promise<SupportSessionRow> {
    const session = await this.get(id);
    if (session.status === 'ended' || session.status === 'expired') return session;
    if (session.employeeId !== ctx.principalContext.principal.employeeId) {
      throw new ConflictException({
        code: 'NOT_SESSION_OWNER',
        message: 'Only the employee who opened a session can end it',
      });
    }
    const now = new Date();
    const updated = await this.repo.update(id, { status: 'ended', endedAt: now });
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session vanished' });

    await this.lifecycleAudit(ctx, session, session.institutionName, 'support_access.ended', {
      reason: input.reason,
      previousState: { status: session.status },
      newState: { status: 'ended' },
    });
    return { ...updated, institutionName: session.institutionName };
  }

  // --- Helpers -----------------------------------------------------------------

  /** Fetch a session that must be live + owned by the caller, rejecting lapsed/foreign ones. */
  private async getActive(id: string, ctx: ActionContext): Promise<SupportSessionRow> {
    const session = await this.get(id);
    if (session.employeeId !== ctx.principalContext.principal.employeeId) {
      throw new ConflictException({
        code: 'NOT_SESSION_OWNER',
        message: 'This support session belongs to another employee',
      });
    }
    if (session.status !== 'active' || isSessionExpired(session.expiresAt)) {
      throw new ConflictException({
        code: 'SESSION_NOT_ACTIVE',
        message: 'This support session is no longer active',
      });
    }
    return session;
  }

  /** Build a lifecycle audit event stamped with the session, institution and case ref. */
  private async lifecycleAudit(
    ctx: ActionContext,
    session: SupportAccessSession,
    institutionName: string | null,
    action: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: session.id,
      institutionId: session.institutionId,
      institutionName: institutionName ?? undefined,
      supportSessionId: session.id,
      caseRef: session.caseRef ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  /** System-actor audit for sweeps — no request context (a timer, not an employee). */
  private systemLifecycleAudit(session: SupportAccessSession, action: string): AuditEventInput {
    return {
      actorType: ActorType.System,
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: session.id,
      institutionId: session.institutionId,
      supportSessionId: session.id,
      caseRef: session.caseRef ?? undefined,
      riskLevel: RiskLevel.Low,
      previousState: { status: session.status },
      newState: { status: 'expired' },
    };
  }
}
