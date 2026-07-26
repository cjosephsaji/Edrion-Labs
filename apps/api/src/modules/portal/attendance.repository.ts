import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  schema,
  sql,
  personSqlName,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  AttendanceRecord,
  AttendanceSession,
  NewAttendanceRecord,
  NewAttendanceSession,
} from '@edrion/database';
import type { AttendanceListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';
import { programmeListFilterConds } from './programme-list-filters';
import { scopeConds } from './portal-scope';

const teacherDisplayName = personSqlName(schema.staff.firstName, schema.staff.middleName, schema.staff.lastName);
const studentDisplayName = personSqlName(schema.students.firstName, schema.students.middleName, schema.students.lastName);

export interface AttendanceSessionRow extends AttendanceSession {
  className: string | null;
  subjectName: string | null;
  takenByName: string | null;
  presentCount: number;
  recordCount: number;
}
export interface AttendanceRecordRow extends AttendanceRecord {
  studentName: string | null;
  admissionNo: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type AttendanceRefTable = 'classes' | 'subjects' | 'staff' | 'students';

/**
 * Typed SQL for the institution-portal attendance tables (sessions + per-student records). Every
 * query is confined to one institution; campus-scoped session reads also include institution-owned
 * (campus_id IS NULL) rows. The service owns scope/version/FK/audit.
 */
@Injectable()
export class AttendanceRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(
    instCol: PgColumn,
    campusCol: PgColumn,
    institutionId: string,
    campusIds: CampusFilter,
  ): SQL[] {
    return scopeConds(instCol, campusCol, institutionId, campusIds);
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: AttendanceRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- sessions --------------------------------------------------------------

  async listSessions(institutionId: string, campusIds: CampusFilter, q: AttendanceListQuery): Promise<Page<AttendanceSessionRow>> {
    const t = schema.attendanceSessions;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.classId) conds.push(eq(t.classId, q.classId));
    if (q.date) conds.push(eq(t.date, q.date));
    if (q.search) {
      const s = `%${q.search}%`;
      conds.push(or(ilike(t.period, s), ilike(t.notes, s))!);
    }
    conds.push(
      ...programmeListFilterConds(this.db, q, {
        academicYearId: t.academicYearId,
        termId: t.termId,
        classId: t.classId,
        termIdNullMeansWholeYear: true,
      }),
    );
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { date: t.date, period: t.period, createdAt: t.createdAt };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const recCount = sql<number>`(select count(*) from ${schema.attendanceRecords} ar where ar.session_id = ${t.id})`;
    const presentCount = sql<number>`(select count(*) from ${schema.attendanceRecords} ar where ar.session_id = ${t.id} and ar.status = 'present')`;

    const rows = await this.db
      .select({
        session: t,
        className: schema.classes.name,
        subjectName: schema.subjects.name,
        takenByName: teacherDisplayName,
        recordCount: recCount,
        presentCount,
      })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, t.takenById))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.date))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.session,
        className: r.className,
        subjectName: r.subjectName,
        takenByName: r.takenByName,
        recordCount: Number(r.recordCount ?? 0),
        presentCount: Number(r.presentCount ?? 0),
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findSession(id: string, institutionId: string): Promise<AttendanceSession | undefined> {
    const t = schema.attendanceSessions;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  /** A register already exists for this (class, date, period)? (friendly 409 instead of a 500). */
  async findSessionByKey(
    institutionId: string,
    classId: string,
    date: string,
    period: string,
  ): Promise<AttendanceSession | undefined> {
    const t = schema.attendanceSessions;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.classId, classId), eq(t.date, date), eq(t.period, period)))
      .limit(1);
    return row;
  }

  async insertSession(values: NewAttendanceSession): Promise<AttendanceSession> {
    const [row] = await this.db.insert(schema.attendanceSessions).values(values).returning();
    return row!;
  }

  async updateSession(id: string, version: number, patch: Partial<NewAttendanceSession>): Promise<AttendanceSession | undefined> {
    const t = schema.attendanceSessions;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteSession(id: string, version: number): Promise<boolean> {
    const t = schema.attendanceSessions;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- records ---------------------------------------------------------------

  async listRecords(sessionId: string): Promise<AttendanceRecordRow[]> {
    const t = schema.attendanceRecords;
    const rows = await this.db
      .select({ rec: t, studentName: studentDisplayName, admissionNo: schema.students.admissionNo })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .where(eq(t.sessionId, sessionId))
      .orderBy(asc(studentDisplayName));
    return rows.map((r) => ({ ...r.rec, studentName: r.studentName, admissionNo: r.admissionNo }));
  }

  /** Upsert one student's mark within a session (unique on (session, student)). */
  async upsertRecord(values: NewAttendanceRecord): Promise<void> {
    const t = schema.attendanceRecords;
    await this.db
      .insert(t)
      .values(values)
      .onConflictDoUpdate({
        target: [t.sessionId, t.studentId],
        set: {
          status: values.status,
          remarks: values.remarks ?? null,
          provenance: values.provenance ?? null,
          version: sql`${t.version} + 1`,
          updatedBy: values.createdBy ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async findRecord(id: string, sessionId: string): Promise<AttendanceRecord | undefined> {
    const t = schema.attendanceRecords;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.sessionId, sessionId))).limit(1);
    return row;
  }

  async deleteRecord(id: string): Promise<boolean> {
    const t = schema.attendanceRecords;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  /** Which of these student ids exist in the institution? */
  async existingStudentIds(ids: string[], institutionId: string): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const t = schema.students;
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /** Student ids enrolled in a class (for register roster). */
  async classRosterStudentIds(classId: string, institutionId: string): Promise<string[]> {
    const t = schema.students;
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.classId, classId)));
    return rows.map((r) => r.id);
  }

  async classRoster(
    classId: string,
    institutionId: string,
  ): Promise<Array<{ id: string; studentName: string | null; admissionNo: string | null }>> {
    const t = schema.students;
    const rows = await this.db
      .select({
        id: t.id,
        studentName: studentDisplayName,
        admissionNo: t.admissionNo,
      })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.classId, classId)))
      .orderBy(asc(studentDisplayName));
    return rows;
  }

  /** Bulk upsert marks in one statement. */
  async upsertRecords(rows: NewAttendanceRecord[]): Promise<void> {
    if (rows.length === 0) return;
    const t = schema.attendanceRecords;
    await this.db
      .insert(t)
      .values(rows)
      .onConflictDoUpdate({
        target: [t.sessionId, t.studentId],
        set: {
          status: sql`excluded.status`,
          remarks: sql`excluded.remarks`,
          provenance: sql`coalesce(excluded.provenance, ${t.provenance})`,
          version: sql`${t.version} + 1`,
          updatedBy: sql`excluded.created_by`,
          updatedAt: new Date(),
        },
      });
  }

  async findSessionBySlotId(
    institutionId: string,
    classId: string,
    date: string,
    slotId: string,
  ): Promise<AttendanceSession | undefined> {
    const t = schema.attendanceSessions;
    const [row] = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.institutionId, institutionId),
          eq(t.classId, classId),
          eq(t.date, date),
          eq(t.slotId, slotId),
        ),
      )
      .limit(1);
    return row;
  }

  async findTimetableSlot(
    slotId: string,
    institutionId: string,
  ): Promise<
    | (typeof schema.timetableSlots.$inferSelect & {
        periodLabel: string;
      })
    | undefined
  > {
    const t = schema.timetableSlots;
    const [row] = await this.db
      .select({
        slot: t,
        periodLabel: sql<string>`coalesce(${t.label}, ${t.startTime})`,
      })
      .from(t)
      .where(and(eq(t.id, slotId), eq(t.institutionId, institutionId)))
      .limit(1);
    if (!row) return undefined;
    return {
      ...row.slot,
      periodLabel: row.periodLabel,
    };
  }

  async getInstitutionTimezone(institutionId: string): Promise<string> {
    const t = schema.institutions;
    const [row] = await this.db
      .select({ timezone: t.timezone })
      .from(t)
      .where(eq(t.id, institutionId))
      .limit(1);
    return row?.timezone ?? 'UTC';
  }

  /**
   * Timetable teaching slots for a weekday, left-joined to attendance sessions for the given date.
   */
  async listAgendaSlots(args: {
    institutionId: string;
    campusIds: CampusFilter;
    date: string;
    dayOfWeek: number;
    teacherId?: string | null;
    classId?: string;
  }): Promise<
    Array<{
      slotId: string;
      periodLabel: string;
      startTime: string;
      endTime: string;
      classId: string;
      className: string | null;
      subjectId: string | null;
      subjectName: string | null;
      teacherId: string | null;
      teacherName: string | null;
      room: string | null;
      sessionId: string | null;
      sessionVersion: number | null;
      recordCount: number;
      presentCount: number;
      rosterSize: number;
    }>
  > {
    const t = schema.timetableSlots;
    const sess = schema.attendanceSessions;

    const conds = this.scopeConds(t.institutionId, t.campusId, args.institutionId, args.campusIds);
    conds.push(eq(t.dayOfWeek, args.dayOfWeek));
    conds.push(eq(t.kind, 'teaching'));
    if (args.teacherId) conds.push(eq(t.teacherId, args.teacherId));
    if (args.classId) conds.push(eq(t.classId, args.classId));

    const recCount = sql<number>`coalesce((select count(*) from ${schema.attendanceRecords} ar where ar.session_id = ${sess.id}), 0)`;
    const presentCount = sql<number>`coalesce((select count(*) from ${schema.attendanceRecords} ar where ar.session_id = ${sess.id} and ar.status = 'present'), 0)`;
    const rosterSize = sql<number>`(select count(*) from ${schema.students} st where st.class_id = ${t.classId} and st.institution_id = ${t.institutionId})`;

    const rows = await this.db
      .select({
        slotId: t.id,
        periodLabel: sql<string>`coalesce(${t.label}, ${t.startTime})`,
        startTime: t.startTime,
        endTime: t.endTime,
        classId: t.classId,
        className: schema.classes.name,
        subjectId: t.subjectId,
        subjectName: schema.subjects.name,
        teacherId: t.teacherId,
        teacherName: teacherDisplayName,
        room: t.room,
        sessionId: sess.id,
        sessionVersion: sess.version,
        recordCount: recCount,
        presentCount,
        rosterSize,
      })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, t.teacherId))
      .leftJoin(
        sess,
        and(
          eq(sess.classId, t.classId),
          eq(sess.date, args.date),
          eq(sess.institutionId, args.institutionId),
          eq(sess.slotId, t.id),
        ),
      )
      .where(and(...conds))
      .orderBy(asc(t.startTime));

    return rows.map((r) => ({
      slotId: r.slotId,
      periodLabel: r.periodLabel,
      startTime: r.startTime,
      endTime: r.endTime,
      classId: r.classId,
      className: r.className,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      teacherId: r.teacherId,
      teacherName: r.teacherName,
      room: r.room,
      sessionId: r.sessionId,
      sessionVersion: r.sessionVersion,
      recordCount: Number(r.recordCount ?? 0),
      presentCount: Number(r.presentCount ?? 0),
      rosterSize: Number(r.rosterSize ?? 0),
    }));
  }
}
