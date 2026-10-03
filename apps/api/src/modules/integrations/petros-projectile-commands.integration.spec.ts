import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, runInStudentTenant, schema, sql } from '@edrion/database';
import { PETROS_PROJECTILE_ASSUMPTIONS, PETROS_PROJECTILE_CAPABILITY, type PetrosProjectileCommand } from '@edrion/schemas';
import { projectileBinding, projectilePack, projectileTrustedContext } from '../../../../../packages/schemas/src/__fixtures__/petros-phase2-projectile';
import { PetrosProjectileService } from '../student/petros-loop/petros-projectile.service';
import { PetrosProjectileRepository } from '../student/petros-loop/petros-projectile.repository';
import { startPhase2TestDatabase, waitForPhase2AdvisoryWait, type Phase2TestDatabase } from './petros-phase2-test-database';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import type { InstitutionalStudentPrincipal } from '../student/student.types';

/** Real command storage/transactions/RLS; controlled pack/policy/auth adapters are NOT authority acceptance. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 projectile command persistence', () => {
  let fixture: Phase2TestDatabase;
  let admin: ReturnType<typeof drizzle<typeof schema>>;
  const principal: InstitutionalStudentPrincipal = {
    kind:'institutional',institutionId:randomUUID(),studentId:randomUUID(),institutionUserId:randomUUID(),
    campusId:null,email:'synthetic-projectile@example.test',fullName:'Synthetic fixture',permissions:['student.learn.use'],lastAuthAt:null,
  };
  beforeAll(async () => {
    fixture=await startPhase2TestDatabase();
    admin=drizzle(fixture.adminSql,{schema});
    await admin.insert(schema.institutions).values({id:principal.institutionId,publicId:randomUUID(),legalName:'Synthetic',
      displayName:'Synthetic',type:'school',country:'IN',primaryContact:{name:'Synthetic',email:principal.email}});
    await admin.insert(schema.institutionUsers).values({id:principal.institutionUserId,institutionId:principal.institutionId,
      fullName:principal.fullName,email:principal.email,status:'active'});
    await admin.insert(schema.students).values({id:principal.studentId,institutionId:principal.institutionId,
      institutionUserId:principal.institutionUserId,admissionNo:randomUUID(),firstName:'Synthetic',lastName:'Fixture'});
  });
  afterAll(async () => { await fixture?.close(); });
  afterEach(() => vi.restoreAllMocks());

  async function setup() {
    const sessionId=randomUUID(),blockId=randomUUID(),decisionId=randomUUID();
    const binding={...structuredClone(projectileBinding),originalDiagramBlockId:blockId};
    const sourceContext={door:'uploaded_document',referenceId:randomUUID(),sourceFingerprint:binding.source.sourceVersion};
    await admin.insert(schema.petrosLearningSessions).values({id:sessionId,institutionId:principal.institutionId,
      studentId:principal.studentId,clientRequestId:randomUUID(),stateVersion:'petros.session-state.v3',sessionType:'learn',
      topic:'Synthetic projectile',currentGoal:'Synthetic reviewed objective',timeBudgetSeconds:600,maxMoves:5,
      checkpoints:[],currentCheckpointId:'synthetic',promptVersion:'synthetic',outputSchemaVersion:'synthetic',sourceContext});
    await admin.insert(schema.petrosPlanningDecisions).values({id:decisionId,sessionId,institutionId:principal.institutionId,
      studentId:principal.studentId,sequence:1,selectedMoveType:'diagram',targetConcept:'component_motion',
      studentSafeReason:'Synthetic reviewed diagram',decisionFactors:[],moveParameters:{},expectedEvidence:'none',
      progressEffect:{},termination:{},guessFirst:{},observationResponse:{},source:'deterministic_fallback',
      functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
    await admin.insert(schema.petrosTeachingBlocks).values({id:blockId,decisionId,sessionId,institutionId:principal.institutionId,
      studentId:principal.studentId,sequence:1,type:'diagram',content:{original:'preserved'},projectileBinding:binding,
      delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
    const policy={schemaVersion:'petros.knowledge-policy.v1',mode:'source_bound',requestedMode:null,policyVersionIds:[],
      authorityHash:'1'.repeat(64),sourceId:sourceContext.referenceId,sourceFingerprint:binding.source.sourceVersion,
      pages:[2],subjectId:null,maximumDepth:2,assignmentRestrictions:[],retrieval:{designatedSource:true,external:false},
      authority:'designated_material_with_institution_restrictions',explanation:'Synthetic authority adapter'};
    const repo=new PetrosProjectileRepository(fixture.db);
    const auth={resolveInstitutionalWorker:vi.fn(async()=>principal)};
    const packs={requireApprovedPack:vi.fn(async()=>({candidate:projectilePack,trustedContext:projectileTrustedContext,
      reviewReceipt:{},candidateId:randomUUID(),payloadHash:'2'.repeat(64)}))};
    const policies={documentKnowledgePolicy:vi.fn(async()=>policy),assertDocumentKnowledgePolicy:vi.fn(async()=>policy)};
    const loop={findSession:vi.fn(async()=> (await fixture.db.select().from(schema.petrosLearningSessions)
      .where(and(eq(schema.petrosLearningSessions.id,sessionId),eq(schema.petrosLearningSessions.studentId,principal.studentId))))[0]),
      recordEvent:vi.fn(async(values:typeof schema.petrosSessionEvents.$inferInsert)=> fixture.db.insert(schema.petrosSessionEvents).values(values))};
    const env={PETROS_PROJECTILE_ENABLED:true,PETROS_ADAPTIVE_TEACHING_ENABLED:true};
    const service=new PetrosProjectileService(fixture.db,env as never,fixture.auditWriter,repo,loop as never,
      packs as never,policies as never,auth as never,{isPortalEnabled:async()=>true} as never);
    const initial:PetrosProjectileCommand={schemaVersion:'petros.projectile-command.v1',operationId:randomUUID(),expectedVersion:0,
      binding,action:{kind:'initialise',input:{schemaVersion:'petros.projectile-input.v1',capability:PETROS_PROJECTILE_CAPABILITY,
        assumptions:PETROS_PROJECTILE_ASSUMPTIONS,launchVelocity:{x:10,y:10,unit:'m/s'},gravity:{value:10,unit:'m/s^2'},elapsedTime:{value:0,unit:'s'}}}};
    const counts=async()=>({
      receipts:(await admin.select().from(schema.petrosVisualOperations).where(eq(schema.petrosVisualOperations.blockId,blockId))).length,
      events:(await admin.select().from(schema.petrosSessionEvents).where(eq(schema.petrosSessionEvents.blockId,blockId))).length,
      audits:(await admin.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId,blockId))).length,
      block:(await admin.select().from(schema.petrosTeachingBlocks).where(eq(schema.petrosTeachingBlocks.id,blockId)))[0],
    });
    return {service,repo,sessionId,blockId,binding,initial,auth,packs,policies,env,counts};
  }

  it('commits checkpoint/event/audit/receipt together and replays lost replies without writes',async()=>{
    const f=await setup();
    expect(await f.service.read(principal,f.sessionId,f.blockId)).toMatchObject({status:'ready',binding:f.binding});
    const first=await f.service.command(principal,f.sessionId,f.blockId,f.initial);
    expect(first).toMatchObject({status:'available',replayed:false,snapshot:{version:1}});
    expect(await f.service.command(principal,f.sessionId,f.blockId,f.initial)).toEqual({...first,replayed:true});
    expect(await f.counts()).toMatchObject({receipts:1,events:1,audits:1,block:{content:{original:'preserved'}}});
    await expect(f.service.command(principal,f.sessionId,f.blockId,{...f.initial,expectedVersion:1})).rejects.toThrow();
    const next:PetrosProjectileCommand={...f.initial,operationId:randomUUID(),expectedVersion:1,
      action:{kind:'parameter',change:{parameter:'gravity',value:5,unit:'m/s^2'}}};
    const concurrent=await Promise.all([f.service.command(principal,f.sessionId,f.blockId,next),f.service.command(principal,f.sessionId,f.blockId,next)]);
    expect(concurrent.map(r=>r.status)).toEqual(['available','available']);
    expect(await f.counts()).toMatchObject({receipts:2,events:2,audits:2});
  });

  it('waits for policy before locking the session while the loop acquires its planning lease',async()=>{
    const f=await setup();let ready!:()=>void,release!:()=>void;
    const locked=new Promise<void>(resolve=>{ready=resolve;});
    const continuePlanning=new Promise<void>(resolve=>{release=resolve;});
    const planning=runInStudentTenant(fixture.db,principal,async()=>{
      await fixture.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${principal.institutionId}`},0))`);
      ready();await continuePlanning;
      // Planning leases do not access document content in this lock-order regression.
      const loop=new PetrosLoopRepository(fixture.db,{} as never);
      expect(await loop.acquirePlanning(principal,f.sessionId)).toBeTruthy();
      await loop.releasePlanning(principal,f.sessionId);
    });
    await locked;
    const reading=f.service.read(principal,f.sessionId,f.blockId);
    try {await waitForPhase2AdvisoryWait(fixture);} finally {release();}
    await planning;expect(await reading).toMatchObject({status:'ready'});
  });

  it('rolls back all four writes when audit fails, and permits exact retry',async()=>{
    const f=await setup();
    const failed=vi.spyOn(fixture.auditWriter,'logAudit').mockRejectedValueOnce(new Error('synthetic audit failure'));
    await expect(f.service.command(principal,f.sessionId,f.blockId,f.initial)).rejects.toThrow('synthetic audit failure');
    expect(await f.counts()).toMatchObject({receipts:0,events:0,audits:0,block:{projectileSnapshot:null}});
    failed.mockRestore();
    expect(await f.service.command(principal,f.sessionId,f.blockId,f.initial)).toMatchObject({status:'available',replayed:false});
  });

  it('records cancellation tombstone and never executes a cancelled or aborted command',async()=>{
    const f=await setup();
    expect(await f.service.cancel(principal,f.sessionId,f.blockId,f.initial)).toEqual({status:'cancelled',operationId:f.initial.operationId});
    expect(await f.service.command(principal,f.sessionId,f.blockId,f.initial)).toEqual({status:'cancelled',operationId:f.initial.operationId});
    expect(await f.counts()).toMatchObject({receipts:1,events:1,audits:1,block:{projectileSnapshot:null}});
    const signal=AbortSignal.abort();
    await expect(f.service.command(principal,f.sessionId,f.blockId,{...f.initial,operationId:randomUUID()},signal)).rejects.toThrow();
    expect((await f.counts()).receipts).toBe(1);
  });

  it('rechecks changed authority on retry and rejects foreign student plus invalid solver/units without writes',async()=>{
    const f=await setup();
    await f.service.command(principal,f.sessionId,f.blockId,f.initial);
    f.packs.requireApprovedPack.mockRejectedValueOnce(new Error('synthetic revoked source'));
    await expect(f.service.command(principal,f.sessionId,f.blockId,f.initial)).rejects.toThrow('synthetic revoked source');
    f.auth.resolveInstitutionalWorker.mockResolvedValueOnce({...principal,permissions:[]});
    await expect(f.service.command(principal,f.sessionId,f.blockId,f.initial)).rejects.toThrow();
    const other={...principal,studentId:randomUUID()};
    await expect(f.service.command(other,f.sessionId,f.blockId,f.initial)).rejects.toThrow();
    expect(await runInStudentTenant(fixture.db,other,()=>fixture.db.select().from(schema.petrosVisualOperations))).toEqual([]);
    const bad=structuredClone(f.initial) as any;
    bad.binding.capability.solver='generated-code';
    await expect(f.service.command(principal,f.sessionId,f.blockId,bad)).rejects.toThrow();
    bad.binding.capability.solver='analytic.uniform-gravity.v1';bad.action.input.gravity.unit='ft/s^2';
    await expect(f.service.command(principal,f.sessionId,f.blockId,bad)).rejects.toThrow();
    expect(await f.counts()).toMatchObject({receipts:1,events:1,audits:1});
  });

  it('keeps receipts and source bindings immutable for application and administrative writes',async()=>{
    const f=await setup();await f.service.command(principal,f.sessionId,f.blockId,f.initial);
    await expect(runInStudentTenant(fixture.db,principal,()=>fixture.db.delete(schema.petrosVisualOperations)
      .where(eq(schema.petrosVisualOperations.blockId,f.blockId)))).rejects.toThrow();
    await expect(admin.update(schema.petrosTeachingBlocks).set({projectileBinding:{...f.binding,conceptId:'changed'}})
      .where(eq(schema.petrosTeachingBlocks.id,f.blockId))).rejects.toThrow('Projectile source bindings are immutable');
  });
});
