import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, schema, sql, type Database } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import { can as hasPerm } from '@edrion/permissions';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';

const RECENT = 5;

/**
 * Student-360 aggregation: ONE read that gathers everything about a student across the existing
 * modules — identity, hostel residence, guardians, academics (marks + assignments), attendance,
 * fees, health, and conduct (behaviour incidents + complaints). Each section is gated by the
 * caller's OWN permissions (a nurse never sees fees) and returns null when not permitted, so the UI
 * shows only what the user may see. Read-only + scope-confined.
 */
@Injectable()
export class StudentProfileService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async profile(ctx: PortalActionContext, studentId: string) {
    const can = (k: string) => hasPerm(ctx.principal.permissions, k);
    const instId = ctx.principal.institutionId;

    const [student] = await this.db
      .select()
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.institutionId, instId)))
      .limit(1);
    if (!student) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Student not found' });

    // Scope confinement — a campus-confined caller can only open students in their campus.
    const f = resolveScopeFilter(ctx.principal, ctx.scope);
    if (f.campusIds !== null && student.campusId !== null && !f.campusIds.includes(student.campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }

    const [overview, hostel, guardians, academics, attendance, fees, health, conduct] = await Promise.all([
      this.overview(student),
      can('hostel.view') ? this.hostel(studentId) : null,
      can('students.view') || can('parents.view') ? this.guardians(studentId) : null,
      can('gradebook.view') || can('assignments.view') ? this.academics(instId, studentId) : null,
      can('attendance.view') ? this.attendance(instId, studentId) : null,
      can('fees.view') ? this.fees(studentId) : null,
      can('health_records.view') ? this.health(instId, studentId) : null,
      can('student_conduct.view') ? this.conduct(instId, studentId) : null,
    ]);

    return { overview, hostel, guardians, academics, attendance, fees, health, conduct };
  }

  private async overview(student: typeof schema.students.$inferSelect) {
    const [cls] = student.classId
      ? await this.db.select({ name: schema.classes.name }).from(schema.classes).where(eq(schema.classes.id, student.classId)).limit(1)
      : [];
    const [grade] = student.gradeLevelId
      ? await this.db.select({ name: schema.gradeLevels.name }).from(schema.gradeLevels).where(eq(schema.gradeLevels.id, student.gradeLevelId)).limit(1)
      : [];
    const [campus] = student.campusId
      ? await this.db.select({ name: schema.campuses.name }).from(schema.campuses).where(eq(schema.campuses.id, student.campusId)).limit(1)
      : [];
    return {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`.trim(),
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth,
      email: student.email,
      phone: student.phone,
      status: student.status,
      enrollmentDate: student.enrollmentDate,
      className: cls?.name ?? null,
      gradeName: grade?.name ?? null,
      campusName: campus?.name ?? null,
    };
  }

  /** Residence: the active hostel allocation, or null (day scholar). */
  private async hostel(studentId: string) {
    const a = schema.hostelAllocations;
    const [row] = await this.db
      .select({ bedNo: a.bedNo, fromDate: a.fromDate, roomNo: schema.hostelRooms.roomNo, blockName: schema.hostelBlocks.name })
      .from(a)
      .leftJoin(schema.hostelRooms, eq(schema.hostelRooms.id, a.roomId))
      .leftJoin(schema.hostelBlocks, eq(schema.hostelBlocks.id, schema.hostelRooms.blockId))
      .where(and(eq(a.studentId, studentId), eq(a.status, 'active')))
      .limit(1);
    return {
      resident: !!row,
      blockName: row?.blockName ?? null,
      roomNo: row?.roomNo ?? null,
      bedNo: row?.bedNo ?? null,
      since: row?.fromDate ?? null,
    };
  }

  private async guardians(studentId: string) {
    const sg = schema.studentGuardians;
    const rows = await this.db
      .select({
        relationship: sg.relationship,
        isPrimary: sg.isPrimary,
        isEmergencyContact: sg.isEmergencyContact,
        firstName: schema.parents.firstName,
        lastName: schema.parents.lastName,
        email: schema.parents.email,
        phone: schema.parents.phone,
      })
      .from(sg)
      .leftJoin(schema.parents, eq(schema.parents.id, sg.parentId))
      .where(eq(sg.studentId, studentId));
    return rows.map((r) => ({
      name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Guardian',
      relationship: r.relationship,
      isPrimary: r.isPrimary,
      isEmergencyContact: r.isEmergencyContact,
      email: r.email,
      phone: r.phone,
    }));
  }

  private async academics(instId: string, studentId: string) {
    const g = schema.gradeEntries;
    const grades = await this.db
      .select({ marksObtained: g.marksObtained, maxMarks: g.maxMarks, letterGrade: g.letterGrade, remarks: g.remarks, createdAt: g.createdAt })
      .from(g)
      .where(and(eq(g.institutionId, instId), eq(g.studentId, studentId)))
      .orderBy(desc(g.createdAt))
      .limit(RECENT);
    const [gTot] = await this.db
      .select({ n: count(), obtained: sql<number>`coalesce(sum(${g.marksObtained}),0)`, max: sql<number>`coalesce(sum(${g.maxMarks}),0)` })
      .from(g)
      .where(and(eq(g.institutionId, instId), eq(g.studentId, studentId)));
    const totalMax = Number(gTot?.max ?? 0);
    const averagePct = totalMax > 0 ? Math.round((Number(gTot?.obtained ?? 0) / totalMax) * 100) : null;

    const sub = schema.assignmentSubmissions;
    const subCounts = await this.db
      .select({ status: sub.status, n: sql<number>`count(*)::int` })
      .from(sub)
      .where(eq(sub.studentId, studentId))
      .groupBy(sub.status);
    const submissions = { total: 0, submitted: 0, graded: 0, pending: 0 };
    for (const r of subCounts) {
      submissions.total += r.n;
      if (r.status === 'submitted') submissions.submitted += r.n;
      else if (r.status === 'graded') submissions.graded += r.n;
      else submissions.pending += r.n;
    }

    return {
      gradesRecorded: Number(gTot?.n ?? 0),
      averagePct,
      recentGrades: grades.map((r) => ({ marksObtained: r.marksObtained, maxMarks: r.maxMarks, letterGrade: r.letterGrade, remarks: r.remarks, at: r.createdAt })),
      submissions,
    };
  }

  private async attendance(instId: string, studentId: string) {
    const t = schema.attendanceRecords;
    const rows = await this.db
      .select({ status: t.status, n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(eq(t.institutionId, instId), eq(t.studentId, studentId)))
      .groupBy(t.status);
    let present = 0;
    let absent = 0;
    let late = 0;
    let total = 0;
    for (const r of rows) {
      total += r.n;
      if (r.status === 'present') present += r.n;
      else if (r.status === 'absent') absent += r.n;
      else if (r.status === 'late') late += r.n;
    }
    const ratePct = total > 0 ? Math.round(((present + late) / total) * 100) : null;
    return { total, present, absent, late, ratePct };
  }

  private async fees(studentId: string) {
    const t = schema.feeInvoices;
    const [agg] = await this.db
      .select({
        n: count(),
        billed: sql<number>`coalesce(sum(${t.amount}),0)`,
        paid: sql<number>`coalesce(sum(${t.amountPaid}),0)`,
      })
      .from(t)
      .where(eq(t.studentId, studentId));
    const [overdue] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t)
      .where(and(eq(t.studentId, studentId), eq(t.status, 'overdue')));
    const billedMinor = Number(agg?.billed ?? 0);
    const paidMinor = Number(agg?.paid ?? 0);
    return { invoices: Number(agg?.n ?? 0), billedMinor, paidMinor, outstandingMinor: Math.max(0, billedMinor - paidMinor), overdue: Number(overdue?.n ?? 0) };
  }

  private async health(instId: string, studentId: string) {
    const hr = schema.healthRecords;
    const records = await this.db
      .select({
        id: hr.id,
        recordType: hr.recordType,
        title: hr.title,
        status: hr.status,
        followUpRequired: hr.followUpRequired,
        followUpAt: hr.followUpAt,
        reason: hr.reason,
        symptoms: hr.symptoms,
        actionTaken: hr.actionTaken,
        treatment: hr.treatment,
        attendedBy: hr.attendedBy,
        details: hr.details,
        bloodGroup: hr.bloodGroup,
        createdAt: hr.createdAt,
      })
      .from(hr)
      .where(and(eq(hr.institutionId, instId), eq(hr.studentId, studentId)))
      .orderBy(desc(hr.createdAt))
      .limit(RECENT);
    const mi = schema.medicalIncidents;
    const incidents = await this.db
      .select({
        id: mi.id,
        title: mi.title,
        severity: mi.severity,
        status: mi.status,
        description: mi.description,
        actionTaken: mi.actionTaken,
        treatment: mi.treatment,
        attendedBy: mi.attendedBy,
        followUpRequired: mi.followUpRequired,
        followUpAt: mi.followUpAt,
        occurredAt: mi.occurredAt,
      })
      .from(mi)
      .where(and(eq(mi.institutionId, instId), eq(mi.studentId, studentId)))
      .orderBy(desc(mi.occurredAt))
      .limit(RECENT);
    const [inc] = await this.db
      .select({ open: sql<number>`count(*) filter (where ${mi.status} = 'open')::int`, total: sql<number>`count(*)::int` })
      .from(mi)
      .where(and(eq(mi.institutionId, instId), eq(mi.studentId, studentId)));
    return {
      records: records.map((r) => ({
        id: r.id,
        recordType: r.recordType,
        title: r.title,
        status: r.status,
        followUpRequired: r.followUpRequired,
        followUpAt: r.followUpAt,
        reason: r.reason,
        symptoms: r.symptoms,
        actionTaken: r.actionTaken,
        treatment: r.treatment,
        attendedBy: r.attendedBy,
        details: r.details,
        bloodGroup: r.bloodGroup,
        at: r.createdAt,
      })),
      incidents: incidents.map((r) => ({
        id: r.id,
        title: r.title,
        severity: r.severity,
        status: r.status,
        description: r.description,
        actionTaken: r.actionTaken,
        treatment: r.treatment,
        attendedBy: r.attendedBy,
        followUpRequired: r.followUpRequired,
        followUpAt: r.followUpAt,
        occurredAt: r.occurredAt?.toISOString() ?? null,
      })),
      incidentsOpen: Number(inc?.open ?? 0),
      incidentsTotal: Number(inc?.total ?? 0),
    };
  }

  private async conduct(instId: string, studentId: string) {
    const t = schema.studentIncidents;
    const items = await this.db
      .select({
        id: t.id,
        category: t.category,
        title: t.title,
        severity: t.severity,
        status: t.status,
        occurredOn: t.occurredOn,
        description: t.description,
        reporterName: t.reporterName,
        resolutionNote: t.resolutionNote,
        notifyGuardians: t.notifyGuardians,
        createdAt: t.createdAt,
      })
      .from(t)
      .where(and(eq(t.institutionId, instId), eq(t.studentId, studentId)))
      .orderBy(desc(sql`coalesce(${t.occurredOn}, ${t.createdAt}::date)`))
      .limit(RECENT);
    const [agg] = await this.db
      .select({ open: sql<number>`count(*) filter (where ${t.status} = 'open')::int`, total: sql<number>`count(*)::int` })
      .from(t)
      .where(and(eq(t.institutionId, instId), eq(t.studentId, studentId)));
    return {
      open: Number(agg?.open ?? 0),
      total: Number(agg?.total ?? 0),
      recent: items.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        severity: r.severity,
        status: r.status,
        occurredOn: r.occurredOn,
        description: r.description,
        reporterName: r.reporterName,
        resolutionNote: r.resolutionNote,
        notifyGuardians: r.notifyGuardians,
        at: r.createdAt,
      })),
    };
  }
}
