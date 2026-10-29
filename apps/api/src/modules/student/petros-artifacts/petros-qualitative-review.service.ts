import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuditWriter } from '@edrion/audit';
import type { InstitutionPrincipal } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { and,eq,runInStudentTenant,runInInstitutionTenant,runInAuthorizedSharedReview,schema,sql,type Database } from '@edrion/database';
import {
  compatibilityCanonicalJson,
  petrosArtifactContentSchema,
  petrosQualitativeReviewCommandSchema,
  petrosQualitativeReviewReceiptSchema,
  petrosQualitativeRevisionCandidateSchema,
  petrosQualitativeSubmissionCommandSchema,
  petrosQualitativeSubmissionReceiptSchema,
  petrosQualitativeRevokeCommandSchema,
  petrosQualitativeDraftRequestSchema,
  petrosQualitativeDraftRequestReceiptSchema,
  petrosQualitativeDraftFeedbackCommandSchema,
  petrosQualitativeDraftFeedbackReceiptSchema,
  petrosAdaptiveSnapshotSchema,
  type PetrosConceptPackCandidate,
  type PetrosQualitativeSubmissionReceipt,
} from '@edrion/schemas';
import { ActorType } from '@edrion/shared-types';
import { createHash, randomUUID } from 'node:crypto';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { PetrosTeachingPackService } from '../knowledge/petros-teaching-pack.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosQualitativeReviewRepository } from './petros-qualitative-review.repository';

const digest = (value: unknown) => createHash('sha256')
  .update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });

