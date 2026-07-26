import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { CreateHomeworkInput, HomeworkListQuery, ReturnHomeworkSubmissionInput, UpdateHomeworkInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../../student/ledger/learning-events.writer';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalHomeworkService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  list(ctx: PortalActionContext, q: HomeworkListQuery) {
    const conds = [eq(schema.homework.institutionId, ctx.principal.institutionId)];
    if (q.classId) conds.push(eq(schema.homework.classId, q.classId));
    if (q.status) conds.push(eq(schema.homework.status, q.status));
    return this.db.select().from(schema.homework).where(and(...conds));
  }

  async create(ctx: PortalActionContext, input: CreateHomeworkInput) {
    const [row] = await this.db
      .insert(schema.homework)
      .values({
        institutionId: ctx.principal.institutionId,
        classId: input.classId,
        subjectId: input.subjectId ?? null,
        title: input.title,
        instructions: input.instructions ?? null,
        dueAt: new Date(input.dueAt),
        aiPolicy: input.aiPolicy,
        status: 'draft',
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    let seq = 1;
    for (const q of input.questions) {
      await this.db.insert(schema.homeworkQuestions).values({
        homeworkId: row!.id,
        sequence: seq++,
        promptText: q.promptText ?? null,
        promptImageObjectId: q.promptImageObjectId ?? null,
        maxMarks: q.maxMarks ?? null,
      });
    }
    if (input.assignees?.length) {
      for (const studentId of input.assignees) {
        await this.db.insert(schema.homeworkAssignees).values({ homeworkId: row!.id, studentId });
      }
    }
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'homework.create',
      module: 'portal-homework',
      entityType: 'homework',
      entityId: row!.id,
      newState: { title: row!.title },
    } as AuditEventInput);
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateHomeworkInput) {
    const [existing] = await this.db
      .select()
      .from(schema.homework)
      .where(and(eq(schema.homework.id, id), eq(schema.homework.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    const [updated] = await this.db
      .update(schema.homework)
      .set({
        title: input.title ?? existing.title,
        instructions: input.instructions === undefined ? existing.instructions : input.instructions,
        dueAt: input.dueAt ? new Date(input.dueAt) : existing.dueAt,
        aiPolicy: input.aiPolicy ?? existing.aiPolicy,
        version: input.version + 1,
        updatedBy: ctx.principal.institutionUserId,
      })
      .where(and(eq(schema.homework.id, id), eq(schema.homework.version, input.version)))
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Homework was updated elsewhere' });
    return updated;
  }

  async assign(ctx: PortalActionContext, id: string) {
    const [hw] = await this.db
      .select()
      .from(schema.homework)
      .where(and(eq(schema.homework.id, id), eq(schema.homework.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!hw) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });

    const assignees = await this.db.select().from(schema.homeworkAssignees).where(eq(schema.homeworkAssignees.homeworkId, id));
    let studentIds = assignees.map((a) => a.studentId);
    if (!studentIds.length) {
      const students = await this.db.select({ id: schema.students.id }).from(schema.students).where(eq(schema.students.classId, hw.classId));
      studentIds = students.map((s) => s.id);
    }
    for (const studentId of studentIds) {
      await this.db.insert(schema.homeworkSubmissions).values({ homeworkId: id, studentId, status: 'assigned' }).onConflictDoNothing();
    }
    await this.db.update(schema.homework).set({ status: 'assigned', assignedAt: new Date() }).where(eq(schema.homework.id, id));
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'homework.assign',
      module: 'portal-homework',
      entityType: 'homework',
      entityId: id,
    } as AuditEventInput);
    return { assigned: true };
  }

  async close(_ctx: PortalActionContext, id: string) {
    await this.db.update(schema.homework).set({ status: 'closed' }).where(eq(schema.homework.id, id));
    return { closed: true };
  }

  async get(ctx: PortalActionContext, id: string) {
    const [hw] = await this.db
      .select()
      .from(schema.homework)
      .where(and(eq(schema.homework.id, id), eq(schema.homework.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!hw) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    const questions = await this.db
      .select()
      .from(schema.homeworkQuestions)
      .where(eq(schema.homeworkQuestions.homeworkId, id))
      .orderBy(asc(schema.homeworkQuestions.sequence));
    return { ...hw, questions };
  }

  submissions(_ctx: PortalActionContext, id: string) {
    return this.db.select().from(schema.homeworkSubmissions).where(eq(schema.homeworkSubmissions.homeworkId, id));
  }

  async submissionDetail(ctx: PortalActionContext, homeworkId: string, submissionId: string) {
    const detail = await this.get(ctx, homeworkId);
    const [submission] = await this.db
      .select()
      .from(schema.homeworkSubmissions)
      .where(and(eq(schema.homeworkSubmissions.id, submissionId), eq(schema.homeworkSubmissions.homeworkId, homeworkId)))
      .limit(1);
    if (!submission) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Submission not found' });
    const answers = await this.db
      .select()
      .from(schema.homeworkAnswers)
      .where(eq(schema.homeworkAnswers.submissionId, submissionId));
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
    return {
      submission,
      questions: detail.questions.map((q) => ({
        id: q.id,
        sequence: q.sequence,
        promptText: q.promptText,
        maxMarks: q.maxMarks,
        answer: answerByQ.get(q.id) ?? null,
      })),
    };
  }

  async returnSubmission(ctx: PortalActionContext, homeworkId: string, submissionId: string, input: ReturnHomeworkSubmissionInput) {
    for (const a of input.answers) {
      await this.db
        .update(schema.homeworkAnswers)
        .set({ teacherMarks: a.teacherMarks ?? null, teacherFeedback: a.teacherFeedback ?? null })
        .where(and(eq(schema.homeworkAnswers.submissionId, submissionId), eq(schema.homeworkAnswers.questionId, a.questionId)));
    }
    await this.db
      .update(schema.homeworkSubmissions)
      .set({
        status: 'returned',
        returnedAt: new Date(),
        totalMarks: input.totalMarks ?? null,
        totalMax: input.totalMax ?? null,
        teacherNote: input.teacherNote ?? null,
      })
      .where(eq(schema.homeworkSubmissions.id, submissionId));
    await this.ledger.log({
      eventType: 'homework.returned',
      payload: { homeworkId, submissionId },
      contextType: 'homework',
      contextId: homeworkId,
      actorKind: 'staff',
      actorId: ctx.principal.institutionUserId,
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'homework.return',
      module: 'portal-homework',
      entityType: 'homework_submission',
      entityId: submissionId,
    } as AuditEventInput);
    return { returned: true };
  }
}
