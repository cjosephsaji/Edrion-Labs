import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter } from '@edrion/auth';
import { and, eq, runInInstitutionTenant, runInStudentTenant, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { can } from '@edrion/permissions';
import { compatibilityCanonicalJson, petrosAssignmentLearningPreviewCommandSchema,
  petrosAssignmentLearningCommitCommandSchema, petrosAssignmentLearningReleaseCandidateSchema,
  petrosAssignmentLearningReceiptSchema, petrosAssignmentLearningStudentBindingSchema,
  type PetrosAssignmentLearningPreviewCommand } from '@edrion/schemas';
import { createHash, randomUUID } from 'node:crypto';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { PortalAuthService } from './portal-auth.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';

const digest = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });

/** Bounded release of an existing assignment. Audience ownership stays with assignments. */
@Injectable()
export class PetrosAssignmentLearningService {
  constructor(@Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly auth: PortalAuthService,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService) {}

  private transaction<T>(ctx: PortalActionContext, work: () => Promise<T>) {
    if (!this.env.PETROS_ASSIGNMENT_LEARNING_ENABLED) throw conflict('PETROS_ASSIGNMENT_LEARNING_DISABLED');
    return runInInstitutionTenant(this.db, ctx.principal.institutionId, async () => {
      await this.db.execute(sql`set local statement_timeout='10s'`);
      await this.db.execute(sql`set local lock_timeout='2s'`);
      // Same order as document policy and pack consumers. No provider work takes this lock.
      await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${ctx.principal.institutionId}`},0))`);
      return work();
    }, ctx.principal.institutionUserId);
  }

  preview(ctx: PortalActionContext, assignmentId: string, raw: unknown) {
    const command = petrosAssignmentLearningPreviewCommandSchema.parse(raw);
    return this.transaction(ctx, () => this.resolve(ctx, assignmentId, command));
  }

  commit(ctx: PortalActionContext, assignmentId: string, raw: unknown) {
    const command = petrosAssignmentLearningCommitCommandSchema.parse(raw);
    const requestHash = digest(command);
    return this.transaction(ctx, async () => {
      const submitted = command.candidate;
      if (submitted.assignment.id !== assignmentId) throw conflict('PETROS_ASSIGNMENT_ID_MISMATCH');
      const current = await this.resolve(ctx, assignmentId, {
        schemaVersion: submitted.schemaVersion, expectedAssignmentVersion: submitted.assignment.version,
        target: submitted.target,
        policy: { assistance: submitted.assistanceSnapshot.mode, resourceMode: submitted.resourceSnapshot.mode,
          answerDisclosure: submitted.evidenceSnapshot.answerDisclosure, evidenceRequirement: submitted.evidenceSnapshot.requirement },
        recipientContexts: submitted.audienceSnapshot.recipients.map(({studentId, sessionId}) => ({studentId, sessionId})),
      });
      if (digest(current) !== digest(submitted)) throw conflict('PETROS_ASSIGNMENT_PREVIEW_CHANGED');
      await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-assignment-release:${assignmentId}`},0))`);
      const receipts = schema.petrosAssignmentLearningReceipts;
      const [replay] = await this.db.select().from(receipts).where(and(
        eq(receipts.institutionId, ctx.principal.institutionId), eq(receipts.commandId, command.commandId))).limit(1);
      if (replay) {
        if (replay.requestHash !== requestHash) throw conflict('PETROS_ASSIGNMENT_REPLAY_CONFLICT');
        return {...petrosAssignmentLearningReceiptSchema.parse(replay.response), replayed:true};
      }
      const releases = schema.petrosAssignmentLearningReleases;
      const [existing] = await this.db.select({id:releases.id}).from(releases).where(and(
        eq(releases.institutionId,ctx.principal.institutionId),eq(releases.assignmentId,assignmentId))).limit(1);
      if (existing) throw conflict('PETROS_ASSIGNMENT_ALREADY_RELEASED');
      const releaseId=randomUUID(), targetId=randomUUID(), committedAt=new Date();
      await this.db.insert(releases).values({id:releaseId,institutionId:ctx.principal.institutionId,
        assignmentId,assignmentVersion:current.assignment.version,authorityHash:current.authorityHash,
        audienceHash:current.audienceSnapshot.hash,candidate:current,createdByUserId:ctx.principal.institutionUserId,
        createdAt:committedAt});
      await this.db.insert(schema.petrosAssignmentLearningTargets).values({id:targetId,
        institutionId:ctx.principal.institutionId,releaseId,kind:current.target.kind,target:current.target,
        sourceSnapshot:current.sourceSnapshot,objectiveSnapshot:current.objectiveSnapshot,packSnapshot:current.packSnapshot,
        curriculumSnapshot:current.curriculumSnapshot,rubricSnapshot:current.rubricSnapshot,
        assistanceSnapshot:current.assistanceSnapshot,resourceSnapshot:current.resourceSnapshot,
        evidenceSnapshot:current.evidenceSnapshot,rolloutGates:current.rolloutGates});
      const binding=petrosAssignmentLearningStudentBindingSchema.parse({schemaVersion:current.schemaVersion,
        assignmentId,assignmentVersion:current.assignment.version,courseId:current.assignment.courseId,
        courseVersion:current.curriculumSnapshot.courseVersion,target:current.target,authorityHash:current.authorityHash,
        policy:{assistance:current.assistanceSnapshot.mode,resourceMode:current.resourceSnapshot.mode,
          answerDisclosure:current.evidenceSnapshot.answerDisclosure,evidenceRequirement:current.evidenceSnapshot.requirement},
        institutionalPolicySnapshot:current.institutionalPolicySnapshot});
      for (const recipient of current.audienceSnapshot.recipients) {
        // resolve() has locked the current explicit audience, class membership,
        // enrollment and owned session. Publication retains that staff authority.
        await runInStudentTenant(this.db, {institutionId:ctx.principal.institutionId,
          studentId:recipient.studentId,institutionUserId:ctx.principal.institutionUserId}, () =>
          this.db.insert(schema.petrosAssignmentLearningRecipients).values({
            id:randomUUID(),institutionId:ctx.principal.institutionId,releaseId,studentId:recipient.studentId,
            sessionId:recipient.sessionId,eligibilitySnapshot:recipient,binding,
          }));
      }
      const response=petrosAssignmentLearningReceiptSchema.parse({schemaVersion:current.schemaVersion,
        commandId:command.commandId,releaseId,targetId,assignmentId,assignmentVersion:current.assignment.version,
        audienceHash:current.audienceSnapshot.hash,authorityHash:current.authorityHash,state:'released',replayed:false,
        committedAt:committedAt.toISOString()});
      await this.db.insert(receipts).values({commandId:command.commandId,institutionId:ctx.principal.institutionId,
        releaseId,requestHash,response});
      await this.db.insert(schema.petrosAssignmentLearningOutbox).values({id:randomUUID(),institutionId:ctx.principal.institutionId,
        releaseId,topic:'petros.assignment-learning.released.v1',payload:{releaseId,assignmentId}});
      await this.audit.logAudit({...basePortalAudit(ctx),actorType:ActorType.InstitutionUser,
        module:'portal-assignments',action:'petros.assignment_learning.released',
        entityType:'assignment',entityId:assignmentId,correlationId:command.commandId,
        newState:{releaseId,targetId,authorityHash:current.authorityHash,audienceHash:current.audienceSnapshot.hash}});
      return response;
    });
  }

  private async resolve(ctx: PortalActionContext, assignmentId: string, command: PetrosAssignmentLearningPreviewCommand) {
    const principal=await this.auth.resolveById(ctx.principal.institutionUserId,null);
    if (principal.institutionId !== ctx.principal.institutionId || !can(principal.permissions,'assignments.manage'))
      throw new ForbiddenException();
    const filter=resolveScopeFilter(principal,ctx.scope);
    const a=schema.assignments;
    const [assignment]=await this.db.select().from(a).where(and(eq(a.id,assignmentId),
      eq(a.institutionId,principal.institutionId))).for('share').limit(1);
    if (!assignment) throw new NotFoundException();
    if (filter.campusIds && (!assignment.campusId || !filter.campusIds.includes(assignment.campusId)))
      throw new ForbiddenException();
    if (assignment.status !== 'published' || assignment.version !== command.expectedAssignmentVersion ||
      assignment.courseId !== command.target.courseId) throw conflict('PETROS_ASSIGNMENT_STALE');
    // S9 currently rejects hints-only execution. Do not weaken it to enable this release.
    if (assignment.aiPolicy !== 'full' || command.policy.assistance !== 'guided_learning')
      throw conflict('PETROS_ASSIGNMENT_ANSWER_RESTRICTED');
    if (command.target.kind === 'journey') throw conflict('PETROS_ASSIGNMENT_JOURNEY_AUTHORITY_UNAVAILABLE');
    // A class/cohort policy has no approved owner yet. Only explicit singleton audiences are supported.
    const recipient=command.recipientContexts[0]!;
    if (command.target.source.sessionId !== recipient.sessionId)
      throw conflict('PETROS_ASSIGNMENT_SESSION_MISMATCH');
    if (command.recipientContexts.length !== 1 || assignment.audience.length !== 1 ||
      assignment.audience[0]?.kind !== 'student' || assignment.audience[0]?.refId !== recipient.studentId)
      throw conflict('PETROS_ASSIGNMENT_COHORT_POLICY_UNAVAILABLE');
    const assignees=await this.db.select().from(schema.assignmentAssignees)
      .where(eq(schema.assignmentAssignees.assignmentId,assignmentId)).for('share');
    if (assignees.length !== 1 || assignees[0]?.studentId !== recipient.studentId)
      throw conflict('PETROS_ASSIGNMENT_AUDIENCE_CHANGED');
    const [student]=await this.db.select().from(schema.students).where(and(eq(schema.students.id,recipient.studentId),
      eq(schema.students.institutionId,principal.institutionId))).for('share').limit(1);
    if (!student || student.status !== 'enrolled' || student.classId !== assignment.classId)
      throw conflict('PETROS_ASSIGNMENT_MEMBERSHIP_CHANGED');
    const [course]=await this.db.select().from(schema.courses).where(and(eq(schema.courses.id,command.target.courseId),
      eq(schema.courses.institutionId,principal.institutionId))).for('share').limit(1);
    const [enrollment]=await this.db.select().from(schema.courseEnrollments).where(and(
      eq(schema.courseEnrollments.institutionId,principal.institutionId),eq(schema.courseEnrollments.courseId,command.target.courseId),
      eq(schema.courseEnrollments.studentId,recipient.studentId))).for('share').limit(1);
    if (!course || course.status !== 'active' || !enrollment || assignment.subjectId !== course.subjectId)
      throw conflict('PETROS_ASSIGNMENT_COURSE_CHANGED');
    const policy=await runInStudentTenant(this.db, {institutionId:principal.institutionId,
      studentId:recipient.studentId,institutionUserId:principal.institutionUserId}, () =>
      this.policies.documentKnowledgePolicy({institutionId:principal.institutionId,studentId:recipient.studentId},
        recipient.sessionId,command.policy.resourceMode));
    // The document session must already name the assignment; publication cannot silently change its S9 context.
    if (!policy.assignmentRestrictions.some(r => r.id === assignmentId && r.version === assignment.version))
      throw conflict('PETROS_ASSIGNMENT_SESSION_BINDING_REQUIRED');
    const approved=await this.packs.requireApprovedPackForReview(principal,{courseId:course.id,
      sessionId:recipient.sessionId,studentId:recipient.studentId,packId:command.target.pack.id,packVersion:command.target.pack.version});
    const pack=approved.candidate;
    if (pack.sourceVersion !== command.target.source.sourceVersion || policy.sourceFingerprint !== pack.sourceVersion ||
      (command.target.kind === 'objective' && (digest(command.target.objective) !== digest(pack.objective) ||
        command.target.curriculumRevision !== pack.curriculumRevision))) throw conflict('PETROS_ASSIGNMENT_TARGET_STALE');
    const locators=new Set(approved.trustedContext.resolvedAnchors.map(anchor => digest(anchor.locator)));
    if (command.target.source.locators.some(locator => !locators.has(digest(locator))))
      throw conflict('PETROS_ASSIGNMENT_LOCATOR_UNRESOLVED');
    // The current renderer executes a complete reviewed pack, not a locator-filtered
    // derivative. A narrower publication would promise a restriction it cannot enforce.
    const selectedLocators=new Set(command.target.source.locators.map(locator=>digest(locator)));
    if ([...locators].some(locator=>!selectedLocators.has(locator)))
      throw conflict('PETROS_ASSIGNMENT_PARTIAL_PACK_SCOPE_UNSUPPORTED');
    const recipients=[{...recipient,studentStatus:'enrolled' as const,courseEnrollmentId:enrollment.id}];
    const value={schemaVersion:command.schemaVersion,
      assignment:{id:assignmentId,version:assignment.version,status:'published' as const,institutionId:principal.institutionId,
        campusId:assignment.campusId,classId:assignment.classId,courseId:course.id,aiPolicy:'full' as const},
      target:command.target,audienceSnapshot:{recipients,hash:digest(recipients)},
      assistanceSnapshot:{mode:command.policy.assistance,assignmentAiPolicy:'full' as const,finalAnswerAllowed:false,
        accommodationsResolved:false},
      resourceSnapshot:{mode:command.policy.resourceMode,sourceVersion:pack.sourceVersion,locators:command.target.source.locators},
      evidenceSnapshot:{requirement:command.policy.evidenceRequirement,answerDisclosure:'never',externalAssistance:'unknown'},
      sourceSnapshot:command.target.source,objectiveSnapshot:{objective:pack.objective,statement:pack.objectiveStatement},
      packSnapshot:{candidateId:approved.candidateId,payloadHash:approved.payloadHash,candidate:pack,reviewReceipt:approved.reviewReceipt},
      curriculumSnapshot:{courseId:course.id,courseVersion:course.version,subjectKey:pack.subject,revision:pack.curriculumRevision},
      rubricSnapshot:pack.rubric,institutionalPolicySnapshot:policy,
      rolloutGates:{singleRecipientOnly:true,cohortPolicyApproved:false,accommodationsPolicyApproved:false,
        journeyAuthorityAvailable:false,productionPilotApproved:false}};
    return petrosAssignmentLearningReleaseCandidateSchema.parse({...value,authorityHash:digest(value)});
  }
}
