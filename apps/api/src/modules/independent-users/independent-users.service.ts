import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@edrion/shared-types';
import type {
  IndependentUserStatusActionInput,
  ListIndependentUsersQuery,
  UpdateIndependentUserInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { IndependentUser } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { IndependentUsersRepository } from './independent-users.repository';

const MODULE = 'independent-users';
const ENTITY = 'independent_user';

@Injectable()
export class IndependentUsersService {
  constructor(
    private readonly repo: IndependentUsersRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  list(q: ListIndependentUsersQuery) {
    return this.repo.list(q);
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  async get(id: string): Promise<IndependentUser> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Independent user not found' });
    return row;
  }

  async update(id: string, input: UpdateIndependentUserInput, ctx: ActionContext): Promise<IndependentUser> {
    const before = await this.get(id);
    const updated = await this.repo.updateWithVersion(
      id,
      input.version,
      {
        fullName: input.fullName ?? before.fullName,
        country: input.country ?? before.country,
        aiUsageLimit: input.aiUsageLimit === undefined ? before.aiUsageLimit : input.aiUsageLimit,
      },
      ctx.principalContext.principal.employeeId,
    );
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, id, 'independent_user.update', {
      previousState: { fullName: before.fullName, country: before.country, aiUsageLimit: before.aiUsageLimit },
      newState: { fullName: updated.fullName, country: updated.country, aiUsageLimit: updated.aiUsageLimit },
    });
    return updated;
  }

  /** Disable (suspend) an independent user. Sensitive — recent auth enforced by the guard. */
  async disable(id: string, input: IndependentUserStatusActionInput, ctx: ActionContext): Promise<IndependentUser> {
    return this.transition(id, AccountStatus.Disabled, 'independent_user.disable', input, ctx);
  }

  /** Restore a disabled user to active. */
  async restore(id: string, input: IndependentUserStatusActionInput, ctx: ActionContext): Promise<IndependentUser> {
    return this.transition(id, AccountStatus.Active, 'independent_user.restore', input, ctx);
  }

  private async transition(
    id: string,
    status: AccountStatus,
    action: string,
    input: IndependentUserStatusActionInput,
    ctx: ActionContext,
  ): Promise<IndependentUser> {
    const before = await this.get(id);
    if (before.status === status) {
      throw new ConflictException({ code: 'INVALID_STATE', message: `User is already ${status}.` });
    }
    const updated = await this.repo.updateWithVersion(
      id,
      input.version,
      { status },
      ctx.principalContext.principal.employeeId,
    );
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, id, action, {
      reason: input.reason,
      previousState: { status: before.status },
      newState: { status: updated.status },
    });
    return updated;
  }

  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }

  private async writeAudit(
    ctx: ActionContext,
    id: string,
    action: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: id,
      ...extra,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}
