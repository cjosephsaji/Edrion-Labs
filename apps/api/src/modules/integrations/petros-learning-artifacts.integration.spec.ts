import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray, schema, sql } from '@edrion/database';
import {
  petrosAdaptiveSnapshotSchema,
  petrosFlashcardContentSchema,
  petrosNoteContentSchema,
  proposePetrosAdaptiveMove,
} from '@edrion/schemas';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { PetrosArtifactsService } from '../student/petros-artifacts/petros-artifacts.service';
import { PetrosArtifactsRepository } from '../student/petros-artifacts/petros-artifacts.repository';
import { PetrosLearningArtifactsService } from '../student/petros-artifacts/petros-learning-artifacts.service';
import { PetrosQualitativeReviewService } from '../student/petros-artifacts/petros-qualitative-review.service';
import { PetrosQualitativeReviewRepository } from '../student/petros-artifacts/petros-qualitative-review.repository';
import { startPhase2TestDatabase, waitForPhase2AdvisoryWait, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 artifact and qualitative persistence',()=>{
  let fixture:Phase2TestDatabase;
  beforeAll(async()=>{fixture=await startPhase2TestDatabase();});
  afterAll(async()=>{await fixture?.close();});afterEach(()=>vi.restoreAllMocks());

  async function setup() {
    const f=await phase2AuthorityFixture(fixture);await f.qualify();await f.approve();
    const provider={execute:vi.fn(()=>{throw new Error('No provider calls');})};
    const policies=new PetrosInstitutionalService(new PetrosInstitutionalRepository(fixture.db),provider as never,fixture.auditWriter,f.env as never);
    const auth=new StudentAuthService(fixture.db,fixture.auditWriter,f.env as never,{} as never,{} as never,{} as never);
    const surfaces={isPortalEnabled:async()=>true};
    const learning=new PetrosLearningArtifactsService(fixture.db,f.env as never,fixture.auditWriter,auth,surfaces as never,f.packs,policies);
    const learner={ingest:vi.fn()};
    const artifacts=new PetrosArtifactsService(new PetrosArtifactsRepository(fixture.db,f.knowledge),learner as never,learning);
    const qualitative=new PetrosQualitativeReviewService(fixture.db,f.env as never,fixture.auditWriter,
      new PetrosQualitativeReviewRepository(fixture.db),f.packs,policies,auth,surfaces as never);
    const adaptive=new PetrosAdaptiveService(fixture.db,f.env as never,fixture.auditWriter,auth,surfaces as never,f.packs,policies);
    await f.owned(()=>adaptive.bind(f.student,f.sessionId,{commandId:randomUUID(),pack:f.candidate.pack}));
    const scope={institutionId:f.institutionId,studentId:f.student.studentId,sessionId:f.sessionId};
    const decisionId=randomUUID(),blockId=randomUUID();
    await f.admin.insert(schema.petrosPlanningDecisions).values({...scope,id:decisionId,sequence:1,selectedMoveType:'layered_explanation',
      targetConcept:f.candidate.objective.id,studentSafeReason:'Reviewed source',decisionFactors:[],moveParameters:{},expectedEvidence:'none',
      progressEffect:{},termination:{},guessFirst:{},observationResponse:{},source:'deterministic_fallback',functionKey:'synthetic',
      promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
    await f.admin.insert(schema.petrosTeachingBlocks).values({...scope,id:blockId,decisionId,sequence:1,type:'layered_explanation',
      content:{},delivery:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',schemaVersion:'synthetic',correlationId:randomUUID()});
    const card=petrosFlashcardContentSchema.parse({kind:'flashcard',title:'Apex components',front:'Which component is zero at the apex?',
      back:'Vertical velocity is zero; horizontal velocity stays constant.',tags:[]});
    const note=petrosNoteContentSchema.parse({kind:'note',title:'Component explanation',body:'Both components are zero at the apex.',tags:[]});
    const save=(content: typeof card | typeof note=card,key=randomUUID())=>f.owned(()=>artifacts.saveBlockArtifact(f.student,f.sessionId,blockId,{idempotencyKey:key,content}));
    return {...f,provider,policies,adaptive,learning,artifacts,qualitative,learner,blockId,card,note,save};
  }

  async function submitRevision(f:Awaited<ReturnType<typeof setup>>,shareLearningProvenance=false) {
    const saved=await f.save(f.note);const task=f.candidate.assessments[0]!;
    const command={schemaVersion:'petros.qualitative-review.v1' as const,commandId:randomUUID(),artifactId:saved.id,
      sessionId:f.sessionId,expectedRevision:1,courseId:f.course.id,objective:f.candidate.objective,
      pack:f.candidate.pack,task:{id:task.id,variant:task.variant}};
    const request=await f.qualitative.requestDraftFeedback(f.student,command);
    const feedback=await f.institution(()=>f.qualitative.draftFeedback(f.principal,{
      schemaVersion:'petros.qualitative-review.v1',commandId:randomUUID(),requestId:request.request.submissionId,
      qualificationId:f.qualificationId,expectedQualificationVersion:1,reason:'Synthetic revision feedback.',
      productFeedback:[{criterionId:f.candidate.rubric.criteria[0]!.id,
        observation:{status:'observed' as const,spans:[{start:0,end:20}]},
        feedback:'Distinguish the horizontal and vertical components.',uncertainty:'low' as const}],
    }));
    const revised={...f.note,body:'Only vertical velocity is zero at the apex. Horizontal velocity remains constant.'};
    await f.owned(()=>f.artifacts.updateSaved(f.student,saved.id,{expectedRevision:1,content:revised}));
    const submission=await f.qualitative.submit(f.student,{...command,commandId:randomUUID(),expectedRevision:2,
      draftFeedbackId:feedback.feedback.id,shareLearningProvenance});
    return {saved,request,feedback,submission,criterionId:f.candidate.rubric.criteria[0]!.id};
  }

  it('saves once with exact provenance, records delayed self-review once, and rejects stale resume without mastery writes',async()=>{
    const f=await setup(),key=randomUUID();
    const [one,two]=await Promise.all([f.save(f.card,key),f.save(f.card,key)]);
    expect(one.id).toBe(two.id);expect(one.dueAt).not.toBeNull();
    expect(await f.owned(()=>f.learning.resume(f.student,one.id))).toMatchObject({status:'available',objective:f.candidate.objective,
      masteryProjectionEligible:false});
    const input={clientReviewId:randomUUID(),grade:'good' as const,confidence:'sure' as const,elapsedMs:1200,
      reviewedAt:new Date().toISOString(),timezone:'Asia/Kolkata'};
    const review=await f.owned(()=>f.artifacts.review(f.student,one.id,input));
    const replay=await f.owned(()=>f.artifacts.review(f.student,one.id,input));
    expect(replay.nextDueAt).toBe(review.nextDueAt);
    expect(await f.admin.select().from(schema.petrosLearningArtifactReceipts).where(eq(schema.petrosLearningArtifactReceipts.artifactId,one.id))).toHaveLength(1);
    expect(await f.admin.select().from(schema.petrosLearningReviewReceipts).where(eq(schema.petrosLearningReviewReceipts.studentId,f.student.studentId))).toHaveLength(1);
    expect(f.learner.ingest).not.toHaveBeenCalled();
    await expect(f.save({...f.card,title:'Changed'},key)).rejects.toThrow();
    await expect(f.owned(()=>f.artifacts.review(f.student,one.id,{...input,grade:'again'}))).rejects.toThrow();
    await f.admin.update(schema.knowledgeItems).set({sourceRevokedAt:new Date()}).where(eq(schema.knowledgeItems.id,f.source.id));
    await expect(f.owned(()=>f.learning.resume(f.student,one.id))).rejects.toThrow();
    expect(f.provider.execute).not.toHaveBeenCalled();
  });

  it('serializes resume behind review without holding a conflicting artifact row lock',async()=>{
    const f=await setup(),saved=await f.save();
    let ready!:()=>void,release!:()=>void;
    const locked=new Promise<void>(resolve=>{ready=resolve;});
    const continueReview=new Promise<void>(resolve=>{release=resolve;});
    const review=f.owned(async()=>{
      await fixture.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${f.institutionId}`},0))`);
      ready();await continueReview;
      return f.artifacts.review(f.student,saved.id,{clientReviewId:randomUUID(),grade:'good',confidence:'sure',
        elapsedMs:1000,reviewedAt:new Date().toISOString(),timezone:'UTC'});
    });
    await locked;
    const resume=f.owned(()=>f.learning.resume(f.student,saved.id));
    try {await waitForPhase2AdvisoryWait(fixture);} finally {release();}
    const [reviewed,resumed]=await Promise.all([review,resume]);
    expect(reviewed.duplicate).toBe(false);expect(resumed).toMatchObject({status:'available',dueAt:reviewed.nextDueAt});
  });

  it('rolls back the product, selected-save and provenance receipt if binding audit fails',async()=>{
    const f=await setup();
    const failure=vi.spyOn(fixture.auditWriter,'logAudit').mockRejectedValueOnce(new Error('synthetic audit failure'));
    await expect(f.save()).rejects.toThrow('synthetic audit failure');failure.mockRestore();
    expect(await f.admin.select().from(schema.petrosSavedArtifacts).where(eq(schema.petrosSavedArtifacts.sessionId,f.sessionId))).toEqual([]);
    expect(await f.admin.select().from(schema.petrosLearningArtifactReceipts).where(eq(schema.petrosLearningArtifactReceipts.studentId,f.student.studentId))).toEqual([]);
    expect(await f.admin.select().from(schema.flashcardDecks).where(eq(schema.flashcardDecks.studentId,f.student.studentId))).toEqual([]);
    await f.save();
  });

  it('shares a draft, records qualified feedback, revises and explicitly reviews; changed work invalidates approval',async()=>{
    const f=await setup();const saved=await f.save(f.note);
    const task=f.candidate.assessments[0]!;
    const command={schemaVersion:'petros.qualitative-review.v1',commandId:randomUUID(),artifactId:saved.id,sessionId:f.sessionId,
      expectedRevision:1,courseId:f.course.id,objective:f.candidate.objective,pack:f.candidate.pack,task:{id:task.id,variant:task.variant}};
    await expect(f.qualitative.submit(f.student,command)).rejects.toThrow();
    const request=await f.qualitative.requestDraftFeedback(f.student,command);
    expect(await f.qualitative.draftStatus(f.student,request.request.submissionId)).toMatchObject({status:'pending'});
    const feedback=await f.institution(()=>f.qualitative.draftFeedback(f.principal,{schemaVersion:'petros.qualitative-review.v1',
      commandId:randomUUID(),requestId:request.request.submissionId,qualificationId:f.qualificationId,expectedQualificationVersion:1,
      reason:'Please distinguish the two components in your revision.',productFeedback:[{criterionId:f.candidate.rubric.criteria[0]!.id,
      observation:{status:'observed',spans:[{start:0,end:20}]},feedback:'Check which component gravity changes.',uncertainty:'low'}]}));
    expect(await f.qualitative.draftStatus(f.student,request.request.submissionId)).toMatchObject({status:'feedback_received'});
    const revised={...f.note,body:'Only vertical velocity is zero at the apex. Horizontal velocity remains constant.'};
    await f.owned(()=>f.artifacts.updateSaved(f.student,saved.id,{expectedRevision:1,content:revised}));
    const submitted=await f.qualitative.submit(f.student,{...command,expectedRevision:2,draftFeedbackId:feedback.feedback.id});
    const reviews=await f.admin.select().from(schema.petrosQualitativeReviews).where(eq(schema.petrosQualitativeReviews.submissionId,submitted.submissionId));
    expect(reviews).toEqual([]);
    const inspection=await f.institution(()=>f.qualitative.inspect(f.principal,submitted.submissionId));
    expect(inspection).toMatchObject({objective:f.candidate.objective,reviewStatus:'pending',provenance:{status:'not_shared'}});
    expect(inspection).not.toHaveProperty('rawAnswer');expect(inspection).not.toHaveProperty('chainOfThought');
    await expect(f.institution(()=>f.qualitative.inspect({...f.principal,institutionUserId:randomUUID()},submitted.submissionId))).rejects.toThrow();
    await expect(f.institution(()=>fixture.db.update(schema.petrosSavedArtifacts).set({content:f.note})
      .where(eq(schema.petrosSavedArtifacts.id,saved.id)))).rejects.toThrow();
    expect(await f.qualitative.current(f.student,submitted.submissionId)).toMatchObject({status:'unavailable',reason:'review_pending'});
    const reviewCommand={schemaVersion:'petros.qualitative-review.v1',commandId:randomUUID(),submissionId:submitted.submissionId,
      qualificationId:f.qualificationId,expectedQualificationVersion:1,decision:'approved',reason:'Synthetic explicit review only.',
      productFeedback:[{criterionId:f.candidate.rubric.criteria[0]!.id,observation:{status:'observed',spans:[{start:0,end:20}]},
        feedback:'The revision distinguishes the components.',uncertainty:'low'}]};
    const approved=await f.institution(()=>f.qualitative.review(f.principal,reviewCommand));
    expect(approved).toMatchObject({evidenceAdmission:'not_granted',numericProjection:false,receipt:{decision:'approved',work:{revision:2}}});
    expect(await f.institution(()=>f.qualitative.review(f.principal,reviewCommand))).toMatchObject({replayed:true});
    expect(await f.qualitative.current(f.student,submitted.submissionId)).toMatchObject({status:'valid_approval',numericProjection:false});
    expect(await f.institution(()=>f.qualitative.inspect(f.principal,submitted.submissionId))).toMatchObject({reviewStatus:'approved'});
    const revoke={commandId:randomUUID(),reviewId:approved.receipt.id,qualificationId:f.qualificationId,
      expectedQualificationVersion:1,reason:'Synthetic withdrawal of the review.'};
    expect(await f.institution(()=>f.qualitative.revoke(f.principal,revoke))).toMatchObject({status:'revoked',replayed:false});
    expect(await f.institution(()=>f.qualitative.revoke(f.principal,revoke))).toMatchObject({status:'revoked',replayed:true});
    expect(await f.qualitative.current(f.student,submitted.submissionId)).toMatchObject({status:'unavailable',reason:'review_revoked'});
    await expect(f.institution(()=>f.qualitative.review(f.principal,reviewCommand))).rejects.toThrow();
    await f.owned(()=>f.artifacts.updateSaved(f.student,saved.id,{expectedRevision:2,content:{...revised,body:'Changed after educator review.'}}));
    await expect(f.institution(()=>f.qualitative.review(f.principal,reviewCommand))).rejects.toThrow();
    await expect(f.institution(()=>f.qualitative.inspect(f.principal,submitted.submissionId))).rejects.toThrow();
    expect(await f.qualitative.current(f.student,submitted.submissionId)).toMatchObject({status:'unavailable',reason:'stale_work'});
    expect(await f.admin.select().from(schema.petrosObjectiveEvidenceEvents).where(eq(schema.petrosObjectiveEvidenceEvents.studentId,f.student.studentId))).toEqual([]);
    expect(await f.owned(()=>f.artifacts.deleteSaved(f.student,saved.id))).toMatchObject({deleted:true,recoverable:false});
    await expect(f.owned(()=>f.artifacts.lifecycle(f.student,saved.id,{action:'restore'}))).rejects.toThrow();
    await expect(f.owned(()=>f.learning.resume(f.student,saved.id))).rejects.toThrow();
  });

  it('retains an explicit educator denial without treating the revision as approved evidence',async()=>{
    const f=await setup();const shared=await submitRevision(f);
    const command={schemaVersion:'petros.qualitative-review.v1',commandId:randomUUID(),
      submissionId:shared.submission.submissionId,qualificationId:f.qualificationId,
      expectedQualificationVersion:1,decision:'rejected',reason:'The requested distinction needs another revision.',
      productFeedback:[{criterionId:shared.criterionId,observation:{status:'not_observed'},
        feedback:'Explain how gravity acts on the vertical component.',uncertainty:'low'}]};
    expect(await f.institution(()=>f.qualitative.review(f.principal,command)))
      .toMatchObject({receipt:{decision:'rejected'},evidenceAdmission:'not_granted',numericProjection:false});
    expect(await f.qualitative.current(f.student,shared.submission.submissionId))
      .toMatchObject({status:'rejected',evidenceAdmission:'not_granted',numericProjection:false});
    expect(await f.institution(()=>f.qualitative.inspect(f.principal,shared.submission.submissionId)))
      .toMatchObject({reviewStatus:'rejected'});
    await expect(f.institution(()=>f.qualitative.review(f.principal,{...command,decision:'approved'}))).rejects.toThrow();
    expect(await f.admin.select().from(schema.petrosObjectiveEvidenceEvents)
      .where(eq(schema.petrosObjectiveEvidenceEvents.studentId,f.student.studentId))).toEqual([]);
  });

  it('rejects a changed current rubric independently of unchanged pack and objective identifiers',async()=>{
    const f=await setup();const shared=await submitRevision(f);
    const current=await f.current();
    // Controlled upstream inconsistency: verify the consumer compares the full rubric,
    // even if a future pack owner returns changed content under the same identifiers.
    const changed=structuredClone(current);
    changed.candidate.rubric.criteria[0]!.descriptor='Changed after the submitted revision.';
    vi.spyOn(f.packs,'requireApprovedPack').mockResolvedValue(changed);
    await expect(f.qualitative.current(f.student,shared.submission.submissionId))
      .rejects.toMatchObject({response:{code:'PETROS_QUALITATIVE_AUTHORITY_CHANGED'}});
    await expect(f.owned(()=>f.learning.resume(f.student,shared.saved.id))).rejects.toThrow();
  });

  it('invalidates stored feedback and approval when homework.grade is revoked without changing staff or qualification',async()=>{
    const f=await setup();const shared=await submitRevision(f);
    const approved=await f.institution(()=>f.qualitative.review(f.principal,{
      schemaVersion:'petros.qualitative-review.v1',commandId:randomUUID(),submissionId:shared.submission.submissionId,
      qualificationId:f.qualificationId,expectedQualificationVersion:1,decision:'approved',reason:'Synthetic approval.',
      productFeedback:[{criterionId:shared.criterionId,observation:{status:'observed',spans:[{start:0,end:20}]},
        feedback:'The submitted revision distinguishes both components.',uncertainty:'low'}],
    }));
    expect(await f.qualitative.current(f.student,shared.submission.submissionId)).toMatchObject({status:'valid_approval'});
    expect(await f.qualitative.draftStatus(f.student,shared.request.request.submissionId)).toMatchObject({status:'feedback_received'});
    const staffBefore=await f.admin.select().from(schema.staff).where(eq(schema.staff.id,f.teacherId));
    const qualificationBefore=await f.admin.select().from(schema.petrosReviewerQualifications)
      .where(eq(schema.petrosReviewerQualifications.id,f.qualificationId));
    // Remove only grading authority; preserve the independent pack/curriculum/course grants.
    await f.admin.insert(schema.institutionRoles).values({institutionId:f.institutionId,key:'institution_owner',
      name:'Synthetic restricted owner',permissions:['syllabus.manage','academics.alignments.approve','class_content.manage','courses.manage']});
    await f.current(); // Pack review and course authority remain valid.
    expect(await f.admin.select().from(schema.staff).where(eq(schema.staff.id,f.teacherId))).toEqual(staffBefore);
    expect(await f.admin.select().from(schema.petrosReviewerQualifications)
      .where(eq(schema.petrosReviewerQualifications.id,f.qualificationId))).toEqual(qualificationBefore);
    expect(await f.qualitative.current(f.student,shared.submission.submissionId))
      .toMatchObject({status:'unavailable',reason:'reviewer_authority_denied'});
    await expect(f.qualitative.draftStatus(f.student,shared.request.request.submissionId)).rejects.toThrow();
    await expect(f.institution(()=>f.qualitative.inspect(f.principal,shared.submission.submissionId))).rejects.toThrow();
    expect(await f.admin.select().from(schema.petrosQualitativeReviews)
      .where(eq(schema.petrosQualitativeReviews.id,approved.receipt.id))).toHaveLength(1);
  });

  it('shares only decisions and evidence recorded by submission time through both inspection and teacher RLS',async()=>{
    const f=await setup();const shared=await submitRevision(f,true);
    const [submissionRow]=await f.admin.select().from(schema.petrosQualitativeSubmissions)
      .where(eq(schema.petrosQualitativeSubmissions.id,shared.submission.submissionId));
    const submittedAt=submissionRow!.createdAt;
    const before=new Date(submittedAt.getTime()-1_000),after=new Date(submittedAt.getTime()+1_000);
    const approved=await f.current();
    const policy=await f.owned(()=>f.policies.documentKnowledgePolicy(f.student,f.sessionId));
    const adaptiveInput=(signal:{kind:'new_topic'}|{kind:'no_evidence'})=>({
      schemaVersion:'petros.adaptive-policy.v1' as const,objective:f.candidate.objective,pack:f.candidate.pack,
      policyVersion:policy.authorityHash,sourceVersion:f.candidate.sourceVersion,
      curriculumRevision:f.candidate.curriculumRevision,assignmentVersions:[],signal,availableTasks:[],
      constraints:{sourceReady:true,sourceGrounding:'supported' as const,explanationPresented:false,
        remainingSeconds:600,diagramAvailable:true,assistance:'ordinary_study' as const},
    });
    const snapshot=(signal:{kind:'new_topic'}|{kind:'no_evidence'})=>{
      const input=adaptiveInput(signal);
      return petrosAdaptiveSnapshotSchema.parse({schemaVersion:'petros.adaptive-snapshot.v1',
        candidateHash:approved.payloadHash,reviewId:approved.reviewReceipt.receiptId,policy,input,
        output:proposePetrosAdaptiveMove(input)});
    };
    const decisionIds=[randomUUID(),randomUUID()];
    const decisionRows=[
      {id:decisionIds[0]!,sequence:2,createdAt:before,adaptiveSnapshot:snapshot({kind:'new_topic'})},
      {id:decisionIds[1]!,sequence:3,createdAt:after,adaptiveSnapshot:snapshot({kind:'no_evidence'})},
    ].map(row=>({...row,institutionId:f.institutionId,studentId:f.student.studentId,sessionId:f.sessionId,
      selectedMoveType:'layered_explanation',targetConcept:f.candidate.objective.id,studentSafeReason:'Synthetic cutoff decision',
      decisionFactors:[],moveParameters:{},expectedEvidence:'none',progressEffect:{},termination:{},guessFirst:{},
      observationResponse:{},source:'deterministic_fallback',functionKey:'synthetic',promptVersion:'synthetic',
      schemaVersion:'synthetic',correlationId:randomUUID()}));
    await f.admin.insert(schema.petrosPlanningDecisions).values(decisionRows);
    const eventIds=[randomUUID(),randomUUID()];
    for (const [index,createdAt] of [before,after].entries()) {
      const questionId=randomUUID(),observationId=randomUUID(),evaluationId=randomUUID();
      await f.admin.insert(schema.petrosQuestionSpecs).values({id:questionId,institutionId:f.institutionId,
        studentId:f.student.studentId,sessionId:f.sessionId,blockId:f.blockId,rootQuestionId:questionId,
        targetId:`cutoff-${index}`,equivalenceKey:`cutoff-${randomUUID()}`,prompt:'Synthetic cutoff prompt',
        responseType:'short_answer',purpose:'recall',evaluationMode:'deterministic',hint:'Synthetic',missingStep:'Synthetic',
        workedSolution:'Synthetic',rewordedPrompt:'Synthetic cutoff prompt'});
      await f.admin.insert(schema.petrosObservations).values({id:observationId,institutionId:f.institutionId,
        studentId:f.student.studentId,sessionId:f.sessionId,decisionId:decisionIds[index]!,blockId:f.blockId,
        questionId,type:'answer_submitted',rawAnswer:'synthetic',confidence:'sure',schemaVersion:'petros.observation.v1',
        occurredAt:createdAt,correlationId:randomUUID()});
      const assessment={schemaVersion:'petros.assessment.v1',result:{kind:'objective',judgment:{status:'evaluated'},provenance:{uncertainty:'low'}}};
      await f.admin.insert(schema.petrosAnswerEvaluations).values({id:evaluationId,institutionId:f.institutionId,
        studentId:f.student.studentId,sessionId:f.sessionId,observationId,questionId,assessment:assessment as never,
        correctness:'correct',creditBasisPoints:10000,evidence:['Synthetic cutoff'],errorClass:'none',feedback:'Synthetic',
        evaluator:'deterministic',promptVersion:'synthetic',schemaVersion:'petros.answer-evaluation.v1',correlationId:randomUUID()});
      const commandId=randomUUID();
      await f.admin.transaction(async tx=>{
      await tx.insert(schema.petrosObjectiveEvidenceCommands).values({commandId,institutionId:f.institutionId,
        studentId:f.student.studentId,sessionId:f.sessionId,evaluationId,eventId:eventIds[index]!,requestHash:'a'.repeat(64),response:{}});
      await tx.insert(schema.petrosObjectiveEvidenceEvents).values({id:eventIds[index]!,institutionId:f.institutionId,
        studentId:f.student.studentId,sessionId:f.sessionId,commandId,evaluationId,
        objectiveId:f.candidate.objective.id,objectiveVersion:f.candidate.objective.version,
        packId:f.candidate.pack.id,packVersion:f.candidate.pack.version,evidence:{task:{id:`cutoff-${index}`,variant:'synthetic'},
          assessment} as never,classification:{petrosAssistance:'none_observed',externalAssistance:'unknown',
          observation:'petros_unassisted',projectionEligible:true} as never,occurredAt:createdAt,createdAt});
      });
    }
    const inspection=await f.institution(()=>f.qualitative.inspect(f.principal,shared.submission.submissionId));
    expect(inspection.provenance).toMatchObject({status:'shared',interventions:[{signal:'new_topic'}],
      observations:[{eventId:eventIds[0],task:{id:'cutoff-0'}}]});
    const teacherDecisions=await f.institution(()=>fixture.db.select({id:schema.petrosPlanningDecisions.id})
      .from(schema.petrosPlanningDecisions).where(inArray(schema.petrosPlanningDecisions.id,decisionIds)));
    const teacherEvidence=await f.institution(()=>fixture.db.select({id:schema.petrosObjectiveEvidenceEvents.id})
      .from(schema.petrosObjectiveEvidenceEvents).where(inArray(schema.petrosObjectiveEvidenceEvents.id,eventIds)));
    expect(teacherDecisions).toEqual([{id:decisionIds[0]}]);
    expect(teacherEvidence).toEqual([{id:eventIds[0]}]);
  });
});
