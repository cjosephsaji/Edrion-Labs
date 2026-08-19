import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { computeForecast, truncateAttendancePctNumber } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { AttendancePolicyService } from '../../portal/attendance-policy.service';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class StudentAttendanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly policyService: AttendancePolicyService,
  ) {}

  async summary(principal: InstitutionalStudentPrincipal) {
    const policy = await this.policyService.resolvePolicyValues(
      principal.institutionId,
      principal.campusId,
    );

    const [term] = await this.db
      .select()
      .from(schema.academicTerms)
      .where(eq(schema.academicTerms.institutionId, principal.institutionId))
      .orderBy(desc(schema.academicTerms.startDate))
      .limit(1);

    const rollups = term
      ? await this.db
          .select({
            rollup: schema.attendanceRollups,
            subjectName: schema.subjects.name,
          })
          .from(schema.attendanceRollups)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceRollups.subjectId))
          .where(
            and(
              eq(schema.attendanceRollups.studentId, principal.studentId),
              eq(schema.attendanceRollups.termId, term.id),
            ),
          )
      : [];

    const overall = rollups.find((row) => row.rollup.subjectId == null);
    const items = rollups
      .filter((row) => row.rollup.subjectId != null)
      .map((row) => {
        const conducted = row.rollup.conducted;
        const present = row.rollup.attended;
        const pct = attendancePercentage(row.rollup.pct, row.rollup.attended, row.rollup.conducted);
        return {
          id: row.rollup.subjectId!,
          subjectName: row.subjectName ?? 'Subject',
          present,
          total: conducted,
          percentage: pct,
          zone: row.rollup.zone,
          forecast: computeForecast({
            attended: row.rollup.attended,
            conducted: row.rollup.conducted,
            remaining: row.rollup.remaining,
            thresholdPct: policy.thresholdPct,
            safeMarginPct: policy.safeMarginPct,
          }).message,
        };
      });

    if (!items.length && overall) {
      items.push({
        id: 'overall',
        subjectName: 'Overall',
        present: overall.rollup.attended,
        total: overall.rollup.conducted,
        percentage: attendancePercentage(
          overall.rollup.pct,
          overall.rollup.attended,
          overall.rollup.conducted,
        ),
        zone: overall.rollup.zone,
        forecast: computeForecast({
          attended: overall.rollup.attended,
          conducted: overall.rollup.conducted,
          remaining: overall.rollup.remaining,
          thresholdPct: policy.thresholdPct,
          safeMarginPct: policy.safeMarginPct,
        }).message,
      });
    }

    return { items };
  }
}

/**
 * `attendance_rollups.pct` is written as a fraction between 0 and 1, but rows seeded before
 * that was settled hold a percentage. Multiplying those by 100 again showed students
 * "9333%", so anything already above 1 is taken as a percentage and passed through. When the
 * column is empty the value is recomputed from the counts rather than shown as unknown.
 */
function attendancePercentage(
  stored: string | null,
  attended: number,
  conducted: number,
): number | null {
  const raw = stored == null ? null : Number(stored);
  if (raw != null && Number.isFinite(raw)) {
    return truncateAttendancePctNumber(raw > 1 ? raw : raw * 100);
  }
  if (!conducted) return null;
  return truncateAttendancePctNumber((attended / conducted) * 100);
}
