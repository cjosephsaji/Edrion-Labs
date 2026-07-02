import { Controller, Get, Inject, Injectable, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, count, desc, eq, inArray, isNull, lt, or, schema, sql, type Database, type PgColumn, type SQL } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { can as hasPerm } from '@edrion/permissions';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { DATABASE } from '../../common/tokens';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import type { PortalActionContext } from './portal-action-context';
import { PortalEntityResolver } from './portal-entity-resolver';

type Severity = 'high' | 'medium' | 'low';
interface AttentionItem {
  id: string;
  title: string;
  subtitle?: string | null;
  severity: Severity;
  meta?: Record<string, unknown>;
}
interface AttentionCategory {
  key: string;
  label: string;
  description: string;
  /** ok = real, computed signals; not_yet_available = needs student-side features (labelled placeholder). */
  status: 'ok' | 'not_yet_available' | 'no_access';
  count: number;
  items: AttentionItem[];
  message?: string;
}

const ITEM_CAP = 25;

/**
 * Institution Attention / Command Centre (admin-redesign Phase 5). Aggregates where admins must act,
 * reading ONLY existing tables — nothing is invented. Each category is gated by the caller's own
 * permissions (a nurse never sees fees), and categories that need student-performance / learning
 * analytics return `not_yet_available` so the UI renders a clearly-labelled placeholder instead of a
 * fake number. Read-only + scope-confined.
 */
