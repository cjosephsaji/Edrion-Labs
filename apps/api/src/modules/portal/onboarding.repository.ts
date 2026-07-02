import { Inject, Injectable } from '@nestjs/common';
import { count, eq, schema, sql, type Database } from '@edrion/database';
import { InstitutionStatus, OnboardingStatus } from '@edrion/shared-types';
import { DATABASE } from '../../common/tokens';

/**
 * Live counts, one per onboarding step. Every step completes purely from real data the admin
 * enters inside the wizard — there is no manual checklist to tick. Institution-wide (all campuses).
 */
export interface OnboardingSignals {
  academicYears: number;
  departments: number;
  subjects: number;
  students: number;
  teachers: number;
  staff: number;
}

export interface InstitutionOnboardingMeta {
  displayName: string;
  status: string;
  onboardingStatus: string;
  activatedAt: Date | null;
}

/** Read the institution's onboarding signals + drive the go-live transition. Always one institution. */
@Injectable()
export class OnboardingRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getMeta(institutionId: string): Promise<InstitutionOnboardingMeta | null> {
    const [row] = await this.db
      .select({
        displayName: schema.institutions.displayName,
        status: schema.institutions.status,
        onboardingStatus: schema.institutions.onboardingStatus,
        activatedAt: schema.institutions.activatedAt,
      })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return row ?? null;
  }

  /** One count per step — a step is complete once its count ≥ 1. */
  async signals(institutionId: string): Promise<OnboardingSignals> {
    const [academicYears, departments, subjects, students, teachers, staff] = await Promise.all([
      this.scalar(this.db.select({ value: count() }).from(schema.academicYears).where(eq(schema.academicYears.institutionId, institutionId))),
      this.scalar(this.db.select({ value: count() }).from(schema.departments).where(eq(schema.departments.institutionId, institutionId))),
      this.scalar(this.db.select({ value: count() }).from(schema.subjects).where(eq(schema.subjects.institutionId, institutionId))),
      this.scalar(this.db.select({ value: count() }).from(schema.students).where(eq(schema.students.institutionId, institutionId))),
      this.scalar(this.db.select({ value: count() }).from(schema.teachers).where(eq(schema.teachers.institutionId, institutionId))),
      this.scalar(this.db.select({ value: count() }).from(schema.staff).where(eq(schema.staff.institutionId, institutionId))),
    ]);
    return { academicYears, departments, subjects, students, teachers, staff };
  }

  /**
   * Flip the institution live: Active + onboarding Completed. `activated_at` is stamped only the
   * first time (coalesce), so re-running never rewrites the original go-live moment.
   */
  async goLive(institutionId: string): Promise<InstitutionOnboardingMeta | null> {
    const [row] = await this.db
      .update(schema.institutions)
      .set({
        status: InstitutionStatus.Active,
        onboardingStatus: OnboardingStatus.Completed,
        activatedAt: sql`coalesce(${schema.institutions.activatedAt}, now())`,
        updatedAt: new Date(),
      })
      .where(eq(schema.institutions.id, institutionId))
      .returning({
        displayName: schema.institutions.displayName,
        status: schema.institutions.status,
        onboardingStatus: schema.institutions.onboardingStatus,
        activatedAt: schema.institutions.activatedAt,
      });
    return row ?? null;
  }

  private async scalar(query: PromiseLike<{ value: number | string }[]>): Promise<number> {
    const rows = await query;
    return Number(rows[0]?.value ?? 0);
  }
}
