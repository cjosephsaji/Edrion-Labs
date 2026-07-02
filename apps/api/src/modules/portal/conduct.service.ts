import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  sql,
  type Database,
  type SQL,
} from '@edrion/database';
import { resolveScopeFilter, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { ConductListQuery, CreateStudentIncidentInput, UpdateStudentIncidentInput } from '@edrion/schemas';
import type { StudentIncident, NewStudentIncident } from '@edrion/database';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-conduct';

/**
 * Institution-portal student conduct service: behaviour incidents + complaints against a student.
 * Campus-scoped (campus_id null = institution-wide), version-guarded. Reads need `student_conduct.view`;
 * writes the sensitive `student_conduct.manage`. Setting status→resolved stamps `resolvedAt`.
 */
@Injectable()
export class ConductService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: ConductListQuery): Promise<ListResult<StudentIncident & { studentName: string | null; admissionNo: string | null }>> {
    const t = schema.studentIncidents;
    const f = this.filter(ctx);
    const conds: SQL[] = [eq(t.institutionId, ctx.principal.institutionId)];
    if (f.campusIds) {
      const inScope = or(isNull(t.campusId), inArray(t.campusId, f.campusIds));
      if (inScope) conds.push(inScope);
    }
    if (q.studentId) conds.push(eq(t.studentId, q.studentId));
    if (q.category) conds.push(eq(t.category, q.category));
    if (q.severity) conds.push(eq(t.severity, q.severity));
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.title, `%${q.search}%`), ilike(t.description, `%${q.search}%`), ilike(t.reporterName, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortCol = q.sortBy === 'severity' ? t.severity : q.sortBy === 'status' ? t.status : q.sortBy === 'occurredOn' ? t.occurredOn : t.createdAt;
    const orderBy = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);
    const rows = await this.db
      .select({ inc: t, studentName: sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.lastName})`, admissionNo: schema.students.admissionNo })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    const total = Number(tot?.value ?? 0);
    const items = rows.map((r) => ({ ...r.inc, studentName: r.studentName, admissionNo: r.admissionNo }));
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }

  async create(ctx: PortalActionContext, input: CreateStudentIncidentInput): Promise<StudentIncident> {
    const student = await this.requireStudentInScope(ctx, input.studentId);
    const values: NewStudentIncident = {
      institutionId: ctx.principal.institutionId,
      campusId: student.campusId ?? null,
      studentId: input.studentId,
      category: input.category,
      title: input.title,
      description: input.description ?? null,
      severity: input.severity,
      status: input.status,
      occurredOn: input.occurredOn ?? null,
      reporterName: input.reporterName ?? null,
      notifyGuardians: input.notifyGuardians,
      resolutionNote: input.resolutionNote ?? null,
      resolvedAt: input.status === 'resolved' ? new Date() : null,
      createdBy: ctx.principal.institutionUserId,
    };
    const [row] = await this.db.insert(schema.studentIncidents).values(values).returning();
    await this.write(ctx, 'conduct.create', row!.id, row!.campusId, { newState: { title: row!.title, category: row!.category, severity: row!.severity } });
    return row!;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateStudentIncidentInput): Promise<StudentIncident> {
    const existing = await this.requireInScope(ctx, id);
    const { version, ...rest } = input;
    const patch: Partial<NewStudentIncident> = {};
    if (rest.category !== undefined) patch.category = rest.category;
    if (rest.title !== undefined) patch.title = rest.title;
    if (rest.description !== undefined) patch.description = rest.description ?? null;
    if (rest.severity !== undefined) patch.severity = rest.severity;
    if (rest.occurredOn !== undefined) patch.occurredOn = rest.occurredOn ?? null;
    if (rest.reporterName !== undefined) patch.reporterName = rest.reporterName ?? null;
    if (rest.notifyGuardians !== undefined) patch.notifyGuardians = rest.notifyGuardians;
    if (rest.resolutionNote !== undefined) patch.resolutionNote = rest.resolutionNote ?? null;
    if (rest.status !== undefined) {
      patch.status = rest.status;
      // Stamp/clear the resolution time as the status crosses the resolved boundary.
      if (rest.status === 'resolved' && existing.status !== 'resolved') patch.resolvedAt = new Date();
      if (rest.status !== 'resolved') patch.resolvedAt = null;
    }
    const [row] = await this.db
      .update(schema.studentIncidents)
      .set({ ...patch, version: version + 1, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date() })
      .where(and(eq(schema.studentIncidents.id, id), eq(schema.studentIncidents.version, version)))
      .returning();
    if (!row) throw this.versionConflict();
    await this.write(ctx, 'conduct.update', id, row.campusId, { newState: { title: row.title, status: row.status } });
    return row;
  }

  async remove(ctx: PortalActionContext, id: string, version: number): Promise<{ deleted: true }> {
    const existing = await this.requireInScope(ctx, id);
    const rows = await this.db
      .delete(schema.studentIncidents)
      .where(and(eq(schema.studentIncidents.id, id), eq(schema.studentIncidents.version, version)))
      .returning({ id: schema.studentIncidents.id });
    if (rows.length === 0) throw this.versionConflict();
    await this.write(ctx, 'conduct.delete', id, existing.campusId, { previousState: { title: existing.title } });
    return { deleted: true };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private async requireStudentInScope(ctx: PortalActionContext, studentId: string) {
    const [row] = await this.db
      .select({ id: schema.students.id, campusId: schema.students.campusId })
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new BadRequestException({ code: 'INVALID_STUDENT', message: 'Student not found in this institution.' });
    const f = this.filter(ctx);
    if (f.campusIds !== null && row.campusId !== null && !f.campusIds.includes(row.campusId)) {
      throw new BadRequestException({ code: 'OUT_OF_SCOPE', message: 'Student is not in the current scope.' });
    }
    return row;
  }

  private async requireInScope(ctx: PortalActionContext, id: string): Promise<StudentIncident> {
    const [row] = await this.db
      .select()
      .from(schema.studentIncidents)
      .where(and(eq(schema.studentIncidents.id, id), eq(schema.studentIncidents.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Incident not found' });
    const f = this.filter(ctx);
    if (row.campusId !== null && f.campusIds !== null && !f.campusIds.includes(row.campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
    return row;
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, campusId: string | null, extra: Partial<AuditEventInput> = {}): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'student_incident',
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({ code: 'VERSION_CONFLICT', message: 'This record changed since you loaded it. Reload and try again.' });
  }
}
