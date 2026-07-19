import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt, or, schema, sql, type Database, type SQL } from '@edrion/database';
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
  ): Promise<{ name: string; status: string; onboardingStatus: string; type: string; country: string }> {
    const [row] = await this.db
      .select({
        name: schema.institutions.displayName,
        status: schema.institutions.status,
        onboardingStatus: schema.institutions.onboardingStatus,
        type: schema.institutions.type,
        country: schema.institutions.country,
      })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return {
      name: row?.name ?? 'Your Institution',
      status: row?.status ?? 'active',
      onboardingStatus: row?.onboardingStatus ?? 'completed',
      type: row?.type ?? 'school',
      country: row?.country ?? 'US',
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

    const [students, staffRows, attendance, fees, admissions, payroll] = await Promise.all([
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
      staff: staffRows,
      attendanceToday: attendance,
      feesCollected: fees,
      openAdmissions: admissions,
      payrollDue: payroll,
    };
  }

  // --- widget queries ---------------------------------------------------------
  //
  // Each of these backs exactly one dashboard widget. They are only ever called after the widget
  // registry has confirmed the caller holds the widget's required permission, so a teacher without
  // `fees.view` never causes feeOverview() to run at all.

  /**
   * The staff row behind a portal login, if any. Teaching widgets key off staff.id (classes and
   * timetable slots reference staff, not institution_users), so a login with no staff record —
   * an admin who never got one — simply has no teaching data and the widgets stay empty.
   */
  async staffIdForUser(institutionId: string, institutionUserId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(
        and(
          eq(schema.staff.institutionId, institutionId),
          eq(schema.staff.institutionUserId, institutionUserId),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  /** Classes this staff member owns as class teacher, plus the subjects they teach. */
  async teachingLoad(
    institutionId: string,
    staffId: string,
    campusIds: string[] | null,
  ): Promise<{ classesOwned: number; subjectsTaught: number }> {
    const [classesOwned, subjectsTaught] = await Promise.all([
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.classes)
          .where(
            and(
              this.scopeWhere(institutionId, schema.classes.institutionId, schema.classes.campusId, campusIds),
              eq(schema.classes.classTeacherId, staffId),
            ),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(schema.classSubjectTeachers)
          .where(eq(schema.classSubjectTeachers.teacherId, staffId)),
      ),
    ]);
    return { classesOwned, subjectsTaught };
  }

  /** Timetable slots for this teacher on today's weekday (1 = Monday … 7 = Sunday). */
  async periodsToday(staffId: string): Promise<number> {
    // JS getDay() is 0 = Sunday; the schema uses 1 = Monday … 7 = Sunday.
    const jsDay = new Date().getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    return this.scalar(
      this.db
        .select({ value: count() })
        .from(schema.timetableSlots)
        .where(
          and(
            eq(schema.timetableSlots.teacherId, staffId),
            eq(schema.timetableSlots.dayOfWeek, dayOfWeek),
          ),
        ),
    );
  }

  /** Submissions handed in on this teacher's assignments that are still awaiting a grade. */
  async submissionsAwaitingGrade(institutionId: string, staffId: string): Promise<number> {
    return this.scalar(
      this.db
        .select({ value: count() })
        .from(schema.assignmentSubmissions)
        .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentSubmissions.assignmentId))
        .where(
          and(
            eq(schema.assignments.institutionId, institutionId),
            eq(schema.assignments.teacherId, staffId),
            eq(schema.assignmentSubmissions.status, 'submitted'),
          ),
        ),
    );
  }

  /**
   * Today's attendance sessions in scope that have no attendance_records yet — i.e. still to be
   * marked. When a staffId is given, narrows to classes that staff member is class teacher of.
   */
  async attendanceSessionsUnmarked(
    institutionId: string,
    campusIds: string[] | null,
    staffId: string | null,
  ): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const s = schema.attendanceSessions;
    const conds: SQL[] = [
      this.scopeWhere(institutionId, s.institutionId, s.campusId, campusIds),
      eq(s.date, today),
      sql`not exists (select 1 from ${schema.attendanceRecords} r where r.session_id = ${s.id})`,
    ];
    if (staffId) {
      conds.push(
        sql`exists (select 1 from ${schema.classes} c where c.id = ${s.classId} and c.class_teacher_id = ${staffId})`,
      );
    }
    return this.scalar(this.db.select({ value: count() }).from(s).where(and(...conds)));
  }

  /** Collected vs still-outstanding fee totals, in MINOR units. */
  async feeOverview(
    institutionId: string,
    campusIds: string[] | null,
  ): Promise<{ collected: number; outstanding: number; overdueInvoices: number }> {
    const t = schema.feeInvoices;
    const scope = this.scopeWhere(institutionId, t.institutionId, t.campusId, campusIds);
    const today = new Date().toISOString().slice(0, 10);

    const [totals] = await this.db
      .select({
        collected: sql<number>`coalesce(sum(${t.amountPaid}), 0)`,
        outstanding: sql<number>`coalesce(sum(greatest(${t.amount} - ${t.amountPaid}, 0)), 0)`,
      })
      .from(t)
      .where(scope);

    const overdueInvoices = await this.scalar(
      this.db
        .select({ value: count() })
        .from(t)
        .where(
          and(
            scope,
            or(eq(t.status, 'overdue'), and(lt(t.dueDate, today), inArray(t.status, ['pending', 'partial']))),
            sql`${t.amount} - ${t.amountPaid} > 0`,
          ),
        ),
    );

    return {
      collected: Number(totals?.collected ?? 0),
      outstanding: Number(totals?.outstanding ?? 0),
      overdueInvoices,
    };
  }

  /** Payroll runs not yet completed. */
  async payrollDue(institutionId: string, campusIds: string[] | null): Promise<number> {
    const t = schema.payrollRuns;
    return this.scalar(
      this.db
        .select({ value: count() })
        .from(t)
        .where(
          and(
            this.scopeWhere(institutionId, t.institutionId, t.campusId, campusIds),
            inArray(t.status, ['draft', 'pending', 'approved']),
          ),
        ),
    );
  }

  /** Active staff headcount in scope. */
  async staffCount(institutionId: string, campusIds: string[] | null): Promise<number> {
    const t = schema.staff;
    return this.scalar(
      this.db
        .select({ value: count() })
        .from(t)
        .where(
          and(this.scopeWhere(institutionId, t.institutionId, t.campusId, campusIds), eq(t.status, 'active')),
        ),
    );
  }

  /** Open admission applications grouped by status. */
  async admissionsPipeline(
    institutionId: string,
    campusIds: string[] | null,
  ): Promise<Array<{ status: string; count: number }>> {
    const t = schema.admissionApplications;
    const rows = await this.db
      .select({ status: t.status, value: count() })
      .from(t)
      .where(
        and(
          this.scopeWhere(institutionId, t.institutionId, t.campusId, campusIds),
          isNull(t.enrolledStudentId),
          inArray(t.status, ['submitted', 'under_review', 'waitlisted']),
        ),
      )
      .groupBy(t.status);
    return rows.map((r) => ({ status: r.status, count: Number(r.value) }));
  }

  /** Open medical incidents and health records still needing a follow-up. */
  async wellbeingOpen(
    institutionId: string,
    campusIds: string[] | null,
  ): Promise<{ openIncidents: number; followUps: number }> {
    const mi = schema.medicalIncidents;
    const hr = schema.healthRecords;
    const [openIncidents, followUps] = await Promise.all([
      this.scalar(
        this.db
          .select({ value: count() })
          .from(mi)
          .where(
            and(this.scopeWhere(institutionId, mi.institutionId, mi.campusId, campusIds), eq(mi.status, 'open')),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(hr)
          .where(
            and(
              this.scopeWhere(institutionId, hr.institutionId, hr.campusId, campusIds),
              eq(hr.followUpRequired, true),
              sql`${hr.status} <> 'resolved'`,
            ),
          ),
      ),
    ]);
    return { openIncidents, followUps };
  }

  /** Books currently on loan and how many of those are past their due date. */
  async libraryLoans(
    institutionId: string,
    campusIds: string[] | null,
  ): Promise<{ onLoan: number; overdue: number }> {
    const t = schema.libraryLoans;
    const today = new Date().toISOString().slice(0, 10);
    // library_loans has no campus_id of its own — it hangs off the book. Scope by institution and
    // narrow through the book's campus when the caller is campus-confined.
    const base: SQL[] = [eq(t.institutionId, institutionId), eq(t.status, 'issued')];
    if (campusIds !== null) {
      base.push(
        campusIds.length === 0
          ? sql`false`
          : sql`exists (select 1 from ${schema.libraryBooks} b where b.id = ${t.bookId} and (b.campus_id is null or ${inArray(sql`b.campus_id`, campusIds)}))`,
      );
    }
    const [onLoan, overdue] = await Promise.all([
      this.scalar(this.db.select({ value: count() }).from(t).where(and(...base))),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(t)
          .where(and(...base, lt(t.dueDate, today))),
      ),
    ]);
    return { onLoan, overdue };
  }

  /** Active transport routes and students riding them. */
  async transportOverview(
    institutionId: string,
    campusIds: string[] | null,
  ): Promise<{ activeRoutes: number; ridersAssigned: number }> {
    const r = schema.transportRoutes;
    const a = schema.transportAssignments;
    const [activeRoutes, ridersAssigned] = await Promise.all([
      this.scalar(
        this.db
          .select({ value: count() })
          .from(r)
          .where(
            and(this.scopeWhere(institutionId, r.institutionId, r.campusId, campusIds), eq(r.status, 'active')),
          ),
      ),
      this.scalar(
        this.db
          .select({ value: count() })
          .from(a)
          .where(and(eq(a.institutionId, institutionId), eq(a.status, 'active'))),
      ),
    ]);
    return { activeRoutes, ridersAssigned };
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
