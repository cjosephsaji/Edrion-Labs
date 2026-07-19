import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import type { TargetInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { RecipientResolver } from './recipient-resolver.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Materializes a resolved student roster from audience targets onto exam_assignees or
 * assignment_assignees. Mirrors homework_assignees / RecipientsService.setMembers pattern.
 */
@Injectable()
export class PortalAudienceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly resolver: RecipientResolver,
  ) {}

  async previewStudents(ctx: PortalActionContext, targets: TargetInput[]) {
    const campusIds = resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
    const resolved = await this.resolver.resolve(ctx.principal.institutionId, campusIds, targets);
    return {
      count: resolved.byKind.students,
      sample: resolved.sample.filter((_, i) => i < 8),
      studentCount: resolved.studentIds.length,
    };
  }

  async materializeExamAssignees(ctx: PortalActionContext, examId: string, targets: TargetInput[]) {
    const campusIds = resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
    const resolved = await this.resolver.resolve(ctx.principal.institutionId, campusIds, targets);
    const t = schema.examAssignees;
    await this.db.delete(t).where(eq(t.examId, examId));
    const studentIds = resolved.studentIds;
    if (studentIds.length === 0) return;
    await this.db.insert(t).values(studentIds.map((studentId) => ({ examId, studentId })));
  }

  async materializeAssignmentAssignees(ctx: PortalActionContext, assignmentId: string, targets: TargetInput[]) {
    const campusIds = resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
    const resolved = await this.resolver.resolve(ctx.principal.institutionId, campusIds, targets);
    const t = schema.assignmentAssignees;
    await this.db.delete(t).where(eq(t.assignmentId, assignmentId));
    const studentIds = resolved.studentIds;
    if (studentIds.length === 0) return;
    await this.db.insert(t).values(studentIds.map((studentId) => ({ assignmentId, studentId })));
  }

  /** Upload a question/option/answer file to storage_objects (institution staff or student scope). */
  async uploadQuestionFile(
    ctx: PortalActionContext,
    driver: { put: (scopeKey: string, buffer: Buffer) => Promise<string> },
    filename: string,
    mimeType: string,
    buffer: Buffer,
    kind: 'exam_question' | 'assignment_question' | 'exam_answer_file' | 'code_submission',
    opts?: { maxBytes?: number },
  ) {
    const maxBytes = opts?.maxBytes ?? 25 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB limit.`,
      });
    }
    const scopeKey = `inst/${ctx.principal.institutionId}/staff/${ctx.principal.institutionUserId}`;
    const storageKey = await driver.put(scopeKey, buffer);
    const [row] = await this.db
      .insert(schema.storageObjects)
      .values({
        institutionId: ctx.principal.institutionId,
        ownerStaffUserId: ctx.principal.institutionUserId,
        kind,
        driver: 'local',
        storageKey,
        filename: filename.slice(0, 255),
        mimeType,
        sizeBytes: buffer.length,
        processingStatus: 'ready',
        derived: {},
      })
      .returning();
    return { objectId: row!.id };
  }

  /** @deprecated Prefer uploadQuestionFile — kept for call-site compatibility. */
  uploadQuestionImage(
    ctx: PortalActionContext,
    driver: { put: (scopeKey: string, buffer: Buffer) => Promise<string> },
    filename: string,
    mimeType: string,
    buffer: Buffer,
    kind: 'exam_question' | 'assignment_question',
  ) {
    return this.uploadQuestionFile(ctx, driver, filename, mimeType, buffer, kind);
  }

  async isStudentTargetedForExam(studentId: string, examId: string, classId: string | null): Promise<boolean> {
    const [assignee] = await this.db
      .select({ id: schema.examAssignees.id })
      .from(schema.examAssignees)
      .where(and(eq(schema.examAssignees.examId, examId), eq(schema.examAssignees.studentId, studentId)))
      .limit(1);
    if (assignee) return true;
    if (!classId) return false;
    const schedules = await this.db
      .select({ classId: schema.examSchedules.classId })
      .from(schema.examSchedules)
      .where(eq(schema.examSchedules.examId, examId));
    return schedules.some((s) => s.classId === classId);
  }

  async isStudentTargetedForAssignment(
    studentId: string,
    assignmentId: string,
    classId: string | null,
    courseId: string | null,
  ): Promise<boolean> {
    const [assignee] = await this.db
      .select({ id: schema.assignmentAssignees.id })
      .from(schema.assignmentAssignees)
      .where(and(eq(schema.assignmentAssignees.assignmentId, assignmentId), eq(schema.assignmentAssignees.studentId, studentId)))
      .limit(1);
    if (assignee) return true;
    if (classId) {
      const [student] = await this.db
        .select({ classId: schema.students.classId })
        .from(schema.students)
        .where(eq(schema.students.id, studentId))
        .limit(1);
      if (student?.classId === classId) return true;
    }
    if (courseId) {
      const [enrolled] = await this.db
        .select({ id: schema.courseEnrollments.id })
        .from(schema.courseEnrollments)
        .where(and(eq(schema.courseEnrollments.courseId, courseId), eq(schema.courseEnrollments.studentId, studentId)))
        .limit(1);
      if (enrolled) return true;
    }
    return false;
  }
}
