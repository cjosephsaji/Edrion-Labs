import { Inject, Injectable, Optional, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, schema, sql, runInScopedTenant, hasActiveTenantTransaction, type Database } from '@edrion/database';
import { can } from '@edrion/permissions';
import type { ApiEnv } from '@edrion/config';
import { m3PrepareCommandSchema, m3EditCommandSchema, m3ReleaseCommandSchema, m3ProposalSchema,
  M3_MODEL_VERSION, type M3Proposal, type M3ModelProposal, type ContentUnit } from '@edrion/schemas';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import type { InterpretationAuthorization } from '../../student/knowledge/petros-content-interpretation';
import { generateM3WithGateway } from './petros-learning-proposal.gateway';
import { randomUUID } from 'node:crypto';
import { API_ENV, DATABASE } from '../../../common/tokens';
import type { PortalActionContext } from '../portal-action-context';
import { PortalTeachingService } from './portal-teaching.service';
import { PetrosContentUnitRepository } from '../../student/knowledge/petros-content-unit.repository';
import { PetrosTeachingPackService } from '../../student/knowledge/petros-teaching-pack.service';
import { latestCourseCurriculum, resolveProposalCourse } from '../courses/course-curriculum.repository';
import { PetrosLearningProposalRepository } from './petros-learning-proposal.repository';
import { assembleProposal, engineeringOutline, proposalEvidence, proposalHash, validateM3Model } from './petros-learning-proposal.validation';

