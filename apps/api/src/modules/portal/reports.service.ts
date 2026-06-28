import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateReportDefinitionInput,
  CreateReportRunInput,
  ReportDefinitionsListQuery,
  UpdateReportDefinitionInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { ReportsRepository } from './reports.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-reports';

/**
 * Institution-portal Reports service (Phase 9). A definition is campus-scoped + version-guarded; the runs
 * inherit the definition's campus and are only reachable through a definition the caller can see
 * (requireDefinitionInScope). `reference_code` is unique within the institution (a friendly 409).
 * Generating a run is the export action. Reads need reports.view; defining/exporting needs the sensitive
 * reports.export key. All mutations are audited.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === definitions ===========================================================

  async listDefinitions(ctx: PortalActionContext, q: ReportDefinitionsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listDefinitions(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createDefinition(ctx: PortalActionContext, input: CreateReportDefinitionInput) {
    const code = input.referenceCode.trim();
    if (await this.repo.findDefinitionByCode(ctx.principal.institutionId, code)) {
      throw new ConflictException({ code: 'REPORT_EXISTS', message: `A report with code "${code}" already exists.` });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertDefinition({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      reportType: input.reportType,
      referenceCode: code,
      description: input.description ?? null,
      config: input.config ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'report.create', 'report_definition', row.id, campusId, {
      newState: { name: row.name, referenceCode: row.referenceCode, reportType: row.reportType },
    });
    return row;
  }

  async updateDefinition(ctx: PortalActionContext, id: string, input: UpdateReportDefinitionInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findDefinition(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const nextCode = (input.referenceCode ?? existing!.referenceCode).trim();
    if (nextCode !== existing!.referenceCode) {
      const dupe = await this.repo.findDefinitionByCode(ctx.principal.institutionId, nextCode);
      if (dupe && dupe.id !== id) {
        throw new ConflictException({ code: 'REPORT_EXISTS', message: `A report with code "${nextCode}" already exists.` });
      }
    }
    const updated = await this.repo.updateDefinition(id, input.version, {
      name: input.name ?? existing!.name,
      reportType: input.reportType ?? existing!.reportType,
      referenceCode: nextCode,
      description: input.description === undefined ? existing!.description : input.description,
      config: input.config === undefined ? existing!.config : input.config,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'report.update', 'report_definition', id, updated.campusId, {
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async deleteDefinition(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findDefinition(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteDefinition(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'report.delete', 'report_definition', id, existing!.campusId, {
      previousState: { name: existing!.name, referenceCode: existing!.referenceCode },
    });
    return { deleted: true };
  }

  // === runs (the export bridge) ==============================================

  async listRuns(ctx: PortalActionContext, reportId: string) {
    await this.requireDefinitionInScope(ctx, reportId);
    return this.repo.listRuns(reportId);
  }

  /** Generate an export of a report definition (the export action). */
  async createRun(ctx: PortalActionContext, reportId: string, input: CreateReportRunInput) {
    const def = await this.requireDefinitionInScope(ctx, reportId);
    const run = await this.repo.insertRun({
      institutionId: ctx.principal.institutionId,
      reportId,
      format: input.format,
      status: 'completed',
      rowCount: input.rowCount,
      generatedDate: input.generatedDate ?? new Date().toISOString().slice(0, 10),
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'report.export', 'report_run', run.id, def.campusId, {
      newState: { reportId, format: run.format, rowCount: run.rowCount },
    });
    return { run, report: def };
  }

  async removeRun(ctx: PortalActionContext, reportId: string, runId: string) {
    const def = await this.requireDefinitionInScope(ctx, reportId);
    const run = await this.repo.findRun(runId, reportId);
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    await this.repo.deleteRun(runId);
    await this.write(ctx, 'report.run.remove', 'report_run', runId, def.campusId, {
      previousState: { reportId, format: run.format },
    });
    return { deleted: true };
  }

  // === helpers ===============================================================

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

  private async requireDefinitionInScope(ctx: PortalActionContext, reportId: string) {
    const f = this.filter(ctx);
    const def = await this.repo.findDefinition(reportId, ctx.principal.institutionId);
    this.assertInScope(def?.campusId ?? null, def, f);
    return def;
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
