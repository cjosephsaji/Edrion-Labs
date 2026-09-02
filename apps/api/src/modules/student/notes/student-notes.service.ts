import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

interface NoteContext {
  type: 'class' | 'course' | 'subject';
  id: string;
  name: string | null;
}

@Injectable()
export class StudentNotesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Where a student can be taught: their class, each enrolled course, and each subject
   * on the class timetable. A note published against any of these is theirs to read.
   */
  private async contexts(principal: InstitutionalStudentPrincipal): Promise<NoteContext[]> {
    const [student] = await this.db
      .select({ classId: schema.students.classId, className: schema.classes.name })
      .from(schema.students)
      .leftJoin(schema.classes, eq(schema.students.classId, schema.classes.id))
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);

    const courses = await this.db
      .select({ courseId: schema.courseEnrollments.courseId, name: schema.courses.name })
      .from(schema.courseEnrollments)
      .innerJoin(schema.courses, eq(schema.courseEnrollments.courseId, schema.courses.id))
      .where(eq(schema.courseEnrollments.studentId, principal.studentId));

    const contexts: NoteContext[] = [];
    if (student?.classId) contexts.push({ type: 'class', id: student.classId, name: student.className });
    for (const c of courses) contexts.push({ type: 'course', id: c.courseId, name: c.name });

    if (student?.classId) {
      const subjects = await this.db
        .selectDistinct({ id: schema.subjects.id, name: schema.subjects.name })
        .from(schema.classSubjectTeachers)
        .innerJoin(schema.subjects, eq(schema.subjects.id, schema.classSubjectTeachers.subjectId))
        .where(eq(schema.classSubjectTeachers.classId, student.classId));
      for (const s of subjects) contexts.push({ type: 'subject', id: s.id, name: s.name });
    }

    return contexts;
  }

  async list(principal: InstitutionalStudentPrincipal) {
    const contexts = await this.contexts(principal);
    if (!contexts.length) return { items: [] };

    const rows = await this.db
      .select({
        id: schema.classNotes.id,
        title: schema.classNotes.title,
        summary: schema.classNotes.summary,
        topicKey: schema.classNotes.topicKey,
        weekNo: schema.classNotes.weekNo,
        contextType: schema.classNotes.contextType,
        contextId: schema.classNotes.contextId,
        publishedAt: schema.classNotes.publishedAt,
        subjectName: schema.subjects.name,
        authorFirstName: schema.staff.firstName,
        authorLastName: schema.staff.lastName,
      })
      .from(schema.classNotes)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.classNotes.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.classNotes.authorStaffId))
      .where(
        and(
          eq(schema.classNotes.institutionId, principal.institutionId),
          eq(schema.classNotes.status, 'published'),
          inArray(
            schema.classNotes.contextId,
            contexts.map((c) => c.id),
          ),
        ),
      );

    // contextId is unique enough to match on, but the type must agree too — a class and a
    // subject could in principle share an id space, so pair them before trusting the row.
    const allowed = new Set(contexts.map((c) => `${c.type}:${c.id}`));
    const nameByContext = new Map(contexts.map((c) => [`${c.type}:${c.id}`, c.name]));

    const items = rows
      .filter((r) => allowed.has(`${r.contextType}:${r.contextId}`))
      .map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        topicKey: r.topicKey,
        weekNo: r.weekNo,
        contextName: nameByContext.get(`${r.contextType}:${r.contextId}`) ?? null,
        subjectName: r.subjectName,
        author: [r.authorFirstName, r.authorLastName].filter(Boolean).join(' ') || null,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));

    return { items };
  }

  /** Opening a note is what marks it read — there is no separate "mark as read" for a student to forget. */
  async get(principal: InstitutionalStudentPrincipal, noteId: string) {
    const visible = await this.list(principal);
    if (!visible.items.some((n) => n.id === noteId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Note not found' });
    }

    const [note] = await this.db
      .select()
      .from(schema.classNotes)
      .where(
        and(eq(schema.classNotes.id, noteId), eq(schema.classNotes.institutionId, principal.institutionId)),
      )
      .limit(1);
    if (!note) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Note not found' });

    await this.db
      .insert(schema.classNoteReads)
      .values({ noteId, studentId: principal.studentId })
      .onConflictDoNothing();

    const objectIds = Array.isArray(note.attachmentObjectIds) ? (note.attachmentObjectIds as string[]) : [];
    const attachments = objectIds.length
      ? await this.db
          .select({
            id: schema.storageObjects.id,
            filename: schema.storageObjects.filename,
            mimeType: schema.storageObjects.mimeType,
            sizeBytes: schema.storageObjects.sizeBytes,
          })
          .from(schema.storageObjects)
          .where(
            and(
              inArray(schema.storageObjects.id, objectIds),
              eq(schema.storageObjects.institutionId, principal.institutionId),
            ),
          )
      : [];

    return {
      id: note.id,
      title: note.title,
      summary: note.summary,
      body: note.body,
      topicKey: note.topicKey,
      weekNo: note.weekNo,
      publishedAt: note.publishedAt?.toISOString() ?? null,
      attachments,
    };
  }

  /** Attachment download, gated on the note actually being visible to this student. */
  async attachment(principal: InstitutionalStudentPrincipal, noteId: string, objectId: string) {
    const note = await this.get(principal, noteId);
    if (!note.attachments.some((a) => a.id === objectId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attachment not found' });
    }

    const [file] = await this.db
      .select({
        storageKey: schema.storageObjects.storageKey,
        filename: schema.storageObjects.filename,
        mimeType: schema.storageObjects.mimeType,
      })
      .from(schema.storageObjects)
      .where(
        and(
          eq(schema.storageObjects.id, objectId),
          eq(schema.storageObjects.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!file) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attachment file not found' });
    return file;
  }
}
