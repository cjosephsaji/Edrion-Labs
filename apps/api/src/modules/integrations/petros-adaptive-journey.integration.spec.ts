import 'reflect-metadata';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq,schema } from '@edrion/database';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { PetrosLoopService } from '../student/petros-loop/petros-loop.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosLearnerModelService } from '../petros-learner-model/petros-learner-model.service';
import { PetrosLearnerModelRepository } from '../petros-learner-model/petros-learner-model.repository';
import { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { PetrosObjectiveEvidenceRepository } from '../petros-learner-model/petros-objective-evidence.repository';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import { startPhase2TestDatabase,type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS==='1')('Phase 2 adaptive answer journey through existing loop owners',()=>{
 let database:Phase2TestDatabase;
 beforeAll(async()=>{database=await startPhase2TestDatabase();});afterAll(async()=>{await database?.close();});
 function owners(f:Awaited<ReturnType<typeof phase2AuthorityFixture>>) {
  const provider={execute:vi.fn(()=>{throw new Error('No provider permitted');})};
  const policy=new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),provider as never,database.auditWriter,f.env as never);
  const auth=new StudentAuthService(database.db,database.auditWriter,f.env as never,{} as never,{} as never,{} as never);
  const surfaces={isPortalEnabled:async()=>true};
  const adaptive=new PetrosAdaptiveService(database.db,f.env as never,database.auditWriter,auth,surfaces as never,f.packs,policy);
  const evidence=new PetrosObjectiveEvidenceService(database.db,f.env as never,database.auditWriter,
   new PetrosObjectiveEvidenceRepository(database.db),f.packs,policy,auth,surfaces as never);
  const learner=new PetrosLearnerModelService(new PetrosLearnerModelRepository(database.db),database.auditWriter);
  const loop=new PetrosLoopService(new PetrosLoopRepository(database.db,f.knowledge),provider as never,{} as never,
   learner,database.auditWriter,policy,f.env as never,adaptive,evidence);
  return {provider,adaptive,evidence,loop};
 }
 it('explains, records a confident error, changes explanation, evaluates an unseen application once and advances to synthesis',async()=>{
  const f=await phase2AuthorityFixture(database);await f.qualify();await f.approve();
  const {provider,adaptive,evidence,loop}=owners(f);
  const checkpoints=Array.from({length:10},(_,i)=>({id:`checkpoint-${i+1}`,label:`Step ${i+1}`,status:i===0?'current' as const:'pending' as const}));
  await f.admin.update(schema.petrosLearningSessions).set({maxMoves:10,checkpoints,currentCheckpointId:'checkpoint-1',
   resolvedTopicProfile:stage4ProfileFixture('projectile',f.institutionId)}).where(eq(schema.petrosLearningSessions.id,f.sessionId));
  expect(await f.owned(()=>adaptive.availability(f.student,f.sessionId))).toMatchObject({status:'available',packs:[{pack:f.candidate.pack}]});
  await f.owned(()=>adaptive.bind(f.student,f.sessionId,{commandId:randomUUID(),pack:f.candidate.pack}));
  expect(await f.owned(()=>adaptive.availability(f.student,f.sessionId))).toMatchObject({status:'bound',pack:f.candidate.pack});
  await expect(f.owned(()=>loop.assertAdaptiveComposerAllowed(f.student,f.sessionId))).rejects.toThrow();
  const next=()=>f.owned(()=>loop.continue(f.student,f.sessionId,randomUUID()));
  const complete=async()=>{
   const doc=await f.owned(()=>loop.document(f.student,f.sessionId));const block=doc.blocks.find(b=>b.status==='current')!;
   return f.owned(()=>loop.complete(f.student,f.sessionId,block.id,{idempotencyKey:randomUUID(),expectedBlockVersion:block.version,
    blockType:block.content.type,interactionState:block.interactionState,observedOutcome:{}}));
  };
  const explanation=await next();expect(explanation.blocks.at(-1)!.content.type).toBe('layered_explanation');await complete();
  const diagnostic=await next();const block=diagnostic.blocks.at(-1)!;expect(block.content.type).toBe('recall_check');
  const answer={idempotencyKey:randomUUID(),expectedBlockVersion:block.version,questionId:block.questions[0]!.id,answer:'both',confidence:'sure' as const};
  await f.owned(()=>loop.submitAnswer(f.student,f.sessionId,block.id,answer));
  await f.owned(()=>loop.submitAnswer(f.student,f.sessionId,block.id,answer));
  await expect(f.owned(()=>loop.submitAnswer(f.student,f.sessionId,block.id,{...answer,answer:'vertical'}))).rejects.toThrow();
  await complete();
  const contrast=await next();expect(contrast.blocks.at(-1)!.content.type).toBe('contrast_case');
  const decisions=await f.admin.select().from(schema.petrosPlanningDecisions).where(eq(schema.petrosPlanningDecisions.sessionId,f.sessionId));
  expect(decisions.at(-1)!.adaptiveSnapshot).toMatchObject({output:{decision:{reason:'confident_error',diagnosis:'tentative'}}});
  await complete();const application=await next();const transfer=application.blocks.at(-1)!;
  expect(transfer.content.type).toBe('recall_check');expect(transfer.questions[0]!.prompt).toContain('6 m/s');
  await f.owned(()=>loop.submitAnswer(f.student,f.sessionId,transfer.id,{idempotencyKey:randomUUID(),expectedBlockVersion:transfer.version,
   questionId:transfer.questions[0]!.id,answer:'12 m',confidence:'sure'}));
  await complete();const synthesis=await next();expect(synthesis.blocks.at(-1)!.content.type).toBe('synthesis');
  const recorded=await evidence.readCurrentEvidence(f.student,f.sessionId,{packId:f.candidate.pack.id,packVersion:f.candidate.pack.version});
  expect(recorded.events).toHaveLength(2);
  expect(recorded.events.filter(e=>e.event.task.unseenContext && e.event.assessment.result.kind==='objective' &&
    e.event.assessment.result.judgment.status==='evaluated' && e.event.assessment.result.judgment.outcome==='correct')).toHaveLength(1);
  expect(recorded.events[1]!.classification).toMatchObject({externalAssistance:'unknown',petrosAssistance:'none_observed'});
  await complete();expect((await next()).blocks.at(-1)!.content.type).toBe('artifact_commit');
  expect(provider.execute).not.toHaveBeenCalled();
 },30000);
 it('retains displayed but unanswered transfer exposure across reviewed pack versions',async()=>{
  const f=await phase2AuthorityFixture(database);await f.qualify();await f.approve();
  const {provider,adaptive,evidence,loop}=owners(f);
  const checkpoints=Array.from({length:10},(_,i)=>({id:`checkpoint-${i+1}`,label:`Step ${i+1}`,status:i===0?'current' as const:'pending' as const}));
  await f.admin.update(schema.petrosLearningSessions).set({maxMoves:10,checkpoints,currentCheckpointId:'checkpoint-1',
   resolvedTopicProfile:stage4ProfileFixture('projectile',f.institutionId)}).where(eq(schema.petrosLearningSessions.id,f.sessionId));
  const [initial]=await f.admin.select().from(schema.petrosLearningSessions).where(eq(schema.petrosLearningSessions.id,f.sessionId));
  await f.owned(()=>adaptive.bind(f.student,f.sessionId,{commandId:randomUUID(),pack:f.candidate.pack}));
  const next=(sessionId:string)=>f.owned(()=>loop.continue(f.student,sessionId,randomUUID()));
  const complete=async(sessionId:string)=>{
   const doc=await f.owned(()=>loop.document(f.student,sessionId));const block=doc.blocks.find(b=>b.status==='current')!;
   return f.owned(()=>loop.complete(f.student,sessionId,block.id,{idempotencyKey:randomUUID(),expectedBlockVersion:block.version,
    blockType:block.content.type,interactionState:block.interactionState,observedOutcome:{}}));
  };
  await next(f.sessionId);await complete(f.sessionId);
  const diagnostic=(await next(f.sessionId)).blocks.at(-1)!;
  await f.owned(()=>loop.submitAnswer(f.student,f.sessionId,diagnostic.id,{idempotencyKey:randomUUID(),expectedBlockVersion:diagnostic.version,
   questionId:diagnostic.questions[0]!.id,answer:'both',confidence:'sure'}));
  await complete(f.sessionId);await next(f.sessionId);await complete(f.sessionId);
  const transfer=(await next(f.sessionId)).blocks.at(-1)!;
  expect(transfer.questions[0]!.prompt).toContain('6 m/s');
  expect(await f.admin.select().from(schema.petrosAnswerEvaluations).where(eq(schema.petrosAnswerEvaluations.questionId,transfer.questions[0]!.id))).toEqual([]);
  const [exposed]=await f.admin.select().from(schema.petrosQuestionSpecs).where(eq(schema.petrosQuestionSpecs.id,transfer.questions[0]!.id));
  const candidate=structuredClone(f.candidate);candidate.pack.version+=1;
  const compiled=await f.institution(()=>f.packs.compile(f.ctx,{...f.compileCommand,commandId:randomUUID(),candidate}));
  await f.institution(()=>f.packs.review(f.ctx,compiled.candidateId,{...f.reviewCommand,commandId:randomUUID(),expectedPayloadHash:compiled.payloadHash}));
  const freshSessionId=randomUUID();
  await f.admin.insert(schema.petrosLearningSessions).values({...initial!,id:freshSessionId,clientRequestId:randomUUID()});
  await f.owned(()=>adaptive.bind(f.student,freshSessionId,{commandId:randomUUID(),pack:candidate.pack}));
  await next(freshSessionId);await complete(freshSessionId);await next(freshSessionId);
  const decisions=await f.admin.select().from(schema.petrosPlanningDecisions).where(eq(schema.petrosPlanningDecisions.sessionId,freshSessionId));
  expect(decisions.at(-1)!.adaptiveSnapshot).toMatchObject({input:{availableTasks:[]}});
  // Model an older writer that still presents this task: evidence admission independently
  // detects the prior display, even with no answer/evidence for the v1 transfer.
  const repeatedSessionId=randomUUID(),decisionId=randomUUID(),blockId=randomUUID(),questionId=randomUUID();
  await f.admin.insert(schema.petrosLearningSessions).values({...initial!,id:repeatedSessionId,clientRequestId:randomUUID()});
  await f.owned(()=>adaptive.bind(f.student,repeatedSessionId,{commandId:randomUUID(),pack:candidate.pack}));
  await f.admin.insert(schema.petrosPlanningDecisions).values({id:decisionId,sessionId:repeatedSessionId,institutionId:f.institutionId,
   studentId:f.student.studentId,sequence:1,selectedMoveType:'recall_check',targetConcept:candidate.objective.id,
   studentSafeReason:'Synthetic old writer exposure regression',decisionFactors:[],moveParameters:{},expectedEvidence:'new_independent_item',
   progressEffect:{},termination:{},guessFirst:{},observationResponse:{},source:'deterministic_fallback',functionKey:'synthetic',
   promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
  await f.admin.insert(schema.petrosTeachingBlocks).values({id:blockId,sessionId:repeatedSessionId,decisionId,institutionId:f.institutionId,
   studentId:f.student.studentId,sequence:1,type:'recall_check',content:transfer.content,interactionState:transfer.interactionState,
   delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
  await f.admin.insert(schema.petrosQuestionSpecs).values({...exposed!,id:questionId,sessionId:repeatedSessionId,blockId,
   rootQuestionId:questionId,parentQuestionId:null,learningTask:{...exposed!.learningTask!,pack:candidate.pack},createdAt:new Date(),active:true});
  await f.owned(()=>loop.submitAnswer(f.student,repeatedSessionId,blockId,{idempotencyKey:randomUUID(),expectedBlockVersion:0,
   questionId,answer:'12 m',confidence:'sure'}));
  const recorded=await evidence.readCurrentEvidence(f.student,repeatedSessionId,{packId:candidate.pack.id,packVersion:candidate.pack.version});
  expect(recorded.events).toHaveLength(1);
  expect(recorded.events[0]).toMatchObject({event:{pack:candidate.pack,task:{id:'transfer',unseenContext:true}},
   classification:{observation:'repeated',projectionEligible:false}});
  expect(provider.execute).not.toHaveBeenCalled();
 },30000);

});
