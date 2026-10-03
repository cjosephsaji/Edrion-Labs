import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, runInStudentTenant, schema, sql } from '@edrion/database';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosContinuityService } from '../student/petros-continuity/petros-continuity.service';
import { PetrosContinuityRepository } from '../student/petros-continuity/petros-continuity.repository';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS==='1')('Phase4 continuity / restricted disposable PostgreSQL',()=>{
 let database:Phase2TestDatabase;
 beforeAll(async()=>{database=await startPhase2TestDatabase();},90000);
 afterAll(async()=>{await database?.close();});
 async function setup(){
  const f=await phase2AuthorityFixture(database);await f.qualify();await f.approve();
  const env={...f.env,PETROS_CONTINUITY_ENABLED:true};
  const auth=new StudentAuthService(database.db,database.auditWriter,env as never,{} as never,{} as never,{} as never);
  const policies=new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),{execute:vi.fn(()=>{throw new Error('No providers');})} as never,database.auditWriter,env as never);
  const repo=new PetrosContinuityRepository(database.db);
  const service=new PetrosContinuityService(database.db,env as never,database.auditWriter,repo,auth,{isPortalEnabled:async()=>true} as never,f.knowledge,f.packs,policies);
  return {...f,repo,service,env};
 }
 it('preserves existing session identity and serializes journey conflicts/receipts',async()=>{
  const f=await setup();const journey=await f.service.ensure(f.student,f.sessionId);
  expect(journey.returnPoint.sessionId).toBe(f.sessionId);
  expect((await f.service.ensure(f.student,f.sessionId)).id).toBe(journey.id);
  const input={commandId:randomUUID(),journeyId:journey.id,expectedVersion:journey.version,returnPoint:{...journey.returnPoint,unresolvedRequest:'Why does horizontal motion continue?'}};
  const [a,b]=await Promise.all([f.service.saveJourney(f.student,input),f.service.saveJourney(f.student,input)]);
  expect(a.id).toBe(b.id);expect(a.version).toBe(2);expect(b.version).toBe(2);
  await expect(f.service.saveJourney(f.student,{...input,returnPoint:{...input.returnPoint,unresolvedRequest:'changed'}})).rejects.toThrow();
  await expect(f.service.saveJourney(f.student,{...input,commandId:randomUUID()})).rejects.toThrow();
  const foreign={...f.student,studentId:randomUUID()};
  expect(await runInStudentTenant(database.db,foreign,()=>f.repo.journeys(foreign))).toEqual([]);
 });
 it('corrects and forgets explicit source memory without retry or raw SQL resurrection',async()=>{
  const f=await setup();const recordId=randomUUID();
  const input={action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId,category:'episodic',sessionId:f.sessionId,content:'The bridge analogy helped.'};
  const saved=await f.service.memoryCommand(f.student,input);expect(saved.records).toHaveLength(1);
  expect(saved.optionalMemoryEnabled).toBe(false);expect((await f.service.context(f.student,f.sessionId)).memories).toEqual([]);
  const prefs=await f.service.memoryCommand(f.student,{action:'preferences',commandId:randomUUID(),expectedMemoryRevision:1,optionalMemoryEnabled:true,responseDepth:'brief',language:'en',quietMode:true});
  expect(prefs.memoryRevision).toBe(2);expect((await f.service.context(f.student,f.sessionId)).memories).toHaveLength(1);
  const corrected=await f.service.memoryCommand(f.student,{action:'correct',commandId:randomUUID(),expectedMemoryRevision:2,recordId,expectedRevision:1,content:'Actually, the velocity arrows helped.'});
  expect(corrected.records[0]?.corrected).toBe(true);
  const forget={action:'forget',commandId:randomUUID(),expectedMemoryRevision:3,recordId,expectedRevision:2};
  expect((await f.service.memoryCommand(f.student,forget)).records).toEqual([]);
  expect((await f.service.memoryCommand(f.student,forget)).replayed).toBe(true);
  expect((await f.service.memoryCommand(f.student,input)).records).toEqual([]);
  expect((await f.service.context(f.student,f.sessionId)).memories).toEqual([]);
  expect(await f.institution(()=>database.db.select().from(schema.petrosMemoryRecords))).toEqual([]);
  await expect(f.owned(()=>database.db.delete(schema.petrosMemoryRecords).where(eq(schema.petrosMemoryRecords.id,recordId)))).rejects.toThrow();
  await expect(f.owned(()=>database.db.execute(sql`truncate petros_memory_records`))).rejects.toThrow();
  await expect(f.owned(()=>database.db.update(schema.petrosContinuityReceipts).set({kind:'changed'}).where(eq(schema.petrosContinuityReceipts.commandId,input.commandId)))).rejects.toThrow();
  const [row]=await f.admin.select().from(schema.petrosMemoryRecords).where(eq(schema.petrosMemoryRecords.id,recordId));expect(row!.content).toBeNull();
  await expect(f.owned(()=>database.db.update(schema.petrosMemoryRecords).set({content:'resurrect',deletedAt:null,revision:4}).where(eq(schema.petrosMemoryRecords.id,recordId)))).rejects.toThrow();
  await expect(f.service.memoryCommand(f.student,{...input,commandId:randomUUID(),expectedMemoryRevision:4})).rejects.toThrow();
 });
 it('links a persisted companion question atomically, preserves current workspace references, and prevents delayed resurrection',async()=>{
  const f=await setup(),threadId=randomUUID(),messageId=randomUUID();
  await f.admin.insert(schema.petrosStudentThreads).values({id:threadId,institutionId:f.institutionId,studentId:f.student.studentId,schemaVersion:'petros.companion.v1'});
  await f.admin.insert(schema.petrosStudentMessages).values({id:messageId,institutionId:f.institutionId,studentId:f.student.studentId,threadId,role:'student',blocks:[{type:'text',text:'Why does horizontal motion continue?'}],idempotencyKey:randomUUID()});
  const before=await f.service.ensure(f.student,f.sessionId);
  const spy=vi.spyOn(database.auditWriter,'logAudit').mockRejectedValueOnce(new Error('link audit failure'));
  await expect(f.service.linkCompanionQuestion(f.student,f.sessionId,messageId)).rejects.toThrow('link audit failure');spy.mockRestore();
  expect((await f.service.read(f.student,before.id)).returnPoint.threadId).toBeNull();
  expect(await f.owned(()=>f.repo.receipt(f.student,messageId))).toBeUndefined();
  await f.service.linkCompanionQuestion(f.student,f.sessionId,messageId);
  const linked=await f.service.read(f.student,before.id);expect(linked.returnPoint).toMatchObject({threadId,unresolvedRequest:'Why does horizontal motion continue?',sessionId:f.sessionId});
  await f.service.linkCompanionQuestion(f.student,f.sessionId,messageId);expect((await f.service.read(f.student,before.id)).version).toBe(linked.version);
  await expect(f.service.linkCompanionQuestion({...f.student,studentId:randomUUID()},f.sessionId,messageId)).rejects.toThrow();
  const delayed=randomUUID();await f.admin.insert(schema.petrosStudentMessages).values({id:delayed,institutionId:f.institutionId,studentId:f.student.studentId,threadId,role:'student',blocks:[{type:'text',text:'An old question that must not return.'}],idempotencyKey:randomUUID()});
  await f.service.memoryCommand(f.student,{action:'reset_topic',commandId:randomUUID(),expectedMemoryRevision:0,sessionId:f.sessionId});
  expect((await f.service.read(f.student,before.id)).returnPoint.unresolvedRequest).toBe('');
  await f.service.linkCompanionQuestion(f.student,f.sessionId,messageId);
  expect((await f.service.read(f.student,before.id)).returnPoint.unresolvedRequest).toBe('');
  await expect(f.service.linkCompanionQuestion(f.student,f.sessionId,delayed)).rejects.toThrow();
 });
 it('denies sensitive/unsupported memory and hypotheses without validated references',async()=>{
  const f=await setup();const common={action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId:randomUUID(),sessionId:f.sessionId,content:'private'};
  await expect(f.service.memoryCommand(f.student,{...common,category:'sensitive'})).rejects.toThrow();
  await expect(f.service.memoryCommand(f.student,{...common,category:'hypothesis',confidence:0.5})).rejects.toThrow();
  await expect(f.service.memoryCommand(f.student,{...common,category:'hypothesis',confidence:0.5,supportingEvidenceIds:[randomUUID()]})).rejects.toThrow();
  expect((await f.service.inspectMemory(f.student)).records).toEqual([]);
 });
 it('resets populated topic memory atomically and exact retries cannot resurrect it',async()=>{
  const f=await setup();
  const remember={action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId:randomUUID(),category:'episodic',sessionId:f.sessionId,content:'A topic-specific explanation.'};
  await f.service.memoryCommand(f.student,remember);
  const reset={action:'reset_topic',commandId:randomUUID(),expectedMemoryRevision:1,sessionId:f.sessionId};
  const spy=vi.spyOn(database.auditWriter,'logAudit').mockRejectedValueOnce(new Error('reset audit failure'));
  await expect(f.service.memoryCommand(f.student,reset)).rejects.toThrow('reset audit failure');spy.mockRestore();
  expect((await f.service.inspectMemory(f.student)).records).toHaveLength(1);
  expect((await f.service.inspectMemory(f.student)).memoryRevision).toBe(1);
  const cleared=await f.service.memoryCommand(f.student,reset);expect(cleared.records).toEqual([]);expect(cleared.memoryRevision).toBe(2);
  expect((await f.service.memoryCommand(f.student,reset)).replayed).toBe(true);
  expect((await f.service.memoryCommand(f.student,remember)).records).toEqual([]);
  await expect(f.service.memoryCommand(f.student,{...reset,sessionId:randomUUID()})).rejects.toThrow();
  expect((await f.service.context(f.student,f.sessionId)).memories).toEqual([]);
 });
 it('rolls back record, revision and receipt when audit fails, then safely retries',async()=>{
  const f=await setup();const input={action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId:randomUUID(),category:'episodic',sessionId:f.sessionId,content:'Useful source context'};
  const spy=vi.spyOn(database.auditWriter,'logAudit').mockRejectedValueOnce(new Error('audit failure'));
  await expect(f.service.memoryCommand(f.student,input)).rejects.toThrow('audit failure');spy.mockRestore();
  expect(await f.owned(()=>f.repo.memory(f.student,input.recordId))).toBeUndefined();
  expect(await f.owned(()=>f.repo.receipt(f.student,input.commandId))).toBeUndefined();
  expect((await f.service.inspectMemory(f.student)).memoryRevision).toBe(0);
  expect((await f.service.memoryCommand(f.student,input)).records).toHaveLength(1);
 });
 it('rechecks source revocation on resume/context/recommendations and allows forgetting',async()=>{
  const f=await setup();const journey=await f.service.ensure(f.student,f.sessionId);const recordId=randomUUID();
  await f.service.memoryCommand(f.student,{action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId,category:'episodic',sessionId:f.sessionId,content:'Remember this'});
  await f.admin.update(schema.knowledgeItems).set({sourceRevokedAt:new Date()}).where(and(eq(schema.knowledgeItems.id,f.source.id),eq(schema.knowledgeItems.studentId,f.student.studentId)));
  await expect(f.service.read(f.student,journey.id)).rejects.toThrow();
  expect((await f.service.list(f.student)).journeys).toEqual([]);
  expect((await f.service.recommendations(f.student)).items).toEqual([]);
  expect((await f.service.memoryCommand(f.student,{action:'forget',commandId:randomUUID(),expectedMemoryRevision:1,recordId,expectedRevision:1})).records).toEqual([]);
 });
 it('excludes expiry using a controlled clock, preserves evidence notice and default-off capability',async()=>{
  const f=await setup(),recordId=randomUUID();await f.service.memoryCommand(f.student,{action:'remember',commandId:randomUUID(),expectedMemoryRevision:0,recordId,category:'episodic',sessionId:f.sessionId,content:'Expires'});
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(Date.now()+31*86400000));
  try{const expired=await f.service.inspectMemory(f.student);expect(expired.records).toEqual([]);expect(expired.memoryRevision).toBe(2);const [row]=await f.admin.select().from(schema.petrosMemoryRecords).where(eq(schema.petrosMemoryRecords.id,recordId));expect(row!.content).toBeNull();expect(row!.deletedAt).not.toBeNull();}finally{vi.useRealTimers();}
  expect((await f.service.inspectMemory(f.student)).retainedEvidenceNotice).toContain('Assessment evidence');
  f.env.PETROS_CONTINUITY_ENABLED=false;expect(f.service.capabilities().enabled).toBe(false);
  await expect(f.service.ensure(f.student,f.sessionId)).rejects.toThrow();
 });
});
