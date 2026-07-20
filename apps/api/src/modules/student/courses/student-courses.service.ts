import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

const profName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;

@Injectable()
export class StudentCoursesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select({
        id: schema.courses.id,
        code: schema.courses.code,
        name: schema.courses.name,
        credits: schema.courses.credits,
        professorName: profName,
      })
      .from(schema.courseEnrollments)
      .innerJoin(schema.courses, eq(schema.courseEnrollments.courseId, schema.courses.id))
      .leftJoin(schema.staff, eq(schema.courses.professorTeacherId, schema.staff.id))
      .where(eq(schema.courseEnrollments.studentId, principal.studentId));
    return { items: rows };
  }

  async announcements(principal: InstitutionalStudentPrincipal, courseId: string) {
    await this.requireEnrollment(principal.studentId, courseId);
    return this.streamPosts(courseId);
  }

  async syllabus(principal: InstitutionalStudentPrincipal, courseId: string) {
    await this.requireEnrollment(principal.studentId, courseId);
    const modules = await this.db
      .select()
      .from(schema.courseSyllabusModules)
      .where(eq(schema.courseSyllabusModules.courseId, courseId))
      .orderBy(asc(schema.courseSyllabusModules.weekNo));
    const currentWeek = new Date().getMonth() < 6 ? 1 : 2; // simplified
    return {
      modules: modules.map((m) => ({
        weekNo: m.weekNo,
        title: m.title,
        topics: m.topics,
        covered: m.covered,
        isCurrentWeek: m.weekNo === currentWeek,
      })),
    };
  }

  async materials(principal: InstitutionalStudentPrincipal, courseId: string) {
    await this.requireEnrollment(principal.studentId, courseId);
    const rows = await this.db
      .select()
      .from(schema.classMaterials)
      .where(and(eq(schema.classMaterials.contextType, 'course'), eq(schema.classMaterials.contextId, courseId)))
      .orderBy(asc(schema.classMaterials.weekNo));
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

  async projects(principal: InstitutionalStudentPrincipal, courseId: string) {
    await this.requireEnrollment(principal.studentId, courseId);
    const rows = await this.db
      .select({ id: schema.assignments.id, title: schema.assignments.title, dueDate: schema.assignments.dueDate })
      .from(schema.assignments)
      .where(and(eq(schema.assignments.courseId, courseId), eq(schema.assignments.status, 'published')));
    return { items: rows };
  }

  async about(principal: InstitutionalStudentPrincipal, courseId: string) {
    const [course] = await this.db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).limit(1);
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
    await this.requireEnrollment(principal.studentId, courseId);

    const [att] = await this.db
      .select({
        present: sql<number>`count(*) filter (where ${schema.attendanceRecords.status} = 'present')`,
        total: sql<number>`count(*) filter (where ${schema.attendanceRecords.status} <> 'excused')`,
      })
      .from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.studentId, principal.studentId));

    const present = Number(att?.present ?? 0);
    const total = Number(att?.total ?? 0);
    const pct = total > 0 ? Math.round((present / total) * 100) : 100;
    const required = course.attendanceRequiredPct;
    const below = pct < required;
    const need = below ? Math.ceil((required / 100) * (total + 1)) - present : 0;

    return {
      officeHours: course.officeHours,
      gradingScheme: course.gradingScheme ?? [],
      attendance: {
        present,
        total,
        requiredPct: required,
        belowThreshold: below,
        warningLine: below ? `Attendance needs attention — ${need} more lectures to stay above ${required}%` : null,
      },
    };
  }

  private async streamPosts(courseId: string) {
    const posts = await this.db
      .select()
      .from(schema.classStreamPosts)
      .where(and(eq(schema.classStreamPosts.contextType, 'course'), eq(schema.classStreamPosts.contextId, courseId)))
      .orderBy(desc(schema.classStreamPosts.postedAt));
    return {
      items: posts.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        body: p.body,
        topicKey: p.topicKey,
        requiresAck: p.requiresAck,
        acked: false,
        postedAt: p.postedAt.toISOString(),
      })),
    };
  }

  private async requireEnrollment(studentId: string, courseId: string) {
    const [row] = await this.db
      .select({ id: schema.courseEnrollments.id })
      .from(schema.courseEnrollments)
      .where(and(eq(schema.courseEnrollments.studentId, studentId), eq(schema.courseEnrollments.courseId, courseId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Course not found' });
  }
}
