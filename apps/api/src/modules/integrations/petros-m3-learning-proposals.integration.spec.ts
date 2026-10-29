import { petrosVerificationOutput } from './petros-verification-output';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, schema, runInReadinessScope, runInScopedTenant } from '@edrion/database';
import { startM3Fixture, m3FixtureRoot, type M3Fixture } from './petros-m3-fixture';
import { controlledSourceProposal } from '../portal/teaching/petros-learning-proposal.fixture';
import { type M3Proposal } from '@edrion/schemas';
const out=resolve(petrosVerificationOutput('docs/verification/petros-v2/m3-evidence/marker'),'..');
describe.runIf(process.env.PETROS_M3_DB_TESTS==='1')('M3 disposable actual App-role source/proposal/review authority',()=>{
 let f:M3Fixture,cloud:Awaited<ReturnType<M3Fixture['document']>>,english:typeof cloud;
 let p:M3Proposal,ep:M3Proposal;
 beforeAll(async()=>{f=await startM3Fixture();cloud=await f.document('cloud-models.pptx','cloud');english=await f.document('argument.pdf','argument');},120000);
 afterAll(async()=>{await f?.f.close();});
 const prepare=(domain:'cloud'|'argument',revisionId:string)=>f.run(ctx=>f.service.prepareControlled(ctx,f.classId,f.subjects[domain],{commandId:randomUUID(),sourceRevisionId:revisionId},units=>controlledSourceProposal(units,domain)));
 const edit=(proposal:M3Proposal,change:unknown,expectedVersion=proposal.version,commandId=randomUUID())=>f.run(ctx=>f.service.edit(ctx,f.classId,proposal.subjectId,proposal.id,{commandId,expectedVersion,change}));
 it('consumes actual M2 queued extraction for two materially different subjects',async()=>{p=(await prepare('cloud',cloud.revision.id)).proposal;ep=(await prepare('argument',english.revision.id)).proposal;
  expect(p.objectives[0]!.wording).not.toBe(ep.objectives[0]!.wording);expect(p.generator.origin).toBe('controlled_fixture');
  expect(p.source.originalHash).toBe(cloud.revision.source.originalHash);expect(ep.source.references[0]!.locator.kind).toBe('pdf');
  writeFileSync(resolve(out,'two-subject-proposals.json'),JSON.stringify({cloud:p,english:ep},null,2));});
 it('repeated creation returns one durable proposal and same concept identities',async()=>{const commandId=randomUUID(),input={commandId,sourceRevisionId:english.revision.id};
  const a=await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects.argument,input));const b=await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects.argument,input));expect(a.proposal.id).toBe(b.proposal.id);expect(a.proposal.concepts).toEqual(b.proposal.concepts);});
 for(const name of ['m2fa/cloud-notes.docx','m2fa/cloud-notes.txt','m2fa/argument-notes.md']) it(`persists and cites actual native proposal: ${name}`,async()=>{
  const domain=name.endsWith('.md')?'argument':'cloud',file=await f.document(name,domain),view=await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects[domain],{commandId:randomUUID(),sourceRevisionId:file.revision.id}));
  const e=await f.run(ctx=>f.service.evidence(ctx,f.classId,f.subjects[domain],view.proposal.id,view.proposal.source.references[0]!.unitId));expect(e.text.length).toBeGreaterThan(0);
  expect((e.locator as {kind:string}).kind).toBe(name.endsWith('.docx')?'docx':name.endsWith('.txt')?'txt':'markdown');},30000);
 it('app actor is restricted and no student session, task or evidence is created',async()=>{const [row]=await f.f.appSql`select current_user AS actor`;expect(row?.actor).toBe('edrion_app');
  const [counts]=await f.f.adminSql`select (select count(*) from petros_learning_sessions)::int sessions,(select count(*) from petros_question_specs)::int questions`;expect(counts?.sessions).toBe(0);expect(counts?.questions).toBe(0);});
 it('cross-institution proposal rows and source access are invisible under actual RLS',async()=>{await runInReadinessScope(f.f.db,{institutionId:f.foreign,institutionUserId:f.teacher},async tx=>{
  const rows=await tx.select().from(schema.petrosDocumentPreparations).where(eq(schema.petrosDocumentPreparations.requestedConceptId,p.id));expect(rows).toEqual([]);
  expect((await new (await import('../student/knowledge/petros-content-unit.repository')).PetrosContentUnitRepository(tx).lookup(cloud.revision.id)).status).toBe('unavailable');});});
 it('student cannot read unreleased proposal preparations',async()=>{await runInReadinessScope(f.f.db,{institutionId:f.institutionId,studentId:f.student},async tx=>{
  const rows=await tx.select().from(schema.petrosDocumentPreparations).where(eq(schema.petrosDocumentPreparations.requestedConceptId,p.id));expect(rows).toEqual([]);});});
 it('wrong subject and cross-class proposal lookup are concealed',async()=>{await expect(f.run(ctx=>f.service.view(ctx,f.classId,f.subjects.argument,p.id))).rejects.toThrow();await expect(f.run(ctx=>f.service.view(ctx,randomUUID(),p.subjectId,p.id))).rejects.toThrow();});
 it('immutable original draft cannot be rewritten or deleted by App',async()=>{await expect(f.run(async()=>{await runInScopedTenant(f.f.db,{...f.scope,sourceItemId:cloud.id,courseId:f.courses.cloud},()=>f.f.db.update(schema.petrosDocumentPreparations).set({message:'rewritten'}).where(eq(schema.petrosDocumentPreparations.requestedConceptId,p.id)));})).rejects.toThrow('IMMUTABLE');});
 it('source evidence is actual and held-out/unreferenced unit access is denied',async()=>{const e=await f.run(ctx=>f.service.evidence(ctx,f.classId,p.subjectId,p.id,p.source.references[0]!.unitId));expect(e.text.length).toBeGreaterThan(0);await expect(f.run(ctx=>f.service.evidence(ctx,f.classId,p.subjectId,p.id,randomUUID()))).rejects.toThrow();});
 it('durable correction preserves original and clears review/release references',async()=>{const original=p.objectives[0]!.wording;p=(await edit(p,{kind:'objective',objectiveId:p.objectives[0]!.id,wording:'Classify the stated responsibilities and justify the selected source boundary.'})).proposal;
  expect(p.version).toBe(2);expect(p.reviewRefs).toEqual([]);const old=await f.run(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id,1));expect(old.proposal.objectives[0]!.wording).toBe(original);});
 it('stale edit rejected and repeated save is idempotent',async()=>{await expect(edit(p,{kind:'save'},1)).rejects.toThrow('REVISION_CONFLICT');const commandId=randomUUID(),old=p;
  p=(await edit(old,{kind:'save'},old.version,commandId)).proposal;const replay=await edit(old,{kind:'save'},old.version,commandId);expect(replay.proposal.version).toBe(p.version);});
 it('concurrent teacher saves admit exactly one next version',async()=>{const results=await Promise.allSettled([edit(p,{kind:'save'}),edit(p,{kind:'save'})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  p=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<{proposal:M3Proposal}>).value.proposal;});
 it('unqualified staff cannot approve teaching or assessment',async()=>{ep=(await edit(ep,{kind:'submit_review'})).proposal;
  const current=await f.run(ctx=>f.service.view(ctx,f.classId,ep.subjectId,ep.id));expect(current.reviewEligibility.items).toEqual([]);
  for(const dimension of ['teaching_scope','assessment_instrument'])await expect(f.run(ctx=>f.service.review(ctx,f.classId,ep.subjectId,ep.id,{commandId:randomUUID(),expectedVersion:ep.version,qualificationId:randomUUID(),qualificationVersion:1,dimension,decision:'approved',reason:'Synthetic review attempt'}))).rejects.toMatchObject({status:403});});
 for(const status of ['expired','revoked','cross_subject'])it(`denies ${status} reviewer qualification`,async()=>{const q=await f.qualification(status==='cross_subject'?'cloud':'argument',status==='revoked'?'revoked':'active',status==='expired'?new Date(Date.now()-1000):undefined);
  await expect(f.run(ctx=>f.service.review(ctx,f.classId,ep.subjectId,ep.id,{commandId:randomUUID(),expectedVersion:ep.version,qualificationId:q,qualificationVersion:1,dimension:'teaching_scope',decision:'approved',reason:'Isolated qualification check'}))).rejects.toThrow();});
 it('missing canonical course blocks scoped release',async()=>{const file=await f.document('m2fa/cloud-notes.txt','cloud','class'),view=await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects.cloud,{commandId:randomUUID(),sourceRevisionId:file.revision.id}));expect(view.proposal.courseId).toBeNull();expect(view.readiness.blockers).toContain('CANONICAL_COURSE_MAPPING_REQUIRED');});
 it('partial-source cloud release stays blocked',async()=>{await expect(f.run(ctx=>f.service.release(ctx,f.classId,p.subjectId,p.id,{commandId:randomUUID(),expectedVersion:p.version}))).rejects.toMatchObject({status:409,response:{code:'M3_RELEASE_BLOCKED'}});});
 it('disabled staff account denies current source and proposal operations',async()=>{await f.admin.update(schema.institutionUsers).set({disabledAt:new Date()}).where(eq(schema.institutionUsers.id,f.teacher));await expect(f.run(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id))).rejects.toThrow();await f.admin.update(schema.institutionUsers).set({disabledAt:null}).where(eq(schema.institutionUsers.id,f.teacher));});
 it('provider request default denied through staff service',async()=>{await expect(f.run(ctx=>f.service.prepare(ctx,f.classId,p.subjectId,{commandId:randomUUID(),sourceRevisionId:cloud.revision.id,origin:'gateway'}))).rejects.toMatchObject({status:503,response:{code:'M3_PROVIDER_AUTHORIZATION_UNAVAILABLE'}});});
 it('failed transaction rolls back draft/concept writes',async()=>{const commandId=randomUUID();await expect(f.run(async ctx=>{await f.service.prepare(ctx,f.classId,p.subjectId,{commandId,sourceRevisionId:cloud.revision.id});throw new Error('injected rollback');})).rejects.toThrow('rollback');
  const rows=await f.f.adminSql`select id from petros_document_preparations where request_context->>'commandId'=${commandId}`;expect(rows).toHaveLength(0);});
 it('current course enrollment changes invalidate existing mapping',async()=>{await f.admin.delete(schema.courseEnrollments).where(eq(schema.courseEnrollments.studentId,f.other));const state=await f.run(ctx=>f.service.readiness(ctx,f.classId,p.subjectId,p.id));expect(state.blockers).toContain('CANONICAL_COURSE_MAPPING_REQUIRED');
  await f.admin.insert(schema.courseEnrollments).values(['cloud','argument'].map(d=>({institutionId:f.institutionId,studentId:f.other,courseId:f.courses[d as 'cloud'|'argument']})));});
 it('synthetic qualified teaching-scope path is separate from instrument and student publication',async()=>{
  const file=await f.document('m3/qualified-scope.txt','cloud');let draft=(await f.run(ctx=>f.service.prepare(ctx,f.classId,f.subjects.cloud,{commandId:randomUUID(),sourceRevisionId:file.revision.id}))).proposal;
  draft=(await edit(draft,{kind:'submit_review'})).proposal;const qualificationId=await f.qualification('cloud','active',undefined,true);
  const selfQualification=await f.qualification('cloud');
  await expect(f.run(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,{commandId:randomUUID(),expectedVersion:draft.version,qualificationId:selfQualification,qualificationVersion:1,dimension:'teaching_scope',decision:'approved',reason:'Synthetic self approval must be denied.'}))).rejects.toMatchObject({status:403,response:{code:'PETROS_PACK_SELF_APPROVAL_DENIED'}});
  // Current source policy grants write/review access only to its staff owner. Preserve that restriction.
  await expect(f.runReviewer(ctx=>f.service.view(ctx,f.classId,draft.subjectId,draft.id))).rejects.toThrow();
  // Synthetic institutional ownership/teaching handoff creates a lawful independent current owner, never a real grant.
  await f.admin.update(schema.storageObjects).set({ownerStaffUserId:f.reviewer}).where(eq(schema.storageObjects.id,file.objectId));
  await f.admin.update(schema.classSubjectTeachers).set({teacherId:f.reviewerStaff}).where(eq(schema.classSubjectTeachers.subjectId,draft.subjectId));
  const reviewerView=await f.runReviewer(ctx=>f.service.view(ctx,f.classId,draft.subjectId,draft.id));
  expect(reviewerView.reviewEligibility.items.map(q=>q.id)).toContain(qualificationId);
  for(const dimension of ['teaching_scope','concepts','activities']) {
   const input={commandId:randomUUID(),expectedVersion:draft.version,qualificationId,qualificationVersion:1,dimension,
    decision:'revision_requested',reason:'Synthetic independent review requests source-supported corrections.'};
   const requested=await f.runReviewer(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,input));
   const replay=await f.runReviewer(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,input));
   expect(replay.receipt.id).toBe(requested.receipt.id);
   expect(requested.receipt.decision).toBe('revision_requested');
   expect(requested.review[dimension]?.status).toBe('revision_requested');
   expect(requested.proposal.state).toBe('under_review');
   const [stored]=await f.admin.select().from(schema.petrosTeachingPackReviews).where(eq(schema.petrosTeachingPackReviews.id,requested.receipt.id));
   expect(stored!.decision).toBe('rejected');
   expect(stored!.receipt).toMatchObject({decision:'revision_requested'});
   expect(requested.readiness.eligible).toBe(false);
   await expect(f.runReviewer(ctx=>f.service.release(ctx,f.classId,draft.subjectId,draft.id,{commandId:randomUUID(),expectedVersion:draft.version}))).rejects.toMatchObject({status:409});
  }
  let teachingReviewCommand:Parameters<typeof f.service.review>[4];
  for(const dimension of ['teaching_scope','concepts','activities']) {
   if(process.env.PETROS_M3_TRACE) console.log('M3 review starting',dimension,Date.now());
   const commandId=randomUUID(),input={commandId,expectedVersion:draft.version,qualificationId,qualificationVersion:1,dimension,decision:'approved',reason:'Isolated synthetic qualification validates this exact literal source organization.'};
   if(dimension==='teaching_scope')teachingReviewCommand=input;
   const a=await f.runReviewer(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,input));if(process.env.PETROS_M3_TRACE) console.log('M3 review done',dimension,Date.now());const b=await f.runReviewer(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,input));expect(a.receipt.id).toBe(b.receipt.id);
  }
  const state=await f.runReviewer(ctx=>f.service.readiness(ctx,f.classId,draft.subjectId,draft.id));if(process.env.PETROS_M3_TRACE) console.log('M3 readiness',JSON.stringify(state));expect(state.eligible).toBe(true);expect(state.studentPublication).toBe('blocked');
  const commandId=randomUUID(),receipt=await f.runReviewer(ctx=>f.service.release(ctx,f.classId,draft.subjectId,draft.id,{commandId,expectedVersion:draft.version}));
  const replay=await f.runReviewer(ctx=>f.service.release(ctx,f.classId,draft.subjectId,draft.id,{commandId,expectedVersion:draft.version}));expect(receipt.id).toBe(replay.id);expect(replay.replayed).toBe(true);
  const recorded=await f.admin.select().from(schema.courseCurriculumRecords).where(eq(schema.courseCurriculumRecords.recordId,draft.id));expect(recorded).toHaveLength(4);
  const studentRecords=await runInScopedTenant(f.f.db,{institutionId:f.institutionId,institutionUserId:f.studentUser,studentId:f.student,
    sourceItemId:file.id,courseId:f.courses.cloud},()=>f.f.db.select().from(schema.courseCurriculumRecords).where(eq(schema.courseCurriculumRecords.recordId,draft.id)));
  expect(studentRecords).toEqual([]);
  await expect(f.runReviewer(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,{commandId:randomUUID(),expectedVersion:draft.version,qualificationId,qualificationVersion:1,dimension:'assessment_instrument',decision:'approved',reason:'Synthetic task metadata is not a qualified instrument.'}))).rejects.toMatchObject({status:409,response:{code:'M3_QUALIFIED_INSTRUMENT_CONTRACT_REQUIRED'}});
  if(process.env.PETROS_M3_TRACE) console.log('M3 negative SQL checks');
  const [candidate]=await f.admin.select().from(schema.petrosTeachingPackCandidates).where(eq(schema.petrosTeachingPackCandidates.packId,draft.id));
  const reviewRows=await f.admin.select().from(schema.petrosTeachingPackReviews).where(eq(schema.petrosTeachingPackReviews.candidateId,candidate!.id));
  const previous=reviewRows[0]!;
  await expect(runInScopedTenant(f.f.db,{institutionId:f.institutionId,institutionUserId:f.reviewer,sourceItemId:file.id,courseId:f.courses.cloud},()=>f.f.db.insert(schema.petrosTeachingPackReviews).values({...previous,id:randomUUID(),commandId:randomUUID(),reviewVersion:99,receipt:{...previous.receipt,dimension:'assessment_instrument'} as never}))).rejects.toThrow();
  await expect(runInScopedTenant(f.f.db,{institutionId:f.institutionId,institutionUserId:f.reviewer,sourceItemId:file.id,courseId:f.courses.cloud},()=>f.f.db.insert(schema.courseCurriculumRecords).values({institutionId:f.institutionId,courseId:f.courses.cloud,kind:'petros_v2_release',recordId:randomUUID(),recordVersion:1,contentHash:'a'.repeat(64),content:{proposalId:randomUUID(),proposalVersion:1},actorId:f.reviewer}))).rejects.toThrow();
  const [qualification]=await f.admin.select().from(schema.petrosReviewerQualifications).where(eq(schema.petrosReviewerQualifications.id,qualificationId));
  await f.admin.insert(schema.petrosReviewerQualifications).values({...qualification!,rowId:randomUUID(),version:2,status:'revoked'});
  const revoked=await f.runReviewer(ctx=>f.service.readiness(ctx,f.classId,draft.subjectId,draft.id));
  expect(revoked.review.teaching_scope?.status).toBe('authority_revoked_or_expired');expect(revoked.eligible).toBe(false);
  await expect(f.runReviewer(ctx=>f.service.review(ctx,f.classId,draft.subjectId,draft.id,teachingReviewCommand))).rejects.toThrow();
  await expect(f.runReviewer(ctx=>f.service.release(ctx,f.classId,draft.subjectId,draft.id,{commandId,expectedVersion:draft.version}))).rejects.toMatchObject({status:409});
  if(process.env.PETROS_M3_TRACE) console.log('M3 post-review edit');
  const changed=(await f.runReviewer(ctx=>f.service.edit(ctx,f.classId,draft.subjectId,draft.id,{commandId:randomUUID(),expectedVersion:draft.version,change:{kind:'objective',objectiveId:draft.objectives[0]!.id,wording:'Identify the stated observation and cite its source wording.'}}))).proposal;
  const after=await f.runReviewer(ctx=>f.service.readiness(ctx,f.classId,changed.subjectId,changed.id));expect(after.eligible).toBe(false);
  await expect(f.runReviewer(ctx=>f.service.release(ctx,f.classId,changed.subjectId,changed.id,{commandId:randomUUID(),expectedVersion:draft.version}))).rejects.toThrow('REVISION_CONFLICT');
  writeFileSync(resolve(out,'synthetic-release.json'),JSON.stringify({label:'Isolated authorization-path test; no student publication or real academic qualification',receipt,state,changedVersion:changed.version,independentReviewer:true,syntheticCurrentOwnerHandoff:true},null,2));
  await f.admin.update(schema.classSubjectTeachers).set({teacherId:f.staffId}).where(eq(schema.classSubjectTeachers.subjectId,draft.subjectId));
 },120000);
 it('actual changed-source publication fences old draft and preserves physical history',async()=>{
  const next=await f.document('cloud-models-revised.pptx','cloud');expect(next.revision.source.originalHash).not.toBe(cloud.revision.source.originalHash);
  await f.admin.update(schema.classMaterials).set({objectId:next.objectId,version:2}).where(eq(schema.classMaterials.id,cloud.id));
  await expect(f.run(ctx=>f.service.view(ctx,f.classId,p.subjectId,p.id))).rejects.toThrow();
  const rows=await f.f.adminSql`select id from petros_document_preparations where requested_concept_id=${p.id}`;expect(rows.length).toBeGreaterThan(1);
  const binding={...cloud.binding,objectId:next.objectId,materialVersion:2},scope={...f.scope,sourceItemId:cloud.id,courseId:f.courses.cloud};
  const queued=await f.intelligence.enqueue(scope,binding),prepared=await f.intelligence.run(scope,queued.id,new AbortController().signal);
  if(!('revision' in prepared))throw Error('Changed actual M2 source required');
  const replacement=await prepare('cloud',prepared.revision.id);expect(replacement.proposal.source.binding.kind).toBe('material');
  expect(replacement.proposal.source.revisionId).not.toBe(p.source.revisionId);expect(replacement.proposal.reviewRefs).toEqual([]);
  expect(replacement.proposal.source.references[0]!.sourceHash).toBe(next.revision.source.originalHash);
  writeFileSync(resolve(out,'changed-source.json'),JSON.stringify({label:'Actual replacement bytes through M2; structural dependency invalidation, not genuine semantic regeneration',sourceId:cloud.id,oldRevision:p.source.revisionId,newRevision:prepared.revision.id,oldHash:p.source.originalHash,newHash:prepared.revision.source.originalHash,oldUnit:p.source.references[0]!.unitId,newUnit:replacement.proposal.source.references[0]!.unitId,priorHistoryRows:rows.length},null,2));

 },60000);
 it('withdrawn source rejects publication and review',async()=>{await f.admin.update(schema.classMaterials).set({sourceRevokedAt:new Date(),version:2}).where(eq(schema.classMaterials.id,english.id));
  await expect(f.run(ctx=>f.service.view(ctx,f.classId,ep.subjectId,ep.id))).rejects.toThrow();await expect(f.run(ctx=>f.service.release(ctx,f.classId,ep.subjectId,ep.id,{commandId:randomUUID(),expectedVersion:ep.version}))).rejects.toThrow();});

 it('SQL proposal installation rolls back atomically on disposable PostgreSQL',async()=>{
  const before=await f.f.adminSql`select oid from pg_proc where proname='m3_curriculum_pins'`;
  await expect(f.f.adminSql.begin(async tx=>{await tx.unsafe(readFileSync(resolve(m3FixtureRoot,'packages/database/proposals/m3-learning-proposals.sql'),'utf8'));throw Error('injected DDL rollback');})).rejects.toThrow('DDL rollback');
  expect(await f.f.adminSql`select oid from pg_proc where proname='m3_curriculum_pins'`).toEqual(before);
 });
 it('additive SQL replay is idempotent and migration journal unchanged',async()=>{const before=await f.f.adminSql`select count(*)::int n from drizzle.__drizzle_migrations`;await f.f.adminSql.unsafe(readFileSync(resolve(m3FixtureRoot,'packages/database/proposals/m3-learning-proposals.sql'),'utf8'));const after=await f.f.adminSql`select count(*)::int n from drizzle.__drizzle_migrations`;expect(after).toEqual(before);});
});
