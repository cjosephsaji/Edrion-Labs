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
import { and, eq, schema, runInAuthorizedCourseSource, runInStudentTenant, type Database } from '@edrion/database';
import { can } from '@edrion/permissions';
import {
  compatibilityCanonicalJson,
  PETROS_TEACHING_PACK_COMPILER_VERSION,
  petrosConceptPackCandidateSchema,
  petrosConceptPackReviewReceiptSchema,
  petrosReviewerAuthoritySnapshotSchema,
  petrosAssignmentLearningStudentBindingSchema,
  petrosTeachingPackCompileCommandSchema,
  petrosTeachingPackReviewCommandSchema,
  petrosTeachingPackReviewRevocationSchema,
  resolvePetrosConceptPackReviewApproval,
  validatePetrosConceptPackCandidate,
  type PetrosConceptPackCandidate,
  type PetrosConceptPackReviewReceipt,
  type PetrosConceptPackTrustedContext,
  type PetrosReviewerAuthoritySnapshot,
  type PetrosTeachingPackCompileCommand,
  type PetrosTeachingPackReviewCommand,
  type PetrosTeachingPackReviewRevocation,
  petrosSessionBlockSchema,
  m3ReviewReceiptSchema, m3ReviewCommandSchema, type M3Proposal,
  type ContentUnit, type SourceRevision,
} from '@edrion/schemas';
import { createHash, randomUUID } from 'node:crypto';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { readCourseCurriculum } from '../../portal/courses/course-curriculum.repository';
import { PortalAuthService } from '../../portal/portal-auth.service';
import { basePortalAudit, type PortalActionContext } from '../../portal/portal-action-context';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { KnowledgeDocumentService } from './knowledge-document.service';
import { PetrosTeachingPackRepository } from './petros-teaching-pack.repository';
import { assertPetrosAdaptivePackRenderable, PetrosAdaptivePackRenderabilityError, renderTeachingPackPreview } from '../petros-loop/petros-adaptive.renderer';
import { m3PrivateDraftCommandSchema, m3PrivateVerificationCandidateSchema, M3_PRIVATE_CANDIDATE_VERSION } from './petros-assessment-contract.server';
import { referenceFor, validateInterpretation, M2_PROMPT } from './petros-content-interpretation';

type CandidateRow = NonNullable<Awaited<ReturnType<PetrosTeachingPackRepository['candidateById']>>>;
type CourseRow = NonNullable<Awaited<ReturnType<PetrosTeachingPackRepository['course']>>>;

export interface PetrosApprovedPackSummary {
  candidateId: string;
  pack: { id: string; version: number };
  subjectKey: string;
  sourceVersion: string;
  curriculumRevision: number;
  objective: { id: string; version: number; statement: string };
  scope: string;
  concepts: Array<{ id: string; label: string }>;
  review: { receiptId: string; version: number; reviewedAt: string };
}

export interface PetrosApprovedPack {
  candidate: PetrosConceptPackCandidate;
  trustedContext: PetrosConceptPackTrustedContext;
  reviewReceipt: PetrosConceptPackReviewReceipt;
  candidateId: string;
  payloadHash: string;
}

@Injectable()
export class PetrosTeachingPackService {
  private readonly enabled: boolean;
  private readonly authoringEnabled: boolean;

