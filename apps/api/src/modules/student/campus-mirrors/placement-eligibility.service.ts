import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';

export type PlacementEligibilityRule = {
  min_gpa?: number;
  allowed_programs?: string[];
  min_attendance_pct?: number;
};

export function evaluatePlacementEligibility(
  rule: PlacementEligibilityRule,
  ctx: { gpa?: number; program?: string; attendancePct?: number },
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (rule.min_gpa != null && (ctx.gpa ?? 0) < rule.min_gpa) {
    reasons.push(`GPA below ${rule.min_gpa}`);
  }
  if (rule.allowed_programs?.length && ctx.program && !rule.allowed_programs.includes(ctx.program)) {
    reasons.push('Program not eligible');
  }
  if (rule.min_attendance_pct != null && (ctx.attendancePct ?? 100) < rule.min_attendance_pct) {
    reasons.push(`Attendance below ${rule.min_attendance_pct}%`);
  }
  return { eligible: reasons.length === 0, reasons };
}

@Injectable()
export class PlacementEligibilityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async studentContext(studentId: string, _institutionId: string) {
    const [gpaRow] = await this.db
      .select({ cgpa: schema.studentCgpaSnapshots.cgpa })
      .from(schema.studentCgpaSnapshots)
      .where(eq(schema.studentCgpaSnapshots.studentId, studentId))
      .orderBy(desc(schema.studentCgpaSnapshots.computedAt))
      .limit(1);
    return {
      gpa: gpaRow?.cgpa != null ? Number(gpaRow.cgpa) : undefined,
      program: undefined,
      attendancePct: undefined,
    };
  }
}
