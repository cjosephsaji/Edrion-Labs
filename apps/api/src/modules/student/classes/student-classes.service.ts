import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;

@Injectable()
export class StudentClassesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(principal: InstitutionalStudentPrincipal) {
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student?.classId) return { items: [] };

    const rows = await this.db
      .select({
        subjectId: schema.subjects.id,
        subjectName: schema.subjects.name,
        teacherName,
      })
      .from(schema.classSubjectTeachers)
      .innerJoin(schema.subjects, eq(schema.classSubjectTeachers.subjectId, schema.subjects.id))
      .leftJoin(schema.staff, eq(schema.classSubjectTeachers.teacherId, schema.staff.id))
      .where(eq(schema.classSubjectTeachers.classId, student.classId));

    return {
      items: rows.map((r) => ({
        id: r.subjectId,
        subjectClassId: r.subjectId,
        name: r.subjectName,
        initial: r.subjectName.slice(0, 1).toUpperCase(),
        teacherName: r.teacherName,
        nextMeta: null,
        liveToday: false,
      })),
    };
  }

  async stream(principal: InstitutionalStudentPrincipal, _subjectId: string) {
    const classId = await this.studentClassId(principal.studentId);
    const posts = await this.db
      .select()
      .from(schema.classStreamPosts)
      .where(and(eq(schema.classStreamPosts.contextType, 'class'), eq(schema.classStreamPosts.contextId, classId)))
      .orderBy(asc(schema.classStreamPosts.postedAt));
    const acked = await this.ackedPostIds(principal.studentId, posts.map((p) => p.id));
    return {
      items: posts.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        body: p.body,
        topicKey: p.topicKey,
        requiresAck: p.requiresAck,
        acked: acked.has(p.id),
        postedAt: p.postedAt.toISOString(),
      })),
    };
  }

  async materials(principal: InstitutionalStudentPrincipal, _subjectId: string) {
    const classId = await this.studentClassId(principal.studentId);
    const rows = await this.db
      .select()
      .from(schema.classMaterials)
      .where(and(eq(schema.classMaterials.contextType, 'class'), eq(schema.classMaterials.contextId, classId)));
    return {
      items: rows.map((m) => ({
        id: m.id,
        title: m.title,
        kindLabel: m.kindLabel,
        weekNo: m.weekNo,
        description: m.description,
      })),
    };
  }

  async homework(principal: InstitutionalStudentPrincipal, subjectId: string) {
    const classId = await this.studentClassId(principal.studentId);
    const rows = await this.db
      .select({ id: schema.homework.id, title: schema.homework.title, dueAt: schema.homework.dueAt })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .where(
        and(
          eq(schema.homeworkSubmissions.studentId, principal.studentId),
          eq(schema.homework.classId, classId),
          eq(schema.homework.subjectId, subjectId),
        ),
      );
    return { items: rows };
  }

  async about(principal: InstitutionalStudentPrincipal, subjectId: string) {
    const classId = await this.studentClassId(principal.studentId);
    const [cst] = await this.db
      .select({ teacherName })
      .from(schema.classSubjectTeachers)
      .leftJoin(schema.staff, eq(schema.classSubjectTeachers.teacherId, schema.staff.id))
      .where(and(eq(schema.classSubjectTeachers.classId, classId), eq(schema.classSubjectTeachers.subjectId, subjectId)))
      .limit(1);

    const slots = await this.db
      .select({ day: schema.timetableSlots.dayOfWeek, start: schema.timetableSlots.startTime, end: schema.timetableSlots.endTime })
      .from(schema.timetableSlots)
      .where(and(eq(schema.timetableSlots.classId, classId), eq(schema.timetableSlots.subjectId, subjectId)));

    const [att] = await this.db
      .select({
        present: sql<number>`count(*) filter (where ${schema.attendanceRecords.status} = 'present')`,
        total: sql<number>`count(*) filter (where ${schema.attendanceRecords.status} <> 'excused')`,
      })
      .from(schema.attendanceRecords)
      .innerJoin(schema.attendanceSessions, eq(schema.attendanceRecords.sessionId, schema.attendanceSessions.id))
      .where(and(eq(schema.attendanceRecords.studentId, principal.studentId), eq(schema.attendanceSessions.classId, classId)));

    return {
      teacherName: cst?.teacherName ?? null,
      timetableLines: slots.map((s) => `${s.day} ${s.start}–${s.end}`),
      attendance: { present: Number(att?.present ?? 0), total: Number(att?.total ?? 0) },
    };
  }

  async ack(principal: InstitutionalStudentPrincipal, postId: string) {
    await this.db
      .insert(schema.classStreamAcks)
      .values({ postId, studentId: principal.studentId })
      .onConflictDoNothing();
    return { acked: true };
  }

  private async studentClassId(studentId: string) {
    const [s] = await this.db.select({ classId: schema.students.classId }).from(schema.students).where(eq(schema.students.id, studentId)).limit(1);
    if (!s?.classId) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Class not found' });
    return s.classId;
  }

  private async ackedPostIds(studentId: string, postIds: string[]) {
    if (!postIds.length) return new Set<string>();
    const rows = await this.db
      .select({ postId: schema.classStreamAcks.postId })
      .from(schema.classStreamAcks)
      .where(and(eq(schema.classStreamAcks.studentId, studentId), inArray(schema.classStreamAcks.postId, postIds)));
    return new Set(rows.map((r) => r.postId));
  }
}
