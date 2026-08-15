import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class StudentMaterialsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(principal: InstitutionalStudentPrincipal) {
    const [student] = await this.db
      .select({ classId: schema.students.classId, className: schema.classes.name })
      .from(schema.students)
      .leftJoin(schema.classes, eq(schema.students.classId, schema.classes.id))
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);

    const courseIds = await this.db
      .select({ courseId: schema.courseEnrollments.courseId, name: schema.courses.name })
      .from(schema.courseEnrollments)
      .innerJoin(schema.courses, eq(schema.courseEnrollments.courseId, schema.courses.id))
      .where(eq(schema.courseEnrollments.studentId, principal.studentId));

    const contexts: Array<{ type: string; id: string; name: string | null }> = [];
    if (student?.classId) {
      contexts.push({ type: 'class', id: student.classId, name: student.className });
    }
    for (const c of courseIds) {
      contexts.push({ type: 'course', id: c.courseId, name: c.name });
    }
    if (!contexts.length) return { items: [] };

    const items: Array<{
      id: string;
      title: string;
      description: string | null;
      kindLabel: string;
      weekNo: number | null;
      className: string | null;
      publishedAt: string;
    }> = [];

    for (const ctx of contexts) {
      const rows = await this.db
        .select()
        .from(schema.classMaterials)
        .where(
          and(
            eq(schema.classMaterials.institutionId, principal.institutionId),
            eq(schema.classMaterials.contextType, ctx.type),
            eq(schema.classMaterials.contextId, ctx.id),
          ),
        );
      for (const m of rows) {
        items.push({
          id: m.id,
          title: m.title,
          description: m.description,
          kindLabel: m.kindLabel,
          weekNo: m.weekNo,
          className: ctx.name,
          publishedAt: m.createdAt.toISOString(),
        });
      }
    }

    items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return { items };
  }
}