@Injectable()
export class PetrosLearningProposalService {
  constructor(@Inject(DATABASE) private readonly db:Database, @Inject(API_ENV) private readonly env:ApiEnv,
    private readonly teaching:PortalTeachingService, private readonly units:PetrosContentUnitRepository,
    private readonly proposals:PetrosLearningProposalRepository, private readonly packs:PetrosTeachingPackService, @Optional() private readonly gateway?:PetrosAiGatewayService) {}
  private admit() {
    if(this.env.NODE_ENV!=='test'||!this.env.PETROS_M2_ISOLATED_ENABLED) throw new ServiceUnavailableException({code:'M3_ISOLATED_IMPLEMENTATION_ONLY',message:'Proposal engineering is available only in the isolated environment.'});
  }
  private async authority(ctx:PortalActionContext,classId:string,subjectId:string,reviewer=false) {
    this.admit();
    await this.packs.requireActionPermissions(ctx.principal,['class_content.manage','syllabus.manage']);
    if(reviewer&&can(ctx.principal.permissions,'courses.manage')&&can(ctx.principal.permissions,'academics.alignments.approve')) {
      const [assigned]=await this.db.select().from(schema.classSubjectTeachers).where(and(eq(schema.classSubjectTeachers.institutionId,ctx.principal.institutionId),eq(schema.classSubjectTeachers.classId,classId),eq(schema.classSubjectTeachers.subjectId,subjectId))).limit(1);
      const [staff]=await this.db.select().from(schema.staff).where(and(eq(schema.staff.institutionId,ctx.principal.institutionId),eq(schema.staff.institutionUserId,ctx.principal.institutionUserId),eq(schema.staff.status,'active'))).limit(1);
      if(!assigned||!staff) throw new NotFoundException('M3_TEACHING_CONTEXT_UNAVAILABLE');
      const courses=await this.db.select({id:schema.courses.id}).from(schema.courses).where(and(eq(schema.courses.institutionId,ctx.principal.institutionId),eq(schema.courses.subjectId,subjectId),eq(schema.courses.status,'active')));
      return {teacherId:assigned.teacherId,contextIds:[classId,...courses.map(c=>c.id)]};
    }
    const assignment=await this.teaching.assignment(ctx,classId,subjectId);
    const [staff]=await this.db.select({id:schema.staff.id}).from(schema.staff).where(and(eq(schema.staff.institutionId,ctx.principal.institutionId),
      eq(schema.staff.institutionUserId,ctx.principal.institutionUserId),eq(schema.staff.status,'active'))).limit(1);
    if(!staff||assignment.teacherId!==staff.id) throw new NotFoundException('M3_TEACHING_CONTEXT_UNAVAILABLE');
    return assignment;
  }
  /** M1 staff RLS requires the exact selected material/course GUC, derived from authorized owners. */
  private async withSourceContext<T>(ctx:PortalActionContext,classId:string,subjectId:string,
    identity:{revisionId?:string;proposalId?:string},work:()=>Promise<T>,reviewer=false):Promise<T> {
    const assignment=await this.authority(ctx,classId,subjectId,reviewer),cm=schema.classMaterials;
    const materials=await this.db.select({id:cm.id,contextId:cm.contextId,contextKind:cm.contextType}).from(cm)
      .where(and(eq(cm.institutionId,ctx.principal.institutionId),eq(cm.subjectId,subjectId))).limit(100);
    for(const material of materials.filter(m=>assignment.contextIds.includes(m.contextId))) {
      const result=await runInScopedTenant(this.db,{institutionId:ctx.principal.institutionId,institutionUserId:ctx.principal.institutionUserId,
        sourceItemId:material.id,courseId:material.contextId},async()=>{
        if(identity.revisionId) {
          const [r]=await this.db.select({id:schema.petrosDocumentSourceRevisions.id}).from(schema.petrosDocumentSourceRevisions)
            .where(eq(schema.petrosDocumentSourceRevisions.id,identity.revisionId)).limit(1);
          if(!r)return {found:false as const};
        } else {
          const [r]=await this.db.select({id:schema.petrosDocumentPreparations.id}).from(schema.petrosDocumentPreparations)
            .where(and(eq(schema.petrosDocumentPreparations.requestedConceptId,identity.proposalId!),eq(schema.petrosDocumentPreparations.generatorVersion,M3_MODEL_VERSION))).limit(1);
          if(!r)return {found:false as const};
        }
        return {found:true as const,value:await work()};
      });
      if(result.found)return result.value;
    }
    // Guidance source RLS uses exact current assignment/recipient bindings without material GUCs.
    const [guidance]=identity.revisionId?await this.db.select({id:schema.petrosDocumentSourceRevisions.id}).from(schema.petrosDocumentSourceRevisions)
      .where(eq(schema.petrosDocumentSourceRevisions.id,identity.revisionId)).limit(1):await this.db.select({id:schema.petrosDocumentPreparations.id}).from(schema.petrosDocumentPreparations)
      .where(and(eq(schema.petrosDocumentPreparations.requestedConceptId,identity.proposalId!),eq(schema.petrosDocumentPreparations.generatorVersion,M3_MODEL_VERSION))).limit(1);
    if(guidance)return work();
    throw new NotFoundException('M3_SOURCE_UNAVAILABLE');
  }
  private async source(ctx:PortalActionContext,classId:string,subjectId:string,revisionId:string,lock=false,reviewer=false) {
    const assignment=await this.authority(ctx,classId,subjectId,reviewer);
    const lookup=await this.units.lookup(revisionId,{limit:16,visibleOnly:true});
    if(lookup.status!=='available') throw new NotFoundException('M3_SOURCE_UNAVAILABLE');
    const r=lookup.revision,b=r.source.binding;
    if(r.source.institutionId!==ctx.principal.institutionId || b.subjectId!==subjectId ||
      (b.kind==='guidance_attachment'?b.classId!==classId:
        b.contextKind==='class'?b.contextId!==classId:!assignment.contextIds.includes(b.contextId)))
      throw new NotFoundException('M3_SOURCE_UNAVAILABLE');
    if(!['pdf','pptx','docx','txt','markdown'].includes(r.source.kind)) throw new UnprocessableEntityException('M3_SOURCE_FORMAT_UNSUPPORTED');
    await this.units.resolveOriginal(b,r.source.originalHash,true,lock);
    const eligible=proposalEvidence(lookup.units);
    if(!eligible.length || r.coverage.status==='not_extracted') throw new UnprocessableEntityException('M3_SOURCE_COVERAGE_REQUIRED');
    // Reserve an actual unit before any model/teaching assembly. It is absent from teaching context and evidence endpoints.
    const heldOut=eligible.length>3?eligible[eligible.length-1]!:null;
    const selected=eligible.filter(u=>u.id!==heldOut?.id).slice(0,8);
    return {revision:r,units:selected,heldOut,lookup,assignment};
  }
  async sources(ctx:PortalActionContext,classId:string,subjectId:string) {
    const assignment=await this.authority(ctx,classId,subjectId),t=schema.petrosDocumentSourceRevisions;
    const cm=schema.classMaterials;
    const materials=await this.db.select().from(cm).where(and(eq(cm.institutionId,ctx.principal.institutionId),eq(cm.subjectId,subjectId))).limit(100);
    const rows:Array<{id:string;title:string;revision:typeof t.$inferSelect.v2Revision}>=[];
    for(const m of materials.filter(m=>assignment.contextIds.includes(m.contextId))) {
      rows.push(...await runInScopedTenant(this.db,{institutionId:ctx.principal.institutionId,institutionUserId:ctx.principal.institutionUserId,sourceItemId:m.id,courseId:m.contextId},()=>this.db.select({id:t.id,title:t.title,revision:t.v2Revision}).from(t)
        .where(and(eq(t.institutionId,ctx.principal.institutionId),eq(t.formatVersion,'v2'),eq(t.classMaterialId,m.id))).orderBy(desc(t.createdAt)).limit(10)));
    }
    rows.push(...await this.db.select({id:t.id,title:t.title,revision:t.v2Revision}).from(t).where(and(eq(t.institutionId,ctx.principal.institutionId),eq(t.formatVersion,'v2'),sql`${t.v2Revision}->'source'->'binding'->>'kind'='guidance_attachment'`)).limit(50));
    const items=[];
    for(const row of rows) {
      const r=row.revision;if(!r) continue;const b=r.source.binding;
      if(b.subjectId!==subjectId||(b.kind==='guidance_attachment'?b.classId!==classId:!assignment.contextIds.includes(b.contextId))) continue;
      try { await this.withSourceContext(ctx,classId,subjectId,{revisionId:r.id},()=>this.units.resolveOriginal(b,r.source.originalHash,true)); } catch {continue;}
      const t2=schema.petrosDocumentPreparations;
      const [draft]=await this.withSourceContext(ctx,classId,subjectId,{revisionId:r.id},()=>this.db.select({id:t2.requestedConceptId}).from(t2).where(and(eq(t2.sourceRevisionId,r.id),eq(t2.generatorVersion,M3_MODEL_VERSION),
        sql`${t2.documentMap}->>'classId'=${classId}`,sql`${t2.documentMap}->>'subjectId'=${subjectId}`)).orderBy(desc(t2.createdAt)).limit(1));
      items.push({revisionId:r.id,title:r.source.title,format:r.source.kind,originalHash:r.source.originalHash,coverage:r.coverage,
        extraction:'source_extracted',semantics:r.interpretationReceipt?.verification==='authorized_live_response'?'model_interpretation_proposed':'semantics_unverified',proposalId:draft?.id??null});
    }
    return {items};
  }
  async prepare(ctx:PortalActionContext,classId:string,subjectId:string,raw:unknown) {
    const input=m3PrepareCommandSchema.parse(raw);
    await this.authority(ctx,classId,subjectId);
    if(input.origin==='gateway') throw new ServiceUnavailableException({code:'M3_PROVIDER_AUTHORIZATION_UNAVAILABLE',message:'The gateway proposal route is registered. No source-sharing, spending or provider authorization is established.'});
    return this.construct(ctx,classId,subjectId,input,undefined,'engineering_source_outline');
  }
  /** Internal authorized worker entry. The portal request remains denied until an approved owner supplies authorization. */
  async prepareAuthorized(ctx:PortalActionContext,classId:string,subjectId:string,raw:unknown,
    authorization:InterpretationAuthorization|undefined,signal:AbortSignal) {
    this.admit();
    if(hasActiveTenantTransaction()) throw new ServiceUnavailableException('M3_PROVIDER_TRANSACTION_FORBIDDEN');
    if(!this.gateway||!authorization||authorization.approved!==true) throw new ServiceUnavailableException('M3_PROVIDER_AUTHORIZATION_UNAVAILABLE');
    const input=m3PrepareCommandSchema.parse(raw),reservation=authorization.sourceReservation;
    if(!reservation||reservation.staffActorId!==ctx.principal.institutionUserId||reservation.institutionId!==ctx.principal.institutionId)
      throw new NotFoundException('M3_SOURCE_UNAVAILABLE');
    const actor={institutionId:ctx.principal.institutionId,institutionUserId:ctx.principal.institutionUserId};
    const source=await runInScopedTenant(this.db,actor,()=>this.withSourceContext(ctx,classId,subjectId,{revisionId:input.sourceRevisionId},()=>this.source(ctx,classId,subjectId,input.sourceRevisionId)));
    const binding=source.revision.source.binding;
    const scope={...actor,...(binding.kind==='material'?{sourceItemId:binding.materialId,courseId:binding.contextId}:{})};
    const retry=await runInScopedTenant(this.db,scope,()=>this.proposals.command(ctx.principal.institutionId,input.commandId));
    if(retry) {
      const origin=authorization.mode==='controlled'?'controlled_fixture':'genuine_model';
      if(retry.correction.requestHash!==proposalHash({classId,subjectId,input,origin})) throw new ConflictException('M3_COMMAND_CONFLICT');
      return runInScopedTenant(this.db,scope,()=>this.viewScoped(ctx,classId,subjectId,retry.id));
    }
    const authorizeAttempt=async()=>{await runInScopedTenant(this.db,scope,()=>this.source(ctx,classId,subjectId,input.sourceRevisionId));await authorization.authorizeAttempt();};
    const generated=await generateM3WithGateway(this.gateway,source.revision,source.units,input.preferences,
      {...authorization,databaseScope:work=>runInScopedTenant(this.db,scope,work),authorizeAttempt},signal);
    return runInScopedTenant(this.db,scope,()=>this.construct(ctx,classId,subjectId,input,()=>generated.proposal,generated.generator.origin,generated.generator));
  }
  /** Controlled tests call the same durable flow with server-generated fixture provenance. Never a client route. */
  async prepareControlled(ctx:PortalActionContext,classId:string,subjectId:string,raw:unknown,build:(units:ContentUnit[])=>M3ModelProposal) {
    this.admit(); return this.construct(ctx,classId,subjectId,m3PrepareCommandSchema.parse(raw),build,'controlled_fixture');
  }
  private async construct(ctx:PortalActionContext,classId:string,subjectId:string,input:ReturnType<typeof m3PrepareCommandSchema.parse>,
    build:((units:ContentUnit[])=>M3ModelProposal)|undefined,origin:M3Proposal['generator']['origin'],generator?:Partial<M3Proposal['generator']>) {
    return this.withSourceContext(ctx,classId,subjectId,{revisionId:input.sourceRevisionId},()=>this.db.transaction(async()=>{
      const began=performance.now();
      await this.proposals.lock(ctx.principal.institutionId,input.commandId);
      const source=await this.source(ctx,classId,subjectId,input.sourceRevisionId,true);
      const retrievedAt=performance.now();
      const requestHash=proposalHash({classId,subjectId,input,origin});
      const retry=await this.proposals.command(ctx.principal.institutionId,input.commandId);
      if(retry) {
        if(retry.correction.requestHash!==requestHash) throw new ConflictException('M3_COMMAND_CONFLICT');
        return this.viewScoped(ctx,classId,subjectId,retry.id);
      }
      const b=source.revision.source.binding;
      const course=await resolveProposalCourse(this.db,ctx.principal.institutionId,classId,subjectId,b.kind==='material'&&b.contextKind==='course'?b.contextId:null);
      const curriculum=course?await latestCourseCurriculum(this.db,ctx.principal.institutionId,course.id):null;
      const validationBegan=performance.now();
      const model=validateM3Model(build?build(source.units):engineeringOutline(source.units),source.revision,source.units);
      const validatedAt=performance.now();
      const concepts=[];
      for(const c of model.concepts) concepts.push(await this.units.createConcept(course?.id??null,{schemaVersion:'petros.v2.concept-version.v1',
        label:c.label,definition:c.definition,provenance:c.support.map(s=>s.reference),mappings:[]}));
      const p=assembleProposal(model,{id:randomUUID(),institutionId:ctx.principal.institutionId,classId,subjectId,courseId:course?.id??null,
        curriculumRevision:curriculum?.revision??0,actorId:ctx.principal.institutionUserId,revision:source.revision,preferences:input.preferences,
        commandId:input.commandId,requestHash,origin,concepts:concepts.map(c=>({id:c.id,version:c.version}))});
      if(generator) p.generator={...p.generator,...generator};
      const persistenceBegan=performance.now();
      const metrics={sourceRetrievalMs:retrievedAt-began,structuredValidationMs:validatedAt-validationBegan,conceptValidationAndPersistenceMs:persistenceBegan-validatedAt};
      await this.proposals.append(p,metrics);
      const persistenceMs=performance.now()-persistenceBegan;
      return {...await this.viewScoped(ctx,classId,subjectId,p.id),preparationMetrics:{...metrics,persistenceMs,totalMs:performance.now()-began}};
    }));
  }
  private async current(ctx:PortalActionContext,classId:string,subjectId:string,id:string,lock=false,reviewer=false) {
    await this.authority(ctx,classId,subjectId,reviewer);
    if(lock) await this.proposals.lock(ctx.principal.institutionId,id);
    const p=await this.proposals.current(ctx.principal.institutionId,id);
    if(p.classId!==classId||p.subjectId!==subjectId) throw new NotFoundException('M3_PROPOSAL_UNAVAILABLE');
    const source=await this.source(ctx,classId,subjectId,p.source.revisionId,lock,reviewer);
    if(p.source.originalHash!==source.revision.source.originalHash) throw new NotFoundException('M3_SOURCE_UNAVAILABLE');
    return {p,source};
  }
  async view(ctx:PortalActionContext,classId:string,subjectId:string,id:string,version?:number):Promise<Awaited<ReturnType<PetrosLearningProposalService['viewScoped']>>> {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.viewScoped(ctx,classId,subjectId,id,version,true),true);
  }
  private async viewScoped(ctx:PortalActionContext,classId:string,subjectId:string,id:string,version?:number,reviewer=false) {
    const {p,source}=await this.current(ctx,classId,subjectId,id,false,reviewer);
    const selected=version===undefined?p:(await this.proposals.revisions(ctx.principal.institutionId,id)).find(r=>r.version===version);
    if(!selected) throw new NotFoundException('M3_REVISION_UNAVAILABLE');
    const review=await this.packs.learningProposalReviewState(selected);
    const readiness=await this.readinessFor(p,source,p.version===selected.version?review:await this.packs.learningProposalReviewState(p));
    return {proposal:m3ProposalSchema.parse(selected),review,readiness,manifest:await this.packs.learningProposalManifest(selected),instrumentFamilies:await this.packs.privateVerificationStatus(selected),reviewEligibility:await this.reviewEligibility(ctx,p)};
  }
  private async reviewEligibility(ctx:PortalActionContext,p:M3Proposal) {
    if(!p.courseId)return {items:[],reason:'A canonical course mapping is required before qualified review.'};
    try {
      const result=await this.packs.reviewerQualifications(ctx,p.courseId);
      return {...result,reason:result.items.length?'':'No current qualified reviewer authority is available for this course.'};
    } catch(error) {
      if(error instanceof ForbiddenException||error instanceof NotFoundException)
        return {items:[],reason:'No current qualified reviewer authority is available for this course.'};
      throw error;
    }
  }
  async evidence(ctx:PortalActionContext,classId:string,subjectId:string,id:string,unitId:string):Promise<Awaited<ReturnType<PetrosLearningProposalService['evidenceScoped']>>> {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.evidenceScoped(ctx,classId,subjectId,id,unitId),true);
  }
  private async evidenceScoped(ctx:PortalActionContext,classId:string,subjectId:string,id:string,unitId:string) {
    const {p,source}=await this.current(ctx,classId,subjectId,id,false,true);
    const references=[...p.objectives,...p.claims,...p.activities,...p.concepts].flatMap(c=>c.support);
    if(!references.some(s=>s.reference.unitId===unitId)||source.heldOut?.id===unitId) throw new NotFoundException('M3_EVIDENCE_UNAVAILABLE');
    const unit=source.units.find(u=>u.id===unitId);
    if(!unit) throw new NotFoundException('M3_EVIDENCE_UNAVAILABLE');
    return {id:unit.id,kind:unit.payload.kind,text:unit.searchableText,locator:unit.locator,contentHash:unit.contentHash,
      payload:unit.payload,uncertainties:unit.quality.uncertainties,rendering:'structural_source_preview'};
  }
  async edit(ctx:PortalActionContext,classId:string,subjectId:string,id:string,raw:unknown):Promise<Awaited<ReturnType<PetrosLearningProposalService['editScoped']>>> {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.editScoped(ctx,classId,subjectId,id,raw));
  }
  private async editScoped(ctx:PortalActionContext,classId:string,subjectId:string,id:string,raw:unknown) {
    const input=m3EditCommandSchema.parse(raw);
    return this.db.transaction(async()=>{
      const {p,source}=await this.current(ctx,classId,subjectId,id,true),requestHash=proposalHash({id,input});
      const retry=await this.proposals.command(ctx.principal.institutionId,input.commandId);
      if(retry) {if(retry.id!==id||retry.correction.requestHash!==requestHash) throw new ConflictException('M3_COMMAND_CONFLICT');return this.viewScoped(ctx,classId,subjectId,id);}
      if(p.version!==input.expectedVersion) throw new ConflictException('M3_REVISION_CONFLICT');
      if(['withdrawn','superseded'].includes(p.state)) throw new ConflictException('M3_PROPOSAL_WITHDRAWN');
      const next=structuredClone(p),c=input.change;
      const objective=(id:string)=>{const o=next.objectives.find(o=>o.id===id);if(!o) throw new NotFoundException('M3_OBJECTIVE_UNAVAILABLE');return o;};
      if(c.kind==='objective') {const o=objective(c.objectiveId);o.wording=c.wording;o.version++;o.reviewStatus='edited';}
      if(c.kind==='accept_objective') objective(c.objectiveId).reviewStatus='accepted';
      if(c.kind==='remove_objective') {
        objective(c.objectiveId);if(next.objectives.length===1) throw new UnprocessableEntityException('M3_OBJECTIVE_REQUIRED');
        next.objectives=next.objectives.filter(o=>o.id!==c.objectiveId);next.activities=next.activities.filter(a=>a.objectiveId!==c.objectiveId);
        next.taskCandidates=next.taskCandidates.filter(t=>t.objectiveId!==c.objectiveId);
      }
      if(c.kind==='reorder') {
        if(new Set(c.objectiveIds).size!==next.objectives.length||c.objectiveIds.length!==next.objectives.length) throw new UnprocessableEntityException('M3_OBJECTIVE_ORDER');
        next.objectives=c.objectiveIds.map(objective);
      }
      if(c.kind==='claim'||c.kind==='reject_claim') {
        const claim=next.claims.find(s=>s.id===c.claimId);if(!claim) throw new NotFoundException('M3_CLAIM_UNAVAILABLE');
        if(c.kind==='claim'){claim.statement=c.statement;claim.classification='needs_human_review';}else claim.classification='rejected';
      }
      if(c.kind==='select_activity') {
        const o=objective(c.objectiveId),a=next.activities.find(a=>a.id===c.activityId&&a.objectiveId===o.id);
        if(!a||a.reviewStatus==='rejected') throw new UnprocessableEntityException('M3_ACTIVITY_UNAVAILABLE');o.selectedActivityId=a.id;a.reviewStatus='selected';
      }
      if(c.kind==='reject_activity') {
        const a=next.activities.find(a=>a.id===c.activityId);if(!a) throw new NotFoundException('M3_ACTIVITY_UNAVAILABLE');a.reviewStatus='rejected';
        next.objectives.filter(o=>o.selectedActivityId===a.id).forEach(o=>o.selectedActivityId=null);
      }
      const at=new Date().toISOString();next.version++;next.updatedAt=at;next.state=c.kind==='withdraw'?'withdrawn':c.kind==='submit_review'?'under_review':'needs_source_review';
      next.reviewRefs=[];next.releaseRef=null;next.blockers=['SEMANTIC_REVIEW_REQUIRED','QUALIFIED_INSTRUMENT_REQUIRED'];
      next.correction={previousVersion:p.version,editorId:ctx.principal.institutionUserId,commandId:input.commandId,requestHash,changedFields:[c.kind],revalidation:'review_required',at};
      // Revalidate all surviving citations. Factual teacher corrections cannot acquire automatic support.
      validateM3Model({schemaVersion:M3_MODEL_VERSION,objectives:next.objectives.map(({key,wording,observableCapability,support,conceptKeys,assumptions})=>({key,wording,observableCapability,support,conceptKeys,assumptions})),
        concepts:next.concepts.map(({key,label,definition,support})=>({key,label,definition,support})),relationships:next.relationships.map(({status,...r})=>r),
        claims:next.claims.filter(c=>c.classification!=='rejected').map(({key,statement,support})=>({key,statement,support})),
        activities:next.activities.map(({key,objectiveKey,family,purpose,expectedObservation,support,renderer,kernel,operations,editableRegions,accessibilityAlternative,expectedResult,assumptions})=>({key,objectiveKey,family,purpose,expectedObservation,support,renderer,kernel,operations,editableRegions,accessibilityAlternative,expectedResult,assumptions})),
        uncertainties:next.uncertainties},source.revision,source.units);
      await this.proposals.append(next);if(c.kind==='submit_review') await this.packs.submitLearningProposal(ctx,next,input.commandId);return this.viewScoped(ctx,classId,subjectId,id);
    });
  }
  async prepareVerification(ctx:PortalActionContext,classId:string,subjectId:string,id:string,taskId:string,raw:unknown) {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.db.transaction(async()=>{
      const {p,source}=await this.current(ctx,classId,subjectId,id,true,true);
      return this.packs.preparePrivateVerification(ctx,p,taskId,raw,source.revision,source.heldOut);
    }),true);
  }
  async verificationPreview(ctx:PortalActionContext,classId:string,subjectId:string,id:string,taskId:string) {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},async()=>{
      const {p}=await this.current(ctx,classId,subjectId,id,false,true);
      return this.packs.privateVerificationPreview(ctx,p,taskId);
    },true);
  }
  async review(ctx:PortalActionContext,classId:string,subjectId:string,id:string,raw:unknown):Promise<Awaited<ReturnType<PetrosLearningProposalService['reviewScoped']>>> {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.reviewScoped(ctx,classId,subjectId,id,raw),true);
  }
  private async reviewScoped(ctx:PortalActionContext,classId:string,subjectId:string,id:string,raw:unknown) {
    return this.db.transaction(async()=>{const {p,source}=await this.current(ctx,classId,subjectId,id,true,true);
      if(p.state!=='under_review') throw new ConflictException('M3_SUBMIT_REVIEW_REQUIRED');
      const result=await this.packs.reviewLearningProposal(ctx,p,raw);const review=await this.packs.learningProposalReviewState(p);return {receipt:result,proposal:p,review,manifest:await this.packs.learningProposalManifest(p),instrumentFamilies:await this.packs.privateVerificationStatus(p),readiness:await this.readinessFor(p,source,review),reviewEligibility:await this.reviewEligibility(ctx,p)};});
  }
  async readiness(ctx:PortalActionContext,classId:string,subjectId:string,id:string):Promise<Awaited<ReturnType<PetrosLearningProposalService['readinessScoped']>>> {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.readinessScoped(ctx,classId,subjectId,id));
  }
  private async readinessScoped(ctx:PortalActionContext,classId:string,subjectId:string,id:string) {
    const {p,source}=await this.current(ctx,classId,subjectId,id),review=await this.packs.learningProposalReviewState(p);
    return this.readinessFor(p,source,review);
  }
  private async readinessFor(p:M3Proposal,source:Awaited<ReturnType<PetrosLearningProposalService['source']>>,review:Awaited<ReturnType<PetrosTeachingPackService['learningProposalReviewState']>>) {
    const {classId,subjectId}=p;
    const b=p.source.binding,course=await resolveProposalCourse(this.db,p.institutionId,classId,subjectId,b.kind==='material'&&b.contextKind==='course'?b.contextId:null);
    const curriculum=course?await latestCourseCurriculum(this.db,p.institutionId,course.id):null;
    const blockers:string[]=[];
    if(!course||course.id!==p.courseId) blockers.push('CANONICAL_COURSE_MAPPING_REQUIRED');
    if(!curriculum) blockers.push('CURRICULUM_CONTEXT_REQUIRED');
    if((curriculum?.revision??0)!==p.curriculumRevision) blockers.push('CURRICULUM_REVISION_CHANGED');
    if(['withdrawn','superseded'].includes(p.state)) blockers.push('PROPOSAL_WITHDRAWN');
    for(const d of ['teaching_scope','concepts','activities']) if(review[d]?.status!=='approved') blockers.push(`${d.toUpperCase()}_REVIEW_REQUIRED`);
    if(p.objectives.some(o=>!o.selectedActivityId||p.activities.find(a=>a.id===o.selectedActivityId)?.capabilityStatus==='unsupported_execution')) blockers.push('SUPPORTED_ACTIVITY_REQUIRED');
    if(source.revision.coverage.unresolvedUnits>0||source.revision.coverage.omittedUnits===null||source.revision.coverage.omittedUnits>0) blockers.push('SOURCE_COVERAGE_REVIEW_REQUIRED');
    return {eligible:blockers.length===0,mode:'isolated_teaching_scope_only',blockers,verification:review.assessment_instrument?.status==='approved'?'Private candidate families have current isolated qualified review. Student publication remains blocked.':'Practice available; verification pending.',
      studentPublication:'blocked',studentPublicationBlockers:['M2_G_QUALITY_ACCEPTANCE_OPEN',...(review.assessment_instrument?.status==='approved'?[]:['QUALIFIED_INSTRUMENT_REQUIRED']),'M4_STUDENT_ADMISSION_NOT_IMPLEMENTED'],review};
  }
  async release(ctx:PortalActionContext,classId:string,subjectId:string,id:string,raw:unknown):Promise<Awaited<ReturnType<PetrosLearningProposalService['releaseScoped']>>> {
    return this.withSourceContext(ctx,classId,subjectId,{proposalId:id},()=>this.releaseScoped(ctx,classId,subjectId,id,raw));
  }
  private async releaseScoped(ctx:PortalActionContext,classId:string,subjectId:string,id:string,raw:unknown) {
    const input=m3ReleaseCommandSchema.parse(raw);
    return this.db.transaction(async()=>{
      const {p,source}=await this.current(ctx,classId,subjectId,id,true);
      if(input.expectedVersion!==p.version) throw new ConflictException('M3_REVISION_CONFLICT');
      const readiness=await this.readinessFor(p,source,await this.packs.learningProposalReviewState(p));
      if(!readiness.eligible) throw new ConflictException({code:'M3_RELEASE_BLOCKED',blockers:readiness.blockers});
      const st=schema.students, aa=schema.assignmentAssignees;
      const recipients=await this.db.select({id:st.id}).from(st).where(and(eq(st.institutionId,p.institutionId),eq(st.classId,classId),eq(st.status,'enrolled'))).for('share');
      let ids=recipients.map(r=>r.id);
      if(p.source.binding.kind==='guidance_attachment') {
        const assigned=await this.db.select({id:aa.studentId}).from(aa).where(eq(aa.assignmentId,p.source.binding.assignmentId)).for('share');
        ids=ids.filter(id=>assigned.some(r=>r.id===id));
      }
      if(!ids.length) throw new ConflictException('M3_RECIPIENTS_REQUIRED');
      const reviewRefs=Object.values(readiness.review).flatMap(r=>r.receiptId?[r.receiptId]:[]).sort();
      return this.packs.releaseLearningProposal(ctx,p,input.commandId,proposalHash(ids.sort()),reviewRefs);
    });
  }
}
