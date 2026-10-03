import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, schema } from '@edrion/database';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { PetrosObjectiveEvidenceRepository } from '../petros-learner-model/petros-objective-evidence.repository';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { objectiveAssessment } from '../student/petros-loop/petros-assessment.adapter';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';

/** Real authority services and persistence. Canonical response rows are controlled seeded observations. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 objective evidence persistence',()=>{
  let fixture:Phase2TestDatabase;
  beforeAll(async()=>{fixture=await startPhase2TestDatabase();});
  afterAll(async()=>{await fixture?.close();});
  afterEach(()=>vi.restoreAllMocks());

  async function setup() {
    const f=await phase2AuthorityFixture(fixture);await f.qualify();await f.approve();
    const provider={execute:vi.fn(()=>{throw new Error('No provider calls allowed');})};
    const policies=new PetrosInstitutionalService(new PetrosInstitutionalRepository(fixture.db),provider as never,fixture.auditWriter,f.env as never);
    const auth=new StudentAuthService(fixture.db,fixture.auditWriter,f.env as never,{} as never,{} as never,{} as never);
    const surfaces={isPortalEnabled:async()=>true};
    const service=new PetrosObjectiveEvidenceService(fixture.db,f.env as never,fixture.auditWriter,
      new PetrosObjectiveEvidenceRepository(fixture.db),f.packs,policies,auth,surfaces as never);
    const adaptive=new PetrosAdaptiveService(fixture.db,f.env as never,fixture.auditWriter,auth,surfaces as never,f.packs,policies);
    await f.owned(()=>adaptive.bind(f.student,f.sessionId,{commandId:randomUUID(),pack:f.candidate.pack}));
    const policy=await f.owned(()=>policies.documentKnowledgePolicy(f.student,f.sessionId));
    const task=f.candidate.assessments[1]!;
    const binding={schemaVersion:'petros.learning-task-binding.v1',pack:f.candidate.pack,task:{id:task.id,variant:task.variant},
      objective:f.candidate.objective,sourceVersion:f.candidate.sourceVersion,rubric:{id:f.candidate.rubric.id,version:f.candidate.rubric.version}};
    const seed=async(prior:Array<{type:string;payload:Record<string,unknown>}>=[])=>{
      const decisionId=randomUUID(),blockId=randomUUID(),questionId=randomUUID(),observationId=randomUUID(),evaluationId=randomUUID();
      const scope={institutionId:f.institutionId,studentId:f.student.studentId,sessionId:f.sessionId};
      const count=await f.admin.select().from(schema.petrosPlanningDecisions).where(eq(schema.petrosPlanningDecisions.sessionId,f.sessionId));
      const sequence=count.length+1;
      await f.admin.insert(schema.petrosPlanningDecisions).values({...scope,id:decisionId,sequence,selectedMoveType:'recall_check',
        targetConcept:f.candidate.objective.id,studentSafeReason:'Synthetic reviewed application',decisionFactors:[],moveParameters:{},
        expectedEvidence:'unseen_transfer',progressEffect:{},termination:{},guessFirst:{},observationResponse:{},source:'deterministic_fallback',
        functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
      await f.admin.insert(schema.petrosTeachingBlocks).values({...scope,id:blockId,decisionId,sequence,type:'recall_check',content:{},
        delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
      await f.admin.insert(schema.petrosQuestionSpecs).values({...scope,id:questionId,blockId,rootQuestionId:questionId,
        targetId:'reviewed-task',equivalenceKey:`${f.candidate.pack.id}:${task.id}:${sequence}`,learningTask:binding,prompt:task.prompt,
        responseType:'short_answer',purpose:'recall',evaluationMode:'deterministic',hint:'Read the source',missingStep:'Check units',
        workedSolution:'Not supplied',rewordedPrompt:task.prompt});
      const evaluation=await f.owned(()=>adaptive.evaluate(f.student,f.sessionId,binding,'12 m'));
      const assessment=objectiveAssessment({evaluation:evaluation!,evaluator:'deterministic',evaluatorVersion:f.candidate.compilerVersion,
        collectedAt:new Date().toISOString(),responseType:'short_answer',prior});
      assessment.conditions.policyVersion=policy.authorityHash;
      await f.admin.insert(schema.petrosObservations).values({...scope,id:observationId,decisionId,blockId,questionId,
        type:'answer_submitted',rawAnswer:'12 m',confidence:'sure',schemaVersion:'petros.observation.v1',occurredAt:new Date(),correlationId:randomUUID()});
      await f.admin.insert(schema.petrosAnswerEvaluations).values({...scope,id:evaluationId,observationId,questionId,
        assessment,correctness:'correct',creditBasisPoints:10000,evidence:['Reviewed answer contract'],errorClass:'none',
        feedback:'Matches reviewed task',evaluator:'deterministic',promptVersion:'synthetic',schemaVersion:'petros.answer-evaluation.v1',correlationId:randomUUID()});
      return {schemaVersion:'petros.objective-evidence.v1',commandId:randomUUID(),evaluationId,pack:f.candidate.pack,
        task:binding.task,correction:null};
    };
    return {...f,service,adaptive,seed,provider,policy};
  }

  it('appends exactly once with outbox and projection, rebuilds and consumes duplicate deliveries idempotently',async()=>{
    const f=await setup(),command=await f.seed();
    const results=await Promise.all([f.service.append(f.student,f.sessionId,command),f.service.append(f.student,f.sessionId,command)]);
    expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
    expect(results[0]!.classification).toMatchObject({observation:'petros_unassisted',externalAssistance:'unknown',projectionEligible:true});
    await expect(f.service.append(f.student,f.sessionId,{...command,commandId:randomUUID()})).rejects.toThrow();
    const pack={packId:f.candidate.pack.id,packVersion:f.candidate.pack.version};
    const first=await f.service.rebuildProjection(f.student,f.sessionId,pack);
    expect(await f.service.rebuildProjection(f.student,f.sessionId,pack)).toEqual(first);
    // Exercise the production read path, not only an otherwise unreachable consumer.
    await f.service.readCurrentEvidence(f.student,f.sessionId,pack);
    await f.service.readCurrentEvidence(f.student,f.sessionId,pack);
    const events=await f.admin.select().from(schema.petrosObjectiveEvidenceEvents).where(eq(schema.petrosObjectiveEvidenceEvents.sessionId,f.sessionId));
    expect(events).toHaveLength(1);
    const outbox=await f.admin.select().from(schema.petrosObjectiveEvidenceOutbox).where(eq(schema.petrosObjectiveEvidenceOutbox.eventId,events[0]!.id));
    expect(outbox).toHaveLength(1);expect(outbox[0]!.status).toBe('processed');
    expect(outbox[0]!.attempts).toBe(1);
    expect(f.provider.execute).not.toHaveBeenCalled();
  });

  it('rejects corrections of different responses and distinguishes hinted/repeated work without projecting mastery',async()=>{
    const f=await setup();const first=await f.service.append(f.student,f.sessionId,await f.seed());
    const command=await f.seed([{type:'hint_requested',payload:{}},{type:'answer_submitted',payload:{supportKind:'hint'}}]);
    await expect(f.service.append(f.student,f.sessionId,{...command,correction:{correctsEventId:first.event.eventId,
      reason:'A new response must not overwrite a prior observation.',declaration:'external_assistance_received'}})).rejects.toThrow();
    const correction=await f.service.append(f.student,f.sessionId,command);
    expect(correction.classification).toMatchObject({observation:'repeated',petrosAssistance:'hinted',projectionEligible:false});
    const read=await f.service.readCurrentEvidence(f.student,f.sessionId,{packId:f.candidate.pack.id,packVersion:1});
    expect(read.events).toHaveLength(2);expect(read.projection).toMatchObject({activeEventCount:2,eligibleEventCount:1});
    expect(await f.admin.select().from(schema.petrosObjectiveEvidenceEvents).where(eq(schema.petrosObjectiveEvidenceEvents.sessionId,f.sessionId))).toHaveLength(2);
    expect(JSON.stringify(read)).not.toMatch(/misconduct|cheat|masteryScore/);
  });

  it('adds a help disclosure correction to the same response, retains its judgment and rebuilds honestly',async()=>{
    const f=await setup(),command=await f.seed();const first=await f.service.append(f.student,f.sessionId,command);
    const correction={...command,commandId:randomUUID(),correction:{correctsEventId:first.event.eventId,
      reason:'I received help outside Petros for this response.',declaration:'external_assistance_received'}};
    const amended=await f.service.append(f.student,f.sessionId,correction);
    expect(amended.event.response).toEqual(first.event.response);
    expect(amended.event.assessment.result).toEqual(first.event.assessment.result);
    expect(amended.classification).toMatchObject({externalAssistance:'declared',projectionEligible:false});
    expect(await f.service.append(f.student,f.sessionId,correction)).toMatchObject({replayed:true});
    const read=await f.service.readCurrentEvidence(f.student,f.sessionId,{packId:f.candidate.pack.id,packVersion:1});
    expect(read.events).toHaveLength(1);expect(read.projection).toMatchObject({eligibleEventCount:0,activeEventCount:1});
    expect(await f.admin.select().from(schema.petrosObjectiveEvidenceEvents).where(eq(schema.petrosObjectiveEvidenceEvents.sessionId,f.sessionId))).toHaveLength(2);
    await expect(f.service.append(f.student,f.sessionId,{...correction,commandId:randomUUID()})).rejects.toThrow();
  });

  it('rolls back evidence, receipt, outbox and projection on audit failure; denies replay after source revocation',async()=>{
    const f=await setup(),command=await f.seed();
    const failure=vi.spyOn(fixture.auditWriter,'logAudit').mockRejectedValueOnce(new Error('synthetic audit failure'));
    await expect(f.service.append(f.student,f.sessionId,command)).rejects.toThrow('synthetic audit failure');failure.mockRestore();
    for(const table of [schema.petrosObjectiveEvidenceCommands,schema.petrosObjectiveEvidenceEvents])
      expect(await f.admin.select().from(table).where(eq(table.sessionId,f.sessionId))).toEqual([]);
    expect(await f.admin.select().from(schema.petrosObjectiveEvidenceOutbox).where(eq(schema.petrosObjectiveEvidenceOutbox.institutionId,f.institutionId))).toEqual([]);
    expect(await f.admin.select().from(schema.petrosObjectiveEvidenceProjections).where(eq(schema.petrosObjectiveEvidenceProjections.institutionId,f.institutionId))).toEqual([]);
    await f.service.append(f.student,f.sessionId,command);
    await f.admin.update(schema.knowledgeItems).set({sourceRevokedAt:new Date()}).where(eq(schema.knowledgeItems.id,f.source.id));
    await expect(f.service.append(f.student,f.sessionId,command)).rejects.toThrow();
    await expect(f.owned(()=>fixture.db.delete(schema.petrosObjectiveEvidenceEvents).where(and(
      eq(schema.petrosObjectiveEvidenceEvents.institutionId,f.institutionId),eq(schema.petrosObjectiveEvidenceEvents.sessionId,f.sessionId))))).rejects.toThrow();
  });
});