@Injectable()
export class PetrosQualitativeReviewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly repo: PetrosQualitativeReviewRepository,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
  ) {}

  private enabled() {
    if (!this.env.PETROS_QUALITATIVE_REVIEW_ENABLED)
      throw conflict('PETROS_QUALITATIVE_REVIEW_DISABLED');
  }

  private transaction<T>(principal: InstitutionalStudentPrincipal, work: () => Promise<T>) {
    return runInStudentTenant(this.db, principal, async () => {
      await this.db.execute(sql`set local statement_timeout='10s'`);
      await this.db.execute(sql`set local lock_timeout='2s'`);
      return work();
    });
  }

  private async currentStudent(principal: InstitutionalStudentPrincipal) {
    const current = await this.auth.resolveInstitutionalWorker(principal.institutionUserId);
    if (current.institutionId !== principal.institutionId || current.studentId !== principal.studentId ||
      !current.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(current))
      throw new ForbiddenException();
    return current;
  }

  /** Explicit student sharing of one immutable artifact revision. */
  async submit(principal: InstitutionalStudentPrincipal, raw: unknown) {
    this.enabled();
    const command = petrosQualitativeSubmissionCommandSchema.parse(raw);
    const requestHash = digest(command);
    return this.transaction(principal, async () => {
      await this.currentStudent(principal);
      let replay = await this.repo.submissionCommand(principal, command.commandId);
      if (replay && replay.requestHash !== requestHash)
        throw conflict('PETROS_QUALITATIVE_SUBMISSION_REPLAY_CONFLICT');
      const artifact = await this.repo.artifact(principal, command.artifactId);
      if (!artifact || artifact.sessionId !== command.sessionId)
        throw new NotFoundException({ code: 'PETROS_QUALITATIVE_ARTIFACT_NOT_FOUND' });
      if (artifact.revision !== command.expectedRevision || artifact.revision < 2)
        throw conflict('PETROS_QUALITATIVE_REVISION_STALE');
      // Policy/course/source authority locks precede the artifact/command locks.
      const policy = await this.policies.documentKnowledgePolicy(principal, command.sessionId);
      const approved = await this.packs.requireApprovedPack(principal, command.sessionId, {
        packId: command.pack.id, packVersion: command.pack.version,
      });
      await this.repo.lock(`petros-qualitative:artifact:${principal.institutionId}:${principal.studentId}:${artifact.id}`);
      await this.repo.lock(`petros-qualitative:submission-command:${principal.institutionId}:${principal.studentId}:${command.commandId}`);
      replay = await this.repo.submissionCommand(principal, command.commandId);
      if (replay && replay.requestHash !== requestHash)
        throw conflict('PETROS_QUALITATIVE_SUBMISSION_REPLAY_CONFLICT');
      const currentArtifact = await this.repo.artifact(principal, command.artifactId,true);
      if (!currentArtifact || currentArtifact.sessionId !== command.sessionId ||
        currentArtifact.revision !== command.expectedRevision)
        throw conflict('PETROS_QUALITATIVE_REVISION_STALE');
      const [current, previous] = await Promise.all([
        this.repo.revision(principal, currentArtifact.id, currentArtifact.revision),
        this.repo.revision(principal, currentArtifact.id, currentArtifact.revision - 1),
      ]);
      if (!current || !previous) throw conflict('PETROS_QUALITATIVE_REVISION_LINEAGE_MISSING');
      const candidate = approved.candidate;
      if (approved.reviewReceipt.courseId !== command.courseId ||
        candidate.objective.id !== command.objective.id || candidate.objective.version !== command.objective.version ||
        candidate.sourceVersion !== policy.sourceFingerprint)
        throw conflict('PETROS_QUALITATIVE_AUTHORITY_CHANGED');
      const task = candidate.assessments.find((item) =>
        item.id === command.task.id && item.variant === command.task.variant);
      if (!task) throw conflict('PETROS_QUALITATIVE_TASK_BINDING_INVALID');
      const currentContent = note(current.content);
      const previousContent = note(previous.content);
      if (!command.draftFeedbackId) throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_REQUIRED');
      const feedbackRow=await this.repo.lifecycleEvent(principal.institutionId,command.draftFeedbackId);
      if (!feedbackRow || feedbackRow.kind!=='draft_feedback' || feedbackRow.studentId!==principal.studentId)
        throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_REQUIRED');
      const feedback=petrosQualitativeDraftFeedbackReceiptSchema.parse(feedbackRow.payload);
      if (feedback.request.work.revisionId!==previous.id || feedback.request.work.contentHash!==digest(previousContent) ||
        feedback.request.policyVersion!==policy.authorityHash || digest(feedback.request.rubric)!==digest(candidate.rubric) ||
        digest(feedback.request.pack)!==digest(candidate.pack) || feedback.request.sessionId!==command.sessionId ||
        digest(feedback.request.task)!==digest(command.task) || new Date(feedback.reviewedAt)>current.createdAt)
        throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_STALE');
      await this.packs.requireStoredReviewerAuthority(command.courseId,feedback.authority,['homework.grade']);
      const storedReplay = replay ? petrosQualitativeSubmissionReceiptSchema.parse(replay.submission) : null;
      const submittedAt = storedReplay?.submittedAt ?? new Date().toISOString();
      const receipt = petrosQualitativeSubmissionReceiptSchema.parse({
        schemaVersion: 'petros.qualitative-review.v1',
        submissionId: replay?.id ?? randomUUID(),
        commandId: command.commandId,
        requestHash,
        scope: { institutionId: principal.institutionId, courseId: command.courseId, studentId: principal.studentId },
        sessionId: command.sessionId,
        objective: candidate.objective,
        pack: candidate.pack,
        task: { id: task.id, variant: task.variant },
        sourceVersion: candidate.sourceVersion,
        sourceAnchors: sourceAnchors(task),
        policyVersion: policy.authorityHash,
        work: {
          stage: 'revision',
          current: work(artifact.id, current.id, current.revision, currentContent),
          previous: work(artifact.id, previous.id, previous.revision, previousContent),
        },
        rubric: candidate.rubric,
        draftFeedback:{id:feedback.id,hash:digest(feedback)},
        shareLearningProvenance:command.shareLearningProvenance,
        submittedAt,
        replayed: Boolean(replay),
      });
      if (replay) {
        // Replays reached current owner, artifact, policy, pack and task authority checks above.
        const stored = storedReplay!;
        if (digest({ ...stored, replayed: false }) !== digest({ ...receipt, replayed: false }))
          throw conflict('PETROS_QUALITATIVE_SUBMISSION_BINDING_CHANGED');
        return { ...stored, replayed: true };
      }
      if (await this.repo.submissionForRevision(principal, current.id))
        throw conflict('PETROS_QUALITATIVE_REVISION_ALREADY_SUBMITTED');
      await this.repo.insertSubmission({
        receipt, artifactId: artifact.id, revisionId: current.id,
        revision: current.revision, candidateHash: digest(receipt),
      });
      await this.audit.logAudit({
        actorType: ActorType.InstitutionUser,
        actorId: principal.institutionUserId,
        institutionId: principal.institutionId,
        module: 'petros',
        action: 'petros.qualitative_submission.shared',
        entityType: 'petros_qualitative_submission',
        entityId: receipt.submissionId,
        correlationId: command.commandId,
        newState: {
          courseId: command.courseId, studentId: principal.studentId,
          artifactId: artifact.id, revision: current.revision,
          objective: candidate.objective, pack: candidate.pack,
        },
      });
      return receipt;
    });
  }

  /** Explicit qualified educator decision. Narrative only; no S8 or numeric projection write. */
  async review(principal: InstitutionPrincipal, raw: unknown) {
    const command=petrosQualitativeReviewCommandSchema.parse(raw);
    return this.sharedReview(principal,'submission',command.submissionId,()=>this.reviewOwned(principal,command));
  }

  private async reviewOwned(principal: InstitutionPrincipal, raw: unknown) {
    await this.packs.requireActionPermissions(principal,['homework.grade']);
    this.enabled();
    const command = petrosQualitativeReviewCommandSchema.parse(raw);
    const requestHash = digest(command);
    let replay = await this.repo.reviewCommand(principal.institutionId, command.commandId);
    if (replay && replay.requestHash !== requestHash)
      throw conflict('PETROS_QUALITATIVE_REVIEW_REPLAY_CONFLICT');
    const row = await this.repo.submission(principal.institutionId, command.submissionId);
    if (!row) throw new NotFoundException({ code: 'PETROS_QUALITATIVE_SUBMISSION_NOT_FOUND' });
    const submission = petrosQualitativeSubmissionReceiptSchema.parse(row.submission);
    if (!submission.draftFeedback) throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_REQUIRED');
    const approved = await this.packs.requireApprovedPackForReview(principal, {
      courseId: submission.scope.courseId,
      studentId: submission.scope.studentId,
      sessionId: submission.sessionId,
      packId: submission.pack.id,
      packVersion: submission.pack.version,
    });
    const policy = await this.policies.documentKnowledgePolicy(
      { institutionId: submission.scope.institutionId, studentId: submission.scope.studentId },
      submission.sessionId,
    );
    const authority = await this.packs.requireReviewerAuthority(principal, {
      institutionId: submission.scope.institutionId,
      courseId: submission.scope.courseId,
      subjectKey: approved.candidate.subject,
      qualificationId: command.qualificationId,
      expectedQualificationVersion: command.expectedQualificationVersion,
    });
    await this.repo.lock(`petros-qualitative:review:${principal.institutionId}:${submission.submissionId}`);
    await this.repo.lock(`petros-qualitative:review-command:${principal.institutionId}:${command.commandId}`);
    replay = await this.repo.reviewCommand(principal.institutionId, command.commandId);
    if (replay && replay.requestHash !== requestHash)
      throw conflict('PETROS_QUALITATIVE_REVIEW_REPLAY_CONFLICT');
    this.assertCurrentSubmission(submission, approved.candidate, approved.reviewReceipt.courseId, policy.sourceFingerprint);
    const currentArtifact = await this.repo.artifact(submission.scope,row.artifactId,true);
    if (!currentArtifact || currentArtifact.revision !== row.revision ||
      digest(note(currentArtifact.content)) !== submission.work.current.contentHash ||
      digest(submission) !== row.candidateHash)
      throw conflict('PETROS_QUALITATIVE_WORK_CHANGED');
    const artifact = await this.repo.revision(submission.scope, row.artifactId, row.revision);
    const previous = await this.repo.revision(submission.scope, row.artifactId, row.revision - 1);
    if (!artifact || !previous || artifact.id !== submission.work.current.revisionId ||
      previous.id !== submission.work.previous.revisionId ||
      digest(note(artifact.content)) !== submission.work.current.contentHash ||
      digest(note(previous.content)) !== submission.work.previous.contentHash)
      throw conflict('PETROS_QUALITATIVE_WORK_CHANGED');
    if (policy.authorityHash !== submission.policyVersion)
      throw conflict('PETROS_QUALITATIVE_POLICY_CHANGED');
    const draft=await this.repo.lifecycleEvent(principal.institutionId,submission.draftFeedback.id);
    if (!draft || digest(draft.payload)!==submission.draftFeedback.hash) throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_STALE');
    const draftFeedback=petrosQualitativeDraftFeedbackReceiptSchema.parse(draft.payload);
    await this.packs.requireStoredReviewerAuthority(submission.scope.courseId,draftFeedback.authority,['homework.grade']);
    const priorReview=await this.repo.reviewForSubmission(principal.institutionId,submission.submissionId);
    if (priorReview && await this.repo.lifecycleTarget(principal.institutionId,'review_revoked',priorReview.id))
      throw conflict('PETROS_QUALITATIVE_REVIEW_REVOKED');
    if (replay) return {
      receipt: petrosQualitativeReviewReceiptSchema.parse(replay.receipt), replayed: true,
      evidenceAdmission: 'not_granted' as const, numericProjection: false as const,
    };
    if (await this.repo.reviewForSubmission(principal.institutionId, submission.submissionId))
      throw conflict('PETROS_QUALITATIVE_ALREADY_REVIEWED');
    const criterionIds = new Set(submission.rubric.criteria.map((criterion) => criterion.id));
    if (command.productFeedback.length !== criterionIds.size ||
      new Set(command.productFeedback.map((item) => item.criterionId)).size !== criterionIds.size ||
      command.productFeedback.some((item) => !criterionIds.has(item.criterionId)))
      throw conflict('PETROS_QUALITATIVE_FEEDBACK_INCOMPLETE');
    const reviewedAt = authority.observedAt;
    const feedbackId = randomUUID();
    const candidate = petrosQualitativeRevisionCandidateSchema.parse({
      schemaVersion: 'petros.qualitative-review.v1',
      exercise: 'source_grounded_explanation_revision',
      exerciseId: submission.submissionId,
      scope: submission.scope,
      objective: submission.objective,
      pack: submission.pack,
      sourceVersion: submission.sourceVersion,
      sourceAnchors: submission.sourceAnchors,
      policyVersion: submission.policyVersion,
      work: submission.work,
      rubric: submission.rubric,
      feedbackId,
      productFeedback: command.productFeedback.map((feedback) => ({
        criterionId: feedback.criterionId,
        observation: feedback.observation.status === 'not_observed'
          ? { status: 'not_observed' as const, spans: [] }
          : { status: 'observed' as const, spans: feedback.observation.spans.map((span) => ({
            workId: submission.work.current.workId,
            revisionId: submission.work.current.revisionId,
            contentHash: submission.work.current.contentHash,
            start: span.start, end: span.end, offsetEncoding: 'utf16' as const,
          })) },
        feedback: feedback.feedback,
        uncertainty: feedback.uncertainty,
      })),
      processObservations: [{
        id: randomUUID(), kind: 'revision_submitted', basis: 'system_observed',
        actorId: submission.scope.studentId, recordedAt: submission.submittedAt,
        revisionId: submission.work.current.revisionId,
        description: 'The student explicitly submitted this saved artifact revision for educator review.',
      }],
      conditions: {
        schemaVersion: 'petros.assessment-conditions.v1', collectedAt: reviewedAt,
        policyVersion: submission.policyVersion, supervision: [], timing: [], resources: [],
        modality: [{ value: 'written', basis: 'system_observed',
          actor: { kind: 'system', id: 'petros-qualitative-review' },
          method: 'saved_note_revision', recordedAt: submission.submittedAt }],
        environment: [], petrosAssistance: [], answerExposure: [], externalAssistance: [],
        attempt: [{ value: 'repeat_equivalent', basis: 'system_observed',
          actor: { kind: 'system', id: 'petros-qualitative-review' },
          method: 'artifact_revision_lineage', recordedAt: submission.submittedAt }],
        attestations: [],
      },
      reviewId: null,
      draftFeedback:submission.draftFeedback,
    });
    const receipt = petrosQualitativeReviewReceiptSchema.parse({
      schemaVersion: 'petros.qualitative-review.v1',
      id: randomUUID(), commandId: command.commandId, exerciseId: submission.submissionId,
      scope: submission.scope, objective: submission.objective, pack: submission.pack,
      sourceVersion: submission.sourceVersion, policyVersion: submission.policyVersion,
      rubric: { id: submission.rubric.id, version: submission.rubric.version },
      work: submission.work.current, previousWork: submission.work.previous,
      feedbackId, reviewedCandidate: candidate,
      reviewer: { institutionUserId: principal.institutionUserId,
        role: 'qualified_educator', authoritySnapshot: authority },
      decision: command.decision, reason: command.reason, reviewedAt,
    });
    await this.repo.insertReview({ receipt, submissionId: submission.submissionId,
      requestHash, receiptHash: digest(receipt) });
    await this.audit.logAudit({
      actorType: ActorType.InstitutionUser,
      actorId: principal.institutionUserId,
      institutionId: principal.institutionId,
      module: 'petros',
      action: 'petros.qualitative_review.recorded',
      entityType: 'petros_qualitative_review',
      entityId: receipt.id,
      correlationId: command.commandId,
      newState: {
        submissionId: submission.submissionId, decision: receipt.decision,
        qualificationId: authority.qualificationId,
        qualificationVersion: authority.qualificationVersion,
        evidenceAdmission: 'not_granted', numericProjection: false,
      },
    });
    return { receipt, replayed: false, evidenceAdmission: 'not_granted' as const,
      numericProjection: false as const };
  }

  /** The student shares one exact draft before any educator feedback is visible. */
  async requestDraftFeedback(principal:InstitutionalStudentPrincipal,raw:unknown) {
    this.enabled();const command=petrosQualitativeDraftRequestSchema.parse(raw);
    if (command.draftFeedbackId) throw conflict('PETROS_QUALITATIVE_DRAFT_REQUEST_INVALID');
    return this.transaction(principal,async()=>{
      await this.currentStudent(principal);
      const policy=await this.policies.documentKnowledgePolicy(principal,command.sessionId);
      const approved=await this.packs.requireApprovedPack(principal,command.sessionId,{packId:command.pack.id,packVersion:command.pack.version});
      const candidate=approved.candidate;const task=candidate.assessments.find(t=>t.id===command.task.id && t.variant===command.task.variant);
      if (!task || approved.reviewReceipt.courseId!==command.courseId || digest(candidate.objective)!==digest(command.objective))
        throw conflict('PETROS_QUALITATIVE_AUTHORITY_CHANGED');
      await this.repo.lock(`petros-qualitative:draft:${principal.studentId}:${command.commandId}`);
      const artifact=await this.repo.artifact(principal,command.artifactId,true);
      if (!artifact || artifact.sessionId!==command.sessionId || artifact.revision!==command.expectedRevision)
        throw conflict('PETROS_QUALITATIVE_REVISION_STALE');
      const revision=await this.repo.revision(principal,artifact.id,artifact.revision);
      if (!revision) throw conflict('PETROS_QUALITATIVE_REVISION_LINEAGE_MISSING');
      const existing=await this.repo.lifecycleCommand(principal.institutionId,principal.studentId,command.commandId);
      if (existing) {
        if (existing.kind!=='feedback_request' || existing.requestHash!==digest(command)) throw conflict('PETROS_QUALITATIVE_REPLAY_CONFLICT');
        return {request:petrosQualitativeDraftRequestReceiptSchema.parse(existing.payload),replayed:true};
      }
      const request=petrosQualitativeDraftRequestReceiptSchema.parse({schemaVersion:'petros.qualitative-review.v1',
        submissionId:randomUUID(),commandId:command.commandId,requestHash:digest(command),
        scope:{institutionId:principal.institutionId,studentId:principal.studentId,courseId:command.courseId},
        sessionId:command.sessionId,objective:candidate.objective,pack:candidate.pack,task:command.task,
        sourceVersion:candidate.sourceVersion,sourceAnchors:sourceAnchors(task),policyVersion:policy.authorityHash,
        work:work(artifact.id,revision.id,revision.revision,note(revision.content)),rubric:candidate.rubric,
        submittedAt:new Date().toISOString(),replayed:false,draftFeedback:null});
      await this.repo.insertLifecycle({id:request.submissionId,institutionId:principal.institutionId,studentId:principal.studentId,
        courseId:command.courseId,artifactId:artifact.id,revision:artifact.revision,kind:'feedback_request',
        commandId:command.commandId,requestHash:digest(command),targetId:revision.id,payload:request});
      await this.lifecycleAudit(principal.institutionId,principal.institutionUserId,request.submissionId,command.commandId,'draft_shared');
      return {request,replayed:false};
    });
  }

  async inspectDraft(principal:InstitutionPrincipal,requestId:string) {
    return this.sharedReview(principal,'event',requestId,()=>this.inspectDraftOwned(principal,requestId));
  }
  private async inspectDraftOwned(principal:InstitutionPrincipal,requestId:string) {
    await this.packs.requireActionPermissions(principal,['homework.grade']);
    this.enabled();
    const row=await this.repo.lifecycleEvent(principal.institutionId,requestId);
    if (!row || row.kind!=='feedback_request') throw new NotFoundException();
    const request=petrosQualitativeDraftRequestReceiptSchema.parse(row.payload);
    const policy=await this.policies.documentKnowledgePolicy(request.scope,request.sessionId);
    const approved=await this.packs.requireApprovedPackForReview(principal,{courseId:row.courseId,studentId:row.studentId,
      sessionId:request.sessionId,packId:request.pack.id,packVersion:request.pack.version});
    const artifact=await this.repo.artifact(request.scope,row.artifactId,true);
    if (!artifact || artifact.revision!==row.revision || digest(note(artifact.content))!==request.work.contentHash ||
      policy.authorityHash!==request.policyVersion || digest(approved.candidate.rubric)!==digest(request.rubric))
      throw conflict('PETROS_QUALITATIVE_WORK_CHANGED');
    return {request,sharedDraftText:note(artifact.content),approvalStatus:'not_reviewed' as const,numericProjection:false};
  }

  async draftFeedback(principal:InstitutionPrincipal,raw:unknown) {
    const command=petrosQualitativeDraftFeedbackCommandSchema.parse(raw);
    return this.sharedReview(principal,'event',command.requestId,()=>this.draftFeedbackOwned(principal,command));
  }
  private async draftFeedbackOwned(principal:InstitutionPrincipal,raw:unknown) {
    await this.packs.requireActionPermissions(principal,['homework.grade']);
    this.enabled();const command=petrosQualitativeDraftFeedbackCommandSchema.parse(raw);
    const row=await this.repo.lifecycleEvent(principal.institutionId,command.requestId);
    if (!row || row.kind!=='feedback_request') throw new NotFoundException();
    const request=petrosQualitativeDraftRequestReceiptSchema.parse(row.payload);
    const approved=await this.packs.requireApprovedPackForReview(principal,{courseId:row.courseId,studentId:row.studentId,
      sessionId:request.sessionId,packId:request.pack.id,packVersion:request.pack.version});
    const policy=await this.policies.documentKnowledgePolicy(request.scope,request.sessionId);
    const authority=await this.packs.requireReviewerAuthority(principal,{institutionId:row.institutionId,courseId:row.courseId,
      subjectKey:approved.candidate.subject,qualificationId:command.qualificationId,expectedQualificationVersion:command.expectedQualificationVersion});
    if (policy.authorityHash!==request.policyVersion || approved.candidate.sourceVersion!==request.sourceVersion ||
      digest(approved.candidate.rubric)!==digest(request.rubric)) throw conflict('PETROS_QUALITATIVE_AUTHORITY_CHANGED');
    await this.repo.lock(`petros-qualitative:feedback:${row.id}`);
    const artifact=await this.repo.artifact(request.scope,row.artifactId,true);
    if (!artifact || artifact.revision!==row.revision || digest(note(artifact.content))!==request.work.contentHash)
      throw conflict('PETROS_QUALITATIVE_WORK_CHANGED');
    const existing=await this.repo.lifecycleCommand(row.institutionId,row.studentId,command.commandId);
    if (existing) {
      if (existing.kind!=='draft_feedback' || existing.requestHash!==digest(command)) throw conflict('PETROS_QUALITATIVE_REPLAY_CONFLICT');
      return {feedback:petrosQualitativeDraftFeedbackReceiptSchema.parse(existing.payload),replayed:true};
    }
    const ids=new Set(request.rubric.criteria.map(c=>c.id));
    if (ids.size!==command.productFeedback.length || new Set(command.productFeedback.map(f=>f.criterionId)).size!==ids.size ||
      command.productFeedback.some(f=>!ids.has(f.criterionId) || (f.observation.status==='observed' &&
        f.observation.spans.some(s=>s.end>request.work.textLength)))) throw conflict('PETROS_QUALITATIVE_FEEDBACK_INCOMPLETE');
    const feedback=petrosQualitativeDraftFeedbackReceiptSchema.parse({id:randomUUID(),requestId:row.id,request,authority,
      reviewedAt:new Date().toISOString(),productFeedback:command.productFeedback,reason:command.reason});
    await this.repo.insertLifecycle({id:feedback.id,institutionId:row.institutionId,studentId:row.studentId,courseId:row.courseId,
      artifactId:row.artifactId,revision:row.revision,kind:'draft_feedback',commandId:command.commandId,
      requestHash:digest(command),targetId:row.id,payload:feedback});
    await this.lifecycleAudit(row.institutionId,principal.institutionUserId,feedback.id,command.commandId,'draft_feedback_recorded');
    return {feedback,replayed:false};
  }

  async draftStatus(principal:InstitutionalStudentPrincipal,requestId:string) {
    this.enabled();return this.transaction(principal,async()=>{
      await this.currentStudent(principal);
      const row=await this.repo.lifecycleEvent(principal.institutionId,requestId);
      if (!row || row.studentId!==principal.studentId || row.kind!=='feedback_request') throw new NotFoundException();
      const request=petrosQualitativeDraftRequestReceiptSchema.parse(row.payload);
      const approved=await this.packs.requireApprovedPack(principal,request.sessionId,{packId:request.pack.id,packVersion:request.pack.version});
      const policy=await this.policies.documentKnowledgePolicy(principal,request.sessionId);
      if (policy.authorityHash!==request.policyVersion || digest(approved.candidate.rubric)!==digest(request.rubric))
        throw conflict('PETROS_QUALITATIVE_AUTHORITY_CHANGED');
      const artifact=await this.repo.artifact(principal,row.artifactId);
      if (!artifact || artifact.revision>row.revision+1) throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_STALE');
      const feedbackRow=await this.repo.lifecycleTarget(row.institutionId,'draft_feedback',row.id);
      if (!feedbackRow) return {status:'pending' as const,requestId:row.id};
      const feedback=petrosQualitativeDraftFeedbackReceiptSchema.parse(feedbackRow.payload);
      await this.packs.requireStoredReviewerAuthority(row.courseId,feedback.authority,['homework.grade']);
      return {status:'feedback_received' as const,feedback,evidenceAdmission:'not_granted' as const};
    });
  }

  async revoke(principal:InstitutionPrincipal,raw:unknown) {
    const command=petrosQualitativeRevokeCommandSchema.parse(raw);
    return this.sharedReview(principal,'review',command.reviewId,()=>this.revokeOwned(principal,command));
  }
  private async revokeOwned(principal:InstitutionPrincipal,raw:unknown) {
    await this.packs.requireActionPermissions(principal,['homework.grade']);
    this.enabled();const command=petrosQualitativeRevokeCommandSchema.parse(raw);
    const row=await this.repo.reviewById(principal.institutionId,command.reviewId);
    if (!row) throw new NotFoundException();
    const receipt=petrosQualitativeReviewReceiptSchema.parse(row.receipt);
    const authority=await this.packs.requireReviewerAuthority(principal,{institutionId:row.institutionId,courseId:row.courseId,
      subjectKey:receipt.reviewer.authoritySnapshot.subjectKey,qualificationId:command.qualificationId,
      expectedQualificationVersion:command.expectedQualificationVersion});
    await this.repo.lock(`petros-qualitative:review:${row.institutionId}:${row.submissionId}`);
    const existing=await this.repo.lifecycleTarget(row.institutionId,'review_revoked',row.id);
    if (existing) {
      if (existing.commandId!==command.commandId || existing.requestHash!==digest(command)) throw conflict('PETROS_QUALITATIVE_REPLAY_CONFLICT');
      return {status:'revoked' as const,reviewId:row.id,replayed:true};
    }
    const id=randomUUID();
    await this.repo.insertLifecycle({id,institutionId:row.institutionId,studentId:row.studentId,courseId:row.courseId,
      artifactId:receipt.work.workId,revision:receipt.work.revision,kind:'review_revoked',commandId:command.commandId,
      requestHash:digest(command),targetId:row.id,payload:{reviewId:row.id,reason:command.reason,authority}});
    await this.lifecycleAudit(row.institutionId,principal.institutionUserId,id,command.commandId,'review_revoked');
    return {status:'revoked' as const,reviewId:row.id,replayed:false};
  }

  async current(principal:InstitutionalStudentPrincipal,submissionId:string) {
    this.enabled();return this.transaction(principal,async()=>{
      await this.currentStudent(principal);
      const row=await this.repo.submission(principal.institutionId,submissionId);
      if (!row || row.studentId!==principal.studentId) throw new NotFoundException();
      const submission=petrosQualitativeSubmissionReceiptSchema.parse(row.submission);
      const approved=await this.packs.requireApprovedPack(principal,submission.sessionId,{packId:submission.pack.id,packVersion:submission.pack.version});
      const policy=await this.policies.documentKnowledgePolicy(principal,submission.sessionId);
      this.assertCurrentSubmission(submission,approved.candidate,approved.reviewReceipt.courseId,policy.sourceFingerprint);
      const unavailable=(reason:string)=>({status:'unavailable' as const,reason,evidenceAdmission:'not_granted' as const,numericProjection:false});
      const artifact=await this.repo.artifact(principal,row.artifactId,true);
      if (!artifact || artifact.revision!==row.revision || digest(note(artifact.content))!==submission.work.current.contentHash)
        return unavailable('stale_work');
      if (policy.authorityHash!==submission.policyVersion) return unavailable('stale_policy');
      const review=await this.repo.reviewForSubmission(principal.institutionId,submissionId);
      if (!review) return unavailable('review_pending');
      if (await this.repo.lifecycleTarget(principal.institutionId,'review_revoked',review.id)) return unavailable('review_revoked');
      const receipt=petrosQualitativeReviewReceiptSchema.parse(review.receipt);
      if (digest(receipt)!==review.receiptHash || digest(submission)!==row.candidateHash ||
        digest(receipt.reviewedCandidate.rubric)!==digest(submission.rubric)) return unavailable('review_binding_mismatch');
      try {await this.packs.requireStoredReviewerAuthority(row.courseId,receipt.reviewer.authoritySnapshot,['homework.grade']);}
      catch(error) {if(error instanceof ForbiddenException || error instanceof ConflictException) return unavailable('reviewer_authority_denied');throw error;}
      if (!submission.draftFeedback) return unavailable('draft_feedback_missing');
      const draft=await this.repo.lifecycleEvent(row.institutionId,submission.draftFeedback.id);
      if (!draft || digest(draft.payload)!==submission.draftFeedback.hash) return unavailable('draft_feedback_stale');
      try {await this.packs.requireStoredReviewerAuthority(row.courseId,petrosQualitativeDraftFeedbackReceiptSchema.parse(draft.payload).authority,['homework.grade']);}
      catch(error) {if(error instanceof ForbiddenException || error instanceof ConflictException) return unavailable('reviewer_authority_denied');throw error;}
      return {status:receipt.decision==='approved'?'valid_approval' as const:'rejected' as const,reviewId:receipt.id,
        feedback:receipt.reviewedCandidate.productFeedback,evidenceAdmission:'not_granted' as const,numericProjection:false};
    });
  }

  /** Allowlisted educator projection of an explicitly shared revision and optional provenance. */
  async inspect(principal:InstitutionPrincipal,submissionId:string) {
    return this.sharedReview(principal,'submission',submissionId,()=>this.inspectOwned(principal,submissionId));
  }
  private async inspectOwned(principal:InstitutionPrincipal,submissionId:string) {
    await this.packs.requireActionPermissions(principal,['homework.grade']);
    this.enabled();
    const row=await this.repo.submission(principal.institutionId,submissionId);
    if (!row) throw new NotFoundException();
    const submission=petrosQualitativeSubmissionReceiptSchema.parse(row.submission);
    const approved=await this.packs.requireApprovedPackForReview(principal,{courseId:row.courseId,studentId:row.studentId,
      sessionId:row.sessionId,packId:row.packId,packVersion:row.packVersion});
    const policy=await this.policies.documentKnowledgePolicy(submission.scope,row.sessionId);
    this.assertCurrentSubmission(submission,approved.candidate,row.courseId,policy.sourceFingerprint);
    const artifact=await this.repo.artifact(submission.scope,row.artifactId,true);
    if (!artifact || artifact.revision!==row.revision || digest(note(artifact.content))!==submission.work.current.contentHash ||
      submission.policyVersion!==policy.authorityHash) throw conflict('PETROS_QUALITATIVE_INSPECTION_STALE');
    const previous=await this.repo.revision(submission.scope,row.artifactId,row.revision-1);
    if (!previous || previous.id!==submission.work.previous.revisionId ||
      digest(note(previous.content))!==submission.work.previous.contentHash) throw conflict('PETROS_QUALITATIVE_WORK_CHANGED');
    const review=await this.repo.reviewForSubmission(row.institutionId,row.id);
    let reviewStatus='pending';
    if (review) {
      const receipt=petrosQualitativeReviewReceiptSchema.parse(review.receipt);
      if (await this.repo.lifecycleTarget(row.institutionId,'review_revoked',review.id)) reviewStatus='revoked';
      else {
        try {
          if (digest(receipt)!==review.receiptHash) throw conflict('PETROS_QUALITATIVE_REVIEW_CHANGED');
          await this.packs.requireStoredReviewerAuthority(row.courseId,receipt.reviewer.authoritySnapshot,['homework.grade']);
          if (!submission.draftFeedback) throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_REQUIRED');
          const feedback=await this.repo.lifecycleEvent(row.institutionId,submission.draftFeedback.id);
          if (!feedback || digest(feedback.payload)!==submission.draftFeedback.hash) throw conflict('PETROS_QUALITATIVE_DRAFT_FEEDBACK_STALE');
          await this.packs.requireStoredReviewerAuthority(row.courseId,petrosQualitativeDraftFeedbackReceiptSchema.parse(feedback.payload).authority,['homework.grade']);
          reviewStatus=receipt.decision;
        } catch(error) {
          if(error instanceof ConflictException || error instanceof ForbiddenException) reviewStatus='stale';else throw error;
        }
      }
    }
    let provenance:unknown={status:'not_shared'};
    if (submission.shareLearningProvenance) {
      const d=schema.petrosPlanningDecisions,e=schema.petrosObjectiveEvidenceEvents;
      const decisions=await this.db.select({snapshot:d.adaptiveSnapshot}).from(d).where(and(eq(d.institutionId,row.institutionId),
        eq(d.studentId,row.studentId),eq(d.sessionId,row.sessionId),sql`${d.createdAt} <= ${row.createdAt.toISOString()}::timestamptz`)).orderBy(d.sequence).limit(100);
      const events=await this.db.select().from(e).where(and(eq(e.institutionId,row.institutionId),eq(e.studentId,row.studentId),
        eq(e.sessionId,row.sessionId),eq(e.packId,row.packId),eq(e.packVersion,row.packVersion),sql`${e.createdAt} <= ${row.createdAt.toISOString()}::timestamptz`)).limit(1001);
      if (events.length>1000) throw conflict('PETROS_INSPECTION_EVIDENCE_LIMIT');
      const superseded=new Set(events.map(event=>event.correctsEventId));
      provenance={status:'shared',asOf:row.createdAt.toISOString(),interventions:decisions.flatMap(decision=>{
        const parsed=petrosAdaptiveSnapshotSchema.safeParse(decision.snapshot);
        if (!parsed.success || digest(parsed.data.output.pack)!==digest(submission.pack) ||
          parsed.data.output.sourceVersion!==submission.sourceVersion || parsed.data.output.decision.status!=='proposed') return [];
        const selected=parsed.data.output;
        return [{move:selected.decision.status==='proposed'?selected.decision.selectedMove:null,
          reason:selected.decision.status==='proposed'?selected.decision.studentSafeReason:null,
          diagnosis:selected.decision.status==='proposed'?selected.decision.diagnosis:null,signal:selected.signal.kind,
          policyVersion:selected.policyVersion,curriculumRevision:selected.curriculumRevision}];
      }),observations:events.filter(event=>!superseded.has(event.id)).map(event=>({eventId:event.id,
        task:event.evidence.task,assistance:event.classification.petrosAssistance,externalAssistance:event.classification.externalAssistance,
        observation:event.classification.observation,eligible:event.classification.projectionEligible,
        evaluation:event.evidence.assessment.result.kind==='objective'?event.evidence.assessment.result.judgment.status:'qualitative',
        uncertainty:event.evidence.assessment.result.kind==='objective'?event.evidence.assessment.result.provenance.uncertainty:'unknown'}))};
    }
    return {schemaVersion:'petros.educator-inspection.v1',submissionId:row.id,studentId:row.studentId,courseId:row.courseId,
      objective:submission.objective,pack:submission.pack,sourceVersion:submission.sourceVersion,sourceAnchors:submission.sourceAnchors,
      curriculumRevision:approved.candidate.curriculumRevision,rubric:submission.rubric,work:submission.work,
      policyVersion:submission.policyVersion,draftFeedback:submission.draftFeedback,reviewStatus,provenance,
      sharedWork:{currentText:note(artifact.content),previousText:note(previous.content)},
      evidenceAdmission:'not_granted',numericProjection:false,meaning:'Individual recorded observations; no cohort or causal inference.'};
  }

  private sharedReview<T>(principal: InstitutionPrincipal, kind: 'event' | 'submission' | 'review',
    id: string, work: () => Promise<T>) {
    return runInInstitutionTenant(this.db,principal.institutionId,async()=> {
      this.enabled();await this.packs.requireActionPermissions(principal,['homework.grade']);
      const owner=await runInAuthorizedSharedReview(this.db,principal.institutionId,id,()=>
        this.repo.sharedOwner(kind,principal.institutionId,id));
      if (!owner) throw new NotFoundException();
      return this.packs.withCourseRecipient(principal,owner.courseId,owner.studentId,work);
    },principal.institutionUserId);
  }

  private lifecycleAudit(institutionId:string,actorId:string,entityId:string,commandId:string,action:string) {
    return this.audit.logAudit({institutionId,actorType:ActorType.InstitutionUser,actorId,module:'petros',
      action:`petros.qualitative.${action}`,entityType:'petros_qualitative_event',entityId,correlationId:commandId,
      newState:{evidenceAdmission:'not_granted',numericProjection:false}});
  }

  private assertCurrentSubmission(submission: PetrosQualitativeSubmissionReceipt,
    candidate: PetrosConceptPackCandidate, courseId: string, sourceFingerprint: string) {
    const task = candidate.assessments.find((item) =>
      item.id === submission.task.id && item.variant === submission.task.variant);
    if (courseId !== submission.scope.courseId || !task ||
      candidate.pack.id !== submission.pack.id || candidate.pack.version !== submission.pack.version ||
      candidate.objective.id !== submission.objective.id || candidate.objective.version !== submission.objective.version ||
      candidate.sourceVersion !== submission.sourceVersion || candidate.sourceVersion !== sourceFingerprint ||
      digest(candidate.rubric) !== digest(submission.rubric) ||
      digest(sourceAnchors(task)) !== digest(submission.sourceAnchors))
      throw conflict('PETROS_QUALITATIVE_AUTHORITY_CHANGED');
  }
}

function note(raw: unknown): string {
  const content = petrosArtifactContentSchema.parse(raw);
  if (content.kind !== 'note') throw conflict('PETROS_QUALITATIVE_NOTE_REQUIRED');
  return content.body;
}

function work(workId: string, revisionId: string, revision: number, content: string) {
  return { workId, revisionId, revision, contentHash: digest(content), textLength: content.length };
}

function sourceAnchors(task: PetrosConceptPackCandidate['assessments'][number]) {
  const seen = new Set<string>();
  return task.anchors.map((anchor) => anchor.locator).filter((locator) => {
    const key = digest(locator);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}
