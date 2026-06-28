import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreatePayrollItemInput,
  CreatePayrollRunInput,
  PayrollRunsListQuery,
  UpdatePayrollItemInput,
  UpdatePayrollRunInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { PayrollRepository, type PayrollRefTable } from './payroll.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-payroll';

/**
 * Institution-portal Payroll service (Phase 7). A payroll run is campus-scoped and version-guarded
 * like every other portal resource; the per-employee items inherit the run's campus and are only
 * reachable through a run the caller can see (requireRunInScope). Each item references a teacher OR a
 * staff member (pre-checked for a friendly 400); a duplicate (run, employee) is a friendly 409; and
 * `net` is always computed (gross − deductions), never trusted from the body. All mutations are audited.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly repo: PayrollRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === payroll runs ==========================================================

  async list(ctx: PortalActionContext, q: PayrollRunsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listRuns(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async create(ctx: PortalActionContext, input: CreatePayrollRunInput) {
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertRun({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      periodLabel: input.periodLabel ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      payDate: input.payDate ?? null,
      status: input.status,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'payroll.run.create', 'payroll_run', row.id, campusId, {
      newState: { name: row.name, periodLabel: row.periodLabel, status: row.status },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdatePayrollRunInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findRun(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const updated = await this.repo.updateRun(id, input.version, {
      name: input.name ?? existing!.name,
      periodLabel: input.periodLabel === undefined ? existing!.periodLabel : input.periodLabel,
      periodStart: input.periodStart === undefined ? existing!.periodStart : input.periodStart,
      periodEnd: input.periodEnd === undefined ? existing!.periodEnd : input.periodEnd,
      payDate: input.payDate === undefined ? existing!.payDate : input.payDate,
      status: input.status ?? existing!.status,
      notes: input.notes === undefined ? existing!.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'payroll.run.update', 'payroll_run', id, updated.campusId, {
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async delete(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findRun(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteRun(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'payroll.run.delete', 'payroll_run', id, existing!.campusId, {
      previousState: { name: existing!.name, periodLabel: existing!.periodLabel },
    });
    return { deleted: true };
  }

  // === payroll items (per employee) ==========================================

  async listItems(ctx: PortalActionContext, runId: string) {
    await this.requireRunInScope(ctx, runId);
    return this.repo.listItems(runId);
  }

  async createItem(ctx: PortalActionContext, runId: string, input: CreatePayrollItemInput) {
    const run = await this.requireRunInScope(ctx, runId);
    const employeeId = this.employeeId(input.employeeType, input.teacherId, input.staffId);
    const net = this.netOf(input.gross, input.deductions);
    await this.assertRef(ctx, input.employeeType === 'staff' ? 'staff' : 'teachers', employeeId, input.employeeType);
    const dupe = await this.repo.findItemByEmployee(runId, input.employeeType, employeeId);
    if (dupe) {
      throw new ConflictException({
        code: 'ITEM_EXISTS',
        message: 'A line already exists for this employee in this payroll run.',
      });
    }
    const row = await this.repo.insertItem({
      institutionId: ctx.principal.institutionId,
      payrollRunId: runId,
      employeeType: input.employeeType,
      teacherId: input.employeeType === 'teacher' ? employeeId : null,
      staffId: input.employeeType === 'staff' ? employeeId : null,
      gross: input.gross,
      deductions: input.deductions,
      net,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'payroll.item.create', 'payroll_item', row.id, run.campusId, {
      newState: { runId, employeeType: row.employeeType, net: row.net },
    });
    return row;
  }

  async updateItem(ctx: PortalActionContext, runId: string, itemId: string, input: UpdatePayrollItemInput) {
    const run = await this.requireRunInScope(ctx, runId);
    const existing = await this.repo.findItem(itemId, runId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll item not found' });
    const employeeType = input.employeeType ?? (existing.employeeType as 'teacher' | 'staff');
    const currentEmployeeId = existing.employeeType === 'staff' ? existing.staffId : existing.teacherId;
    const employeeId =
      input.teacherId !== undefined || input.staffId !== undefined || input.employeeType !== undefined
        ? this.employeeId(employeeType, input.teacherId ?? null, input.staffId ?? null)
        : (currentEmployeeId as string);
    await this.assertRef(ctx, employeeType === 'staff' ? 'staff' : 'teachers', employeeId, employeeType);
    if (employeeType !== existing.employeeType || employeeId !== currentEmployeeId) {
      const dupe = await this.repo.findItemByEmployee(runId, employeeType, employeeId);
      if (dupe && dupe.id !== itemId) {
        throw new ConflictException({
          code: 'ITEM_EXISTS',
          message: 'A line already exists for this employee in this payroll run.',
        });
      }
    }
    const gross = input.gross ?? existing.gross;
    const deductions = input.deductions ?? existing.deductions;
    const net = this.netOf(gross, deductions);
    const updated = await this.repo.updateItem(itemId, input.version, {
      employeeType,
      teacherId: employeeType === 'teacher' ? employeeId : null,
      staffId: employeeType === 'staff' ? employeeId : null,
      gross,
      deductions,
      net,
      notes: input.notes === undefined ? existing.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'payroll.item.update', 'payroll_item', itemId, run.campusId, {
      newState: { employeeType: updated.employeeType, net: updated.net },
    });
    return updated;
  }

  async deleteItem(ctx: PortalActionContext, runId: string, itemId: string, version: number) {
    const run = await this.requireRunInScope(ctx, runId);
    const existing = await this.repo.findItem(itemId, runId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payroll item not found' });
    const ok = await this.repo.deleteItem(itemId, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'payroll.item.delete', 'payroll_item', itemId, run.campusId, {
      previousState: { employeeType: existing.employeeType, net: existing.net },
    });
    return { deleted: true };
  }

  // === helpers ===============================================================

  /** The employee id matching the type — zod has already refined exactly one is set. */
  private employeeId(type: string, teacherId: string | null | undefined, staffId: string | null | undefined): string {
    const id = type === 'staff' ? staffId : teacherId;
    if (!id) {
      throw new BadRequestException({
        code: 'INVALID_REFERENCE',
        message: `Select the ${type} for this line.`,
      });
    }
    return id;
  }

  /** Net = gross − deductions. Deductions cannot exceed gross — a friendly 400. */
  private netOf(gross: number, deductions: number): number {
    if (deductions > gross) {
      throw new BadRequestException({
        code: 'INVALID_DEDUCTIONS',
        message: 'Deductions cannot exceed gross pay.',
      });
    }
    return gross - deductions;
  }

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async requireRunInScope(ctx: PortalActionContext, runId: string) {
    const f = this.filter(ctx);
    const run = await this.repo.findRun(runId, ctx.principal.institutionId);
    this.assertInScope(run?.campusId ?? null, run, f);
    return run;
  }

  private async assertRef(ctx: PortalActionContext, table: PayrollRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
