import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { canonicalMaterialMimeType } from './material-file-types';

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
      filename: string | null;
      mimeType: string;
      subjectName: string | null;
      publishedAt: string;
    }> = [];

    for (const ctx of contexts) {
      // Left join: a material filed before subjects existed still belongs to the class.
      const rows = await this.db
        .select({
          id: schema.classMaterials.id,
          title: schema.classMaterials.title,
          description: schema.classMaterials.description,
          kindLabel: schema.classMaterials.kindLabel,
          weekNo: schema.classMaterials.weekNo,
          filename: schema.storageObjects.filename,
          mimeType: schema.storageObjects.mimeType,
          createdAt: schema.classMaterials.createdAt,
          subjectName: schema.subjects.name,
        })
        .from(schema.classMaterials)
        .innerJoin(schema.storageObjects, eq(schema.storageObjects.id, schema.classMaterials.objectId))
        .leftJoin(schema.subjects, eq(schema.subjects.id, schema.classMaterials.subjectId))
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
          subjectName: m.subjectName,
          filename: m.filename,
          mimeType: canonicalMaterialMimeType(m.filename, m.mimeType),
          publishedAt: m.createdAt.toISOString(),
        });
      }
    }

    items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return { items };
  }

  async file(principal: InstitutionalStudentPrincipal, materialId: string) {
    const visibleMaterials = await this.list(principal);
    if (!visibleMaterials.items.some((material) => material.id === materialId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Study material not found' });
    }

    const [file] = await this.db
      .select({
        objectId: schema.storageObjects.id,
        storageKey: schema.storageObjects.storageKey,
        filename: schema.storageObjects.filename,
        mimeType: schema.storageObjects.mimeType,
        derived: schema.storageObjects.derived,
      })
      .from(schema.classMaterials)
      .innerJoin(schema.storageObjects, eq(schema.storageObjects.id, schema.classMaterials.objectId))
      .where(
        and(
          eq(schema.classMaterials.id, materialId),
          eq(schema.classMaterials.institutionId, principal.institutionId),
        ),
      )
      .limit(1);

    if (!file) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Study material file not found' });
    }
    return {
      ...file,
      mimeType: canonicalMaterialMimeType(file.filename, file.mimeType),
    };
  }

  /** Reuse the student's already-extracted Petros pages before parsing the source again. */
  async previewPages(principal: InstitutionalStudentPrincipal, materialId: string) {
    const [source] = await this.db
      .select({ id: schema.knowledgeItems.id })
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.institutionId, principal.institutionId),
          eq(schema.knowledgeItems.studentId, principal.studentId),
          sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${materialId}`,
        ),
      )
      .orderBy(desc(schema.knowledgeItems.updatedAt))
      .limit(1);

    if (!source) return [];
    return this.db
      .select({
        pageIndex: schema.knowledgeItemPages.pageIndex,
        text: schema.knowledgeItemPages.text,
      })
      .from(schema.knowledgeItemPages)
      .where(eq(schema.knowledgeItemPages.itemId, source.id))
      .orderBy(asc(schema.knowledgeItemPages.pageIndex));
  }
}
