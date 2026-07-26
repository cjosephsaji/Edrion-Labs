import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@edrion/shared-types';
import type {
  AssignRolesInput,
  CreateEmployeeInput,
  EmployeeStatusActionInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { PlatformEmployee } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { EmployeesRepository } from './employees.repository';

const MODULE = 'employees';
const ENTITY = 'platform_employee';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly repo: EmployeesRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  list(q: ListEmployeesQuery) {
    return this.repo.list(q);
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  async get(id: string): Promise<PlatformEmployee> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Employee not found' });
    return row;
  }

  /** Detail view: identity + assigned roles + permission overrides. */
  async detail(id: string) {
    const employee = await this.get(id);
    const [roles, overrides] = await Promise.all([
      this.repo.rolesForEmployee(id),
      this.repo.overridesForEmployee(id),
    ]);
    return { employee, roles, overrides };
  }

  async create(input: CreateEmployeeInput, ctx: ActionContext): Promise<PlatformEmployee> {
    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      throw new ConflictException({ code: 'ALREADY_EXISTS', message: 'An employee with that email already exists.' });
    }
    const actorId = ctx.principalContext.principal.employeeId;
    const created = await this.repo.insert({
      email: input.email,
      fullName: input.fullName,
      title: input.title ?? null,
      status: AccountStatus.Active,
      createdBy: actorId,
    });
    await this.writeAudit(ctx, created.id, 'employee.create', {
      newState: { email: created.email, fullName: created.fullName, title: created.title },
    });
    return created;
  }

  async update(id: string, input: UpdateEmployeeInput, ctx: ActionContext): Promise<PlatformEmployee> {
    const before = await this.get(id);
    const updated = await this.repo.updateWithVersion(
      id,
      input.version,
      {
        fullName: input.fullName ?? before.fullName,
        title: input.title === undefined ? before.title : input.title,
      },
      ctx.principalContext.principal.employeeId,
    );
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, id, 'employee.update', {
      previousState: { fullName: before.fullName, title: before.title },
      newState: { fullName: updated.fullName, title: updated.title },
    });
    return updated;
  }

  /** Disable an employee. Sensitive — recent auth enforced by the guard. Cannot disable self. */
  async disable(id: string, input: EmployeeStatusActionInput, ctx: ActionContext): Promise<PlatformEmployee> {
    if (id === ctx.principalContext.principal.employeeId) {
      throw new ConflictException({ code: 'CANNOT_DISABLE_SELF', message: 'You cannot disable your own account.' });
    }
    return this.transition(id, AccountStatus.Disabled, 'employee.disable', input, ctx);
  }

  /** Restore a disabled employee to active. */
  async restore(id: string, input: EmployeeStatusActionInput, ctx: ActionContext): Promise<PlatformEmployee> {
    return this.transition(id, AccountStatus.Active, 'employee.restore', input, ctx);
  }

  async assignRoles(id: string, input: AssignRolesInput, ctx: ActionContext) {
    await this.get(id); // ensure exists
    const before = await this.repo.rolesForEmployee(id);
    await this.repo.replaceRoleAssignments(id, input.roleIds, ctx.principalContext.principal.employeeId);
    const after = await this.repo.rolesForEmployee(id);
    await this.writeAudit(ctx, id, 'employee.assign_roles', {
      reason: input.reason,
      previousState: { roleIds: before.map((r) => r.id) },
      newState: { roleIds: after.map((r) => r.id) },
    });
    return { roles: after };
  }

  private async transition(
    id: string,
    status: AccountStatus,
    action: string,
    input: EmployeeStatusActionInput,
    ctx: ActionContext,
  ): Promise<PlatformEmployee> {
    const before = await this.get(id);
    if (before.status === status) {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Employee is already ${status}.` });
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
