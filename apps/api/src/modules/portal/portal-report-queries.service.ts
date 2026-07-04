import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, schema, sql, type Database } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';

export interface ReportPeriod {
  from?: Date;
  to?: Date;
}

/**
 * Typed Drizzle aggregates behind the Petros report tools + REST (Phase 5): attendance summary,
 * fee collection, grade distribution. Scope-confined like every portal read.
 */
@Injectable()
export class PortalReportQueriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private campusIds(ctx: PortalActionContext): string[] | null {
    return resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
  }

  /** Attendance status counts over a period (per status + per-day trend). */
  async attendanceSummary(ctx: PortalActionContext, period: ReportPeriod) {
    const r = schema.attendanceRecords;
    const s = schema.attendanceSessions;
    const campusIds = this.campusIds(ctx);
    const where = and(
      eq(r.institutionId, ctx.principal.institutionId),
      period.from ? gte(s.date, period.from.toISOString().slice(0, 10)) : undefined,
      period.to ? lte(s.date, period.to.toISOString().slice(0, 10)) : undefined,
      campusIds ? sql`${s.campusId} = any(${campusIds})` : undefined,
    );
    const byStatus = await this.db
      .select({ status: r.status, count: sql<number>`count(*)` })
      .from(r)
      .innerJoin(s, eq(s.id, r.sessionId))
      .where(where)
      .groupBy(r.status);
    const byDay = await this.db
      .select({
        date: s.date,
        present: sql<number>`count(*) filter (where ${r.status} = 'present')`,
        absent: sql<number>`count(*) filter (where ${r.status} = 'absent')`,
        total: sql<number>`count(*)`,
      })
      .from(r)
      .innerJoin(s, eq(s.id, r.sessionId))
      .where(where)
      .groupBy(s.date)
      .orderBy(s.date);
    return {
      byStatus: byStatus.map((x) => ({ label: x.status, value: Number(x.count) })),
      byDay: byDay.map((d) => ({ ...d, present: Number(d.present), absent: Number(d.absent), total: Number(d.total) })),
    };
  }

  /** Fee collection over a period: invoiced vs collected + payments per day. */
  async feeCollection(ctx: PortalActionContext, period: ReportPeriod) {
    const inv = schema.feeInvoices;
    const pay = schema.feePayments;
    const campusIds = this.campusIds(ctx);
    const invWhere = and(
      eq(inv.institutionId, ctx.principal.institutionId),
      campusIds ? sql`${inv.campusId} = any(${campusIds})` : undefined,
      period.from ? sql`${inv.issueDate} >= ${period.from.toISOString().slice(0, 10)}` : undefined,
      period.to ? sql`${inv.issueDate} <= ${period.to.toISOString().slice(0, 10)}` : undefined,
    );
    const [invoiced] = await this.db
      .select({
        totalMinor: sql<number>`coalesce(sum(${inv.amount}), 0)`,
        paidMinor: sql<number>`coalesce(sum(${inv.amountPaid}), 0)`,
        invoices: sql<number>`count(*)`,
      })
      .from(inv)
      .where(invWhere);
    const byStatus = await this.db
      .select({ status: inv.status, count: sql<number>`count(*)`, amountMinor: sql<number>`coalesce(sum(${inv.amount}),0)` })
      .from(inv)
      .where(invWhere)
      .groupBy(inv.status);
    const payments = await this.db
      .select({ day: pay.paidDate, amountMinor: sql<number>`coalesce(sum(${pay.amount}),0)` })
      .from(pay)
      .where(
        and(
          eq(pay.institutionId, ctx.principal.institutionId),
          period.from ? sql`${pay.paidDate} >= ${period.from.toISOString().slice(0, 10)}` : undefined,
          period.to ? sql`${pay.paidDate} <= ${period.to.toISOString().slice(0, 10)}` : undefined,
        ),
      )
      .groupBy(pay.paidDate)
      .orderBy(pay.paidDate);
    return {
      totals: {
        invoicedMinor: Number(invoiced?.totalMinor ?? 0),
        collectedMinor: Number(invoiced?.paidMinor ?? 0),
        outstandingMinor: Number(invoiced?.totalMinor ?? 0) - Number(invoiced?.paidMinor ?? 0),
        invoices: Number(invoiced?.invoices ?? 0),
      },
      byStatus: byStatus.map((x) => ({ label: x.status, value: Number(x.count), amountMinor: Number(x.amountMinor) })),
      paymentsByDay: payments.map((p) => ({ day: p.day, amountMinor: Number(p.amountMinor) })),
    };
  }

  /** Grade distribution (percentage buckets), optionally for one exam. */
  async gradeDistribution(ctx: PortalActionContext, examId?: string) {
    const g = schema.gradeEntries;
    const campusIds = this.campusIds(ctx);
    const pct = sql<number>`(${g.marksObtained}::numeric * 100 / nullif(${g.maxMarks}, 0))`;
    const bucket = sql<string>`case
      when ${pct} >= 90 then '90-100'
      when ${pct} >= 75 then '75-89'
      when ${pct} >= 60 then '60-74'
      when ${pct} >= 40 then '40-59'
      else '0-39' end`;
    const rows = await this.db
      .select({ bucket, count: sql<number>`count(*)` })
      .from(g)
      .where(
        and(
          eq(g.institutionId, ctx.principal.institutionId),
          examId ? eq(g.examId, examId) : undefined,
          campusIds ? sql`${g.campusId} = any(${campusIds})` : undefined,
        ),
      )
      .groupBy(bucket)
      .orderBy(bucket);
    const order = ['90-100', '75-89', '60-74', '40-59', '0-39'];
    return {
      buckets: order.map((b) => ({ label: b, value: Number(rows.find((r) => r.bucket === b)?.count ?? 0) })),
    };
  }
}
