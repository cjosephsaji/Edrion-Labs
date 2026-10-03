import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, lte, runInStudentTenant, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { compatibilityCanonicalJson, petrosJourneyCommandSchema, petrosMemoryCommandSchema, petrosQueuedNoteSchema,
  assemblePetrosDynamicContext, petrosCompanionBlockSchema, petrosAdaptiveSnapshotSchema, petrosReturnPointSchema, validateEngineSnapshot, type PetrosJourneyCommand, type PetrosQueuedNote, type PetrosReturnPoint } from '@edrion/schemas';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { KnowledgeDocumentService } from '../knowledge/knowledge-document.service';
import { PetrosTeachingPackService } from '../knowledge/petros-teaching-pack.service';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import { activeObjectiveEvidence, buildObjectiveEvidenceProjection } from '../../petros-learner-model/petros-objective-evidence.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosContinuityRepository } from './petros-continuity.repository';

export const continuityHash = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });
const retainedEvidenceNotice = 'Forgetting removes optional conversational memory from future context. Assessment evidence and separately governed records remain with their existing owners. Previously delivered content cannot be recalled.';
type Principal = InstitutionalStudentPrincipal;
type Journey = NonNullable<Awaited<ReturnType<PetrosContinuityRepository['journey']>>>;

@Injectable()
export class PetrosContinuityService {
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter, private readonly repo: PetrosContinuityRepository,
    private readonly auth: StudentAuthService, private readonly surfaces: SurfacesService,
    private readonly documents: KnowledgeDocumentService, private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService) {}
  capabilities() { return { enabled: this.env.PETROS_CONTINUITY_ENABLED, independentSupported: false,
    guardianSharing: false, partnerDelivery: false, fullOffline: false, intermittentWrites: ['workspace_private_note'] }; }
  private parse<T>(parser: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
    const parsed = parser.safeParse(raw);
    if (!parsed.success) throw new BadRequestException({ code: 'PETROS_CONTINUITY_INVALID_COMMAND' });
    return parsed.data;
  }
  private transaction<T>(p: Principal, work: () => Promise<T>) {
    return runInStudentTenant(this.db, p, async () => {
      if (!this.env.PETROS_CONTINUITY_ENABLED) throw conflict('PETROS_CONTINUITY_DISABLED');
      const current = await this.auth.resolveInstitutionalWorker(p.institutionUserId);
      if (current.institutionId !== p.institutionId || current.studentId !== p.studentId ||
        !current.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(current)) throw new ForbiddenException();
      await this.db.execute(sql`set local statement_timeout='10s'`);
      await this.db.execute(sql`set local lock_timeout='2s'`);
      await this.repo.lock(p);
      return work();
    });
  }
  private async session(p: Principal, sessionId: string) {
    const t = schema.petrosLearningSessions;
    const [session] = await this.db.select().from(t).where(and(this.repo.owner(t, p), eq(t.id, sessionId))).limit(1);
    if (!session) throw new NotFoundException();
    await this.documents.assertContext(p, session.sourceContext);
    if (session.sourceContext?.door !== 'uploaded_document') throw conflict('PETROS_CONTINUITY_SOURCE_UNSUPPORTED');
    const a = schema.petrosAdaptiveBindings;
    const [bound] = await this.db.select().from(a).where(and(this.repo.owner(a, p), eq(a.sessionId, sessionId))).limit(1);
    const binding = bound?.binding as { pack: { id: string; version: number }; policy: unknown } | undefined;
    const policy = binding ? await this.policies.assertDocumentKnowledgePolicy(p, sessionId, binding.policy)
      : await this.policies.documentKnowledgePolicy(p, sessionId);
    const approved = binding ? await this.packs.requireApprovedPackForResume(p, sessionId,
      { packId: binding.pack.id, packVersion: binding.pack.version }) : null;
    return { session, policy, approved };
  }
  private async validatePoint(p: Principal, point: PetrosReturnPoint) {
    const authority = await this.session(p, point.sessionId);
    if (point.threadId) {
      const t = schema.petrosStudentThreads;
      const [thread] = await this.db.select({ id: t.id }).from(t).where(and(this.repo.owner(t,p),eq(t.id,point.threadId),eq(t.status,'active'))).limit(1);
      if (!thread) throw new NotFoundException();
    }
    if (point.blockId) {
      const t = schema.petrosTeachingBlocks;
      const [block] = await this.db.select({ id: t.id }).from(t).where(and(this.repo.owner(t,p),eq(t.sessionId,point.sessionId),eq(t.id,point.blockId))).limit(1);
      if (!block) throw new NotFoundException();
    }
    if (point.artifactId) {
      const t = schema.petrosSavedArtifacts;
      const [artifact] = await this.db.select().from(t).where(and(this.repo.owner(t,p),eq(t.id,point.artifactId),eq(t.sessionId,point.sessionId),isNull(t.deletedAt))).limit(1);
      if (!artifact || !await this.documents.canReadArtifact(p, artifact)) throw new NotFoundException();
    }
    if (point.workspace) {
      if (point.workspace.blockId !== point.blockId) throw conflict('PETROS_JOURNEY_WORKSPACE_SCOPE');
      const t = schema.petrosWorkspaceCheckpoints;
      const [checkpoint] = await this.db.select().from(t).where(and(this.repo.owner(t,p),eq(t.id,point.workspace.checkpointId),eq(t.workspaceId,point.workspace.blockId))).limit(1);
      if (!checkpoint) throw conflict('PETROS_JOURNEY_CHECKPOINT_MISSING');
      const snapshot = validateEngineSnapshot(checkpoint.snapshot).snapshot;
      if (snapshot.program.revision !== point.workspace.programRevision || snapshot.execution.version !== point.workspace.experimentVersion ||
        snapshot.draft.version !== point.workspace.draftVersion || snapshot.execution.branchId !== point.workspace.branchId)
        throw conflict('PETROS_JOURNEY_CHECKPOINT_CHANGED');
    }
    // Cursor is the count of persisted owner events; clients cannot acknowledge events that never committed.
    const t = schema.petrosSessionEvents;
    const events = await this.db.select({ id: t.id }).from(t).where(and(this.repo.owner(t,p),eq(t.sessionId,point.sessionId))).limit(10001);
    if (events.length>10000 || point.acknowledgedEventCursor>events.length) throw conflict('PETROS_JOURNEY_CURSOR_UNAVAILABLE');
    return authority;
  }
  private async view(p: Principal, row: Journey) {
    const point = petrosReturnPointSchema.parse(row.returnPoint);
    const a = await this.validatePoint(p, point);
    const w = schema.petrosWorkspaces;
    const [workspace] = point.blockId ? await this.db.select().from(w).where(and(this.repo.owner(w,p),eq(w.sessionId,point.sessionId),eq(w.blockId,point.blockId))).limit(1) : [];
    const snapshot = workspace ? validateEngineSnapshot(workspace.snapshot).snapshot : null;
    const cp = schema.petrosWorkspaceCheckpoints;
    const [checkpoint] = workspace ? await this.db.select({ id: cp.id }).from(cp).where(and(this.repo.owner(cp,p),eq(cp.workspaceId,workspace.id),eq(cp.version,workspace.version))).limit(1) : [];
    const [source] = await this.db.select({title:schema.knowledgeItems.title}).from(schema.knowledgeItems).where(and(this.repo.owner(schema.knowledgeItems,p),eq(schema.knowledgeItems.id,String(a.session.sourceContext!.referenceId)))).limit(1);
    const context = await this.context(p, point.sessionId);
    return { id: row.id, version: row.version, returnPoint: point,
      contextAccounting: {budgets:context.assembled.budgets,omissions:context.assembled.omissions},
      source: { id: a.session.sourceContext!.referenceId, title:source?.title??a.session.topic, sourceVersion: a.session.sourceContext!.sourceFingerprint },
      objective: a.approved?.candidate.objective ?? null, objectiveStatement: a.approved?.candidate.objectiveStatement ?? a.session.topic,
      policyVersion: a.policy.authorityHash, policy: a.policy, sessionStatus: a.session.status,
      workspace: snapshot && checkpoint ? { blockId: workspace!.blockId, checkpointId: checkpoint.id,
        programRevision: snapshot.program.revision, experimentVersion: snapshot.execution.version, draftVersion: snapshot.draft.version,
        branchId: snapshot.execution.branchId, narration: snapshot.teaching, selectedEntity: snapshot.presentation,
        draft: snapshot.draft, capabilityRefs: snapshot.program.capabilities } : null,
      resumeHref: `/petros/session?session=${point.sessionId}&journey=${row.id}`,
      recovery: { acknowledgedOnly: true, unacknowledgedInterval: 'not_persisted', historicalReturnPoint: point.workspace } };
  }
  async read(p: Principal, id: string) { return this.transaction(p, async () => {
    const row = await this.repo.journey(p,id); if (!row) throw new NotFoundException(); return this.view(p,row);
  }); }
  async list(p: Principal) { return this.transaction(p, async () => {
    const journeys: Awaited<ReturnType<PetrosContinuityService['view']>>[]=[]; let unavailableCount=0;
    for (const row of await this.repo.journeys(p)) {
      try { journeys.push(await this.view(p,row)); } catch (error) {
        if (error instanceof ForbiddenException || error instanceof ConflictException || error instanceof NotFoundException) unavailableCount++;
        else throw error;
      }
    }
    return { journeys, unavailableCount };
  }); }
  async ensure(p: Principal, sessionId: string) { return this.transaction(p, async () => {
    await this.session(p,sessionId);
    const prior = await this.repo.sessionJourney(p,sessionId); if (prior) return this.view(p,prior);
    const returnPoint = petrosReturnPointSchema.parse({sessionId});
    const [row] = await this.db.insert(schema.petrosJourneys).values({institutionId:p.institutionId,studentId:p.studentId,returnPoint}).returning();
    await this.db.insert(schema.petrosJourneySessions).values({institutionId:p.institutionId,studentId:p.studentId,sessionId,journeyId:row!.id});
    await this.record(p,randomUUID(),'journey.created',{journeyId:row!.id,version:1});
    return this.view(p,row!);
  }); }
  async saveJourney(p: Principal, raw: unknown) {
    const input = this.parse(petrosJourneyCommandSchema,raw);
    return this.transaction(p, async () => this.savePoint(p,input));
  }
  /** Link an already persisted student question; message/thread owners retain the transcript. */
  async linkCompanionQuestion(p: Principal, sessionId: string, messageId: string) {
    return this.transaction(p, async () => {
      await this.session(p, sessionId);
      const messages = schema.petrosStudentMessages;
      const [message] = await this.db.select().from(messages).where(and(this.repo.owner(messages,p),eq(messages.id,messageId),eq(messages.role,'student'))).limit(1);
      if (!message) throw new NotFoundException();
      const point = { sessionId, threadId:message.threadId, messageId };
      const hash = continuityHash(point), prior = await this.repo.receipt(p,messageId);
      if (prior) {
        if (prior.requestHash !== hash) throw conflict('PETROS_CONTINUITY_REPLAY_CONFLICT');
        return;
      }
      const prefs = await this.repo.preferences(p);
      // A delayed turn must not reintroduce a question from before a memory reset/forget.
      if (message.seq <= prefs.memoryCutoffSeq) throw conflict('PETROS_CONTEXT_CHANGED_DURING_TURN');
      const text = message.blocks.flatMap(raw => {
        const block = petrosCompanionBlockSchema.safeParse(raw);
        return block.success && block.data.type === 'text' ? [block.data.text] : [];
      }).join('\n').slice(0,2000);
      const ensured = await this.ensure(p,sessionId);
      const returnPoint = petrosReturnPointSchema.parse({...ensured.returnPoint,threadId:message.threadId,unresolvedRequest:text});
      await this.validatePoint(p,returnPoint);
      await this.db.update(schema.petrosJourneys).set({returnPoint,version:ensured.version+1,updatedAt:new Date()})
        .where(and(this.repo.owner(schema.petrosJourneys,p),eq(schema.petrosJourneys.id,ensured.id)));
      await this.commitReceipt(p,messageId,hash,'companion_link',{journeyId:ensured.id});
    });
  }
  private async savePoint(p:Principal,input:PetrosJourneyCommand) {
    const a = await this.validatePoint(p,input.returnPoint);
    const hash=continuityHash(input); const receipt=await this.repo.receipt(p,input.commandId);
    if (receipt) { if(receipt.requestHash!==hash) throw conflict('PETROS_CONTINUITY_REPLAY_CONFLICT');
      const row=await this.repo.journey(p,receipt.result.journeyId as string); if(!row) throw new NotFoundException();
      return {...await this.view(p,row),replayed:true}; }
    let row=input.journeyId ? await this.repo.journey(p,input.journeyId) : await this.repo.sessionJourney(p,input.returnPoint.sessionId);
    if(row) {
      if(row.version!==input.expectedVersion) throw conflict('PETROS_JOURNEY_STALE');
      const old=await this.session(p,row.returnPoint.sessionId);
      if(old.session.sourceContext?.sourceFingerprint!==a.session.sourceContext?.sourceFingerprint ||
        old.approved?.candidate.objective.id!==a.approved?.candidate.objective.id) throw conflict('PETROS_JOURNEY_TARGET_CHANGED');
      const existing=await this.repo.sessionJourney(p,input.returnPoint.sessionId);
      if(existing && existing.id!==row.id) throw conflict('PETROS_SESSION_OTHER_JOURNEY');
      [row]=await this.db.update(schema.petrosJourneys).set({version:row.version+1,returnPoint:input.returnPoint,updatedAt:new Date()})
        .where(and(this.repo.owner(schema.petrosJourneys,p),eq(schema.petrosJourneys.id,row.id))).returning();
    } else {
      if(input.journeyId || input.expectedVersion!==0) throw conflict('PETROS_JOURNEY_STALE');
      [row]=await this.db.insert(schema.petrosJourneys).values({institutionId:p.institutionId,studentId:p.studentId,returnPoint:input.returnPoint}).returning();
    }
    await this.db.insert(schema.petrosJourneySessions).values({institutionId:p.institutionId,studentId:p.studentId,sessionId:input.returnPoint.sessionId,journeyId:row!.id}).onConflictDoNothing();
    await this.commitReceipt(p,input.commandId,hash,'journey',{journeyId:row!.id,version:row!.version});
    return {...await this.view(p,row!),replayed:false};
  }
  private async record(p:Principal,commandId:string,action:string,result:Record<string,unknown>) {
    await this.audit.logAudit({actorType:ActorType.InstitutionUser,actorId:p.institutionUserId,institutionId:p.institutionId,
      module:'petros',action:`petros.continuity.${action}`,entityType:'petros_continuity',entityId:p.studentId,correlationId:commandId,newState:result});
  }
  private async commitReceipt(p:Principal,commandId:string,requestHash:string,kind:string,result:Record<string,unknown>) {
    await this.db.insert(schema.petrosContinuityReceipts).values({institutionId:p.institutionId,studentId:p.studentId,commandId,requestHash,kind,result});
    await this.record(p,commandId,kind,result);
  }
  async inspectMemory(p:Principal) { return this.transaction(p,()=>this.memoryView(p)); }
  private async expireMemories(p:Principal) {
    const t=schema.petrosMemoryRecords,now=new Date();
    const expired=await this.db.update(t).set({content:null,deletedAt:now,revision:sql`${t.revision}+1`,updatedAt:now})
      .where(and(this.repo.owner(t,p),isNull(t.deletedAt),lte(t.expiresAt,now))).returning({id:t.id});
    if(!expired.length)return;
    const prefs=await this.repo.preferences(p),pref=schema.petrosStudentCompanionPreferences;
    const m=schema.petrosStudentMessages;
    const [last]=await this.db.select({seq:m.seq}).from(m).where(this.repo.owner(m,p)).orderBy(desc(m.seq)).limit(1);
    await this.db.update(pref).set({memoryRevision:prefs.memoryRevision+1,memoryCutoffSeq:last?.seq??prefs.memoryCutoffSeq,version:prefs.version+1,updatedAt:now}).where(this.repo.owner(pref,p));
    const threads=schema.petrosStudentThreads;
    await this.db.update(threads).set({summary:null,summaryWatermark:0,updatedAt:now}).where(this.repo.owner(threads,p));
    await this.clearLinkedQuestions(p,now);
    await this.record(p,randomUUID(),'memory.expire',{count:expired.length,memoryRevision:prefs.memoryRevision+1});
  }
  private async memoryView(p:Principal) {
    await this.expireMemories(p);
    const prefs=await this.repo.preferences(p); const records=[];
    for(const row of await this.repo.memories(p)) {
      if(row.deletedAt || row.expiresAt<=new Date()) continue;
      let authority:Awaited<ReturnType<PetrosContinuityService['session']>>;
      try { authority=await this.session(p,row.sessionId); } catch(error) {
        if(error instanceof ForbiddenException || error instanceof ConflictException || error instanceof NotFoundException) continue;
        throw error;
      }
      if(row.category==='hypothesis') {
        const e=schema.petrosObjectiveEvidenceEvents;
        const events=activeObjectiveEvidence(await this.db.select().from(e).where(and(this.repo.owner(e,p),eq(e.sessionId,row.sessionId))));
        if(!row.supportingEvidenceIds.length||!row.supportingEvidenceIds.every(id=>events.some(event=>event.id===id&&event.classification.appendable&&event.classification.projectionEligible&&event.evidence.sourceVersion===row.sourceVersion&&event.evidence.policyVersion===authority.policy.authorityHash)))continue;
      }
      records.push({id:row.id,category:row.category,content:row.content,supportingEvidenceIds:row.supportingEvidenceIds,scope:{sessionId:row.sessionId,sourceVersion:row.sourceVersion},
        revision:row.revision,sourceEventId:row.sourceEventId,confidence:row.confidence,expiresAt:row.expiresAt.toISOString(),corrected:row.corrected,deletedAt:null});
    }
    return { memoryRevision:prefs.memoryRevision,memoryCutoffSeq:prefs.memoryCutoffSeq,optionalMemoryEnabled:prefs.optionalMemoryEnabled,
      preferences:{responseDepth:prefs.responseDepth,language:prefs.language,quietMode:prefs.quietMode},records,retainedEvidenceNotice,
      categories:{explicitPreference:'student_editable',sessionContinuity:'journey_references',learningEvidence:'validated_owner_references',
        episodic:'explicit_source_linked',hypothesis:'evidence_supported_expiring',sensitive:'automatic_storage_excluded'} };
  }
  async memoryCommand(p:Principal,raw:unknown) {
    const input=this.parse(petrosMemoryCommandSchema,raw);
    return this.transaction(p,async()=>{
      await this.expireMemories(p);
      const prefs=await this.repo.preferences(p), hash=continuityHash(input), prior=await this.repo.receipt(p,input.commandId);
      if(prior) {if(prior.requestHash!==hash) throw conflict('PETROS_CONTINUITY_REPLAY_CONFLICT'); return {...await this.memoryView(p),replayed:true};}
      if(prefs.memoryRevision!==input.expectedMemoryRevision) throw conflict('PETROS_MEMORY_STALE');
      const t=schema.petrosMemoryRecords; const now=new Date();
      if(input.action==='remember') {
        const a=await this.session(p,input.sessionId);
        if(await this.repo.memory(p,input.recordId)) throw conflict('PETROS_MEMORY_ID_USED');
        if(input.category==='hypothesis' && (!input.supportingEvidenceIds.length || input.confidence===null)) throw conflict('PETROS_MEMORY_EVIDENCE_REQUIRED');
        if(input.supportingEvidenceIds.length) {
          const e=schema.petrosObjectiveEvidenceEvents;
          const all=await this.db.select().from(e).where(and(this.repo.owner(e,p),eq(e.sessionId,input.sessionId)));
          const events=activeObjectiveEvidence(all).filter(row=>input.supportingEvidenceIds.includes(row.id)&&row.classification.appendable&&row.classification.projectionEligible&&row.evidence.sourceVersion===a.session.sourceContext!.sourceFingerprint&&row.evidence.policyVersion===a.policy.authorityHash);
          if(events.length!==input.supportingEvidenceIds.length) throw conflict('PETROS_MEMORY_EVIDENCE_SCOPE');
        }
        await this.db.insert(t).values({id:input.recordId,institutionId:p.institutionId,studentId:p.studentId,category:input.category,
          sessionId:input.sessionId,sourceVersion:String(a.session.sourceContext!.sourceFingerprint),sourceEventId:input.commandId,
          supportingEvidenceIds:input.supportingEvidenceIds,content:input.content,revision:1,confidence:input.confidence,
          expiresAt:new Date(now.getTime()+(input.category==='hypothesis'?7:30)*86400000),createdAt:now});
      } else if(input.action==='correct'||input.action==='forget') {
        const row=await this.repo.memory(p,input.recordId);if(!row) throw new NotFoundException();
        if(row.deletedAt || row.revision!==input.expectedRevision) throw conflict('PETROS_MEMORY_STALE');
        // Forget remains available after source access loss; correction requires current source authority.
        if(input.action==='correct') await this.session(p,row.sessionId);
        await this.db.update(t).set({content:input.action==='correct'?input.content:null,deletedAt:input.action==='forget'?now:null,
          corrected:true,revision:row.revision+1,updatedAt:now}).where(and(this.repo.owner(t,p),eq(t.id,row.id)));
      } else if(input.action==='reset_topic') {
        await this.db.update(t).set({content:null,deletedAt:now,revision:sql`${t.revision}+1`,updatedAt:now})
          .where(and(this.repo.owner(t,p),eq(t.sessionId,input.sessionId),isNull(t.deletedAt)));
      }
      const m=schema.petrosStudentMessages;
      const [last]=await this.db.select({seq:m.seq}).from(m).where(this.repo.owner(m,p)).orderBy(desc(m.seq)).limit(1);
      const pref=schema.petrosStudentCompanionPreferences;
      await this.db.update(pref).set({memoryRevision:prefs.memoryRevision+1,memoryCutoffSeq:last?.seq??prefs.memoryCutoffSeq,
        ...(input.action==='preferences'?{optionalMemoryEnabled:input.optionalMemoryEnabled,responseDepth:input.responseDepth,language:input.language,quietMode:input.quietMode}:{}),
        version:prefs.version+1,updatedAt:now}).where(this.repo.owner(pref,p));
      const threads=schema.petrosStudentThreads;
      await this.db.update(threads).set({summary:null,summaryWatermark:0,updatedAt:now}).where(this.repo.owner(threads,p));
      await this.clearLinkedQuestions(p,now);
      await this.commitReceipt(p,input.commandId,hash,'memory',{memoryRevision:prefs.memoryRevision+1,action:input.action});
      return {...await this.memoryView(p),replayed:false};
    });
  }
  private async clearLinkedQuestions(p:Principal,now:Date) {
    const journeys=schema.petrosJourneys;
    await this.db.update(journeys).set({returnPoint:sql`jsonb_set(${journeys.returnPoint},'{unresolvedRequest}','""'::jsonb)`,version:sql`${journeys.version}+1`,updatedAt:now})
      .where(and(this.repo.owner(journeys,p),sql`${journeys.returnPoint}->>'threadId' is not null`,sql`${journeys.returnPoint}->>'unresolvedRequest' <> ''`));
  }
  async context(p:Principal,sessionId?:string) { return this.transaction(p,async()=>{
    const memory=await this.memoryView(p);
    const a=sessionId?await this.session(p,sessionId):null;
    const journey=sessionId?await this.repo.sessionJourney(p,sessionId):null;
    const e=schema.petrosObjectiveEvidenceEvents;
    const rows=a?.approved?await this.db.select().from(e).where(and(this.repo.owner(e,p),eq(e.objectiveId,a.approved.candidate.objective.id))) : [];
    const events=activeObjectiveEvidence(rows).filter(row=>row.evidence.sourceVersion===a?.session.sourceContext?.sourceFingerprint && row.evidence.policyVersion===a?.policy.authorityHash);
    const projection=a?.approved?buildObjectiveEvidenceProjection(p,a.approved.candidate.objective,events):null;
    const memories=memory.optionalMemoryEnabled?memory.records.filter(row=>Boolean(sessionId)&&row.scope.sessionId===sessionId):[];
    const currentPrincipal=await this.auth.resolveInstitutionalWorker(p.institutionUserId);
    const entitlementVersion=continuityHash({institution:p.institutionId,student:p.studentId,permissions:currentPrincipal.permissions,policy:a?.policy.authorityHash});
    const evidence={projection,events:events.map(row=>({id:row.id,classification:row.classification,task:row.evidence.task,assessment:row.evidence.assessment.result}))};
    const assembled=assemblePetrosDynamicContext({cacheDimensions:{institutionId:p.institutionId,studentId:p.studentId,entitlementVersion,
      sourceVersion:typeof a?.session.sourceContext?.sourceFingerprint==='string'?a.session.sourceContext.sourceFingerprint:undefined,learnerWatermark:projection?.eventSetHash,memoryRevision:memory.memoryRevision,
      policyVersion:a?.policy.authorityHash,promptVersion:'petros.owner-context.v1',schemaVersion:'petros.dynamic-context.v1',language:memory.preferences.language,
      configVersion:continuityHash({continuity:this.env.PETROS_CONTINUITY_ENABLED})},
      values:{request:null,objective:{reference:a?.approved?.candidate.objective??null,statement:a?.approved?.candidate.objectiveStatement??a?.session.topic??null},
        unresolved:{question:journey?.returnPoint.unresolvedRequest??null,detourReason:journey?.returnPoint.detourReason??null},sources:a?.session.sourceContext?.citations??[],policy:a?.policy??null,
        evidence,workspace:journey?.returnPoint.workspace??null,memories,preferences:memory.preferences},
      budgets:{request:5000,objective:400,unresolved:700,sources:2000,policy:1000,evidence:1600,workspace:400,memories:1200,preferences:400},
      unavailable:!memory.optionalMemoryEnabled?{memories:'disabled'}:{}});
    return {...memory,memories,assembled,
      journey:journey?{id:journey.id,version:journey.version,returnPoint:journey.returnPoint}:null,
      objective:a?.approved?.candidate.objective??null,objectiveStatement:a?.approved?.candidate.objectiveStatement??null,
      policy:a?.policy??null,sources:a?.session.sourceContext?.citations??[],
      evidence,entitlementVersion,
      workspace:journey?journey.returnPoint.workspace:null};
  }); }
  async recommendations(p:Principal) {return this.transaction(p,async()=>{
    const prefs=await this.repo.preferences(p); const items=[];
    for(const row of await this.repo.journeys(p)) {
      try {
        const journey=await this.view(p,row);const ctx=await this.context(p,row.returnPoint.sessionId);
        const e=ctx.evidence.events.filter(event=>event.classification.appendable&&event.classification.projectionEligible&&event.assessment.kind==='objective'&&event.assessment.judgment.status==='evaluated');const demonstrated=e.filter(event=>event.task.unseenContext && event.classification.projectionEligible && event.assessment.kind==='objective' && event.assessment.judgment.status==='evaluated' && event.assessment.judgment.outcome==='correct');
        const t=schema.petrosSavedArtifacts;
        const artifacts=await this.db.select({id:t.id,dueAt:t.dueAt}).from(t).where(and(this.repo.owner(t,p),eq(t.sessionId,row.returnPoint.sessionId),isNull(t.deletedAt)));
        const due=artifacts.find(item=>item.dueAt && item.dueAt<=new Date());
        const authority=await this.session(p,row.returnPoint.sessionId);
        const selections=await this.db.select({snapshot:schema.petrosPlanningDecisions.adaptiveSnapshot}).from(schema.petrosPlanningDecisions).where(this.repo.owner(schema.petrosPlanningDecisions,p));
        const used=new Set(ctx.evidence.events.map(event=>`${event.task.id}:${event.task.variant}`));
        for(const selection of selections){const parsed=petrosAdaptiveSnapshotSchema.safeParse(selection.snapshot);if(parsed.success&&parsed.data.output.pack.id===authority.approved?.candidate.pack.id&&parsed.data.output.selectedTask)used.add(`${parsed.data.output.selectedTask.id}:${parsed.data.output.selectedTask.variant}`);}
        const task=authority.approved?.candidate.assessments.find(task=>task.unseenContext&&!used.has(`${task.id}:${task.variant}`));
        const reviewApplication=task?{status:'available' as const,taskId:task.id,variant:task.variant,href:journey.resumeHref,
          reason:'An unseen reviewed application remains available through the lesson. Recall of this saved card is not evidence of independent application.'}:
          {status:'unavailable' as const,taskId:null,variant:null,href:null,reason:'No unseen reviewed application is available. Review of the saved card records recall only; it does not demonstrate retention or mastery.'};
        const state=due?'review_due':demonstrated.length?'demonstrated':e.length?'not_demonstrated':'not_assessed';
        const watermark=ctx.evidence.projection?.eventSetHash??'no_accepted_evidence';
        const recommendationKey=continuityHash({watermark,state,memoryRevision:prefs.memoryRevision,policy:journey.policyVersion});
        if(row.dismissedWatermark===recommendationKey) continue;
        items.push({id:recommendationKey,journeyId:row.id,sessionId:row.returnPoint.sessionId,state,
          reason:due?'Your saved takeaway is due for a review. Recall is separate from independent application.':demonstrated.length?'An accepted independent application is recorded; you can continue from the saved point.':e.length?'Responses are recorded, but independent application is not yet demonstrated.':'This objective has not been assessed. Resume your saved question when useful.',
          evidenceIds:e.map(event=>event.id),watermark,source:journey.source,objective:journey.objective,objectiveStatement:journey.objectiveStatement,contextAccounting:journey.contextAccounting,
          reviewApplication,policyVersion:journey.policyVersion,href:due?`/petros/artifacts?artifact=${due.id}&journey=${row.id}`:journey.resumeHref,
          uncertainty:'Outside assistance remains unknown. Interaction and saved work do not establish mastery.',version:row.version});
      } catch(error) {if(!(error instanceof ForbiddenException||error instanceof ConflictException||error instanceof NotFoundException))throw error;}
    }
    return {items,memoryRevision:prefs.memoryRevision};
  });}
  async dismiss(p:Principal,id:string,raw:unknown){const input=this.parse(z.object({commandId:z.string().uuid(),expectedVersion:z.number().int().positive()}).strict(),raw);
    return this.transaction(p,async()=>{const hash=continuityHash({id,...input});const prior=await this.repo.receipt(p,input.commandId);
      const row=await this.repo.journey(p,id);if(!row)throw new NotFoundException();await this.view(p,row);
      if(prior){if(prior.requestHash!==hash)throw conflict('PETROS_CONTINUITY_REPLAY_CONFLICT');return{dismissed:true,replayed:true};}
      if(row.version!==input.expectedVersion)throw conflict('PETROS_JOURNEY_STALE');
      const rec=(await this.recommendations(p)).items.find(item=>item.journeyId===id);
      await this.db.update(schema.petrosJourneys).set({dismissedWatermark:rec?.id??null,version:row.version+1}).where(and(this.repo.owner(schema.petrosJourneys,p),eq(schema.petrosJourneys.id,id)));
      await this.commitReceipt(p,input.commandId,hash,'dismiss',{journeyId:id});return{dismissed:true,replayed:false};});}
  async fenceContext<T>(p:Principal,prior:Awaited<ReturnType<PetrosContinuityService['context']>>,work:()=>Promise<T>) {return this.transaction(p,async()=>{
    const current=await this.context(p,prior.journey?.returnPoint.sessionId);
    if(current.memoryRevision!==prior.memoryRevision||current.entitlementVersion!==prior.entitlementVersion||current.evidence.projection?.eventSetHash!==prior.evidence.projection?.eventSetHash||current.journey?.version!==prior.journey?.version)throw conflict('PETROS_CONTEXT_CHANGED_DURING_TURN');
    return work();
  });}
  async teachingReference(p:Principal,sessionId:string){return this.transaction(p,async()=>{
    const a=await this.session(p,sessionId);const j=await this.repo.sessionJourney(p,sessionId);
    if(!j?.returnPoint.blockId)return null;const t=schema.petrosTeachingBlocks;
    const [block]=await this.db.select().from(t).where(and(this.repo.owner(t,p),eq(t.sessionId,sessionId),eq(t.id,j.returnPoint.blockId))).limit(1);
    if(!block)return null;
    return {type:'teaching_reference' as const,sessionId,blockId:block.id,sourceVersion:String(a.session.sourceContext!.sourceFingerprint),sceneRevision:block.type==='diagram'?j.returnPoint.workspace?.programRevision??null:null,label:'Your current source lesson'};
  });}
  async reconcile(p:Principal,raw:unknown,apply:(input:PetrosQueuedNote)=>Promise<unknown>){
    const input=this.parse(z.object({items:z.array(petrosQueuedNoteSchema).max(50)}).strict(),raw);const results=[];
    for(const item of input.items){
      try{results.push(await this.transaction(p,async()=>{
        if(item.owner.institutionId!==p.institutionId||item.owner.studentId!==p.studentId)throw new ForbiddenException();
        if(continuityHash(item.payload)!==item.payloadHash)throw conflict('PETROS_OFFLINE_PAYLOAD_CHANGED');
        const hash=continuityHash(item),prior=await this.repo.receipt(p,item.commandId);
        const row=await this.repo.journey(p,item.journeyId);if(!row)throw new NotFoundException();const current=await this.view(p,row);
        if(prior){if(prior.requestHash!==hash)throw conflict('PETROS_CONTINUITY_REPLAY_CONFLICT');return{commandId:item.commandId,status:'duplicate',journey:current};}
        if(item.payload.sessionId!==row.returnPoint.sessionId||item.payload.blockId!==current.workspace?.blockId)throw conflict('PETROS_OFFLINE_TARGET_CHANGED');
        if(item.sourceVersion!==current.source.sourceVersion||item.policyVersion!==current.policyVersion||item.programRevision!==current.workspace.programRevision||item.rubricVersion!==null)throw conflict('PETROS_OFFLINE_AUTHORITY_CHANGED');
        const receipts=schema.petrosContinuityReceipts;
        const previous=await this.db.select().from(receipts).where(and(this.repo.owner(receipts,p),eq(receipts.kind,'note')));
        const device=previous.filter(r=>r.result.deviceId===item.deviceId);
        if(device.some(r=>Number(r.result.sequence)>=item.sequence))throw conflict('PETROS_OFFLINE_SEQUENCE_CONFLICT');
        if(new Set(item.dependencies).size!==item.dependencies.length||item.dependencies.some(id=>!previous.some(r=>r.commandId===id&&r.result.deviceId===item.deviceId&&Number(r.result.sequence)<item.sequence)))throw conflict('PETROS_OFFLINE_DEPENDENCY_PENDING');
        if(item.baseVersion!==row.version)throw conflict('PETROS_JOURNEY_STALE');
        if(item.expectedExperimentVersion!==current.workspace.experimentVersion||item.expectedDraftVersion!==current.workspace.draftVersion)throw conflict('PETROS_OFFLINE_WORKSPACE_STALE');
        await apply(item);
        await this.commitReceipt(p,item.commandId,hash,'note',{journeyId:row.id,deviceId:item.deviceId,sequence:item.sequence});
        return{commandId:item.commandId,status:'applied',journey:await this.view(p,row)};
      }));}catch(error){if(!(error instanceof ConflictException||error instanceof ForbiddenException||error instanceof NotFoundException))throw error;
        results.push({commandId:item.commandId,status:error instanceof ConflictException?'needs_review':'denied',reason:error instanceof ConflictException?(error.getResponse() as {code?:string}).code:'Current account or source authority is unavailable. Private draft retained on device.'});}
    }
    return{results};
  }
}
