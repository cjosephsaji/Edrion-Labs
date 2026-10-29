import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter } from '@edrion/auth';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { and, asc, desc, eq, inArray, schema, sql, runInAuthorizedAssignmentParticipation, type Database } from '@edrion/database';
import { petrosTeacherGuidanceSchema, type CreatePetrosTeacherGuidance } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';
import { institutionNow } from '../institution-clock';
import { PortalTeachingService } from './portal-teaching.service';
import { PetrosTeacherGuidanceFilesService } from './petros-teacher-guidance-files.service';
import { guidanceFileMetadata, readGuidanceFiles } from '../../student/assignments/petros-guidance-files';

@Injectable()
export class PetrosTeacherGuidanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly teaching: PortalTeachingService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(PetrosTeacherGuidanceFilesService) private readonly files: PetrosTeacherGuidanceFilesService,
  ) {}

  private async authority(ctx: PortalActionContext, classId: string, subjectId: string) {
    const assignment = await this.teaching.assignment(ctx, classId, subjectId);
    const [classRow] = await this.db.select().from(schema.classes).where(and(
      eq(schema.classes.id, classId), eq(schema.classes.institutionId, ctx.principal.institutionId),
    )).limit(1);
    const scope = resolveScopeFilter(ctx.principal, ctx.scope);
    if (!classRow || (scope.campusIds && (!classRow.campusId || !scope.campusIds.includes(classRow.campusId)))) {
      throw new NotFoundException('This class is unavailable in the current campus.');
    }
    return { assignment, classRow };
  }

  private roster(institutionId: string, classId: string) {
    return this.db.select({ id: schema.students.id, firstName: schema.students.firstName,
      lastName: schema.students.lastName, rollNo: schema.students.rollNo })
      .from(schema.students).where(and(eq(schema.students.institutionId, institutionId),
        eq(schema.students.classId, classId), eq(schema.students.status, 'enrolled')))
      .orderBy(asc(schema.students.firstName), asc(schema.students.lastName));
  }

  async workspace(ctx: PortalActionContext, classId: string, subjectId: string) {
    await this.authority(ctx, classId, subjectId);
    const institutionId = ctx.principal.institutionId;
    const students = await this.roster(institutionId, classId);
    const goals = await this.db.select().from(schema.assignments).where(and(
      eq(schema.assignments.institutionId, institutionId), eq(schema.assignments.classId, classId),
      eq(schema.assignments.subjectId, subjectId), sql`${schema.assignments.petrosGuidance} is not null`,
    )).orderBy(desc(schema.assignments.createdAt)).limit(50);
    const ids = goals.map((goal) => goal.id);
    const recipients = ids.length ? await this.db.select({
      assignmentId: schema.assignmentAssignees.assignmentId, studentId: schema.students.id,
      firstName: schema.students.firstName, lastName: schema.students.lastName,
      submissionStatus: schema.assignmentSubmissions.status,
    }).from(schema.assignmentAssignees)
      .innerJoin(schema.students, and(eq(schema.students.id, schema.assignmentAssignees.studentId),
        eq(schema.students.institutionId, institutionId), eq(schema.students.classId, classId)))
      .leftJoin(schema.assignmentSubmissions, and(
        eq(schema.assignmentSubmissions.assignmentId, schema.assignmentAssignees.assignmentId),
        eq(schema.assignmentSubmissions.studentId, schema.students.id),
        eq(schema.assignmentSubmissions.institutionId, institutionId)))
      .where(inArray(schema.assignmentAssignees.assignmentId, ids)) : [];
    // Read only participation metadata for authorized recipients, never answers or private sessions.
    const sessions: Array<{ assignmentId: string; studentId: string; status: string }> = [];
    // Scope changes share this request's connection. Serialize savepoints so a
    // second goal cannot replace the first goal's GUC before its SELECT runs.
    for (const id of ids) sessions.push(...await runInAuthorizedAssignmentParticipation(this.db, institutionId, id, () => this.db.select({
      assignmentId: sql<string>`${schema.petrosLearningSessions.sourceContext}->'assignmentContext'->>'assignmentId'`,
      studentId: schema.petrosLearningSessions.studentId, status: schema.petrosLearningSessions.status,
    }).from(schema.petrosLearningSessions).where(and(
      eq(schema.petrosLearningSessions.institutionId, institutionId),
      eq(sql`${schema.petrosLearningSessions.sourceContext}->'assignmentContext'->>'assignmentId'`, id),
    ))));
    const goalFiles = await Promise.all(goals.map((goal) => readGuidanceFiles(this.db, goal)));
    return {
      students: students.map((student) => ({ id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(), rollNo: student.rollNo })),
      goals: goals.map((goal, index) => ({ id: goal.id, version: goal.version, status: goal.status,
        dueDate: goal.dueDate, guidance: goal.petrosGuidance,
        attachments: goalFiles[index]!.map(guidanceFileMetadata),
        recipients: recipients.filter((row) => row.assignmentId === goal.id).map((row) => {
          const work = sessions.filter((session) => session.assignmentId === goal.id && session.studentId === row.studentId);
          const reportedComplete = ['submitted', 'late', 'graded'].includes(row.submissionStatus ?? '');
          return { studentId: row.studentId, name: `${row.firstName} ${row.lastName}`.trim(),
            progress: reportedComplete ? 'reported_complete' : work.some((session) => session.status === 'closed')
              ? 'session_finished' : work.length ? 'started' : 'not_started' };
        }),
      })),
    };
  }

  async create(ctx: PortalActionContext, classId: string, subjectId: string, input: CreatePetrosTeacherGuidance) {
    const { assignment, classRow } = await this.authority(ctx, classId, subjectId);
    const guidance = petrosTeacherGuidanceSchema.parse({ schemaVersion: input.schemaVersion, focus: input.focus,
      instructions: input.instructions, approach: input.approach, sessionMinutes: input.sessionMinutes,
      attachmentObjectIds: input.attachmentObjectIds });
    const institutionId = ctx.principal.institutionId;
    const roster = await this.roster(institutionId, classId);
    const studentIds = input.audience.kind === 'class' ? roster.map((student) => student.id)
      : [...new Set(input.audience.studentIds)];
    if (!studentIds.length || studentIds.some((id) => !roster.some((student) => student.id === id))) {
      throw new BadRequestException('Choose currently enrolled students from this class.');
    }
    const audience = input.audience.kind === 'class' ? [{ kind: 'class', refId: classId }]
      : studentIds.sort().map((refId) => ({ kind: 'student', refId }));
    const [institution] = await this.db.select({ timezone: schema.institutions.timezone })
      .from(schema.institutions).where(eq(schema.institutions.id, institutionId)).limit(1);
    await this.files.resolve(ctx, classId, subjectId, guidance.attachmentObjectIds);
    const result = await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.assignments).where(eq(schema.assignments.id, input.commandId)).limit(1);
      if (existing) {
        const storedGuidance = petrosTeacherGuidanceSchema.safeParse(existing.petrosGuidance);
        if (!storedGuidance.success || existing.institutionId !== institutionId || existing.createdBy !== ctx.principal.institutionUserId ||
          existing.classId !== classId || existing.subjectId !== subjectId || existing.dueDate !== input.dueDate ||
          JSON.stringify(storedGuidance.data) !== JSON.stringify(guidance) ||
          JSON.stringify(existing.audience.map(({ kind, refId }) => ({ kind, refId }))) !== JSON.stringify(audience)) {
          throw new ConflictException('This request has already been used for different guidance.');
        }
        return { id: existing.id, replayed: true };
      }
      if (input.dueDate < institutionNow(institution?.timezone ?? 'UTC').date) {
        throw new BadRequestException('Choose today or a future completion date.');
      }
      await tx.insert(schema.assignments).values({ id: input.commandId, institutionId,
        campusId: classRow.campusId, classId, subjectId, teacherId: assignment.teacherId,
        academicYearId: classRow.academicYearId, termId: classRow.termId,
        title: guidance.focus, instructions: guidance.instructions || null, dueDate: input.dueDate,
        petrosGuidance: guidance, maxPoints: 1, aiPolicy: 'full', status: 'published', audience,
        createdBy: ctx.principal.institutionUserId });
      await tx.insert(schema.assignmentAssignees).values(studentIds.map((studentId) => ({
        assignmentId: input.commandId, studentId,
      })));
      return { id: input.commandId, replayed: false };
    });
    if (!result.replayed) await this.audit.logAudit({ ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      actorId: ctx.principal.institutionUserId, module: 'portal-teaching',
      action: 'petros.guidance.assigned', entityType: 'assignment', entityId: result.id,
      newState: { classId, subjectId, recipientCount: studentIds.length, dueDate: input.dueDate } });
    return result;
  }

  async uploadFile(ctx: PortalActionContext, classId: string, subjectId: string, filename: string, mimeType: string, buffer: Buffer) {
    await this.authority(ctx, classId, subjectId);
    const file = await this.files.upload(ctx, classId, subjectId, filename, mimeType, buffer);
    await this.audit.logAudit({ ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      actorId: ctx.principal.institutionUserId, module: 'portal-teaching', action: 'petros.guidance.file_uploaded',
      entityType: 'storage_object', entityId: file.id, newState: { classId, subjectId } });
    return file;
  }

  async file(ctx: PortalActionContext, classId: string, subjectId: string, id: string) {
    await this.authority(ctx, classId, subjectId);
    return (await this.files.resolve(ctx, classId, subjectId, [id], false))[0]!;
  }

  async close(ctx: PortalActionContext, classId: string, subjectId: string, id: string, version: number) {
    await this.authority(ctx, classId, subjectId);
    const [row] = await this.db.update(schema.assignments).set({ status: 'closed', version: version + 1,
      updatedAt: new Date(), updatedBy: ctx.principal.institutionUserId }).where(and(
      eq(schema.assignments.id, id), eq(schema.assignments.institutionId, ctx.principal.institutionId),
      eq(schema.assignments.classId, classId), eq(schema.assignments.subjectId, subjectId),
      eq(schema.assignments.version, version), eq(schema.assignments.status, 'published'),
      sql`${schema.assignments.petrosGuidance} is not null`,
    )).returning({ id: schema.assignments.id });
    if (!row) throw new ConflictException('This goal changed. Refresh before closing it.');
    await this.audit.logAudit({ ...basePortalAudit(ctx), actorType: ActorType.InstitutionUser,
      actorId: ctx.principal.institutionUserId, module: 'portal-teaching',
      action: 'petros.guidance.closed', entityType: 'assignment', entityId: id });
    return row;
  }
}
