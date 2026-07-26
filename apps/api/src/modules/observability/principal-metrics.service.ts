import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class PrincipalMetricsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async rollupInstitution(institutionId: string, asOf: string) {
    const metrics: Array<{ key: string; value: Record<string, unknown> }> = [];

    const [attendance] = await this.db
      .select({
        avgPct: sql<number>`coalesce(avg(${schema.attendanceRollups.pct}), 0)`,
      })
      .from(schema.attendanceRollups)
      .where(eq(schema.attendanceRollups.institutionId, institutionId));

    metrics.push({
      key: 'attendance.avg_pct',
      value: { pct: Number(attendance?.avgPct ?? 0) },
    });

    const [fees] = await this.db
      .select({
        outstanding: sql<number>`coalesce(sum(${schema.feeInvoices.amount} - ${schema.feeInvoices.amountPaid}), 0)`,
      })
      .from(schema.feeInvoices)
      .where(
        and(eq(schema.feeInvoices.institutionId, institutionId), sql`${schema.feeInvoices.status} <> 'cancelled'`),
      );

    metrics.push({
      key: 'fees.outstanding_minor',
      value: { amount_minor: Number(fees?.outstanding ?? 0) },
    });

    const [requests] = await this.db
      .select({ open: sql<number>`count(*)` })
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.institutionId, institutionId),
          sql`${schema.studentRequests.status} in ('submitted', 'in_review')`,
        ),
      );

    metrics.push({
      key: 'requests.open',
      value: { count: Number(requests?.open ?? 0) },
    });

    for (const m of metrics) {
      await this.db
        .insert(schema.principalMetricRollups)
        .values({
          institutionId,
          metricKey: m.key,
          asOf,
          value: m.value,
        })
        .onConflictDoUpdate({
          target: [
            schema.principalMetricRollups.institutionId,
            schema.principalMetricRollups.metricKey,
            schema.principalMetricRollups.asOf,
          ],
          set: { value: m.value },
        });
    }

    return { institutionId, asOf, metrics: metrics.length };
  }

  async listRollups(institutionId: string, asOf?: string) {
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    const rows = await this.db
      .select()
      .from(schema.principalMetricRollups)
      .where(
        and(
          eq(schema.principalMetricRollups.institutionId, institutionId),
          eq(schema.principalMetricRollups.asOf, date),
        ),
      );
    return { asOf: date, items: rows.map((r) => ({ key: r.metricKey, value: r.value })) };
  }
}