@Injectable()
export class AttentionService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly entities: PortalEntityResolver,
  ) {}

  async overview(ctx: PortalActionContext): Promise<{ categories: AttentionCategory[] }> {
    const can = (k: string) => hasPerm(ctx.principal.permissions, k);
    const categories = await Promise.all([
      can('fees.view') ? this.fees(ctx) : this.noAccess('fees', 'Fees & Finance', 'Overdue fees, large balances and payment follow-ups.'),
      can('attendance.view') ? this.attendance(ctx) : this.noAccess('attendance', 'Attendance', 'Students with repeated absences.'),
      this.performance(),
      this.learning(),
      can('health_records.view') ? this.health(ctx) : this.noAccess('health', 'Health & Wellbeing', 'Follow-ups and unresolved incidents.'),
      can('admissions.view') ? this.admissions(ctx) : this.noAccess('admissions', 'Admissions', 'Applications awaiting review or a decision.'),
      this.operations(ctx),
    ]);
    return { categories };
  }

  private noAccess(key: string, label: string, description: string): AttentionCategory {
    return { key, label, description, status: 'no_access', count: 0, items: [] };
  }

  private scope(ctx: PortalActionContext) {
    return resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
  }

  private scopeCond(table: { institutionId: PgColumn; campusId: PgColumn }, ctx: PortalActionContext): SQL[] {
    const campusIds = this.scope(ctx);
    const conds: SQL[] = [eq(table.institutionId, ctx.principal.institutionId)];
    if (campusIds) {
      const c = or(isNull(table.campusId), inArray(table.campusId, campusIds));
      if (c) conds.push(c);
    }
    return conds;
  }

  // --- Fees & Finance --------------------------------------------------------

  private async fees(ctx: PortalActionContext): Promise<AttentionCategory> {
    const t = schema.feeInvoices;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = or(eq(t.status, 'overdue'), and(lt(t.dueDate, today), inArray(t.status, ['pending', 'partial'])));
    const where = and(...this.scopeCond(t, ctx), ...(overdue ? [overdue] : []), sql`${t.amount} - ${t.amountPaid} > 0`);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    const rows = await this.db
      .select({ id: t.id, studentId: t.studentId, amount: t.amount, amountPaid: t.amountPaid, dueDate: t.dueDate, status: t.status })
      .from(t)
      .where(where)
      .orderBy(sql`${t.amount} - ${t.amountPaid} desc`)
      .limit(ITEM_CAP);
    const names = await this.students(ctx, rows.map((r) => r.studentId));
    const items = rows.map((r): AttentionItem => {
      const outstanding = r.amount - r.amountPaid;
      return {
        id: r.id,
        title: names.get(r.studentId ?? '') ?? 'Unknown student',
        subtitle: `Outstanding ${(outstanding / 100).toFixed(2)}${r.dueDate ? ` · due ${r.dueDate}` : ''}`,
        severity: outstanding >= 50000 ? 'high' : outstanding >= 10000 ? 'medium' : 'low',
        meta: { outstandingMinor: outstanding, dueDate: r.dueDate, status: r.status },
      };
    });
    return { key: 'fees', label: 'Fees & Finance', description: 'Overdue fees, large balances and payment follow-ups.', status: 'ok', count: Number(tot?.value ?? 0), items };
  }

  // --- Attendance ------------------------------------------------------------

  private async attendance(ctx: PortalActionContext): Promise<AttentionCategory> {
    const t = schema.attendanceRecords;
    // attendance_records is a session child with no campus_id of its own — scope by institution.
    const where = and(eq(t.institutionId, ctx.principal.institutionId), inArray(t.status, ['absent', 'late']));
    const rows = await this.db
      .select({ studentId: t.studentId, cnt: sql<number>`count(*)::int` })
      .from(t)
      .where(where)
      .groupBy(t.studentId)
      .having(sql`count(*) >= 3`)
      .orderBy(desc(sql`count(*)`))
      .limit(ITEM_CAP);
    const names = await this.students(ctx, rows.map((r) => r.studentId));
    const items = rows.map((r): AttentionItem => ({
      id: r.studentId,
      title: names.get(r.studentId) ?? 'Unknown student',
      subtitle: `${r.cnt} absences/late on record`,
      severity: r.cnt >= 10 ? 'high' : r.cnt >= 5 ? 'medium' : 'low',
      meta: { count: r.cnt },
    }));
    return { key: 'attendance', label: 'Attendance', description: 'Students with repeated absences or late arrivals.', status: 'ok', count: items.length, items };
  }

  // --- Health & Wellbeing ----------------------------------------------------

  private async health(ctx: PortalActionContext): Promise<AttentionCategory> {
    const hr = schema.healthRecords;
    const followUps = await this.db
      .select({ id: hr.id, studentId: hr.studentId, title: hr.title, reason: hr.reason })
      .from(hr)
      .where(and(...this.scopeCond(hr, ctx), eq(hr.followUpRequired, true), sql`${hr.status} <> 'resolved'`))
      .limit(ITEM_CAP);
    const mi = schema.medicalIncidents;
    const openIncidents = await this.db
      .select({ id: mi.id, studentId: mi.studentId, title: mi.title, severity: mi.severity })
      .from(mi)
      .where(and(...this.scopeCond(mi, ctx), eq(mi.status, 'open')))
      .limit(ITEM_CAP);
    const names = await this.students(ctx, [...followUps.map((r) => r.studentId), ...openIncidents.map((r) => r.studentId)]);
    const items: AttentionItem[] = [
      ...followUps.map((r): AttentionItem => ({ id: r.id, title: names.get(r.studentId ?? '') ?? r.title, subtitle: `Follow-up: ${r.reason ?? r.title}`, severity: 'medium', meta: { kind: 'follow_up' } })),
      ...openIncidents.map((r): AttentionItem => ({ id: r.id, title: names.get(r.studentId ?? '') ?? r.title, subtitle: `Open incident: ${r.title}`, severity: r.severity === 'high' ? 'high' : 'medium', meta: { kind: 'incident' } })),
    ].slice(0, ITEM_CAP);
    return { key: 'health', label: 'Health & Wellbeing', description: 'Students needing follow-up and unresolved incidents.', status: 'ok', count: followUps.length + openIncidents.length, items };
  }

  // --- Admissions ------------------------------------------------------------

  private async admissions(ctx: PortalActionContext): Promise<AttentionCategory> {
    const t = schema.admissionApplications;
    // "Needs staff action" = submitted or under review (info_requested waits on the parent; decided
    // states are done). Oldest first — the longest-waiting applicants are the most urgent.
    const where = and(...this.scopeCond(t, ctx), inArray(t.status, ['submitted', 'under_review']));
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    const rows = await this.db
      .select({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        applicationNo: t.applicationNo,
        status: t.status,
        appliedDate: t.appliedDate,
        createdAt: t.createdAt,
      })
      .from(t)
      .where(where)
      .orderBy(sql`coalesce(${t.appliedDate}, ${t.createdAt}::date) asc`)
      .limit(ITEM_CAP);
    const now = Date.now();
    const items = rows.map((r): AttentionItem => {
      const since = r.appliedDate ? new Date(r.appliedDate).getTime() : new Date(r.createdAt).getTime();
      const days = Math.floor((now - since) / 86_400_000);
      return {
        id: r.id,
        title: `${r.firstName} ${r.lastName}`.trim() || 'Applicant',
        subtitle: `${r.applicationNo} · ${r.status === 'under_review' ? 'Under review' : 'Awaiting review'}${r.appliedDate ? ` · applied ${r.appliedDate}` : ''}`,
        severity: days >= 14 ? 'high' : days >= 5 ? 'medium' : 'low',
        meta: { applicationNo: r.applicationNo, status: r.status, waitingDays: days },
      };
    });
    return { key: 'admissions', label: 'Admissions', description: 'Applications awaiting review or a decision.', status: 'ok', count: Number(tot?.value ?? 0), items };
  }

  // --- Staff & Operations ----------------------------------------------------

  private async operations(ctx: PortalActionContext): Promise<AttentionCategory> {
    const items: AttentionItem[] = [];
    let total = 0;
    const can = (k: string) => hasPerm(ctx.principal.permissions, k);

    if (can('academics.view')) {
      const c = schema.classes;
      const unassigned = await this.db
        .select({ id: c.id, name: c.name })
        .from(c)
        .where(and(...this.scopeCond(c, ctx), isNull(c.classTeacherId)))
        .limit(ITEM_CAP);
      total += unassigned.length;
      items.push(...unassigned.map((r): AttentionItem => ({ id: r.id, title: `Unassigned class: ${r.name}`, subtitle: 'No class teacher', severity: 'medium', meta: { kind: 'unassigned_class' } })));
    }
    if (can('work_orders.manage')) {
      const w = schema.workOrders;
      const open = await this.db.select({ id: w.id, title: w.title }).from(w).where(and(...this.scopeCond(w, ctx), eq(w.status, 'open'))).limit(ITEM_CAP);
      total += open.length;
      items.push(...open.map((r): AttentionItem => ({ id: r.id, title: `Work order: ${r.title}`, subtitle: 'Open', severity: 'low', meta: { kind: 'work_order' } })));
    }
    if (can('access_requests.manage')) {
      const a = schema.accessRequests;
      const open = await this.db.select({ id: a.id, requesterName: a.requesterName, system: a.system }).from(a).where(and(...this.scopeCond(a, ctx), eq(a.status, 'open'))).limit(ITEM_CAP);
      total += open.length;
      items.push(...open.map((r): AttentionItem => ({ id: r.id, title: `Access request: ${r.requesterName}`, subtitle: r.system ?? 'Pending', severity: 'low', meta: { kind: 'access_request' } })));
    }
    if (can('security_incidents.manage')) {
      const s = schema.securityIncidents;
      const open = await this.db.select({ id: s.id, title: s.title }).from(s).where(and(...this.scopeCond(s, ctx), eq(s.status, 'open'))).limit(ITEM_CAP);
      total += open.length;
      items.push(...open.map((r): AttentionItem => ({ id: r.id, title: `Security: ${r.title}`, subtitle: 'Open', severity: 'high', meta: { kind: 'security_incident' } })));
    }
    return { key: 'operations', label: 'Staff & Operations', description: 'Unassigned classes, pending requests and open operational issues.', status: 'ok', count: total, items: items.slice(0, ITEM_CAP) };
  }

  // --- analytics-dependent (placeholders) ------------------------------------

  private performance(): AttentionCategory {
    return {
      key: 'performance',
      label: 'Student Performance',
      description: 'Underperformance, declining grades, at-risk and high-achieving students.',
      status: 'not_yet_available',
      count: 0,
      items: [],
      message: 'Available after the student-side performance analytics are built.',
    };
  }

  private learning(): AttentionCategory {
    return {
      key: 'learning',
      label: 'Learning Progress',
      description: 'Subject struggles, incomplete assignments and learning-behaviour changes.',
      status: 'not_yet_available',
      count: 0,
      items: [],
      message: 'Available after the student-side learning analytics are built.',
    };
  }

  // --- helpers ---------------------------------------------------------------

  private async students(ctx: PortalActionContext, ids: Array<string | null>): Promise<Map<string, string>> {
    const clean = ids.filter((v): v is string => !!v);
    const refs = await this.entities.resolve(ctx.principal.institutionId, { studentIds: clean });
    return new Map(Object.values(refs.student ?? {}).map((d) => [d.id, d.label]));
  }
}

@ApiTags('portal-attention')
@Controller('portal/attention')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AttentionController {
  constructor(private readonly svc: AttentionService) {}

  @Get()
  @RequireInstitutionPermissions('portal.dashboard.view')
  overview(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.overview({ principal: p, scope: s, request: r });
  }
}
