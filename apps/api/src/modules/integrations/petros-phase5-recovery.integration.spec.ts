import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { eq, schema } from '@edrion/database';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PetrosTopicProfilesService } from '../petros-topic-profiles/petros-topic-profiles.service';
import { PetrosTopicProfilesRepository } from '../petros-topic-profiles/petros-topic-profiles.repository';
import { PetrosLearnerModelService } from '../petros-learner-model/petros-learner-model.service';
import { PetrosLearnerModelRepository } from '../petros-learner-model/petros-learner-model.repository';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosLoopService } from '../student/petros-loop/petros-loop.service';
import { PetrosQuestionExecutionRepository } from '../student/petros-loop/petros-question-execution.repository';
import { PetrosQuestionExecutionService } from '../student/petros-loop/petros-question-execution.service';
import { PetrosAiRoutingRepository } from '../petros-ai-routing/petros-ai-routing.repository';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS==='1')('Phase5 durable recovery across two owners / two tenants',()=>{
 let database:Phase2TestDatabase;
 beforeAll(async()=>{database=await startPhase2TestDatabase();},90_000);
 afterAll(async()=>{await database?.close();});
 it('replays concurrent admissions, cancels late replies, rolls back receipt failure and fences expired claims under current authority',async()=>{
  const fixtures=[await phase2AuthorityFixture(database),await phase2AuthorityFixture(database)];
  expect(new Set(fixtures.map(f=>f.institutionId)).size).toBe(2);
  for(const f of fixtures){
   const env={...f.env,PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED:true,PETROS_DOCUMENT_RETRIEVAL_ENABLED:true,REDIS_ENABLED:true,QUEUE_WORKERS_ENABLED:true,PETROS_DOCUMENT_QUESTION_TIMEOUT_MS:1000};
   const gateway={execute:vi.fn(async(request:{input:Array<{text:string}>})=>({content:{answer:'Gravity changes vertical velocity; horizontal velocity remains constant.',citedSpanIds:[JSON.parse(request.input[0]!.text).evidence.hits[0].spanId]}}))};
   const profiles=new PetrosTopicProfilesService(new PetrosTopicProfilesRepository(database.db),{execute:async()=>{throw new Error('Controlled no-model fixture');}} as never,database.auditWriter);
   const profile=await profiles.resolveForSession({institutionId:f.institutionId,topic:'synthetic projectile motion',profileContext:{authoritativeGrounding:['Uniform gravity changes vertical velocity.']}});
   await f.admin.update(schema.petrosLearningSessions).set({resolvedTopicProfile:profile}).where(eq(schema.petrosLearningSessions.id,f.sessionId));
   const loopRepo=new PetrosLoopRepository(database.db,f.knowledge);
   const loop=new PetrosLoopService(loopRepo,gateway as never,profiles,new PetrosLearnerModelService(new PetrosLearnerModelRepository(database.db),database.auditWriter),database.auditWriter,undefined,env as never);
   const repo=new PetrosQuestionExecutionRepository(database.db,database.auditWriter);
   const auth=new StudentAuthService(database.db,database.auditWriter,env as never,{} as never,{} as never,{} as never);
   const jobs=new PetrosQuestionExecutionService(database.db,env as never,repo,loopRepo,loop,auth,{isPortalEnabled:async()=>true} as never,{enabled:false} as never,{} as never,new PetrosAiRoutingRepository(database.db));
   const admit=async()=>{
    const [session]=await f.admin.select().from(schema.petrosLearningSessions).where(eq(schema.petrosLearningSessions.id,f.sessionId));
    const input={question:'Why does horizontal velocity remain constant?',idempotencyKey:randomUUID(),expectedSessionVersion:session!.version};
    const receipts=await Promise.all([f.owned(()=>jobs.admit(f.student,f.sessionId,input)),f.owned(()=>jobs.admit(f.student,f.sessionId,input))]);
    expect(receipts[0]).toEqual(receipts[1]);return {receipt:receipts[0]!,input};
   };
   const read=(key:string)=>f.owned(()=>jobs.read(f.student,f.sessionId,key));
   const detours=()=>f.admin.select().from(schema.petrosSessionDetours).where(eq(schema.petrosSessionDetours.sessionId,f.sessionId));
   // Provider ignores cancellation: late completion must never commit a detour.
   const cancelled=await admit();let entered!:()=>void,release!:()=>void;
   const ready=new Promise<void>(resolve=>{entered=resolve;});
   gateway.execute.mockImplementationOnce(async request=>{entered();await new Promise<void>(resolve=>{release=resolve;});return {content:{answer:'Late synthetic reply',citedSpanIds:[JSON.parse(request.input[0]!.text).evidence.hits[0].spanId]}};});
   const running=jobs.execute(f.student,cancelled.receipt.id);await Promise.race([ready,running.then(async()=>{throw new Error(`Provider did not start: ${JSON.stringify(await read(cancelled.input.idempotencyKey))}`);})]);
   const state=await read(cancelled.input.idempotencyKey);
   const response=await f.owned(()=>jobs.command(f.student,f.sessionId,cancelled.input.idempotencyKey,state!.version,'cancel'));
   expect(await f.owned(()=>jobs.command(f.student,f.sessionId,cancelled.input.idempotencyKey,state!.version,'cancel'))).toEqual(response);
   await running;release();await new Promise(resolve=>setImmediate(resolve));
   expect((await read(cancelled.input.idempotencyKey))!.state).toBe('cancelled');expect(await detours()).toHaveLength(0);
   // Receipt failure after domain effects rolls the entire transaction back; one retry survives.
   const crash=await admit();const complete=repo.complete.bind(repo);
   const fault=vi.spyOn(repo,'complete').mockImplementationOnce(async(claim,result)=>{await complete(claim,result);throw new Error('phase5 receipt crash');});
   await jobs.execute(f.student,crash.receipt.id);fault.mockRestore();
   expect(await detours()).toHaveLength(0);const failed=await read(crash.input.idempotencyKey);expect(failed).toMatchObject({state:'failed',retryable:true});
   await f.owned(()=>jobs.command(f.student,f.sessionId,crash.input.idempotencyKey,failed!.version,'retry'));
   await jobs.execute(f.student,crash.receipt.id);await jobs.execute(f.student,crash.receipt.id);
   expect(await read(crash.input.idempotencyKey)).toMatchObject({state:'succeeded'});expect(await detours()).toHaveLength(1);
   // Worker restart: a new higher fence survives; stale completion is rejected.
   const recovery=await admit();const old=await f.owned(()=>repo.claim(f.student,recovery.receipt.id));expect(old).toBeTruthy();
   await f.admin.update(schema.petrosSessionCommands).set({executionLeaseUntil:new Date(0)}).where(eq(schema.petrosSessionCommands.id,recovery.receipt.id));
   await jobs.execute(f.student,recovery.receipt.id);
   await expect(f.owned(()=>repo.complete(old!,{stale:true}))).rejects.toThrow();
   expect((await read(recovery.input.idempotencyKey))!).toMatchObject({state:'succeeded',attempts:2});expect(await detours()).toHaveLength(2);
   // Queue authority changes deny execution before adapter entry, even after duplicate admission.
   const revoked=await admit();const calls=gateway.execute.mock.calls.length;
   await f.admin.update(schema.institutionUsers).set({disabledAt:new Date()}).where(eq(schema.institutionUsers.id,f.student.institutionUserId));
   await jobs.execute(f.student,revoked.receipt.id);expect(gateway.execute.mock.calls).toHaveLength(calls);expect(await detours()).toHaveLength(2);
   await f.admin.update(schema.institutionUsers).set({disabledAt:null}).where(eq(schema.institutionUsers.id,f.student.institutionUserId));
   expect((await read(revoked.input.idempotencyKey))!).toMatchObject({state:'failed',retryable:false});
   jobs.onModuleDestroy();
  }
  const left=fixtures[0]!,right=fixtures[1]!;
  const foreign=new PetrosQuestionExecutionRepository(database.db,database.auditWriter);
  expect(await right.owned(()=>foreign.latest(right.student,left.sessionId))).toBeNull();
 },90_000);
});
