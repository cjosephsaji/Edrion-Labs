import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { eq, runInStudentTenant, schema } from '@edrion/database';
import { compatibilityCanonicalJson } from '@edrion/schemas';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';

const digest = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 real pack authority owners',()=>{
  let db:Phase2TestDatabase;
  beforeAll(async()=>{db=await startPhase2TestDatabase();});
  afterAll(async()=>{await db?.close();});

  it('resolves exact source and curriculum; refuses unreviewed/unqualified, then consumes explicit qualified approval',async()=>{
    const f=await phase2AuthorityFixture(db);
    expect(await f.owned(()=>f.knowledge.locator(f.student,f.source.id,f.citation.locator))).toMatchObject({locator:f.citation.locator});
    await expect(f.current()).rejects.toThrow();
    expect(await f.owned(()=>db.db.select().from(schema.petrosTeachingPackCandidates))).toEqual([]);
    await expect(f.approve()).rejects.toThrow();
    await f.qualify();const approved=await f.approve();
    const current=await f.current();
    expect(current.candidate.objective).toEqual(f.candidate.objective);
    expect(current.reviewReceipt.receiptId).toBe(approved.receipt.receiptId);
    expect(current.candidate.validation).toMatchObject({status:'candidate',approvedReviewId:null});
    expect(await f.institution(()=>f.packs.compile(f.ctx,f.compileCommand))).toMatchObject({replayed:true,candidateId:f.compiled.candidateId});
    expect(await f.approve()).toMatchObject({replayed:true});
    const summaries=await f.owned(()=>f.packs.listApprovedPackSummaries(f.student,f.sessionId));
    expect(JSON.stringify(summaries)).not.toContain('answerKey');
    expect(JSON.stringify(summaries)).not.toContain('qualification');
    expect(await runInStudentTenant(db.db,{institutionId:f.institutionId,studentId:randomUUID()},()=>
      db.db.select().from(schema.petrosTeachingPackCandidates))).toEqual([]);
  });

  it('fails after reviewer qualification revocation and hides stale payloads at the student RLS boundary',async()=>{
    const f=await phase2AuthorityFixture(db);await f.qualify();await f.approve();await f.current();
    await f.admin.insert(schema.petrosReviewerQualifications).values({id:f.qualificationId,version:2,institutionId:f.institutionId,
      reviewerUserId:f.teacherUserId,reviewerStaffId:f.teacherId,subjectKey:f.subjectId,status:'revoked',
      validFrom:new Date('2026-01-01'),validUntil:new Date('2030-01-01'),evidenceKind:'institution_record',evidenceHash:'d'.repeat(64),
      recordedByUserId:f.teacherUserId});
    await expect(f.current()).rejects.toThrow();
    expect(await f.owned(()=>db.db.select().from(schema.petrosTeachingPackCandidates))).toEqual([]);
  });

  it('rejects source revocation, membership loss, changed payload and unsupported compiler',async()=>{
    const f=await phase2AuthorityFixture(db);await f.qualify();await f.approve();
    await expect(f.institution(()=>f.packs.compile(f.ctx,{...f.compileCommand,
      candidate:{...f.candidate,coreExplanation:'Changed after review.'}}))).rejects.toThrow();
    await expect(f.institution(()=>f.packs.compile(f.ctx,{...f.compileCommand,commandId:randomUUID(),
      candidate:{...f.candidate,compilerVersion:'untrusted.v2'}}))).rejects.toThrow();
    await f.admin.update(schema.knowledgeItems).set({sourceRevokedAt:new Date()}).where(eq(schema.knowledgeItems.id,f.source.id));
    await expect(f.current()).rejects.toThrow();
    await f.admin.update(schema.knowledgeItems).set({sourceRevokedAt:null}).where(eq(schema.knowledgeItems.id,f.source.id));
    await f.current();
    await f.admin.delete(schema.courseEnrollments).where(eq(schema.courseEnrollments.courseId,f.course.id));
    await expect(f.current()).rejects.toThrow();
  });

  it('rejects a structurally valid candidate when any selectable task cannot render',async()=>{
    await expect(phase2AuthorityFixture(db,candidate=>{
      candidate.assessments[1]!.prompt='x'.repeat(701);
    })).rejects.toMatchObject({response:{code:'PETROS_PACK_NOT_RENDERABLE'}});
  });

  it('rejects a legacy stored candidate that cannot render before review or current-pack admission',async()=>{
    const f=await phase2AuthorityFixture(db);
    const [stored]=await f.admin.select().from(schema.petrosTeachingPackCandidates)
      .where(eq(schema.petrosTeachingPackCandidates.id,f.compiled.candidateId));
    if(!stored) throw new Error('Expected compiled candidate.');
    const candidate=structuredClone(f.candidate);
    candidate.pack.version=2;
    candidate.assessments[1]!.prompt='x'.repeat(701);
    const payloadHash=digest(candidate);
    const candidateId=randomUUID();
    await f.admin.insert(schema.petrosTeachingPackCandidates).values({...stored,id:candidateId,
      packVersion:candidate.pack.version,payload:candidate,payloadHash,commandId:randomUUID(),
      requestHash:digest({candidateId,payloadHash})});
    await f.qualify();
    await expect(f.institution(()=>f.packs.review(f.ctx,candidateId,{...f.reviewCommand,
      commandId:randomUUID(),expectedPayloadHash:payloadHash}))).rejects.toMatchObject({response:{code:'PETROS_PACK_NOT_RENDERABLE'}});
    await expect(f.institution(()=>f.packs.requireApprovedPackForReview(f.principal,{courseId:f.course.id,
      sessionId:f.sessionId,studentId:f.student.studentId,packId:candidate.pack.id,
      packVersion:candidate.pack.version}))).rejects.toMatchObject({response:{code:'PETROS_PACK_NOT_RENDERABLE'}});
  });

  it('does not silently rebind an approved session to a newer pack or curriculum revision',async()=>{
    const f=await phase2AuthorityFixture(db);await f.qualify();await f.approve();
    await f.institution(()=>f.packs.compile(f.ctx,{...f.compileCommand,commandId:randomUUID(),
      candidate:{...f.candidate,pack:{...f.candidate.pack,version:2}}}));
    await expect(f.current()).rejects.toThrow();
    const g=await phase2AuthorityFixture(db);await g.qualify();await g.approve();
    await g.admin.update(schema.courseSyllabusModules).set({title:'Revised syllabus'})
      .where(eq(schema.courseSyllabusModules.courseId,g.course.id));
    await expect(g.current()).rejects.toThrow();
  });
});
