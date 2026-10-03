import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, runInInstitutionTenant, runInStudentTenant, schema } from '@edrion/database';
import { phase4InstitutionalFixture } from './petros-phase4-institutional-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS==='1')('Phase4 institutional real owners / isolated PostgreSQL',()=>{
 let database:Phase2TestDatabase;
 beforeAll(async()=>{database=await startPhase2TestDatabase();},90000);afterAll(async()=>{await database?.close();});
 async function setup(){
  const f=await phase2AuthorityFixture(database);await f.qualify();await f.approve();
  return phase4InstitutionalFixture(database,f);
 }
 it('previews/reviews/publishes correction through current material owner and preserves superseded extraction history',async()=>{
  const f=await setup();const bytes=Buffer.from('%PDF-1.4\nSynthetic controlled corrected file\n%%EOF');
  const uploaded=await f.institution(()=>f.publisher.uploadMaterialFile(f.ctx,'corrected.pdf','application/pdf',bytes));
  const [file]=await f.admin.select().from(schema.storageObjects).where(eq(schema.storageObjects.id,uploaded.id));if(!file)throw new Error('Missing uploaded fixture');
  const input={objectId:file.id,expectedMaterialVersion:f.material.version,reason:'Correct vertical and horizontal component meaning.',meaningChanged:true,commandId:randomUUID()};
  const preview=await f.institution(()=>f.publisher.previewMaterialCorrection(f.ctx,f.material.id,input));expect(preview!.status).toBe('preview');expect(preview!.preview.affectedLearners).toBeGreaterThan(0);expect(preview!.preview.affectedPacks).toBeGreaterThan(0);expect(preview!.preview.affectedLocators).toBeGreaterThan(0);expect(preview!.preview.affectedSessionRecommendations).toBeGreaterThan(0);
  expect((await f.institution(()=>f.publisher.previewMaterialCorrection(f.ctx,f.material.id,input)))!.id).toBe(preview!.id);
  await expect(f.institution(()=>f.publisher.previewMaterialCorrection(f.ctx,f.material.id,{...input,reason:'Changed command meaning rejected.'}))).rejects.toThrow();
  const review={expectedVersion:1,decision:'approve' as const,reviewReason:'Second synthetic educator confirms the correction.'};
  await expect(f.institution(()=>f.publisher.reviewMaterialCorrection(f.ctx,f.material.id,preview!.id,review))).rejects.toThrow();
  const published=await f.institution(()=>f.publisher.reviewMaterialCorrection(f.reviewCtx,f.material.id,preview!.id,review));expect(published!.status).toBe('published');
  expect((await f.institution(()=>f.publisher.reviewMaterialCorrection(f.reviewCtx,f.material.id,preview!.id,review)))!.id).toBe(published!.id);
  const [old]=await f.admin.select().from(schema.knowledgeItemVersions).where(eq(schema.knowledgeItemVersions.id,f.extraction.version.id));expect(old!.invalidatedAt).not.toBeNull();
  expect(await f.admin.select().from(schema.knowledgeItemVersionPages).where(eq(schema.knowledgeItemVersionPages.versionId,old!.id))).toHaveLength(1);
  await expect(f.owned(()=>f.knowledge.assertContext(f.student,{door:'uploaded_document',referenceId:f.source.id,sourceFingerprint:f.extraction.version.fingerprint,citations:[f.citation]}))).rejects.toThrow();
  const [material]=await f.admin.select().from(schema.classMaterials).where(eq(schema.classMaterials.id,f.material.id));
  // Controlled worker output; it commits through the actual publication owner after approved revision.
  await f.institution(()=>f.publisher.publishPreparedPdf(material!,file,{pages:['Horizontal velocity remains constant; only vertical velocity is zero at the apex.'],fileSha256:file.checksumSha256!}));
  const current=await f.owned(()=>f.knowledge.resolve(f.student,f.source.id));expect(current.version!.fingerprint).not.toBe(f.extraction.version.fingerprint);expect(current.version!.invalidatedAt).toBeNull();
  const privateRead=await runInStudentTenant(database.db,f.student,()=>database.db.select().from(schema.petrosMaterialCorrections));expect(privateRead).toEqual([]);
 });
 it('approves once using current canonical audience and denies revoked/expired/cancelled student delivery',async()=>{
  const f=await setup(),preview=await f.preview();expect(preview!.audiencePreview.candidateCount).toBe(5);
  const action={expectedVersion:1,reason:'Approve a synthetic supported practice intervention.'};
  await expect(f.institution(()=>f.service.reviewIntervention(f.ctx,preview!.id,action,'approve'))).rejects.toThrow();await f.rotate();
  const [one,two]=await Promise.all([f.institution(()=>f.service.reviewIntervention(f.reviewCtx,preview!.id,action,'approve')),f.institution(()=>f.service.reviewIntervention(f.reviewCtx,preview!.id,action,'approve'))]);
  expect(one!.assignmentId).toBe(two!.assignmentId);expect(one!.audiencePreview.assigneeReceiptCount).toBe(5);
  expect(await f.admin.select().from(schema.assignments).where(eq(schema.assignments.institutionId,f.institutionId))).toHaveLength(1);
  expect((await f.owned(()=>f.students.detail(f.student,one!.assignmentId!))).title).toBe('Compare velocity components');
  await f.admin.update(schema.students).set({status:'left'}).where(eq(schema.students.id,f.student.studentId));await expect(f.owned(()=>f.students.detail(f.student,one!.assignmentId!))).rejects.toThrow();
  await f.admin.update(schema.students).set({status:'enrolled'}).where(eq(schema.students.id,f.student.studentId));
  await f.admin.update(schema.institutionUsers).set({status:'disabled'}).where(eq(schema.institutionUsers.id,f.reviewerUserId));await expect(f.owned(()=>f.students.detail(f.student,one!.assignmentId!))).rejects.toThrow();
  await f.admin.update(schema.institutionUsers).set({status:'active'}).where(eq(schema.institutionUsers.id,f.reviewerUserId));
  const restricted={...f.config,classSignals:{...f.config.classSignals,enabled:false}};
  const [restriction]=await f.admin.insert(schema.petrosInstitutionPolicyVersions).values({institutionId:f.institutionId,scopeLevel:'subject',subjectId:f.subjectId,version:1,status:'published',schemaVersion:'petros.institutional-policy.v1',config:restricted,reason:'Synthetic stricter policy immediately revokes delivery',authorId:f.reviewerUserId,effectiveFrom:new Date(0),publishedAt:new Date()}).returning();
  await expect(f.owned(()=>f.students.detail(f.student,one!.assignmentId!))).rejects.toThrow();
  await f.admin.update(schema.petrosInstitutionPolicyVersions).set({effectiveUntil:new Date(Date.now()-1000)}).where(eq(schema.petrosInstitutionPolicyVersions.id,restriction!.id));
  expect((await f.owned(()=>f.students.detail(f.student,one!.assignmentId!))).title).toBe('Compare velocity components');
  await f.admin.update(schema.petrosInstitutionalInterventions).set({expiresAt:new Date(Date.now()-1000)}).where(eq(schema.petrosInstitutionalInterventions.id,one!.id));await expect(f.owned(()=>f.students.detail(f.student,one!.assignmentId!))).rejects.toThrow();
  const expired=await f.institution(()=>f.service.reviewIntervention(f.reviewCtx,one!.id,{expectedVersion:2,reason:'Expire the synthetic intervention.'},'cancel'));expect(expired!.status).toBe('expired');
 });
 it('rolls back a reviewed correction on publication audit failure and retries its exact command',async()=>{
  const f=await setup();const uploaded=await f.institution(()=>f.publisher.uploadMaterialFile(f.ctx,'corrected.pdf','application/pdf',Buffer.from('%PDF-1.4\nSynthetic corrected file\n%%EOF')));
  const preview=await f.institution(()=>f.publisher.previewMaterialCorrection(f.ctx,f.material.id,{objectId:uploaded.id,expectedMaterialVersion:f.material.version,reason:'Correct the motion component explanation.',meaningChanged:true,commandId:randomUUID()}));
  const action={expectedVersion:1,decision:'approve' as const,reviewReason:'Reviewed exact synthetic source meaning.'};
  const original=database.auditWriter.logAudit.bind(database.auditWriter);
  const spy=vi.spyOn(database.auditWriter,'logAudit').mockImplementation(async(input)=>{if(input.action==='petros.material_correction.publish')throw new Error('publication audit rollback');return original(input);});
  await expect(f.institution(()=>f.publisher.reviewMaterialCorrection(f.reviewCtx,f.material.id,preview!.id,action))).rejects.toThrow('publication audit rollback');spy.mockRestore();
  const [material]=await f.admin.select().from(schema.classMaterials).where(eq(schema.classMaterials.id,f.material.id));expect(material!.version).toBe(f.material.version);expect(material!.objectId).toBe(f.material.objectId);
  const [correction]=await f.admin.select().from(schema.petrosMaterialCorrections).where(eq(schema.petrosMaterialCorrections.id,preview!.id));expect(correction!.status).toBe('preview');expect(correction!.version).toBe(1);
  const [source]=await f.admin.select().from(schema.knowledgeItemVersions).where(eq(schema.knowledgeItemVersions.id,f.extraction.version.id));expect(source!.invalidatedAt).toBeNull();
  expect((await f.institution(()=>f.publisher.reviewMaterialCorrection(f.reviewCtx,f.material.id,preview!.id,action)))!.status).toBe('published');
 });
 it('rolls back correction and assignment effects on audit failure, and tests default-off/guardian/private-tenant denial',async()=>{
  const f=await setup(),preview=await f.preview();await f.rotate();
  const action={expectedVersion:1,reason:'Approve a synthetic practice step after review.'};
  const spy=vi.spyOn(database.auditWriter,'logAudit').mockRejectedValueOnce(new Error('audit rollback'));
  await expect(f.institution(()=>f.service.reviewIntervention(f.reviewCtx,preview!.id,action,'approve'))).rejects.toThrow();spy.mockRestore();
  expect(await f.admin.select().from(schema.assignments).where(eq(schema.assignments.institutionId,f.institutionId))).toEqual([]);
  const approved=await f.institution(()=>f.service.reviewIntervention(f.reviewCtx,preview!.id,action,'approve'));
  const cancelled=await f.institution(()=>f.service.reviewIntervention(f.reviewCtx,approved!.id,{expectedVersion:2,reason:'Cancel the synthetic intervention.'},'cancel'));expect(cancelled!.status).toBe('cancelled');
  await expect(f.owned(()=>f.students.detail(f.student,approved!.assignmentId!))).rejects.toThrow();
  const foreign=await runInInstitutionTenant(database.db,randomUUID(),()=>database.db.select().from(schema.petrosInstitutionalInterventions));expect(foreign).toEqual([]);
  await expect(f.service.parentDigestHistory({} as never,f.student.studentId)).rejects.toThrow();
  f.env.PETROS_CONTINUITY_ENABLED=false;await expect(f.preview()).rejects.toThrow();
 });
});
