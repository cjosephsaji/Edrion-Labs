import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, or, schema, sql, type Database, type SQL } from '@edrion/database';
import type { PgColumn } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/** Real, scope-aware module counts for the adaptive dashboard. */
export interface ModuleCounts {
  students: number;
  staff: number;
  attendanceToday: number;
  feesCollected: number;
  openAdmissions: number;
  payrollDue: number;
}

export interface CampusRow {
  id: string;
  name: string;
  currentUserCount: number;
}

export interface ActivityRow {
  id: string;
  action: string;
  module: string;
  actorName: string | null;
  occurredAt: Date;
}

/** Read-only typed SQL for portal dashboard aggregates. Always scoped to one institution. */
@Injectable()
export class PortalRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getInstitutionName(institutionId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: schema.institutions.displayName })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return row?.name ?? 'Your Institution';
  }

  /** Name + lifecycle status the portal shell needs to gate the onboarding wizard. */
  async getInstitutionMeta(
    institutionId: string,
  ): Promise<{ name: string; status: string; onboardingStatus: string }> {
    const [row] = await this.db
      .select({
        name: schema.institutions.displayName,
        status: schema.institutions.status,
        onboardingStatus: schema.institutions.onboardingStatus,
      })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return {
      name: row?.name ?? 'Your Institution',
      status: row?.status ?? 'active',
      onboardingStatus: row?.onboardingStatus ?? 'completed',
    };
  }

  /** All campuses in the institution, optionally narrowed to a set of ids (scope). */
  async listCampuses(institutionId: string, campusIds: string[] | null): Promise<CampusRow[]> {
    const where = campusIds
      ? and(eq(schema.campuses.institutionId, institutionId), inArray(schema.campuses.id, campusIds))
      : eq(schema.campuses.institutionId, institutionId);
    return this.db
      .select({
        id: schema.campuses.id,
        name: schema.campuses.name,
        currentUserCount: schema.campuses.currentUserCount,
      })
      .from(schema.campuses)
      .where(where);
  }

  /** Count institution users (portal accounts) for the institution. */
  async countUsers(institutionId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.institutionId, institutionId));
    return Number(row?.value ?? 0);
  }

  /** Recent audit events in scope, newest first. */
  async recentActivity(
    institutionId: string,
    campusIds: string[] | null,
    limit: number,
  ): Promise<ActivityRow[]> {
    const conditions: SQL[] = [eq(schema.auditEvents.institutionId, institutionId)];
    if (campusIds && campusIds.length > 0) {
      conditions.push(inArray(schema.auditEvents.campusId, campusIds));
    }
    return this.db
      .select({
        id: schema.auditEvents.id,
        action: schema.auditEvents.action,
        module: schema.auditEvents.module,
        actorName: schema.auditEvents.actorName,
        occurredAt: schema.auditEvents.occurredAt,
      })
      .from(schema.auditEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.auditEvents.occurredAt))
      .limit(limit);
  }

  /**
   * Real, scope-aware module counts for the admin (institution/campus) dashboards, gathered in a
   * single round of queries. `campusIds === null` means institution-wide (no campus narrowing);
   * otherwise rows are confined to those campuses plus institution-owned (campus_id IS NULL) rows,
   * mirroring the scope semantics every portal service uses.
   */
  async moduleCounts(institutionId: string, campusIds: string[] | null): Promise<ModuleCounts> {
    const today = new Date().toISOString().slice(0, 10);
    const scope = (instCol: PgColumn, campusCol: PgColumn) =>
      this.scopeWhere(institutionId, instCol, campusCol, campusIds);

    const [students, staffRows, teacherRows, attendance, fees, admissions, payroll] = await Promise.all([
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.students)
          .where(
            and(
              scope(schema.students.institutionId, schema.students.campusId),
              eq(schema.students.status, 'enrolled'),
            ),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.staff)
          .where(
            and(scope(schema.staff.institutionId, schema.staff.campusId), eq(schema.staff.status, 'active')),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.teachers)
          .where(
            and(
              scope(schema.teachers.institutionId, schema.teachers.campusId),
              eq(schema.teachers.status, 'active'),
            ),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.attendanceRecords)
          .innerJoin(
            schema.attendanceSessions,
            eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId),
          )
          .where(
            and(
              eq(schema.attendanceSessions.institutionId, institutionId),
              this.campusNarrow(schema.attendanceSessions.campusId, campusIds),
              eq(schema.attendanceSessions.date, today),
              eq(schema.attendanceRecords.status, 'present'),
            ),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: sql<number>`coalesce(sum(${schema.feeInvoices.amountPaid}), 0)` })
          .from(schema.feeInvoices)
          .where(scope(schema.feeInvoices.institutionId, schema.feeInvoices.campusId)),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.admissionApplications)
          .where(
            and(
              scope(schema.admissionApplications.institutionId, schema.admissionApplications.campusId),
              isNull(schema.admissionApplications.enrolledStudentId),
              inArray(schema.admissionApplications.status, ['submitted', 'under_review', 'waitlisted']),
            ),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.payrollRuns)
          .where(
            and(
              scope(schema.payrollRuns.institutionId, schema.payrollRuns.campusId),
              inArray(schema.payrollRuns.status, ['draft', 'pending', 'approved']),
            ),
          ),
      ),
    ]);

    return {
      students,
      staff: staffRows + teacherRows,
      attendanceToday: attendance,
      feesCollected: fees,
      openAdmissions: admissions,
      payrollDue: payroll,
    };
  }

  // --- scope helpers ----------------------------------------------------------

  /** institution_id = … AND (campus_id ∈ ids OR campus_id IS NULL). Null ids → institution-wide. */
  private scopeWhere(
    institutionId: string,
    institutionCol: PgColumn,
    campusCol: PgColumn,
    campusIds: string[] | null,
  ): SQL {
    return and(eq(institutionCol, institutionId), this.campusNarrow(campusCol, campusIds)) as SQL;
  }

  /** (campus_id ∈ ids OR campus_id IS NULL) when confined; always-true when institution-wide. */
  private campusNarrow(campusCol: PgColumn, campusIds: string[] | null): SQL {
    if (campusIds === null) return sql`true`;
    if (campusIds.length === 0) return sql`false`;
    return or(inArray(campusCol, campusIds), isNull(campusCol)) as SQL;
  }

  private async scalar(query: PromiseLike<{ value: number | string }[]>): Promise<number> {
    const rows = await query;
    return Number(rows[0]?.value ?? 0);
  }
}