  constructor(
    private readonly repo: PetrosTeachingPackRepository,
    private readonly knowledge: KnowledgeDocumentService,
    private readonly portalAuth: PortalAuthService,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {
    this.enabled = env.PETROS_ADAPTIVE_TEACHING_ENABLED;
    this.authoringEnabled = env.PETROS_TEACHER_AUTHORING_ENABLED;
  }

  /** The authorized author submits the exact immutable draft before an independent review. */
  async submitLearningProposal(ctx:PortalActionContext,proposal:M3Proposal,commandId:string) {
    this.requireAuthoringEnabled();await this.requireActionPermissions(ctx.principal,['class_content.manage','syllabus.manage']);
    if(!proposal.courseId||!proposal.curriculumRevision) return;
    const existing=await this.repo.candidateByRef(proposal.institutionId,proposal.id,proposal.version);
    if(existing) {if(existing.payloadHash!==digest(proposal))throw conflict('M3_CANDIDATE_HASH_CONFLICT');return;}
    await this.repo.insertM3Candidate(proposal,commandId,digest({proposalId:proposal.id,version:proposal.version,commandId}),digest(proposal),ctx.principal.institutionUserId);
  }

  private async requireM3PrivateAuthority(ctx:PortalActionContext,p:M3Proposal) {
    this.requireAuthoringEnabled();await this.requireActionPermissions(ctx.principal,['academics.alignments.approve','class_content.manage','syllabus.manage']);
    if(!p.courseId)throw conflict('CANONICAL_COURSE_MAPPING_REQUIRED');
    const {items}=await this.reviewerQualifications(ctx,p.courseId);
    if(!items.length)throw new ForbiddenException({code:'PETROS_REVIEWER_AUTHORITY_DENIED',message:'Current qualified reviewer authority is required for private verification materials.'});
    return this.requireReviewerAuthority(ctx.principal,{institutionId:p.institutionId,courseId:p.courseId,subjectKey:p.subjectId,
      qualificationId:items[0]!.id,expectedQualificationVersion:items[0]!.version});
  }
  private verificationTask(p:M3Proposal,id:string) {
    const task=p.taskCandidates.find(t=>t.id===id&&t.kind!=='formative_practice'&&t.nonEquivalenceRequired);
    if(!task)throw unavailable('M3_VERIFICATION_CANDIDATE_UNAVAILABLE');return task;
  }
  private parsePrivate(p:M3Proposal,row:CandidateRow|undefined) {
    if(!row||row.schemaVersion!==M3_PRIVATE_CANDIDATE_VERSION)throw unavailable('M3_PRIVATE_CANDIDATE_UNAVAILABLE');
    const c=m3PrivateVerificationCandidateSchema.parse(row.payload);
    if(c.institutionId!==p.institutionId||c.courseId!==p.courseId||c.subjectId!==p.subjectId||c.proposalId!==p.id||
      c.proposalVersion!==p.version||c.proposalHash!==digest(p)||c.sourceRevisionId!==p.source.revisionId||c.sourceHash!==p.source.originalHash||
      row.payloadHash!==digest(c))throw conflict('M3_PRIVATE_CANDIDATE_STALE');
    const task=this.verificationTask(p,c.id),objective=p.objectives.find(o=>o.id===task.objectiveId);
    if(!objective||c.objectiveId!==objective.id||c.objectiveVersion!==objective.version||c.criterionId!==task.id)throw conflict('M3_PRIVATE_CANDIDATE_STALE');
    return c;
  }
  async preparePrivateVerification(ctx:PortalActionContext,p:M3Proposal,taskId:string,raw:unknown,revision:SourceRevision,heldOut:ContentUnit|null) {
    await this.requireM3PrivateAuthority(ctx,p);
    const input=m3PrivateDraftCommandSchema.parse(raw),task=this.verificationTask(p,taskId);
    if(input.expectedVersion!==p.version)throw conflict('M3_REVISION_CONFLICT');
    if(p.state!=='under_review')throw conflict('M3_SUBMIT_REVIEW_REQUIRED');
    if(!heldOut||p.source.references.some(r=>r.unitId===heldOut.id))throw conflict('M3_HELD_OUT_RESERVATION_REQUIRED');
    await this.repo.lock(`m3-private:${p.institutionId}:${taskId}`);
    const requestHash=digest({proposalId:p.id,version:p.version,taskId,input,actorId:ctx.principal.institutionUserId});
    const replay=await this.repo.candidateCommand(p.institutionId,input.commandId);
    if(replay){if(replay.requestHash!==requestHash)throw conflict('M3_PRIVATE_RETRY_CONFLICT');this.parsePrivate(p,replay);return this.privateVerificationPreview(ctx,p,taskId);}
    const previous=await this.repo.latestCandidate(p.institutionId,taskId);
    if((previous?.packVersion??0)!==input.expectedFamilyVersion)throw conflict('M3_INSTRUMENT_REVISION_CONFLICT');
    const objective=p.objectives.find(o=>o.id===task.objectiveId)!;
    const support=[{reference:referenceFor(heldOut),quote:heldOut.searchableText.slice(0,1200)}];
    const question=input.questionText??`Provide ${task.kind.replaceAll('_',' ')} work for this objective using the reserved passage: ${objective.wording}. Criterion: ${task.criterion}`;
    const normalized=(value:string)=>value.toLowerCase().replace(/\W+/g,' ').trim();
    const teaching=[...p.taskCandidates.filter(t=>t.kind==='formative_practice').map(t=>t.expectedWork),...p.activities.flatMap(a=>[a.purpose,a.expectedObservation,a.expectedResult])];
    if(teaching.some(text=>normalized(text)===normalized(question)))throw conflict('M3_TASK_FAMILY_EQUIVALENCE_REQUIRED');
    for(const other of p.taskCandidates.filter(t=>t.id!==taskId&&t.kind!=='formative_practice')) {
      const stored=await this.repo.latestCandidate(p.institutionId,other.id);
      if(stored?.schemaVersion===M3_PRIVATE_CANDIDATE_VERSION&&normalized(m3PrivateVerificationCandidateSchema.parse(stored.payload).question)===normalized(question))
        throw conflict('M3_TASK_FAMILY_EQUIVALENCE_REQUIRED');
    }
    const answer=input.referenceText??support[0]!.quote,alternatives=input.alternativeTexts??[];
    for(const statement of [answer,...alternatives])validateInterpretation({schemaVersion:M2_PROMPT,uncertainties:[],
      proposals:[{kind:'claim',statement,support,relatedUnitId:null,diagramEdge:null}]},revision,[heldOut]);
    const at=new Date().toISOString();
    const c=m3PrivateVerificationCandidateSchema.parse({schemaVersion:M3_PRIVATE_CANDIDATE_VERSION,id:taskId,version:(previous?.packVersion??0)+1,
      institutionId:p.institutionId,courseId:p.courseId,subjectId:p.subjectId,proposalId:p.id,proposalVersion:p.version,proposalHash:digest(p),
      objectiveId:objective.id,objectiveVersion:objective.version,criterionId:task.id,kind:task.kind,assistance:'unassisted',
      sourceRevisionId:p.source.revisionId,sourceHash:p.source.originalHash,support,question,answer,referenceAnswers:alternatives,
      rubric:(input.criteriaTexts??[task.criterion,'Check the source support and preserve defensible alternative readings.']).map(privateRule=>({criterionId:task.id,privateRule})),
      discriminators:[`Independent review must establish non-equivalence with ${task.kind} practice and other families.`],
      privateEvaluationPrompt:input.evaluationInstruction??'Candidate instructions only. Do not execute an evaluator or issue a grade in M3.',
      origin:input.questionText?'qualified_teacher_edit':'engineering_private_outline',status:'qualified_review_required',
      exposure:{sourceWasPublished:true,questionWasPublished:false,privateCriteriaWerePublished:false,nonEquivalence:'independent_review_required'},
      correction:{previousVersion:previous?.packVersion??null,editorId:ctx.principal.institutionUserId,commandId:input.commandId,requestHash,at},createdBy:ctx.principal.institutionUserId,createdAt:at});
    if(Buffer.byteLength(JSON.stringify(c))>48*1024)throw conflict('M3_PRIVATE_CANDIDATE_LIMIT');
    await this.repo.insertM3PrivateCandidate(p,c,digest(c));
    return this.privateVerificationPreview(ctx,p,taskId);
  }
  async privateVerificationPreview(ctx:PortalActionContext,p:M3Proposal,taskId:string) {
    await this.requireM3PrivateAuthority(ctx,p);this.verificationTask(p,taskId);
    const c=this.parsePrivate(p,await this.repo.latestCandidate(p.institutionId,taskId));
    return {family:{id:c.id,version:c.version},origin:c.origin,classification:'Private review draft; no student task or evaluator execution',
      panels:[{label:'Candidate question',content:c.question},{label:'Private reference criteria',content:[c.answer,...c.referenceAnswers,...c.rubric.map(r=>r.privateRule)].join('\n\n')},
        {label:'Private evaluation instructions',content:c.privateEvaluationPrompt},{label:'Reserved source evidence',content:JSON.stringify(c.support,null,2)},
        {label:'Exposure and non-equivalence review',content:JSON.stringify(c.exposure,null,2)}]};
  }
  async privateVerificationStatus(p:M3Proposal) {
    if(!p.courseId)return [];
    const rows=await this.repo.m3PrivatePublicStatus(p),result=[];
    // Request-local only: exact qualification/version decisions share one current owner read.
    const authorityReads=new Map<string,boolean>();
    for(const row of rows) {
      let status=row.context_current?(row.decision??'qualified_review_required'):'stale_proposal';
      if(row.review_id&&row.reviewer_user_id&&row.qualification_id&&row.qualification_version) {
        const pin=`${row.reviewer_user_id}:${row.qualification_id}:${row.qualification_version}`;
        if(!authorityReads.has(pin)) {
          try {const principal=await this.portalAuth.resolveById(row.reviewer_user_id,null);
            await this.requireActionPermissions(principal,['academics.alignments.approve','class_content.manage']);
            await this.requireReviewerAuthority(principal,{institutionId:p.institutionId,courseId:p.courseId,subjectKey:p.subjectId,
              qualificationId:row.qualification_id,expectedQualificationVersion:row.qualification_version});authorityReads.set(pin,true);}
          catch {authorityReads.set(pin,false);}
        }
        if(!authorityReads.get(pin))status='authority_revoked_or_expired';
        if(row.revoked)status='review_revoked';
      }
      result.push({id:row.family_id,version:row.family_version,status,receiptId:row.review_id??undefined});
    }
    return result;
  }
  /** M3 decisions remain in the established candidate/qualification/review owners. */
  async reviewLearningProposal(ctx: PortalActionContext, proposal: M3Proposal, raw: unknown) {
    this.requireAuthoringEnabled();
    const input = m3ReviewCommandSchema.parse(raw);
    await this.requireActionPermissions(ctx.principal, ['academics.alignments.approve', 'class_content.manage']);
    if (!proposal.courseId) throw conflict('CANONICAL_COURSE_MAPPING_REQUIRED');
    if (input.expectedVersion !== proposal.version) throw conflict('M3_REVISION_CONFLICT');
    const authority = await this.requireReviewerAuthority(ctx.principal, {institutionId:proposal.institutionId,courseId:proposal.courseId,
      subjectKey:proposal.subjectId,qualificationId:input.qualificationId,expectedQualificationVersion:input.qualificationVersion});
    let taskFamily:{id:string;version:number;hash:string}|null=null;
    if(input.dimension==='assessment_instrument') {
      if(!input.taskFamilyId||!input.taskFamilyVersion)throw conflict('M3_QUALIFIED_INSTRUMENT_CONTRACT_REQUIRED');
      const row=await this.repo.latestCandidate(proposal.institutionId,input.taskFamilyId),privateBody=this.parsePrivate(proposal,row);
      if(privateBody.version!==input.taskFamilyVersion)throw conflict('M3_INSTRUMENT_REVISION_CONFLICT');
      if(input.decision==='approved'&&input.nonEquivalenceDecision!=='distinct')throw conflict('M3_TASK_FAMILY_EQUIVALENCE_REQUIRED');
      if(input.decision==='approved'&&privateBody.createdBy===ctx.principal.institutionUserId)throw new ForbiddenException({code:'PETROS_PACK_SELF_APPROVAL_DENIED',message:'An independent qualified reviewer must approve this private instrument.'});
      taskFamily={id:privateBody.id,version:privateBody.version,hash:row!.payloadHash};
    } else if(input.taskFamilyId||input.taskFamilyVersion||input.nonEquivalenceDecision)throw conflict('M3_REVIEW_DIMENSION_MISMATCH');
    const requestHash = digest({proposalId:proposal.id,version:proposal.version,reviewerUserId:ctx.principal.institutionUserId,input,taskFamily});
    const prior = await this.repo.reviewCommand(proposal.institutionId,input.commandId);
    if (prior) {
      if(prior.requestHash !== requestHash) throw conflict('M3_REVIEW_RETRY_CONFLICT');
      return m3ReviewReceiptSchema.parse(prior.receipt);
    }
    if(input.decision==='approved'&&(proposal.createdBy===ctx.principal.institutionUserId||proposal.correction.editorId===ctx.principal.institutionUserId)) throw new ForbiddenException({code:'PETROS_PACK_SELF_APPROVAL_DENIED',message:'An independent qualified reviewer must approve this lesson.'});
    let candidate=await this.repo.candidateByRef(proposal.institutionId,proposal.id,proposal.version);
    const payloadHash=digest(proposal);
    if(candidate && candidate.payloadHash!==payloadHash) throw conflict('M3_CANDIDATE_HASH_CONFLICT');
    if(!candidate) throw conflict('M3_SUBMIT_REVIEW_REQUIRED');
    const rows=await this.repo.m3Reviews(proposal.institutionId,candidate.id);
    const receipt=m3ReviewReceiptSchema.parse({schemaVersion:'petros.v2.scope-review.v1',id:randomUUID(),proposalId:proposal.id,
      proposalVersion:proposal.version,sourceRevisionId:proposal.source.revisionId,payloadHash,dimension:input.dimension,
      decision:input.decision,reviewerUserId:ctx.principal.institutionUserId,qualificationId:authority.qualificationId,
      qualificationVersion:authority.qualificationVersion,taskFamily,nonEquivalenceDecision:input.nonEquivalenceDecision,reason:input.reason,reviewedAt:new Date().toISOString()});
    await this.repo.insertM3Review(candidate,receipt,authority,input.commandId,requestHash,(rows[0]?.reviewVersion??0)+1);
    if(input.decision==='approved'&&input.dimension!=='assessment_instrument') {
      await this.db.insert(schema.courseCurriculumRecords).values({institutionId:proposal.institutionId,courseId:proposal.courseId,
        kind:`petros_v2_${input.dimension}`,recordId:proposal.id,recordVersion:proposal.version,contentHash:payloadHash,
        content:{proposalId:proposal.id,proposalVersion:proposal.version,sourceRevisionId:proposal.source.revisionId,reviewId:receipt.id,
          objectives:proposal.objectives.map(o=>({id:o.id,version:o.version,wording:o.wording,conceptRefs:o.conceptRefs})),
          relationships:proposal.relationships},actorId:ctx.principal.institutionUserId}).onConflictDoNothing();
    }
    return receipt;
  }

  async learningProposalReviewState(proposal: M3Proposal) {
    const candidate=await this.repo.candidateByRef(proposal.institutionId,proposal.id,proposal.version);
    const result:Record<string,{status:string;receiptId?:string}>={};
    if(!candidate) return result;
    if(candidate.payloadHash!==digest(proposal)) throw conflict('M3_CANDIDATE_HASH_CONFLICT');
    for(const row of await this.repo.m3Reviews(proposal.institutionId,candidate.id)) {
      const receipt=m3ReviewReceiptSchema.parse(row.receipt);
      if(receipt.dimension==='assessment_instrument'||result[receipt.dimension]) continue;
      let valid=proposal.createdBy!==row.reviewerUserId;
      try { await this.requireStoredReviewerAuthority(proposal.courseId!,row.authoritySnapshot,['academics.alignments.approve']); }
      catch { valid=false; }
      if(await this.repo.reviewRevocation(proposal.institutionId,row.id)) valid=false;
      result[receipt.dimension]={status:valid?receipt.decision:'authority_revoked_or_expired',receiptId:row.id};
    }
    const instruments=await this.privateVerificationStatus(proposal);
    const needed=proposal.taskCandidates.filter(t=>t.kind!=='formative_practice');
    result.assessment_instrument={status:needed.length&&needed.every(t=>instruments.some(i=>i.id===t.id&&i.status==='approved'))?'approved':'verification_pending'};
    return result;
  }

  /** Immutable release manifest; no student session/task/evidence is created. Caller holds current source/class locks. */
  async learningProposalManifest(proposal:M3Proposal) {
    if(!proposal.courseId)return null;
    const t=schema.courseCurriculumRecords;
    const [row]=await this.db.select({id:t.id,createdAt:t.createdAt}).from(t).where(and(eq(t.institutionId,proposal.institutionId),
      eq(t.courseId,proposal.courseId),eq(t.kind,'petros_v2_release'),eq(t.recordId,proposal.id),eq(t.recordVersion,proposal.version),
      eq(t.contentHash,digest(proposal)))).limit(1);
    return row?{id:row.id,proposalVersion:proposal.version,recordedAt:row.createdAt.toISOString(),
      mode:'isolated_teaching_scope_only',studentPublication:'not_enabled',currentChecksRequired:true}:null;
  }

  async releaseLearningProposal(ctx:PortalActionContext,proposal:M3Proposal,commandId:string,recipientHash:string,reviewRefs:string[]) {
    this.requireAuthoringEnabled();
    await this.requireActionPermissions(ctx.principal,['class_content.manage','academics.alignments.approve']);
    const states=await this.learningProposalReviewState(proposal);
    if(['teaching_scope','concepts','activities'].some(d=>states[d]?.status!=='approved')) throw conflict('M3_REVIEW_REQUIRED');
    const instrumentRefs=(await this.privateVerificationStatus(proposal)).filter(i=>i.status==='approved').map(({id,version,receiptId})=>({id,version,receiptId})).sort((a,b)=>a.id.localeCompare(b.id));
    const t=schema.courseCurriculumRecords;
    const requestHash=digest({proposalId:proposal.id,version:proposal.version,commandId,recipientHash,reviewRefs,instrumentRefs});
    const [prior]=await this.db.select().from(t).where(and(eq(t.institutionId,proposal.institutionId),eq(t.courseId,proposal.courseId!),
      eq(t.kind,'petros_v2_release'),eq(t.recordId,proposal.id),eq(t.recordVersion,proposal.version))).limit(1);
    if(prior) {
      if(prior.content.requestHash!==requestHash) throw conflict('M3_RELEASE_RETRY_CONFLICT');
      return {id:prior.id,version:proposal.version,isolatedAuthorizationPath:true,replayed:true};
    }
    const [row]=await this.db.insert(t).values({institutionId:proposal.institutionId,courseId:proposal.courseId!,kind:'petros_v2_release',
      recordId:proposal.id,recordVersion:proposal.version,contentHash:digest(proposal),content:{schemaVersion:'petros.v2.release-manifest.v1',
        mode:'isolated_teaching_scope_only',proposalId:proposal.id,proposalVersion:proposal.version,source:proposal.source,
        classId:proposal.classId,subjectId:proposal.subjectId,recipientHash,reviewRefs,requestHash,commandId,
        instrumentRefs,verification:states.assessment_instrument?.status==='approved'?'qualified_synthetic_review':'pending',studentPublication:'not_enabled'},actorId:ctx.principal.institutionUserId}).returning();
    return {id:row!.id,version:proposal.version,isolatedAuthorizationPath:true,replayed:false};
  }

  async compileAuthoredCandidate(ctx: PortalActionContext, input: PetrosTeachingPackCompileCommand) {
    this.requireAuthoringEnabled();
    return this.compile(ctx, input);
  }

  async reviewAuthoredCandidate(ctx: PortalActionContext, candidateId: string, input: PetrosTeachingPackReviewCommand) {
    this.requireAuthoringEnabled();
    return this.review(ctx, candidateId, input);
  }

  async revokeAuthoredReview(ctx: PortalActionContext, reviewId: string, input: PetrosTeachingPackReviewRevocation) {
    this.requireAuthoringEnabled();
    return this.revoke(ctx, reviewId, input);
  }

  async listCandidates(ctx: PortalActionContext, courseId: string) {
    this.requireAuthoringEnabled();
    await this.requireActionPermissions(ctx.principal, ['class_content.manage', 'syllabus.manage']);
    const course = await this.requireCourseAuthority(ctx.principal, ctx.scope, courseId, 'share');
    const rows = await this.repo.candidatesForCourse(ctx.principal.institutionId, course.id);
    const items = [];
    let unavailableCount = 0;
    for (const row of rows) {
      if ((row.sourceFormat ?? 'v1') !== 'v1' || !row.sourceItemId) { unavailableCount++; continue; }
      const candidate = this.requireStoredCandidate(row);
      try { validatePetrosConceptPackCandidate(candidate, await this.buildTrustedContext(course, row.sourceItemId, candidate)); }
      catch (error) { if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof ForbiddenException) { unavailableCount++; continue; } throw error; }
      const latest = await this.repo.latestReview(ctx.principal.institutionId, row.id);
      const revoked = latest ? !!await this.repo.reviewRevocation(ctx.principal.institutionId,latest.id) : false;
      items.push({id: row.id, createdByUserId: row.createdByUserId, sourceItemId: row.sourceItemId,
        payloadHash: row.payloadHash, packVersion: row.packVersion, payload: candidate,
        latestReview: latest ? {id: latest.id, decision: latest.decision, reviewVersion: latest.reviewVersion, reviewedAt: latest.reviewedAt.toISOString(), payloadHash: latest.payloadHash, revoked} : null});
    }
    return {items, unavailableCount};
  }

