import { z } from 'zod';
import type { PortalReportQueriesService } from '../../portal-report-queries.service';
import type { PetrosRepository } from '../petros.repository';
import { barChartSvg, pieChartSvg } from '../../../documents/svg-charts';
import { params, type PetrosTool } from './types';

/**
 * Phase 5 report tools. `requiredPermissions` = reports.view AND the domain view key. Charts are
 * drawn server-side (deterministic SVG) ONLY for summary/period reports — daily or single-student
 * questions should be answered with tables/text (stated in the descriptions).
 */
export function buildReportTools(queries: PortalReportQueriesService, repo: PetrosRepository): PetrosTool[] {
  const periodSchema = z.object({
    from: z.string().min(8).max(30).optional(),
    to: z.string().min(8).max(30).optional(),
    chart: z.boolean().default(true),
  });
  const periodParams = {
    from: { type: 'string', description: 'ISO start date' },
    to: { type: 'string', description: 'ISO end date' },
    chart: { type: 'boolean', description: 'Draw a chart (only for period summaries, not daily/single-student questions)' },
  };
  const period = (args: Record<string, unknown>) => ({
    from: typeof args.from === 'string' ? new Date(args.from) : undefined,
    to: typeof args.to === 'string' ? new Date(args.to) : undefined,
  });

  async function chartArtifact(
    args: Record<string, unknown>,
    institutionId: string,
    title: string,
    svg: string,
  ): Promise<string | null> {
    const conversationId = (args as { __conversationId?: string }).__conversationId;
    if (!conversationId) return null;
    const artifact = await repo.insertArtifact({
      conversationId,
      institutionId,
      kind: 'chart_svg',
      title,
      mimeType: 'image/svg+xml',
      sizeBytes: svg.length,
      meta: { svg },
    });
    return artifact.id;
  }

  return [
    {
      name: 'report_attendance_summary',
      description:
        'Attendance summary over a period (status breakdown + per-day trend). Use the chart for monthly/term summaries only.',
      inputSchema: periodSchema,
      parameters: params(periodParams),
      requiredPermissions: ['reports.view', 'attendance.view'],
      capability: 'read',
      humanStatus: 'Crunching attendance…',
      execute: async (ctx, args) => {
        const data = await queries.attendanceSummary(ctx, period(args));
        let artifactId: string | null = null;
        if (args.chart !== false && data.byStatus.length) {
          artifactId = await chartArtifact(
            args,
            ctx.principal.institutionId,
            'Attendance summary',
            pieChartSvg('Attendance summary', data.byStatus),
          );
        }
        return { ...data, artifactId };
      },
    },
    {
      name: 'report_fee_collection',
      description:
        'Fee collection over a period (invoiced vs collected vs outstanding, invoice statuses). Amounts are MINOR currency units. Chart for period summaries only.',
      inputSchema: periodSchema,
      parameters: params(periodParams),
      requiredPermissions: ['reports.view', 'fees.view'],
      capability: 'read',
      humanStatus: 'Crunching fee collection…',
      execute: async (ctx, args) => {
        const data = await queries.feeCollection(ctx, period(args));
        let artifactId: string | null = null;
        if (args.chart !== false) {
          const chartData = [
            { label: 'Collected', value: Math.round(data.totals.collectedMinor / 100) },
            { label: 'Outstanding', value: Math.round(data.totals.outstandingMinor / 100) },
          ];
          artifactId = await chartArtifact(
            args,
            ctx.principal.institutionId,
            'Fee collection',
            pieChartSvg('Fee collection (major units)', chartData),
          );
        }
        return { ...data, artifactId };
      },
    },
    {
      name: 'report_grade_distribution',
      description: 'Grade distribution in percentage buckets, optionally for one exam. Chart for cohort summaries only.',
      inputSchema: z.object({ examId: z.string().uuid().optional(), chart: z.boolean().default(true) }),
      parameters: params({ examId: { type: 'string' }, chart: { type: 'boolean' } }),
      requiredPermissions: ['reports.view', 'gradebook.view'],
      capability: 'read',
      humanStatus: 'Crunching grades…',
      execute: async (ctx, args) => {
        const data = await queries.gradeDistribution(ctx, typeof args.examId === 'string' ? args.examId : undefined);
        let artifactId: string | null = null;
        if (args.chart !== false && data.buckets.some((b) => b.value > 0)) {
          artifactId = await chartArtifact(
            args,
            ctx.principal.institutionId,
            'Grade distribution',
            barChartSvg('Grade distribution (%)', data.buckets),
          );
        }
        return { ...data, artifactId };
      },
    },
  ];
}
