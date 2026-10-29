import { petrosVerificationOutput } from './petros-verification-output';
/** Synthetic academic authority, actual restricted App-role SQL. No real publication, sessions or assessment execution. */
import { describe,it,beforeAll,afterAll,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { eq,and,schema,runInScopedTenant,sql } from '@edrion/database';
import { startM3Fixture,type M3Fixture } from './petros-m3-fixture';
import type { M3Proposal } from '@edrion/schemas';
import { M3_PRIVATE_CANDIDATE_VERSION } from '../student/knowledge/petros-assessment-contract.server';
const sentinel='M3_PRIVATE_CRITERIA_SENTINEL_7829';
describe.runIf(process.env.PETROS_M3_DB_TESTS==='1')('M3 private preparation and independent qualified instrument review',{timeout:60000},()=>{
 let f:M3Fixture,file:Awaited<ReturnType<M3Fixture['document']>>,p:M3Proposal,authorQ:string,reviewQ:string;
 let taskId:string,privateVersion:number,reviewInput:Record<string,unknown>,releaseCommand:string;
 beforeAll(async()=>{f=await startM3Fixture();file=await f.document('m3/private-review-source.txt','cloud');
  p=(await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects.cloud,{commandId:randomUUID(),sourceRevisionId:file.revision.id}))).proposal;
  p=(await f.run(ctx=>f.service.edit(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version,change:{kind:'submit_review'}}))).proposal;
  taskId=p.taskCandidates.find(t=>t.kind==='held_out_verification')!.id;
 },120000);
 afterAll(async()=>{await f?.f.close();});
 const context=(actor:string)=>({institutionId:f.institutionId,institutionUserId:actor,sourceItemId:file.id,courseId:f.courses.cloud});
 const draft=(id=taskId,extra={})=>f.run(ctx=>f.service.prepareVerification(ctx,f.classId,p.subjectId,p.id,id,{commandId:randomUUID(),expectedVersion:p.version,expectedFamilyVersion:0,...extra}));
 const review=(extra={})=>f.runReviewer(ctx=>f.service.review(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version,qualificationId:reviewQ,qualificationVersion:1,dimension:'assessment_instrument',decision:'approved',reason:'Synthetic independent review only.',taskFamilyId:taskId,taskFamilyVersion:privateVersion,nonEquivalenceDecision:'distinct',...extra}));
 it('reserves real extracted evidence before teaching construction and denies unqualified inspection/preparation',async()=>{
  expect(p.source.references).toHaveLength(3);await expect(draft()).rejects.toMatchObject({status:403});
  await expect(f.run(ctx=>f.service.verificationPreview(ctx,f.classId,p.subjectId,p.id,taskId))).rejects.toMatchObject({status:403});
  const hidden=(await f.f.adminSql`select id from petros_content_units where source_revision_id=${file.revision.id} order by ordinal desc limit 1`)[0]!.id;
  expect(p.source.references.some(r=>r.unitId===hidden)).toBe(false);
  await expect(f.run(ctx=>f.service.evidence(ctx,f.classId,p.subjectId,p.id,String(hidden)))).rejects.toThrow();
 });
 it('qualified private draft is immutable, source-pinned and idempotent with real private sentinel',async()=>{
  authorQ=await f.qualification('cloud');reviewQ=await f.qualification('cloud','active',undefined,true);
  const input={commandId:randomUUID(),expectedVersion:p.version,expectedFamilyVersion:0,criteriaTexts:[sentinel,'PRIVATE_FRAGMENT_ALPHA_SENTINEL','ZKQKEY','Preserve defensible alternatives.']};
  const a=await f.run(ctx=>f.service.prepareVerification(ctx,f.classId,p.subjectId,p.id,taskId,input));
  const b=await f.run(ctx=>f.service.prepareVerification(ctx,f.classId,p.subjectId,p.id,taskId,input));
  expect(a.family).toEqual(b.family);privateVersion=a.family.version;expect(JSON.stringify(a)).toContain(sentinel);
  const [row]=await f.admin.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,taskId));
  for(const task of p.taskCandidates.filter(t=>t.kind!=='formative_practice'&&t.id!==taskId))await draft(task.id);
  expect(row!.schemaVersion).toBe(M3_PRIVATE_CANDIDATE_VERSION);expect(row!.sourceRevisionId).toBe(p.source.revisionId);
  await expect(runInScopedTenant(f.f.db,context(f.teacher),()=>f.f.db.update(schema.petrosTeachingPackCandidates).set({payloadHash:'a'.repeat(64)}).where(eq(schema.petrosTeachingPackCandidates.id,row!.id)))).rejects.toThrow();
 });
 it('ordinary proposal DTO, source preview and safe SQL projection never expose private body or hashes',async()=>{
  const v=await f.run(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id));expect(v.instrumentFamilies).toHaveLength(p.taskCandidates.filter(t=>t.kind!=='formative_practice').length);
  const [row]=await f.admin.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,taskId));
  expect(JSON.stringify(v)).not.toContain(sentinel);expect(JSON.stringify(v)).not.toContain(row!.payloadHash);
  const publicSql=await runInScopedTenant(f.f.db,context(f.teacher),()=>f.f.db.execute(sql`select * from m3_private_public_status(${f.institutionId}::uuid,${p.id}::uuid,${p.version}::integer)`));
  expect(JSON.stringify(publicSql)).not.toContain(sentinel);expect(JSON.stringify(publicSql)).not.toContain(row!.payloadHash);
 });
 it('restricted database rejects copying private criteria into a teaching edit atomically',async()=>{
  for(const wording of ['PRIVATE_FRAGMENT_ALPHA_SENTINEL','This practice explains ZKQKEY as its reference criterion.'])
   await expect(f.run(ctx=>f.service.edit(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version,
    change:{kind:'objective',objectiveId:p.objectives[0]!.id,wording}}))).rejects.toThrow('PRIVATE_CONTENT_IN_TEACHING');
  expect((await f.run(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id))).proposal.version).toBe(p.version);
 });
 it('private payload writes reject stale family versions, model approval and unsupported answer corrections',async()=>{
  await expect(draft()).rejects.toMatchObject({status:409,response:{code:'M3_INSTRUMENT_REVISION_CONFLICT'}});
  await expect(draft(taskId,{expectedFamilyVersion:privateVersion,approved:true})).rejects.toThrow();
  await expect(draft(taskId,{expectedFamilyVersion:privateVersion,referenceText:'The passage prescribes 99999 official points.'})).rejects.toThrow();
 });
 it('public teaching candidate cannot substitute for a private family and self approval is denied',async()=>{
  await expect(f.run(ctx=>f.service.review(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version,qualificationId:authorQ,qualificationVersion:1,dimension:'assessment_instrument',decision:'approved',reason:'Self approval forbidden.',taskFamilyId:taskId,taskFamilyVersion:privateVersion,nonEquivalenceDecision:'distinct'}))).rejects.toMatchObject({status:403});
  await expect(draft(p.taskCandidates.find(t=>t.kind==='formative_practice')!.id)).rejects.toMatchObject({status:404,response:{code:'M3_VERIFICATION_CANDIDATE_UNAVAILABLE'}});
 });
 it('non-owner qualified reviewer cannot inspect private materials or gain source access',async()=>{
  await expect(f.runReviewer(ctx=>f.service.verificationPreview(ctx,f.classId,p.subjectId,p.id,taskId))).rejects.toThrow();
  const rows=await runInScopedTenant(f.f.db,context(f.reviewer),()=>f.f.db.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,taskId)));expect(rows).toEqual([]);
 });
 it('cross-tenant and student SQL cannot see private families or status',async()=>{
  for(const scope of [{...context(f.teacher),institutionId:f.foreign},{...context(f.studentUser),studentId:f.student}]) {
   const rows=await runInScopedTenant(f.f.db,scope,()=>f.f.db.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,taskId)));expect(rows).toEqual([]);
   const status=await runInScopedTenant(f.f.db,scope,()=>f.f.db.execute(sql`select * from m3_private_public_status(${f.institutionId}::uuid,${p.id}::uuid,${p.version}::integer)`));expect(status).toEqual([]);
  }
 });
 it('isolated ownership handoff permits qualified inspection without merging scope and instrument decisions',async()=>{
  await f.admin.update(schema.storageObjects).set({ownerStaffUserId:f.reviewer}).where(eq(schema.storageObjects.id,file.objectId));
  await f.admin.update(schema.classSubjectTeachers).set({teacherId:f.reviewerStaff}).where(eq(schema.classSubjectTeachers.subjectId,p.subjectId));
  const preview=await f.runReviewer(ctx=>f.service.verificationPreview(ctx,f.classId,p.subjectId,p.id,taskId));expect(JSON.stringify(preview)).toContain(sentinel);
  for(const dimension of ['teaching_scope','concepts','activities'])await f.runReviewer(ctx=>f.service.review(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version,qualificationId:reviewQ,qualificationVersion:1,dimension,decision:'approved',reason:'Synthetic literal-source independent scope review.'}));
  const status=await f.runReviewer(ctx=>f.service.readiness(ctx,f.classId,p.subjectId,p.id));expect(status.review.teaching_scope!.status).toBe('approved');expect(status.review.assessment_instrument!.status).toBe('verification_pending');
 });
 it('uncertain equivalence, wrong proposal/family versions and forged qualification are denied',async()=>{
  for(const nonEquivalenceDecision of ['uncertain','equivalent'])await expect(review({nonEquivalenceDecision})).rejects.toMatchObject({status:409,response:{code:'M3_TASK_FAMILY_EQUIVALENCE_REQUIRED'}});
  await expect(review({expectedVersion:p.version-1})).rejects.toMatchObject({status:409,response:{code:'M3_REVISION_CONFLICT'}});
  await expect(review({taskFamilyVersion:privateVersion+1})).rejects.toMatchObject({status:409,response:{code:'M3_INSTRUMENT_REVISION_CONFLICT'}});
  await expect(review({qualificationId:authorQ})).rejects.toThrow();
 });
 it('private instrument corrections persist as non-approval without changing review authority',async()=>{
  const input={commandId:randomUUID(),decision:'revision_requested',nonEquivalenceDecision:'uncertain'};
  const a=await review(input),b=await review(input);expect(a.receipt.id).toBe(b.receipt.id);
  expect(a.receipt).toMatchObject({decision:'revision_requested',taskFamily:{id:taskId,version:privateVersion}});
  const [stored]=await f.admin.select().from(schema.petrosTeachingPackReviews).where(eq(schema.petrosTeachingPackReviews.id,a.receipt.id));
  expect(stored!.decision).toBe('rejected');
  const current=await f.runReviewer(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id));
  expect(current.instrumentFamilies.find(i=>i.id===taskId)!.status).toBe('rejected');
  expect(current.readiness.studentPublication).toBe('blocked');
  expect(current.review.assessment_instrument!.status).toBe('verification_pending');
  expect((await f.f.adminSql`select count(*)::int n from petros_question_specs`)[0]!.n).toBe(0);
 });
 it('independent qualified decision pins exact private family and repeats idempotently',async()=>{
  reviewInput={commandId:randomUUID()};const a=await review(reviewInput),b=await review(reviewInput);expect(a.receipt.id).toBe(b.receipt.id);
  expect(a.receipt.taskFamily).toMatchObject({id:taskId,version:privateVersion});expect(a.receipt.nonEquivalenceDecision).toBe('distinct');
  const view=await f.runReviewer(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id));expect(view.instrumentFamilies.find(i=>i.id===taskId)!.status).toBe('approved');
  expect(JSON.stringify(view)).not.toContain(sentinel);expect(JSON.stringify(view)).not.toContain(a.receipt.taskFamily!.hash);
  expect(view.review.assessment_instrument!.status).toBe('verification_pending');
  for(const task of p.taskCandidates.filter(t=>t.kind!=='formative_practice'&&t.id!==taskId))await review({taskFamilyId:task.id,taskFamilyVersion:1});
  expect((await f.runReviewer(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id))).review.assessment_instrument!.status).toBe('approved');
 });
 it('restricted SQL rejects an assessment receipt with a fabricated private body hash',async()=>{
  const [publicCandidate]=await f.admin.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,p.id));
  const rows=await f.admin.select().from(schema.petrosTeachingPackReviews).where(eq(schema.petrosTeachingPackReviews.candidateId,publicCandidate!.id));
  const previous=rows.find(r=>(r.receipt as {dimension?:string}).dimension==='assessment_instrument')!;
  await expect(runInScopedTenant(f.f.db,context(f.reviewer),()=>f.f.db.insert(schema.petrosTeachingPackReviews).values({...previous,id:randomUUID(),commandId:randomUUID(),reviewVersion:100,
   receipt:{...previous.receipt,taskFamily:{id:taskId,version:privateVersion,hash:'a'.repeat(64)}} as never}))).rejects.toThrow();
 });
 it('isolated release records only current opaque family references and no student task',async()=>{
  releaseCommand=randomUUID();const result=await f.runReviewer(ctx=>f.service.release(ctx,f.classId,p.subjectId,p.id,{commandId:releaseCommand,expectedVersion:p.version}));expect(result.isolatedAuthorizationPath).toBe(true);
  const refreshed=await f.runReviewer(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id));expect(refreshed.manifest).toMatchObject({id:result.id,currentChecksRequired:true,studentPublication:'not_enabled'});
  const [manifest]=await f.admin.select().from(schema.courseCurriculumRecords).where(and(eq(schema.courseCurriculumRecords.recordId,p.id),eq(schema.courseCurriculumRecords.kind,'petros_v2_release')));
  expect(manifest!.content.instrumentRefs).toEqual(expect.arrayContaining([expect.objectContaining({id:taskId,version:privateVersion})]));expect(JSON.stringify(manifest)).not.toContain(sentinel);
  expect((await f.f.adminSql`select count(*)::int n from petros_question_specs`)[0]!.n).toBe(0);
  writeFileSync(petrosVerificationOutput('docs/verification/petros-v2/m3-evidence/private-authorization-path.json'),JSON.stringify({label:'Isolated synthetic qualified authorization-path test; no actual academic approval or student publication',sourceRevision:p.source.revisionId,publicProposalVersion:p.version,reviewedPrivateFamilies:p.taskCandidates.filter(t=>t.kind!=='formative_practice').length,manifestId:result.id,studentTasks:0,privateBodyInPublicManifest:false,teachingAndInstrumentReviewsSeparate:true},null,2));
 });
 it('private revision invalidates prior review and release replay, while preserving history',async()=>{
  await f.admin.update(schema.storageObjects).set({ownerStaffUserId:f.teacher}).where(eq(schema.storageObjects.id,file.objectId));
  await f.admin.update(schema.classSubjectTeachers).set({teacherId:f.staffId}).where(eq(schema.classSubjectTeachers.subjectId,p.subjectId));
  const updated=await draft(taskId,{expectedFamilyVersion:privateVersion,questionText:'Identify defensible observable work under the reserved passage conditions and state an alternative interpretation.'});privateVersion=updated.family.version;
  await f.admin.update(schema.storageObjects).set({ownerStaffUserId:f.reviewer}).where(eq(schema.storageObjects.id,file.objectId));
  await f.admin.update(schema.classSubjectTeachers).set({teacherId:f.reviewerStaff}).where(eq(schema.classSubjectTeachers.subjectId,p.subjectId));
  expect((await f.runReviewer(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id))).instrumentFamilies.find(i=>i.id===taskId)!.status).toBe('qualified_review_required');
  await expect(review({...reviewInput,taskFamilyVersion:privateVersion-1})).rejects.toMatchObject({status:409,response:{code:'M3_INSTRUMENT_REVISION_CONFLICT'}});
  await expect(f.runReviewer(ctx=>f.service.release(ctx,f.classId,p.subjectId,p.id,{commandId:releaseCommand,expectedVersion:p.version}))).rejects.toMatchObject({status:409,response:{code:'M3_RELEASE_RETRY_CONFLICT'}});
  expect(await f.admin.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,taskId))).toHaveLength(2);
 });
 it('revoked qualification blocks private API, direct SQL and review retry',async()=>{
  const [q]=await f.admin.select().from(schema.petrosReviewerQualifications).where(eq(schema.petrosReviewerQualifications.id,reviewQ));
  await f.admin.insert(schema.petrosReviewerQualifications).values({...q!,rowId:randomUUID(),version:2,status:'revoked'});
  await expect(f.runReviewer(ctx=>f.service.verificationPreview(ctx,f.classId,p.subjectId,p.id,taskId))).rejects.toMatchObject({status:403});
  await expect(review()).rejects.toThrow();
  const rows=await runInScopedTenant(f.f.db,context(f.reviewer),()=>f.f.db.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,taskId)));expect(rows).toEqual([]);
 });
 it('public edit invalidates private context and source withdrawal removes both inspection and status',async()=>{
  p=(await f.runReviewer(ctx=>f.service.edit(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version,change:{kind:'objective',objectiveId:p.objectives[0]!.id,wording:'Identify a bounded observation and its exact conditions.'}}))).proposal;
  expect((await f.runReviewer(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id))).instrumentFamilies).toEqual([]);
  await f.admin.update(schema.classMaterials).set({sourceRevokedAt:new Date()}).where(eq(schema.classMaterials.id,file.id));
  await expect(f.runReviewer(ctx=>f.service.verificationPreview(ctx,f.classId,p.subjectId,p.id,taskId))).rejects.toThrow();
  const status=await runInScopedTenant(f.f.db,context(f.reviewer),()=>f.f.db.execute(sql`select * from m3_private_public_status(${f.institutionId}::uuid,${p.id}::uuid,${p.version}::integer)`));expect(status).toEqual([]);
 });
});