  async reviewerQualifications(ctx: PortalActionContext, courseId: string) {
    this.requireAuthoringEnabled();
    await this.requireActionPermissions(ctx.principal, ['syllabus.manage', 'academics.alignments.approve']);
    const course = await this.requireCourseAuthority(ctx.principal, ctx.scope, courseId, 'share');
    const rows = await this.repo.qualificationsForReviewer(ctx.principal.institutionId, ctx.principal.institutionUserId, course.subjectId!);
    const latest = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!latest.has(row.id)) latest.set(row.id, row);
    const items = [];
    for (const row of latest.values()) {
      try { await this.requireReviewerAuthority(ctx.principal, {institutionId: ctx.principal.institutionId,
        courseId: course.id, subjectKey: row.subjectKey, qualificationId: row.id, expectedQualificationVersion: row.version}); }
      catch (error) { if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof ForbiddenException) continue; throw error; }
      items.push({id: row.id, version: row.version, subjectKey: row.subjectKey, status: row.status, reviewerUserId: row.reviewerUserId});
    }
    return {items};
  }

  async previewCandidate(ctx: PortalActionContext, candidateId: string) {
    this.requireAuthoringEnabled();
    await this.requireActionPermissions(ctx.principal, ['class_content.manage', 'syllabus.manage']);
    const row = await this.repo.candidateById(ctx.principal.institutionId, candidateId);
    if (!row || (row.sourceFormat ?? 'v1') !== 'v1' || !row.sourceItemId) throw unavailable('PETROS_PACK_CANDIDATE_NOT_FOUND');
    const course = await this.requireCourseAuthority(ctx.principal, ctx.scope, row.courseId, 'share');
    const candidate = this.requireStoredCandidate(row);
    validatePetrosConceptPackCandidate(candidate, await this.buildTrustedContext(course, row.sourceItemId, candidate));
    const sessionId = randomUUID();
    const blocks = renderTeachingPackPreview(candidate).map((content, index) => petrosSessionBlockSchema.parse({
      id: randomUUID(), sessionId, decisionId: randomUUID(), sequence: index + 1, status: 'current', version: 0,
      content, interactionState: {revealedLayers: 20, revealedSteps: 20, diagramBuilt: true}, observedOutcome: null,
      questions: [], whyThis: 'Teacher preview of candidate content; no review or learning evidence is implied.',
      correlationId: randomUUID(), delivery: 'deterministic_fallback', createdAt: new Date().toISOString(), completedAt: null,
    }));
    return {candidateId, payloadHash: row.payloadHash, blocks, assessmentConditions: {supervision: 'unknown',
      externalAssistance: 'unknown', purpose: 'formative_preview', evidenceRecorded: false}};
  }

  async compile(ctx: PortalActionContext, raw: PetrosTeachingPackCompileCommand) {
    this.requireEnabled();
    await this.requireActionPermissions(ctx.principal,['class_content.manage','syllabus.manage']);
    const input = petrosTeachingPackCompileCommandSchema.parse(raw);
    const institutionId = ctx.principal.institutionId;
    const course = await this.requireCourseAuthority(ctx.principal, ctx.scope, input.courseId, 'exclusive');
    const candidate = petrosConceptPackCandidateSchema.parse(input.candidate);
    if (candidate.compilerVersion !== PETROS_TEACHING_PACK_COMPILER_VERSION)
      throw conflict('PETROS_PACK_COMPILER_UNSUPPORTED');
    if (!candidate.claims?.length) throw conflict('PETROS_PACK_CLAIMS_REQUIRED');
    if (!course.subjectId || candidate.subject !== course.subjectId)
      throw conflict('PETROS_PACK_SUBJECT_MISMATCH');
    await this.repo.lock(`petros-pack:${institutionId}:${course.id}:${candidate.pack.id}`);
    const trustedContext = await this.buildTrustedContext(course, input.sourceItemId, candidate);
    validatePetrosConceptPackCandidate(candidate, trustedContext);
    this.requireRenderableCandidate(candidate);
    const payloadHash = digest(candidate);
    const requestHash = digest(input);
    const replay = await this.repo.candidateCommand(institutionId, input.commandId);
    if (replay) {
      if (replay.requestHash !== requestHash || replay.payloadHash !== payloadHash)
        throw conflict('PETROS_PACK_COMPILE_RETRY_CONFLICT');
      return { candidateId: replay.id, candidate, payloadHash, replayed: true };
    }
    const latest = await this.repo.latestCandidate(institutionId, candidate.pack.id);
    const expectedVersion = (latest?.packVersion ?? 0) + 1;
    if (candidate.pack.version !== expectedVersion)
      throw conflict('PETROS_PACK_VERSION_CONFLICT');
    const row = await this.repo.insertCandidate({
      institutionId,
      courseId: course.id,
      sourceItemId: input.sourceItemId,
      payloadHash,
      requestHash,
      commandId: input.commandId,
      createdByUserId: ctx.principal.institutionUserId,
      candidate,
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'petros.teaching_pack_candidate_compiled',
      module: 'petros',
      entityType: 'petros_teaching_pack_candidate',
      entityId: row.id,
      newState: { courseId: course.id, pack: candidate.pack, sourceVersion: candidate.sourceVersion,
        curriculumRevision: candidate.curriculumRevision, payloadHash },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return { candidateId: row.id, candidate, payloadHash, replayed: false };
  }

  async review(ctx: PortalActionContext, candidateId: string, raw: PetrosTeachingPackReviewCommand) {
    this.requireEnabled();
    await this.requireActionPermissions(ctx.principal,['syllabus.manage','academics.alignments.approve']);
    const input = petrosTeachingPackReviewCommandSchema.parse(raw);
    const institutionId = ctx.principal.institutionId;
    await this.repo.lock(`petros-pack-review:${institutionId}:${candidateId}`);
    const found = await this.repo.candidateById(institutionId, candidateId);
    if (!found) throw new NotFoundException({ code: 'PETROS_PACK_CANDIDATE_NOT_FOUND' });
    const course = await this.requireCourseAuthority(ctx.principal, ctx.scope, found.courseId, 'exclusive');
    const row = await this.repo.candidateById(institutionId, candidateId);
    if (!row || row.courseId !== course.id || (row.sourceFormat ?? 'v1') !== 'v1' || !row.sourceItemId) throw new NotFoundException({ code: 'PETROS_PACK_CANDIDATE_NOT_FOUND' });
    const candidate = this.requireStoredCandidate(row);
    const trustedContext = await this.buildTrustedContext(course, row.sourceItemId, candidate);
    validatePetrosConceptPackCandidate(candidate, trustedContext);
    this.requireRenderableCandidate(candidate);
    if (input.expectedPayloadHash !== row.payloadHash || digest(candidate) !== row.payloadHash)
      throw conflict('PETROS_PACK_REVIEW_CHANGED_PAYLOAD');
    if (this.authoringEnabled && input.decision === 'approved' && row.createdByUserId === ctx.principal.institutionUserId)
      throw new ForbiddenException({code: 'PETROS_PACK_SELF_APPROVAL_DENIED', message: 'An independent qualified reviewer must approve this lesson.'});
    const authority = await this.requireReviewerAuthority(ctx.principal, {
      institutionId,
      courseId: course.id,
      subjectKey: candidate.subject,
      qualificationId: input.qualificationId,
      expectedQualificationVersion: input.expectedQualificationVersion,
    });
    const requestHash = digest({ candidateId, input });
    const replay = await this.repo.reviewCommand(institutionId, input.commandId);
    if (replay) {
      if (replay.candidateId !== candidateId || replay.requestHash !== requestHash || replay.payloadHash !== row.payloadHash)
        throw conflict('PETROS_PACK_REVIEW_RETRY_CONFLICT');
      return { receipt: petrosConceptPackReviewReceiptSchema.parse(replay.receipt), replayed: true };
    }
    const latest = await this.repo.latestReview(institutionId, candidateId);
    const reviewedAt = authority.observedAt;
    const receipt = petrosConceptPackReviewReceiptSchema.parse({
      schemaVersion: 'petros.concept-pack-review.v1',
      receiptId: randomUUID(),
      reviewVersion: (latest?.reviewVersion ?? 0) + 1,
      institutionId,
      courseId: course.id,
      candidateId,
      payloadHash: row.payloadHash,
      reviewedAt,
      decision: input.decision,
      reviewer: {
        educatorId: ctx.principal.institutionUserId,
        authorityVersion: authority.qualificationVersion,
        qualification: { id: authority.qualificationId, version: authority.qualificationVersion,
          subject: authority.subjectKey },
        authoritySnapshot: authority,
      },
      reviewedCandidate: candidate,
      coverage: input.coverage,
      rationale: input.rationale,
    });
    await this.repo.insertReview({
      reviewId: receipt.receiptId,
      institutionId,
      courseId: course.id,
      sourceItemId: row.sourceItemId,
      sourceVersion: row.sourceVersion,
      candidateId,
      reviewVersion: receipt.reviewVersion,
      decision: receipt.decision,
      payloadHash: row.payloadHash,
      reviewerUserId: ctx.principal.institutionUserId,
      authority,
      receipt,
      commandId: input.commandId,
      requestHash,
    });
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'petros.teaching_pack_review_recorded', module: 'petros',
      entityType: 'petros_teaching_pack_review', entityId: receipt.receiptId,
      newState: { candidateId, decision: receipt.decision, reviewVersion: receipt.reviewVersion,
        payloadHash: row.payloadHash, qualificationId: authority.qualificationId,
        qualificationVersion: authority.qualificationVersion },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return { receipt, replayed: false };
  }

  async revoke(ctx: PortalActionContext, reviewId: string, raw: PetrosTeachingPackReviewRevocation) {
    this.requireEnabled();
    await this.requireActionPermissions(ctx.principal,['syllabus.manage','academics.alignments.approve']);
    const input = petrosTeachingPackReviewRevocationSchema.parse(raw);
    const institutionId = ctx.principal.institutionId;
    await this.repo.lock(`petros-pack-revocation:${institutionId}:${reviewId}`);
    const found = await this.repo.reviewById(institutionId, reviewId);
    if (!found) throw new NotFoundException({ code: 'PETROS_PACK_REVIEW_NOT_FOUND' });
    await this.requireCourseAuthority(ctx.principal, ctx.scope, found.courseId, 'exclusive');
    const review = await this.repo.reviewById(institutionId, reviewId);
    if (!review || review.courseId !== found.courseId || (review.sourceFormat ?? 'v1') !== 'v1' || !review.sourceItemId) throw new NotFoundException({ code: 'PETROS_PACK_REVIEW_NOT_FOUND' });
    if (review.reviewVersion !== input.expectedReviewVersion)
      throw conflict('PETROS_PACK_REVIEW_VERSION_CONFLICT');
    const requestHash = digest({ reviewId, input });
    const replay = await this.repo.revocationCommand(institutionId, input.commandId);
    if (replay) {
      if (replay.reviewId !== reviewId || replay.requestHash !== requestHash)
        throw conflict('PETROS_PACK_REVOCATION_RETRY_CONFLICT');
      return { revocationId: replay.id, revokedAt: replay.revokedAt.toISOString(), replayed: true };
    }
    if (await this.repo.reviewRevocation(institutionId, reviewId))
      throw conflict('PETROS_PACK_REVIEW_ALREADY_REVOKED');
    const row = await this.repo.insertRevocation({ institutionId, reviewId, courseId:review.courseId,
      sourceItemId:review.sourceItemId, commandId: input.commandId,
      requestHash, reason: input.reason, revokedByUserId: ctx.principal.institutionUserId });
    await this.audit.logAudit({
      ...basePortalAudit(ctx), action: 'petros.teaching_pack_review_revoked', module: 'petros',
      entityType: 'petros_teaching_pack_review', entityId: reviewId,
      reason: input.reason, newState: { reviewVersion: review.reviewVersion, revocationId: row.id },
    } as Parameters<AuditWriter['logAudit']>[0]);
    return { revocationId: row.id, revokedAt: row.revokedAt.toISOString(), replayed: false };
  }

  async requireReviewerAuthority(principal: InstitutionPrincipal, input: {
    institutionId: string;
    courseId: string;
    subjectKey: string;
    qualificationId: string;
    expectedQualificationVersion: number;
  }): Promise<PetrosReviewerAuthoritySnapshot> {
    this.requireEnabled();
    if (principal.institutionId !== input.institutionId)
      throw new ForbiddenException({ code: 'PETROS_REVIEWER_AUTHORITY_DENIED' });
    const course = await this.requireCourseAuthority(principal, { mode: 'institution' }, input.courseId, 'exclusive');
    if (course.subjectId !== input.subjectKey) throw conflict('PETROS_REVIEWER_SUBJECT_MISMATCH');
    return this.loadReviewerAuthority(input.institutionId, input.courseId, principal.institutionUserId,
      input.subjectKey, input.qualificationId, input.expectedQualificationVersion, new Date().toISOString());
  }

  /** Recheck the exact authority retained in a review; callers still authorize access to the work. */
  async requireStoredReviewerAuthority(courseId:string, snapshot:PetrosReviewerAuthoritySnapshot,
    requiredPermissions:string[] = []) {
    this.requireEnabled();
    const current=await this.loadReviewerAuthority(snapshot.institutionId,courseId,snapshot.reviewerUserId,
      snapshot.subjectKey,snapshot.qualificationId,snapshot.qualificationVersion,new Date().toISOString());
    if (current.evidenceHash!==snapshot.evidenceHash) throw conflict('PETROS_REVIEWER_AUTHORITY_CHANGED');
    if (requiredPermissions.length) {
      const principal=await this.portalAuth.resolveById(snapshot.reviewerUserId,null);
      if (principal.institutionId!==snapshot.institutionId) throw new ForbiddenException();
      await this.requireActionPermissions(principal,requiredPermissions);
    }
    return current;
  }

  async requireActionPermissions(principal:InstitutionPrincipal,permissions:string[]) {
    await this.repo.lock(`petros-knowledge:${principal.institutionId}`);
    const current=await this.portalAuth.resolveById(principal.institutionUserId,null);
    if (current.institutionId!==principal.institutionId || permissions.some(permission=>!can(current.permissions,permission)))
      throw new ForbiddenException({code:'PETROS_CURRENT_PERMISSION_REQUIRED'});
    return current;
  }

  async requireApprovedPack(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    packRef: { packId: string; packVersion: number },
  ): Promise<PetrosApprovedPack> {
    this.requireEnabled();
    return this.requireApprovedPackForOwner(principal.institutionId, principal.studentId, sessionId, packRef);
  }

  /** Artifact/readback path. This never changes session state and still revalidates all authorities. */
  async requireApprovedPackForResume(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    packRef: { packId: string; packVersion: number },
  ): Promise<PetrosApprovedPack> {
    this.requireEnabled();
    return this.requireApprovedPackForOwner(principal.institutionId, principal.studentId, sessionId,
      packRef, undefined, true);
  }

  async requireApprovedPackForReview(principal: InstitutionPrincipal, input: {
    courseId: string;
    sessionId: string;
    studentId: string;
    packId: string;
    packVersion: number;
  }): Promise<PetrosApprovedPack> {
    return this.withCourseRecipient(principal, input.courseId, input.studentId, () =>
      this.requireApprovedPackForOwner(principal.institutionId, input.studentId, input.sessionId,
        { packId: input.packId, packVersion: input.packVersion }, input.courseId));
  }

  /** Staff delegation is bounded by current course authority and a locked recipient enrollment. */
  async withCourseRecipient<T>(principal: InstitutionPrincipal, courseId: string, studentId: string,
    work: () => Promise<T>): Promise<T> {
    this.requireEnabled();
    await this.requireCourseAuthority(principal, { mode: 'institution' }, courseId, 'share');
    const enrollment = await this.repo.enrollment(principal.institutionId, courseId, studentId);
    if (!enrollment || enrollment.studentStatus !== 'enrolled')
      throw new ForbiddenException({ code: 'PETROS_PACK_COURSE_ACCESS_DENIED' });
    // Current course authority and the locked enrollment authorize this bounded
    // recipient read. Retain the staff actor; only public session columns are read.
    return runInStudentTenant(this.db, { institutionId: principal.institutionId,
      studentId, institutionUserId: principal.institutionUserId }, work);
  }

  private async requireApprovedPackForOwner(institutionId: string, studentId: string, sessionId: string,
    packRef: { packId: string; packVersion: number }, expectedCourseId?: string,
    allowInactiveSession = false): Promise<PetrosApprovedPack> {
    await this.repo.lock(`petros-knowledge:${institutionId}`);
    const session = await this.requireOwnedSession(institutionId, studentId, sessionId, allowInactiveSession);
    const releases = await this.repo.learningAssignments(institutionId,studentId,sessionId);
    if (releases.length > 1) throw conflict('PETROS_ASSIGNMENT_MULTIPLE_RELEASES_UNSUPPORTED');
    for (const release of releases) {
      const binding=petrosAssignmentLearningStudentBindingSchema.parse(release.binding);
      if (binding.target.pack.id !== packRef.packId || binding.target.pack.version !== packRef.packVersion)
        throw conflict('PETROS_ASSIGNMENT_PACK_RESTRICTED');
    }
    const sourceContext = session.sourceContext as Record<string, unknown>;
    const found = await this.repo.candidateByRef(institutionId, packRef.packId, packRef.packVersion);
    if (!found || (expectedCourseId && found.courseId !== expectedCourseId))
      throw new NotFoundException({ code: 'PETROS_PACK_NOT_FOUND' });
    const course = await this.repo.course(institutionId, found.courseId, 'share');
    if (!course || course.status !== 'active') throw unavailable('PETROS_PACK_COURSE_UNAVAILABLE');
    const row = await this.repo.candidateByRef(institutionId, packRef.packId, packRef.packVersion);
    if (!row || row.courseId !== course.id || (row.sourceFormat ?? 'v1') !== 'v1' || !row.sourceItemId) throw new NotFoundException({ code: 'PETROS_PACK_NOT_FOUND' });
    if (row.sourceItemId !== sourceContext.referenceId || row.sourceVersion !== sourceContext.sourceFingerprint)
      throw conflict('PETROS_PACK_SESSION_SOURCE_MISMATCH');
    const latestCandidate = await this.repo.latestCandidate(institutionId, row.packId);
    if (latestCandidate?.id !== row.id) throw conflict('PETROS_PACK_STALE_VERSION');
    const enrollment = await this.repo.enrollment(institutionId, course.id, studentId);
    if (!enrollment || enrollment.studentStatus !== 'enrolled')
      throw new ForbiddenException({ code: 'PETROS_PACK_COURSE_ACCESS_DENIED' });
    const candidate = this.requireStoredCandidate(row);
    this.requireRenderableCandidate(candidate);
    this.requireSessionPageScope(candidate, sourceContext);
    const trustedContext = await this.buildTrustedContext(course, row.sourceItemId, candidate);
    for (const release of releases) {
      const {target}=petrosAssignmentLearningStudentBindingSchema.parse(release.binding);
      if (target.kind==='journey' || target.courseId!==course.id || target.source.sessionId!==sessionId ||
        target.source.sourceVersion!==candidate.sourceVersion ||
        (target.kind==='objective' && (digest(target.objective)!==digest(candidate.objective) ||
          target.curriculumRevision!==candidate.curriculumRevision)))
        throw conflict('PETROS_ASSIGNMENT_TARGET_STALE');
      const allowed=new Set(target.source.locators.map(locator=>digest(locator)));
      const required=new Set(trustedContext.resolvedAnchors.map(anchor=>digest(anchor.locator)));
      if ([...required].some(locator=>!allowed.has(locator)) || [...allowed].some(locator=>!required.has(locator)))
        throw conflict('PETROS_ASSIGNMENT_PARTIAL_PACK_SCOPE_UNSUPPORTED');
    }
    if (digest(candidate) !== row.payloadHash) throw conflict('PETROS_PACK_CHANGED_PAYLOAD');
    const latestReview = await this.repo.latestReview(institutionId, row.id);
    const receipt = latestReview ? petrosConceptPackReviewReceiptSchema.parse(latestReview.receipt) : null;
    const revocation = latestReview ? await this.repo.reviewRevocation(institutionId, latestReview.id) : null;
    const reviewer = receipt ? await this.loadReviewerAuthority(institutionId, course.id, receipt.reviewer.educatorId,
      candidate.subject, receipt.reviewer.qualification.id, receipt.reviewer.qualification.version,
      new Date().toISOString()) : null;
    const resolution = resolvePetrosConceptPackReviewApproval(candidate, {
      institutionId,
      observedAt: reviewer?.observedAt ?? new Date().toISOString(),
      currentPack: candidate.pack,
      currentCompilerVersion: PETROS_TEACHING_PACK_COMPILER_VERSION,
      packContext: trustedContext,
      access: { source: true, curriculum: true, pack: true, review: true },
      currentReview: {
        status: !latestReview ? 'missing' : revocation ? 'revoked' : latestReview.decision,
        latestReceipt: latestReview ? { id: latestReview.id, version: latestReview.reviewVersion } : null,
        receipt,
        revokedAt: revocation?.revokedAt.toISOString() ?? null,
      },
      currentReviewer: reviewer ? { snapshot: reviewer, membership: 'active', mayReviewPack: true } : null,
    });
    return { candidate: resolution.candidate, trustedContext, reviewReceipt: resolution.receipt,
      candidateId: row.id, payloadHash: row.payloadHash };
  }

  async listApprovedPackSummaries(principal: InstitutionalStudentPrincipal, sessionId: string): Promise<{
    status: 'disabled' | 'ready'; packs: PetrosApprovedPackSummary[];
  }> {
    if (!this.enabled) return { status: 'disabled', packs: [] };
    await this.repo.lock(`petros-knowledge:${principal.institutionId}`);
    const session = await this.requireSession(principal, sessionId);
    const source = session.sourceContext as Record<string, unknown>;
    const rows = await this.repo.candidatesForSource(principal.institutionId,
      source.referenceId as string, source.sourceFingerprint as string);
    const seen = new Set<string>();
    const packs: PetrosApprovedPackSummary[] = [];
    for (const row of rows) {
      if (seen.has(row.packId)) continue;
      seen.add(row.packId);
      try {
        const approved = await this.requireApprovedPack(principal, sessionId,
          { packId: row.packId, packVersion: row.packVersion });
        const pack = approved.candidate;
        packs.push({ candidateId: approved.candidateId, pack: pack.pack, subjectKey: pack.subject,
          sourceVersion: pack.sourceVersion, curriculumRevision: pack.curriculumRevision,
          objective: { ...pack.objective, statement: pack.objectiveStatement }, scope: pack.scope,
          concepts: pack.concepts.map(({ id, label }) => ({ id, label })),
          review: { receiptId: approved.reviewReceipt.receiptId,
            version: approved.reviewReceipt.reviewVersion, reviewedAt: approved.reviewReceipt.reviewedAt } });
      } catch (error) {
        if (error instanceof ConflictException || error instanceof ForbiddenException || error instanceof NotFoundException)
          continue;
        throw error;
      }
    }
    return { status: 'ready', packs };
  }

  private requireStoredCandidate(row: CandidateRow) {
    if ((row.sourceFormat ?? 'v1') !== 'v1' || !row.sourceItemId) throw unavailable('PETROS_PACK_CANDIDATE_NOT_FOUND');
    const candidate = petrosConceptPackCandidateSchema.parse(row.payload);
    if (candidate.pack.id !== row.packId || candidate.pack.version !== row.packVersion ||
      candidate.sourceVersion !== row.sourceVersion || candidate.curriculumRevision !== row.curriculumRevision ||
      candidate.compilerVersion !== row.compilerVersion)
      throw conflict('PETROS_PACK_CHANGED_PAYLOAD');
    return candidate;
  }

  private requireRenderableCandidate(candidate: PetrosConceptPackCandidate) {
    try {
      assertPetrosAdaptivePackRenderable(candidate);
    } catch (error) {
      if (error instanceof PetrosAdaptivePackRenderabilityError)
        throw conflict('PETROS_PACK_NOT_RENDERABLE');
      throw error;
    }
  }

  private async requireSession(principal: InstitutionalStudentPrincipal, sessionId: string) {
    return this.requireOwnedSession(principal.institutionId, principal.studentId, sessionId);
  }

  private async requireOwnedSession(institutionId: string, studentId: string, sessionId: string,
    allowInactive = false) {
    const session = await this.repo.session(institutionId, studentId, sessionId);
    if (!session) throw new NotFoundException({ code: 'PETROS_SESSION_NOT_FOUND' });
    if (!allowInactive && session.status !== 'active') throw conflict('PETROS_SESSION_NOT_ACTIVE');
    if (allowInactive && !['active', 'paused', 'closed'].includes(session.status))
      throw conflict('PETROS_SESSION_NOT_READABLE');
    const context = session.sourceContext;
    if (!context || context.door !== 'uploaded_document' || typeof context.referenceId !== 'string' ||
      typeof context.sourceFingerprint !== 'string') throw conflict('PETROS_SESSION_SOURCE_REQUIRED');
    await this.knowledge.assertContext({ institutionId, studentId }, context);
    return session;
  }

  private requireSessionPageScope(candidate: PetrosConceptPackCandidate,
    sourceContext: Record<string, unknown>) {
    const citations = sourceContext.citations;
    if (!Array.isArray(citations) || citations.length === 0)
      throw conflict('PETROS_PACK_SESSION_SCOPE_REQUIRED');
    const allowedPages = new Set<number>();
    for (const citation of citations) {
      if (!citation || typeof citation !== 'object') throw conflict('PETROS_PACK_SESSION_SCOPE_REQUIRED');
      const value = citation as Record<string, unknown>;
      if (value.sourceId !== sourceContext.referenceId || typeof value.page !== 'number')
        throw conflict('PETROS_PACK_SESSION_SCOPE_REQUIRED');
      allowedPages.add(value.page);
    }
    const anchors = [
      ...(candidate.claims ?? []).flatMap((item) => item.anchors),
      ...candidate.concepts.flatMap((item) => item.anchors),
      ...candidate.prerequisites.flatMap((item) => item.anchors),
      ...candidate.examples.flatMap((item) => item.anchors),
      ...candidate.misconceptions.flatMap((item) => item.anchors),
      ...candidate.assessments.flatMap((item) => item.anchors),
    ];
    if (anchors.some((anchor) => !allowedPages.has(anchor.locator.page)))
      throw new ForbiddenException({ code: 'PETROS_PACK_OUTSIDE_SESSION_PAGE_SCOPE' });
  }

  private async buildTrustedContext(course: CourseRow, sourceItemId: string,
    candidate: PetrosConceptPackCandidate): Promise<PetrosConceptPackTrustedContext> {
    return runInAuthorizedCourseSource(this.db, course.institutionId, course.id, sourceItemId,
      () => this.buildScopedTrustedContext(course, sourceItemId, candidate));
  }

  private async buildScopedTrustedContext(course: CourseRow, sourceItemId: string,
    candidate: PetrosConceptPackCandidate): Promise<PetrosConceptPackTrustedContext> {
    const source = await this.repo.source(course.institutionId, sourceItemId);
    if (!source?.studentId || source.sourceRevokedAt) throw unavailable('PETROS_PACK_SOURCE_UNAVAILABLE');
    const materialId = source.origin.classMaterialId;
    if (typeof materialId !== 'string') throw conflict('PETROS_PACK_SOURCE_OWNER_REQUIRED');
    const material = await this.repo.material(course.institutionId, materialId);
    if (!material || material.contextType !== 'course' || material.contextId !== course.id ||
      material.subjectId !== course.subjectId) throw conflict('PETROS_PACK_SOURCE_COURSE_MISMATCH');
    const pinnedVersion = await this.repo.sourceVersion(sourceItemId, candidate.sourceVersion);
    if (!pinnedVersion || pinnedVersion.state !== 'complete' || pinnedVersion.invalidatedAt)
      throw conflict('PETROS_PACK_STALE_SOURCE');
    const sourceScope = { institutionId: course.institutionId, studentId: source.studentId };
    const current = await this.knowledge.resolve(sourceScope, sourceItemId);
    if (!current.version || current.version.fingerprint !== candidate.sourceVersion)
      throw conflict('PETROS_PACK_STALE_SOURCE');
    const modules = await this.repo.courseModules(course.id);
    const curriculum = await readCourseCurriculum(this.db, course, modules);
    if (curriculum.status !== 'ready' || curriculum.revision !== candidate.curriculumRevision)
      throw conflict('PETROS_PACK_STALE_CURRICULUM');
    const objective = curriculum.data.objectives.find((item) => item.id === candidate.objective.id &&
      item.version === candidate.objective.version);
    if (!objective || objective.descriptor !== candidate.objectiveStatement ||
      !curriculum.data.moduleObjectives.some((module) => module.objectives.some((item) =>
        item.id === candidate.objective.id && item.version === candidate.objective.version)) ||
      !curriculum.data.alignments.some((alignment) => alignment.state === 'approved' &&
        alignment.objective.id === candidate.objective.id && alignment.objective.version === candidate.objective.version))
      throw conflict('PETROS_PACK_OBJECTIVE_NOT_CURRENT');
    const allAnchors = [
      ...(candidate.claims ?? []).flatMap((item) => item.anchors),
      ...candidate.concepts.flatMap((item) => item.anchors),
      ...candidate.prerequisites.flatMap((item) => item.anchors),
      ...candidate.examples.flatMap((item) => item.anchors),
      ...candidate.misconceptions.flatMap((item) => item.anchors),
      ...candidate.assessments.flatMap((item) => item.anchors),
    ];
    const unique = new Map(allAnchors.map((anchor) => [compatibilityCanonicalJson(anchor.locator), anchor.locator]));
    const resolvedAnchors = [];
    for (const locator of unique.values()) {
      if (locator.sourceVersion !== candidate.sourceVersion) throw conflict('PETROS_PACK_STALE_SOURCE');
      resolvedAnchors.push(await this.knowledge.locator(sourceScope, sourceItemId, locator));
    }
    return { currentSourceVersion: candidate.sourceVersion, currentCurriculumRevision: curriculum.revision,
      currentObjective: candidate.objective, resolvedAnchors };
  }

  private async requireCourseAuthority(principal: InstitutionPrincipal,
    scope: { mode: 'institution' } | { mode: 'campus'; campusId: string }, courseId: string,
    lock: 'share' | 'exclusive' = 'share') {
    // Use the S9 authority lock before any course row lock or lock upgrade.
    await this.repo.lock(`petros-knowledge:${principal.institutionId}`);
    const current=await this.portalAuth.resolveById(principal.institutionUserId,null);
    if (current.institutionId!==principal.institutionId)
      throw new ForbiddenException({code:'PETROS_PACK_COURSE_SCOPE_REQUIRED'});
    principal=current;
    const course = await this.repo.course(principal.institutionId, courseId, lock);
    if (!course || course.status !== 'active') throw new NotFoundException({ code: 'PETROS_PACK_COURSE_NOT_FOUND' });
    const campusAllowed = course.campusId == null || principal.isInstitutionWide ||
      principal.allowedCampusIds.includes(course.campusId);
    if (!campusAllowed || (scope.mode === 'campus' && course.campusId !== null && course.campusId !== scope.campusId))
      throw new ForbiddenException({ code: 'PETROS_PACK_COURSE_SCOPE_REQUIRED' });
    if (!can(principal.permissions, 'courses.manage')) {
      const identity = await this.repo.reviewerIdentity(principal.institutionId, principal.institutionUserId);
      if (!identity || identity.userStatus !== 'active' || identity.staffStatus !== 'active' ||
        course.professorTeacherId !== identity.staffId)
        throw new ForbiddenException({ code: 'PETROS_PACK_COURSE_SCOPE_REQUIRED' });
    }
    return course;
  }

  private async loadReviewerAuthority(institutionId: string, courseId: string, reviewerUserId: string, subjectKey: string,
    qualificationId: string, expectedVersion: number, observedAt: string) {
    const [qualification, identity, livePrincipal] = await Promise.all([
      this.repo.latestQualification(institutionId, qualificationId),
      this.repo.reviewerIdentity(institutionId, reviewerUserId),
      this.portalAuth.resolveById(reviewerUserId, null).catch(() => null),
    ]);
    if (!qualification || qualification.version !== expectedVersion || qualification.reviewerUserId !== reviewerUserId ||
      qualification.subjectKey !== subjectKey || qualification.status !== 'active' ||
      !identity || identity.userStatus !== 'active' || identity.staffStatus !== 'active' ||
      identity.staffId !== qualification.reviewerStaffId || !livePrincipal ||
      !can(livePrincipal.permissions, 'academics.alignments.approve'))
      throw new ForbiddenException({ code: 'PETROS_REVIEWER_QUALIFICATION_REQUIRED' });
    await this.requireCourseAuthority(livePrincipal, { mode: 'institution' }, courseId, 'share');
    const at = Date.parse(observedAt);
    if (qualification.validFrom.getTime() > at || qualification.validUntil.getTime() <= at)
      throw new ForbiddenException({ code: 'PETROS_REVIEWER_QUALIFICATION_EXPIRED' });
    return petrosReviewerAuthoritySnapshotSchema.parse({
      schemaVersion: 'petros.reviewer-authority.v1', qualificationId: qualification.id,
      qualificationVersion: qualification.version, institutionId, reviewerUserId,
      reviewerStaffId: qualification.reviewerStaffId, subjectKey, status: 'active',
      validFrom: qualification.validFrom.toISOString(), validUntil: qualification.validUntil.toISOString(),
      evidenceKind: qualification.evidenceKind, evidenceHash: qualification.evidenceHash, observedAt,
    });
  }

  private requireEnabled() {
    if (!this.enabled) throw conflict('PETROS_ADAPTIVE_TEACHING_DISABLED');
  }
  private requireAuthoringEnabled() {
    this.requireEnabled();
    if (!this.authoringEnabled) throw conflict('PETROS_TEACHER_AUTHORING_DISABLED');
  }
}

const digest = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });
const unavailable = (code: string) => new NotFoundException({ code });
