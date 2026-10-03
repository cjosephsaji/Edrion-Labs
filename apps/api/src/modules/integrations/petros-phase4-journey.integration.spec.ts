import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, schema } from '@edrion/database';
import { PETROS_PROJECTILE_CAPABILITY, PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  createEngineReferenceProgram, describeEngineCapabilities, petrosProjectileBindingSchema, type EngineCommand } from '@edrion/schemas';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { PetrosWorkspaceRepository } from '../student/petros-loop/petros-workspace.repository';
import { PetrosWorkspaceService } from '../student/petros-loop/petros-workspace.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../student/auth/student-auth.service';

import { PetrosContinuityRepository } from '../student/petros-continuity/petros-continuity.repository';
import { PetrosContinuityService, continuityHash } from '../student/petros-continuity/petros-continuity.service';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { PetrosArtifactsService } from '../student/petros-artifacts/petros-artifacts.service';
import { PetrosArtifactsRepository } from '../student/petros-artifacts/petros-artifacts.repository';
import { PetrosLearningArtifactsService } from '../student/petros-artifacts/petros-learning-artifacts.service';
import { phase4InstitutionalFixture } from './petros-phase4-institutional-fixture';
import { phase4EvidenceAttempt } from './petros-phase4-evidence-fixture';
import { PetrosObjectiveEvidenceRepository } from '../petros-learner-model/petros-objective-evidence.repository';
import { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { PetrosCohortEvidenceAuthority } from '../petros-institutional/petros-cohort-evidence-authority';
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS==='1')('Phase4 complete owner continuity / disposable PostgreSQL',()=>{
 let database:Phase2TestDatabase;
 beforeAll(async()=>{database=await startPhase2TestDatabase();},90000);
 afterAll(async()=>{await database?.close();});
  async function setup(generic = false, integrated = false) {
    const f = await phase2AuthorityFixture(database);
    if (generic) {
      const config = defaultInstitutionPolicy();
      config.syllabus.allowExternalSources = true;
      config.syllabus.knowledgeMode = 'source_primary';
      await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({
        institutionId: f.institutionId, scopeLevel: 'institution', version: 1, status: 'published',
        schemaVersion: PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION, config,
        reason: 'Synthetic general engineering comparison', authorId: f.student.institutionUserId,
        effectiveFrom: new Date(0), publishedAt: new Date(),
      });
    }
    await f.qualify();
    const approved = await f.approve();
    const institutional=integrated?await phase4InstitutionalFixture(database,f):null;
    const provider = { execute: vi.fn(() => { throw new Error('Provider calls are forbidden'); }) };
    const auth = new StudentAuthService(database.db, database.auditWriter, f.env as never,
      {} as never, {} as never, {} as never);
    const policies = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
      provider as never, database.auditWriter, f.env as never);
    const surfaces = { isPortalEnabled: vi.fn(async () => true) };
    const adaptive=new PetrosAdaptiveService(database.db,f.env as never,database.auditWriter,auth,surfaces as never,f.packs,policies);
    await f.owned(()=>adaptive.bind(f.student,f.sessionId,{commandId:randomUUID(),pack:f.candidate.pack}));
    const blockId = randomUUID(), decisionId = randomUUID();
    const binding = petrosProjectileBindingSchema.parse({
      schemaVersion: 'petros.projectile-binding.v1', originalDiagramBlockId: blockId,
      pack: f.candidate.pack, objective: f.candidate.objective,
      curriculumRevision: f.candidate.curriculumRevision,
      conceptId: f.candidate.concepts[0]!.id,
      source: f.candidate.concepts[0]!.anchors[0]!.locator,
      capability: PETROS_PROJECTILE_CAPABILITY,
    });
    await f.admin.insert(schema.petrosPlanningDecisions).values({
      id: decisionId, sessionId: f.sessionId, institutionId: f.institutionId, studentId: f.student.studentId,
      sequence: 1, selectedMoveType: 'diagram', targetConcept: 'component_motion',
      studentSafeReason: 'Synthetic reviewed diagram', decisionFactors: [], moveParameters: {},
      expectedEvidence: 'none', progressEffect: {}, termination: {}, guessFirst: {}, observationResponse: {},
      source: 'deterministic_fallback', functionKey: 'synthetic', promptVersion: 'synthetic',
      schemaVersion: 'synthetic', correlationId: randomUUID(),
    });
    await f.admin.insert(schema.petrosTeachingBlocks).values({
      id: blockId, decisionId, sessionId: f.sessionId, institutionId: f.institutionId,
      studentId: f.student.studentId, sequence: 1, type: 'diagram', content: { original: 'preserved' },
      projectileBinding: binding, delivery: 'deterministic_fallback', functionKey: 'synthetic',
      promptVersion: 'synthetic', schemaVersion: 'synthetic', correlationId: randomUUID(),
    });
    const loop = new PetrosLoopRepository(database.db, f.knowledge);
    const env = { ...f.env, PETROS_WORKSPACE_ENABLED: true };
    const repo = new PetrosWorkspaceRepository(database.db);
    const service = new PetrosWorkspaceService(database.db, env as never, database.auditWriter,
      repo, loop, f.packs, policies, auth, surfaces as never);
    const ready = await service.read(f.student, f.sessionId, blockId);
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') throw new Error('Workspace fixture was not ready');
    const program = generic ? createEngineReferenceProgram({
      ownerScopeRef: `${f.institutionId}:${f.student.studentId}`, programId: blockId, source: null,
      allowedCapabilities: describeEngineCapabilities().capabilities.filter(capability => capability.enabled)
        .map(capability => capability.id),
    }, 'physics.pendulum.ideal') : ready.program;
    const create: EngineCommand = {
      schemaVersion: 'petros.engine-command.v1', programId: blockId, operationId: randomUUID(),
      expectedRevision: 0, expectedExperimentVersion: 0, expectedDraftVersion: 0,
      target: 'workspace', purpose: 'Open a reviewed projectile model',
      action: { type: 'create', program },
    };
    const counts = async () => ({
      workspaces: (await f.admin.select().from(schema.petrosWorkspaces).where(eq(schema.petrosWorkspaces.blockId, blockId))).length,
      checkpoints: (await f.admin.select().from(schema.petrosWorkspaceCheckpoints).where(eq(schema.petrosWorkspaceCheckpoints.workspaceId, blockId))).length,
      operations: (await f.admin.select().from(schema.petrosWorkspaceOperations).where(eq(schema.petrosWorkspaceOperations.blockId, blockId))).length,
      events: (await f.admin.select().from(schema.petrosSessionEvents).where(and(
        eq(schema.petrosSessionEvents.blockId, blockId), eq(schema.petrosSessionEvents.type, 'visual.workspace_command')))).length,
      audits: (await f.admin.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.entityId, blockId), eq(schema.auditEvents.action, 'petros.visual.workspace_command')))).length,
    });
    const predictionCounts = async () => ({
      challenges: (await f.admin.select().from(schema.petrosWorkspacePredictionChallenges)
        .where(eq(schema.petrosWorkspacePredictionChallenges.workspaceId, blockId))).length,
      responses: (await f.admin.select().from(schema.petrosWorkspacePredictionResponses)
        .where(eq(schema.petrosWorkspacePredictionResponses.workspaceId, blockId))).length,
      events: (await f.admin.select().from(schema.petrosSessionEvents).where(and(
        eq(schema.petrosSessionEvents.blockId, blockId), eq(schema.petrosSessionEvents.type, 'visual.workspace_prediction')))).length,
      audits: (await f.admin.select().from(schema.auditEvents).where(and(
        eq(schema.auditEvents.entityId, blockId), eq(schema.auditEvents.action, 'petros.visual.workspace_prediction')))).length,
    });
    return { f, service, repo, blockId, binding, create, provider, surfaces, env, counts, predictionCounts, approved, institutional,adaptive,auth,policies };
  }


 async function continuity(x:Awaited<ReturnType<typeof setup>>){
  const env={...x.env,PETROS_CONTINUITY_ENABLED:true};const auth=new StudentAuthService(database.db,database.auditWriter,env as never,{} as never,{} as never,{} as never);
  const policies=new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),x.provider as never,database.auditWriter,env as never);
  const service=new PetrosContinuityService(database.db,env as never,database.auditWriter,new PetrosContinuityRepository(database.db),auth,x.surfaces as never,x.f.knowledge,x.f.packs,policies);
  const learning=new PetrosLearningArtifactsService(database.db,env as never,database.auditWriter,auth,x.surfaces as never,x.f.packs,policies);
  const artifacts=new PetrosArtifactsService(new PetrosArtifactsRepository(database.db,x.f.knowledge),{ingest:vi.fn()} as never,learning);
  const opened=await x.service.command(x.f.student,x.f.sessionId,x.blockId,x.create);if(opened.status!=='available')throw new Error('Not opened');
  const initial=await service.ensure(x.f.student,x.f.sessionId);
  const journey=await service.saveJourney(x.f.student,{commandId:randomUUID(),journeyId:initial.id,expectedVersion:1,returnPoint:{...initial.returnPoint,blockId:x.blockId,unresolvedRequest:'Why does horizontal motion remain?',detourReason:'Saved notebook work',workspace:{blockId:x.blockId,checkpointId:opened.receipt.checkpointId,programRevision:opened.snapshot.program.revision,experimentVersion:opened.snapshot.execution.version,draftVersion:opened.snapshot.draft.version,branchId:opened.snapshot.execution.branchId}}});
  const payload={sessionId:x.f.sessionId,blockId:x.blockId,text:'My private offline comparison'};
  const item={schemaVersion:'petros.queued-note.v1' as const,owner:{institutionId:x.f.institutionId,studentId:x.f.student.studentId},deviceId:randomUUID(),commandId:randomUUID(),sequence:1,journeyId:journey.id,baseVersion:journey.version,sourceVersion:journey.source.sourceVersion as string,policyVersion:journey.policyVersion,programRevision:opened.snapshot.program.revision,expectedExperimentVersion:opened.snapshot.execution.version,expectedDraftVersion:opened.snapshot.draft.version,rubricVersion:null,payload,payloadHash:continuityHash(payload),dependencies:[],localOccurredAt:'2026-01-01T00:00:00.000Z'};
  const apply=(note:typeof item)=>x.service.command(x.f.student,note.payload.sessionId,note.payload.blockId,{schemaVersion:'petros.engine-command.v1',programId:note.payload.blockId,operationId:note.commandId,expectedRevision:note.programRevision,expectedExperimentVersion:note.expectedExperimentVersion,expectedDraftVersion:note.expectedDraftVersion,target:'workspace',purpose:'Save an explicitly chosen private note after reconnection',action:{type:'annotate',text:note.payload.text}});
  return{service,env,journey,item,apply,artifacts,opened};
 }
 it('completes one owner journey from reviewed source through workspace/notebook/memory/next-day review/cohort/intervention/correction/revocation',async()=>{
  const x=await setup(false,true),c=await continuity(x),p=x.f.student;const institution=x.institutional!;
  const rec=await c.service.recommendations(p);expect(rec.items[0]).toMatchObject({state:'not_assessed',evidenceIds:[]});
  const saved=await x.f.owned(()=>c.artifacts.saveBlockArtifact(p,x.f.sessionId,x.blockId,{idempotencyKey:randomUUID(),content:{kind:'flashcard',title:'Apex components',front:'Which velocity vanishes?',back:'Only vertical velocity.',hint:null,explanation:null,tags:[]}}));
  const id=randomUUID();await c.service.memoryCommand(p,{action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId:id,category:'episodic',sessionId:x.f.sessionId,content:'The projectile stops completely.'});
  await c.service.memoryCommand(p,{action:'correct',commandId:randomUUID(),expectedMemoryRevision:1,recordId:id,expectedRevision:1,content:'Only the vertical component stops.'});
  await c.service.memoryCommand(p,{action:'preferences',commandId:randomUUID(),expectedMemoryRevision:2,optionalMemoryEnabled:true,responseDepth:'brief',language:'en',quietMode:true});
  expect((await c.service.context(p,x.f.sessionId)).memories[0]?.content).toContain('Only the vertical');
  const [scheduledArtifact]=await x.f.admin.select().from(schema.petrosSavedArtifacts).where(eq(schema.petrosSavedArtifacts.id,saved.id));
  expect(scheduledArtifact?.dueAt).toBeTruthy();
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(scheduledArtifact!.dueAt!.getTime()+1000));
  try{const resumed=await c.service.read(p,c.journey.id);expect(resumed.returnPoint.unresolvedRequest).toBe('Why does horizontal motion remain?');expect(resumed.workspace?.narration).toEqual(c.opened.snapshot.teaching);expect(resumed.workspace?.draft).toEqual(c.opened.snapshot.draft);expect((await c.service.recommendations(p)).items[0]).toMatchObject({state:'review_due'});}finally{vi.useRealTimers();}
  expect(saved.id).toBeTruthy();await c.service.memoryCommand(p,{action:'forget',commandId:randomUUID(),expectedMemoryRevision:3,recordId:id,expectedRevision:2});expect((await c.service.context(p,x.f.sessionId)).memories).toEqual([]);
  // Reconnect through the same workspace owner before institutional source correction.
  const synced=await c.service.reconcile(p,{items:[c.item]},c.apply as never);expect(synced.results[0]?.status).toBe('applied');
  expect((await c.service.reconcile(p,{items:[c.item]},c.apply as never)).results[0]?.status).toBe('duplicate');
  const evidenceOwner=new PetrosObjectiveEvidenceService(database.db,x.env as never,database.auditWriter,new PetrosObjectiveEvidenceRepository(database.db),x.f.packs,x.policies,x.auth,x.surfaces as never);
  const policy=await x.f.owned(()=>x.policies.documentKnowledgePolicy(p,x.f.sessionId));
  const append=phase4EvidenceAttempt(x.f,x.adaptive,evidenceOwner,policy);const beforeEvidence=await c.service.context(p,x.f.sessionId);const wrong=await append('17 m');await expect(c.service.fenceContext(p,beforeEvidence,async()=>true)).rejects.toThrow(ConflictException);expect(wrong.classification.projectionEligible).toBe(true);
  const hypothesisId=randomUUID();await c.service.memoryCommand(p,{action:'remember',commandId:randomUUID(),expectedMemoryRevision:4,recordId:hypothesisId,category:'hypothesis',sessionId:x.f.sessionId,content:'Tentative component comparison may help.',confidence:0.4,supportingEvidenceIds:[wrong.event.eventId]});
  expect((await c.service.context(p,x.f.sessionId)).memories[0]).toMatchObject({category:'hypothesis',confidence:0.4,supportingEvidenceIds:[wrong.event.eventId]});
  await c.service.memoryCommand(p,{action:'forget',commandId:randomUUID(),expectedMemoryRevision:5,recordId:hypothesisId,expectedRevision:1});
  const cohort=new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),x.provider as never,database.auditWriter,c.env as never,institution.assignments,new PetrosCohortEvidenceAuthority(database.db,x.auth,x.f.knowledge,x.f.packs));
  const signals=await x.f.institution(()=>cohort.refreshSignals(x.f.ctx,institution.classId,x.f.subjectId));expect(signals[0]?.suppressed).toBe(true);
  const [aggregate]=await x.f.admin.select().from(schema.petrosClassStruggleSignals).where(eq(schema.petrosClassStruggleSignals.institutionId,x.f.institutionId));expect(aggregate).toMatchObject({eligibleCount:5,evidenceCoveredCount:1,affectedLearnerCount:1});
  const preview=await institution.preview();await institution.rotate();
  const approved=await x.f.institution(()=>institution.service.reviewIntervention(institution.reviewCtx,preview!.id,{expectedVersion:1,reason:'Second synthetic teacher approves supported practice.'},'approve'));expect(approved!.audiencePreview.assigneeReceiptCount).toBe(5);
  expect((await x.f.owned(()=>institution.students.detail(p,approved!.assignmentId!))).title).toBe('Compare velocity components');
  const cancelled=await x.f.institution(()=>institution.service.reviewIntervention(institution.reviewCtx,approved!.id,{expectedVersion:2,reason:'Cancel the reviewed synthetic practice assignment.'},'cancel'));expect(cancelled!.status).toBe('cancelled');
  await expect(x.f.owned(()=>institution.students.detail(p,approved!.assignmentId!))).rejects.toThrow();
  await expect(institution.service.parentDigestHistory({} as never,p.studentId)).rejects.toThrow();
  expect(c.service.capabilities()).toMatchObject({guardianSharing:false,partnerDelivery:false,fullOffline:false,independentSupported:false});
  const upload=await x.f.institution(()=>institution.publisher.uploadMaterialFile(x.f.ctx,'corrected.pdf','application/pdf',Buffer.from('%PDF-1.4\nSynthetic corrected source\n%%EOF')));
  const correction=await x.f.institution(()=>institution.publisher.previewMaterialCorrection(x.f.ctx,x.f.material.id,{objectId:upload.id,expectedMaterialVersion:x.f.material.version,reason:'Correct the horizontal component explanation.',meaningChanged:true,commandId:randomUUID()}));
  const published=await x.f.institution(()=>institution.publisher.reviewMaterialCorrection(institution.reviewCtx,x.f.material.id,correction!.id,{expectedVersion:1,decision:'approve',reviewReason:'Second synthetic educator reviews exact source meaning.'}));expect(published!.status).toBe('published');
  await expect(c.service.read(p,c.journey.id)).rejects.toThrow();expect((await c.service.recommendations(p)).items).toEqual([]);
  expect((await c.service.reconcile(p,{items:[c.item]},c.apply as never)).results[0]?.status).toBe('needs_review');
  const persisted=await x.f.admin.select().from(schema.petrosObjectiveEvidenceEvents).where(eq(schema.petrosObjectiveEvidenceEvents.studentId,p.studentId));expect(persisted).toHaveLength(1);expect(persisted[0]?.id).toBe(wrong.event.eventId);
  expect(x.provider.execute).not.toHaveBeenCalled();
 },30000);
 it('reconciles only canonical private notes once, lost replies duplicate and stale state remains for review',async()=>{
  const x=await setup(),c=await continuity(x),p=x.f.student;
  const before=await x.counts();expect((await c.service.reconcile(p,{items:[c.item]},c.apply as never)).results[0]?.status).toBe('applied');
  expect((await c.service.reconcile(p,{items:[c.item]},c.apply as never)).results[0]?.status).toBe('duplicate');
  const after=await x.counts();expect(after.operations).toBe(before.operations+1);
  const payload={...c.item.payload,text:'Different pending text'};const stale={...c.item,commandId:randomUUID(),sequence:2,payload,payloadHash:continuityHash(payload),dependencies:[c.item.commandId]};
  expect((await c.service.reconcile(p,{items:[stale]},c.apply as never)).results[0]?.status).toBe('needs_review');
  expect((await c.service.reconcile(p,{items:[{...c.item,payload}]},c.apply as never)).results[0]?.status).toBe('needs_review');
  expect(await x.f.admin.select().from(schema.petrosObjectiveEvidenceEvents).where(eq(schema.petrosObjectiveEvidenceEvents.studentId,p.studentId))).toEqual([]);
  await x.f.admin.update(schema.knowledgeItems).set({sourceRevokedAt:new Date()}).where(eq(schema.knowledgeItems.id,x.f.source.id));
  expect((await c.service.reconcile(p,{items:[c.item]},c.apply as never)).results[0]?.status).toBe('denied');
 });
 it('atomically rolls back normal workspace effect and queue receipt when audit fails',async()=>{
  const x=await setup(),c=await continuity(x),before=await x.counts();
  const spy=vi.spyOn(database.auditWriter,'logAudit').mockImplementationOnce(async()=>undefined).mockRejectedValueOnce(new Error('receipt audit unavailable'));
  await expect(c.service.reconcile(x.f.student,{items:[c.item]},c.apply as never)).rejects.toThrow();spy.mockRestore();expect(await x.counts()).toEqual(before);
  expect((await c.service.reconcile(x.f.student,{items:[c.item]},c.apply as never)).results[0]?.status).toBe('applied');
 });
 it('rejects delayed context after forget and exposes typed source/scene refs only to current owner',async()=>{
  const x=await setup(),c=await continuity(x),p=x.f.student,ctx=await c.service.context(p,x.f.sessionId);
  expect(await c.service.teachingReference(p,x.f.sessionId)).toMatchObject({type:'teaching_reference',blockId:x.blockId,sourceVersion:c.item.sourceVersion});
  await c.service.memoryCommand(p,{action:'reset_topic',commandId:randomUUID(),expectedMemoryRevision:0,sessionId:x.f.sessionId});
  await expect(c.service.fenceContext(p,ctx,async()=>true)).rejects.toThrow(ConflictException);
  const foreign={...p,studentId:randomUUID()};await expect(c.service.read(foreign,c.journey.id)).rejects.toThrow();
 });
});
