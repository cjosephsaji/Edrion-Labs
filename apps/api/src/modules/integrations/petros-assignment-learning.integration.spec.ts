import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, runInStudentTenant, runInInstitutionTenant, schema } from '@edrion/database';
import { phase2PackCandidate, phase2PackTrustedContext, phase2PackReviewReceipt } from '../../../../../packages/schemas/src/__fixtures__/petros-phase2-pack';
import { PetrosAssignmentLearningService } from '../portal/petros-assignment-learning.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import type { PortalActionContext } from '../portal/portal-action-context';

/** Persistence and S9-context tests; pack/auth/policy adapters are controlled, not authority acceptance. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 assignment release persistence', () => {
  let fixture:Phase2TestDatabase;
  let admin:ReturnType<typeof drizzle<typeof schema>>;
  const institutionId=randomUUID(),userId=randomUUID(),studentId=randomUUID(),classId=randomUUID(),subjectId=randomUUID();
  const principal={institutionId,institutionUserId:userId,fullName:'Synthetic publisher',
    permissions:{keys:new Set(['assignments.manage','courses.manage']),hasWildcard:false},
    allowedCampusIds:[],isInstitutionWide:true,roleKeys:['institution_owner']};
  const ctx={principal,scope:{mode:'institution'},request:{}} as unknown as PortalActionContext;
  beforeAll(async()=>{
    fixture=await startPhase2TestDatabase();admin=drizzle(fixture.adminSql,{schema});
    await admin.insert(schema.institutions).values({id:institutionId,publicId:randomUUID(),legalName:'Synthetic',displayName:'Synthetic',
      type:'school',country:'IN',primaryContact:{name:'Synthetic',email:'synthetic@example.test'}});
    await admin.insert(schema.institutionUsers).values({id:userId,institutionId,fullName:'Synthetic',email:'synthetic@example.test',status:'active'});
    const [year]=await admin.insert(schema.academicYears).values({institutionId,name:'Synthetic',startDate:'2026-01-01',endDate:'2026-12-31'}).returning();
    const [grade]=await admin.insert(schema.gradeLevels).values({institutionId,name:'Synthetic'}).returning();
    await admin.insert(schema.classes).values({id:classId,institutionId,academicYearId:year!.id,gradeLevelId:grade!.id,name:'Synthetic'});
    await admin.insert(schema.subjects).values({id:subjectId,institutionId,name:'Synthetic source subject',code:'SYN'});
    await admin.insert(schema.students).values({id:studentId,institutionId,classId,admissionNo:randomUUID(),firstName:'Synthetic',lastName:'Only'});
  });
  afterAll(async()=>{await fixture?.close();});
  afterEach(()=>vi.restoreAllMocks());

  async function setup() {
    const courseId=randomUUID(),assignmentId=randomUUID(),sessionId=randomUUID(),sourceId=randomUUID();
    await admin.insert(schema.courses).values({id:courseId,institutionId,subjectId,code:randomUUID(),name:'Synthetic'});
    await admin.insert(schema.courseEnrollments).values({institutionId,courseId,studentId});
    await admin.insert(schema.assignments).values({id:assignmentId,institutionId,classId,courseId,subjectId,title:'Synthetic',
      status:'published',aiPolicy:'full',audience:[{kind:'student',refId:studentId}]});
    await admin.insert(schema.assignmentAssignees).values({assignmentId,studentId});
    await admin.insert(schema.knowledgeItems).values({id:sourceId,institutionId,studentId,kind:'pdf',title:'Synthetic'});
    await admin.insert(schema.petrosLearningSessions).values({id:sessionId,institutionId,studentId,clientRequestId:randomUUID(),
      stateVersion:'petros.session-state.v3',sessionType:'learn',topic:'Synthetic',currentGoal:'Synthetic',timeBudgetSeconds:600,
      maxMoves:5,checkpoints:[],currentCheckpointId:'synthetic',promptVersion:'synthetic',outputSchemaVersion:'synthetic',
      sourceContext:{door:'uploaded_document',referenceId:sourceId,sourceFingerprint:phase2PackCandidate.sourceVersion,
        citations:[{page:1}],assignmentContext:{assignmentId}}});
    const candidate={...structuredClone(phase2PackCandidate),subject:subjectId};
    const authority={...structuredClone(phase2PackReviewReceipt.reviewer.authoritySnapshot),institutionId,subjectKey:subjectId};
    const receipt={...structuredClone(phase2PackReviewReceipt),institutionId,courseId,reviewedCandidate:candidate,
      reviewer:{...phase2PackReviewReceipt.reviewer,qualification:{...phase2PackReviewReceipt.reviewer.qualification,subject:subjectId},
        authoritySnapshot:authority}};
    const policy={schemaVersion:'petros.knowledge-policy.v1',mode:'source_bound',requestedMode:'source_bound',policyVersionIds:[],
      authorityHash:'1'.repeat(64),sourceId,sourceFingerprint:candidate.sourceVersion,pages:[1],subjectId,maximumDepth:2,
      assignmentRestrictions:[{id:assignmentId,version:0,aiPolicy:'full'}],retrieval:{designatedSource:true,external:false},
      authority:'designated_material_with_institution_restrictions',explanation:'Synthetic adapter'};
    const packs={requireApprovedPackForReview:vi.fn(async()=>({candidate,trustedContext:phase2PackTrustedContext,
      reviewReceipt:receipt,candidateId:receipt.candidateId,payloadHash:receipt.payloadHash}))};
    const policies={documentKnowledgePolicy:vi.fn(async()=>policy)};
    const auth={resolveById:vi.fn(async()=>principal)};
    const env={PETROS_ASSIGNMENT_LEARNING_ENABLED:true};
    const service=new PetrosAssignmentLearningService(fixture.db,env as never,fixture.auditWriter,auth as never,packs as never,policies as never);
    const input={schemaVersion:'petros.assignment-learning-release.v1',expectedAssignmentVersion:0,
      target:{kind:'objective',courseId,source:{sessionId,sourceVersion:candidate.sourceVersion,locators:[phase2PackTrustedContext.resolvedAnchors[0].locator]},
        objective:candidate.objective,curriculumRevision:1,pack:candidate.pack},
      policy:{assistance:'guided_learning',resourceMode:'source_bound',answerDisclosure:'never',evidenceRequirement:'unseen_transfer'},
      recipientContexts:[{studentId,sessionId}]};
    const counts=async()=>({
      releases:(await admin.select().from(schema.petrosAssignmentLearningReleases).where(eq(schema.petrosAssignmentLearningReleases.assignmentId,assignmentId))).length,
      targets:(await admin.select().from(schema.petrosAssignmentLearningTargets).where(eq(schema.petrosAssignmentLearningTargets.target, input.target as never))).length,
      audits:(await admin.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId,assignmentId))).length,
    });
    return {service,input,assignmentId,sessionId,courseId,policy,env,auth,packs,policies,counts};
  }

  it('atomically publishes target, recipient, receipt, outbox and audit; replays simultaneous lost replies',async()=>{
    const f=await setup();
    const candidate=await f.service.preview(ctx,f.assignmentId,f.input);
    const command={schemaVersion:f.input.schemaVersion,commandId:randomUUID(),candidate};
    const responses=await Promise.all([f.service.commit(ctx,f.assignmentId,command),f.service.commit(ctx,f.assignmentId,command)]);
    expect(responses.map(r=>r.replayed).sort()).toEqual([false,true]);
    expect(responses[0]!.releaseId).toBe(responses[1]!.releaseId);
    expect(await f.counts()).toMatchObject({releases:1,audits:1});
    for (const table of [schema.petrosAssignmentLearningTargets,schema.petrosAssignmentLearningRecipients,
      schema.petrosAssignmentLearningReceipts,schema.petrosAssignmentLearningOutbox]) {
      expect(await admin.select().from(table).where(eq(table.releaseId,responses[0]!.releaseId))).toHaveLength(1);
    }
    const changed={...command,candidate:{...candidate,evidenceSnapshot:{...candidate.evidenceSnapshot,requirement:'participation'}}};
    await expect(f.service.commit(ctx,f.assignmentId,changed)).rejects.toThrow();
    expect((await admin.select().from(schema.assignments).where(eq(schema.assignments.id,f.assignmentId)))[0]).toMatchObject({version:0,status:'published',aiPolicy:'full'});
    const context=await runInStudentTenant(fixture.db,{institutionId,studentId},()=>
      new PetrosInstitutionalRepository(fixture.db).documentKnowledgeContext({institutionId,studentId},f.sessionId));
    expect(context).toMatchObject({missingBinding:false,learning:{assignmentId:f.assignmentId,assignmentVersion:0}});
    await admin.delete(schema.courseEnrollments).where(eq(schema.courseEnrollments.courseId,f.courseId));
    const revoked=await runInStudentTenant(fixture.db,{institutionId,studentId},()=>
      new PetrosInstitutionalRepository(fixture.db).documentKnowledgeContext({institutionId,studentId},f.sessionId));
    expect(revoked?.missingBinding).toBe(true);
    await expect(f.service.commit(ctx,f.assignmentId,command)).rejects.toThrow();
  });

  it('rolls back every publication write if audit fails and allows exact retry',async()=>{
    const f=await setup();const candidate=await f.service.preview(ctx,f.assignmentId,f.input);
    const command={schemaVersion:f.input.schemaVersion,commandId:randomUUID(),candidate};
    const failure=vi.spyOn(fixture.auditWriter,'logAudit').mockRejectedValueOnce(new Error('synthetic audit failure'));
    await expect(f.service.commit(ctx,f.assignmentId,command)).rejects.toThrow('synthetic audit failure');
    expect(await f.counts()).toMatchObject({releases:0,targets:0,audits:0});
    failure.mockRestore();expect(await f.service.commit(ctx,f.assignmentId,command)).toMatchObject({replayed:false});
  });

  it('rejects stale preview and current permission, source and assignment restrictions before writes',async()=>{
    const f=await setup();const candidate=await f.service.preview(ctx,f.assignmentId,f.input);
    const command={schemaVersion:f.input.schemaVersion,commandId:randomUUID(),candidate};
    f.auth.resolveById.mockResolvedValueOnce({...principal,permissions:{keys:new Set(),hasWildcard:false}});
    await expect(f.service.commit(ctx,f.assignmentId,command)).rejects.toThrow();
    f.packs.requireApprovedPackForReview.mockRejectedValueOnce(new Error('synthetic stale source'));
    await expect(f.service.commit(ctx,f.assignmentId,command)).rejects.toThrow('synthetic stale source');
    f.policy.authorityHash='2'.repeat(64);
    await expect(f.service.commit(ctx,f.assignmentId,command)).rejects.toThrow();
    await admin.update(schema.assignments).set({aiPolicy:'hints_only',version:1}).where(eq(schema.assignments.id,f.assignmentId));
    await expect(f.service.preview(ctx,f.assignmentId,{...f.input,expectedAssignmentVersion:1})).rejects.toThrow();
    expect(await f.counts()).toMatchObject({releases:0,audits:0});
  });

  it('keeps full publication payloads teacher-only and immutable, with only the owner binding readable by a student',async()=>{
    const f=await setup();const candidate=await f.service.preview(ctx,f.assignmentId,f.input);
    const response=await f.service.commit(ctx,f.assignmentId,{schemaVersion:f.input.schemaVersion,commandId:randomUUID(),candidate});
    await runInStudentTenant(fixture.db,{institutionId,studentId},async()=>{
      expect(await fixture.db.select().from(schema.petrosAssignmentLearningReleases)).toEqual([]);
      expect(await fixture.db.select().from(schema.petrosAssignmentLearningTargets)).toEqual([]);
      const rows=await fixture.db.select().from(schema.petrosAssignmentLearningRecipients)
        .where(eq(schema.petrosAssignmentLearningRecipients.releaseId,response.releaseId));
      expect(rows).toHaveLength(1);expect(JSON.stringify(rows)).not.toContain('answerKey');
    });
    expect(await runInStudentTenant(fixture.db,{institutionId,studentId:randomUUID()},()=>
      fixture.db.select().from(schema.petrosAssignmentLearningRecipients))).toEqual([]);
    await expect(runInInstitutionTenant(fixture.db,institutionId,()=>fixture.db.delete(schema.petrosAssignmentLearningTargets)
      .where(eq(schema.petrosAssignmentLearningTargets.releaseId,response.releaseId)))).rejects.toThrow();
    await expect(admin.update(schema.petrosAssignmentLearningOutbox).set({payload:{tampered:true}})
      .where(eq(schema.petrosAssignmentLearningOutbox.releaseId,response.releaseId))).rejects.toThrow('outbox identity is immutable');
    f.env.PETROS_ASSIGNMENT_LEARNING_ENABLED=false;
    await expect(async()=>f.service.preview(ctx,f.assignmentId,f.input)).rejects.toThrow();
  });
});
