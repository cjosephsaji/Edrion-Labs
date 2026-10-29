import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, schema, sql, runInStudentTenant, runInInstitutionTenant, runInReadinessScope,
  assertRestrictedDatabaseRole, withInstitutionScope, type Database } from '@edrion/database';
import { AuditWriter } from '@edrion/audit';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API_ENV, DATABASE } from '../../common/tokens';
import { PetrosDocumentDatabase } from '../../common/petros-document-database';
import { PetrosDocumentPreparationService, PETROS_DOCUMENT_PREPARATION_JOB } from '../student/petros-session-intent/petros-document-preparation.service';
import { PetrosSessionIntentRepository } from '../student/petros-session-intent/petros-session-intent.repository';
import { PetrosSessionIntentService } from '../student/petros-session-intent/petros-session-intent.service';
import { StudentPetrosSessionIntentController } from '../student/petros-session-intent/petros-session-intent.controller';
import { fallbackDocumentTeachingPlan } from '../student/petros-session-intent/petros-document-teaching';
import { documentPageCitation } from '../student/petros-session-intent/petros-document-source';
import { KnowledgeDocumentService } from '../student/knowledge/knowledge-document.service';
import { StudentMaterialsService } from '../student/materials/student-materials.service';
import { StudentSessionService } from '../student/core/student-session.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import { StudentTenantInterceptor } from '../student/core/student-tenant.interceptor';
import { PetrosTeacherGuidanceService } from '../portal/teaching/petros-teacher-guidance.service';
import { PetrosTeacherGuidanceFilesService } from '../portal/teaching/petros-teacher-guidance-files.service';
import { PortalTeachingService } from '../portal/teaching/portal-teaching.service';
import { MaterialDocumentPreviewService } from '../student/materials/material-document-preview.service';
import { StudentAssignmentsService } from '../student/assignments/student-assignments.service';
import { PortalCourseContentService } from '../portal/course-content/portal-course-content.service';
import { PortalCrudEngine } from '../portal/portal-crud.engine';
import { PortalAuthService } from '../portal/portal-auth.service';
import { PortalMaterialPreparationJobs } from '../portal/course-content/portal-material-preparation.jobs';
import { KnowledgePreparationRepository } from '../student/knowledge/knowledge-preparation.repository';
import { PetrosArtifactsRepository } from '../student/petros-artifacts/petros-artifacts.repository';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosTeachBackRepository } from '../student/petros-teach-back/petros-teach-back.repository';
import { PetrosAssignmentLearningService } from '../portal/petros-assignment-learning.service';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import { startReadinessRehearsal, type ReadinessRehearsal } from '../../../scripts/rehearse-petros-v2-readiness-repair';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import type { Phase2TestDatabase } from './petros-phase2-test-database';

// The only databases are created by the guarded private Unix-socket rehearsal.
// Worker dispatch/provider output are controlled; no provider client or application bootstrap is started.
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('M0-R Phase B actual services / restricted roles', () => {
  let f: ReadinessRehearsal, app: INestApplication, runtime: PetrosDocumentDatabase;
  let workerDb: Database, evaluatorDb: Database, preparation: PetrosDocumentPreparationService;
  let documents: KnowledgeDocumentService, repo: PetrosLoopRepository;
  let handler: (job: {data: Record<string,string>}) => Promise<unknown>;
  let cookies: string[], sessions: StudentSessionService;
  let principal: InstitutionalStudentPrincipal;
  let authority: Awaited<ReturnType<typeof phase2AuthorityFixture>>;
  const env = { NODE_ENV: 'test', PETROS_DOCUMENT_TEACHING_ENABLED: true, PETROS_AI_MODE: 'demo',
    PETROS_DOCUMENT_RETRIEVAL_ENABLED: true, STUDENT_AUTH_DEV_HEADER: false,
    STUDENT_SESSION_COOKIE_NAME: 'm0r_phase_b', SESSION_COOKIE_SECRET: 'synthetic-m0r-phase-b-secret-at-least-32',
    SESSION_TTL_SECONDS: 3600, STUDENT_STORAGE_DIR: '' };
  const jobs = { enqueue: vi.fn(async () => 'persisted-job') };
  const gateway = { execute: vi.fn() };
  const owned = <T>(fn: () => Promise<T>) => runInStudentTenant(f.tenantDb, principal, fn);
  const work = (id: string, owner = f.owners[0]!) => handler({data: {
    preparationId: id, institutionId: owner.institutionId, studentId: owner.studentId,
  }});
  async function queued(mode = 'demo') {
    env.PETROS_AI_MODE = mode;
    const source = await owned(() => documents.resolve(principal, f.owners[0]!.itemId));
    return owned(() => preparation.prepare(principal, source, source.version!.fingerprint, {
      id: randomUUID(), title: 'Synthetic document reasoning', summary: 'Read the supplied synthetic source.',
    }));
  }
  async function published() {
    const queuedWork = await queued();
    const result = await work(queuedWork.preparation.id) as {lessonId: string};
    expect(result.lessonId).toBeTruthy();
    return { ...queuedWork, lessonId: result.lessonId };
  }
  beforeAll(async () => {
    f = await startReadinessRehearsal(); await f.applyRepair();
    env.STUDENT_STORAGE_DIR = `${f.directory}/assets`;
    workerDb = drizzle(f.worker, {schema}); evaluatorDb = drizzle(f.evaluator, {schema});
    for (const [db, role] of [[f.tenantDb,'edrion_app'],[workerDb,'edrion_petros_document_worker'],
      [evaluatorDb,'edrion_petros_document_evaluator']] as const) await assertRestrictedDatabaseRole(db, role);
    // Inject effective independently authenticated restricted pools into the production adapter.
    runtime = new PetrosDocumentDatabase(env as never);
    Object.assign(runtime, {workerDb, evaluatorDb});
    preparation = new PetrosDocumentPreparationService(f.tenantDb, env as never, jobs as never,
      { register(name: string, fn: typeof handler) { expect(name).toBe(PETROS_DOCUMENT_PREPARATION_JOB); handler=fn; } } as never,
      gateway as never, runtime);
    preparation.onModuleInit();
    const audit = new AuditWriter(f.tenantDb);
    documents = new KnowledgeDocumentService(f.tenantDb, new StudentMaterialsService(f.tenantDb), env as never);
    repo = new PetrosLoopRepository(f.tenantDb, documents);
    sessions = new StudentSessionService(f.tenantDb, env as never);
    const auth = new StudentAuthService(f.tenantDb, audit, env as never, sessions, {} as never, {} as never);
    cookies = [];
    for (const owner of f.owners) {
      await f.admin`INSERT INTO institution_user_roles(institution_user_id,role_key) VALUES(${owner.userId},'student')`;
      const issued = await runInInstitutionTenant(f.tenantDb, owner.institutionId,
        () => sessions.issue({kind:'institutional',userId:owner.userId,institutionId:owner.institutionId}));
      cookies.push(`${sessions.cookieName}=${issued.token}`);
    }
    principal = await auth.resolveByEmail(`${f.owners[0]!.userId}@example.test`) as InstitutionalStudentPrincipal;
    const intent = new PetrosSessionIntentService(new PetrosSessionIntentRepository(f.tenantDb, documents),
      {} as never, gateway as never, preparation, env as never, audit);
    Reflect.defineMetadata('design:paramtypes', [PetrosSessionIntentService], StudentPetrosSessionIntentController);
    const module = await Test.createTestingModule({ controllers: [StudentPetrosSessionIntentController], providers: [
      {provide: PetrosSessionIntentService,useValue:intent}, {provide: StudentAuthService,useValue:auth},
      {provide: StudentSessionService,useValue:sessions}, {provide:API_ENV,useValue:env},
      {provide:DATABASE,useValue:f.tenantDb}, Reflector, StudentAuthGuard, StudentPermissionsGuard,
    ] }).overrideGuard(StudentAuthGuard).useValue(new StudentAuthGuard(auth,sessions,env as never))
      .overrideGuard(StudentPermissionsGuard).useValue(new StudentPermissionsGuard(new Reflector()))
      .overrideGuard(StudentPortalGuard).useValue({canActivate:()=>true})
      .overrideGuard(StudentRateLimitGuard).useValue({canActivate:()=>true}).compile();
    app = module.createNestApplication(); app.useGlobalInterceptors(new StudentTenantInterceptor(f.tenantDb)); await app.init();
  }, 60000);
  afterAll(async()=> { await app?.close(); await f?.close(); },30000);

  it('uses the actual startup guard and rejects owner, bypass, membership and wrong roles', async()=> {
    await expect(assertRestrictedDatabaseRole(drizzle(f.admin,{schema}),'edrion_app')).rejects.toThrow('ROLE_UNSAFE');
    await expect(assertRestrictedDatabaseRole(workerDb,'edrion_app')).rejects.toThrow('ROLE_UNSAFE');
    await f.admin.unsafe('CREATE ROLE phase_b_carrier NOLOGIN; GRANT phase_b_carrier TO edrion_app');
    try { await expect(assertRestrictedDatabaseRole(f.tenantDb,'edrion_app')).rejects.toThrow('ROLE_UNSAFE'); }
    finally { await f.admin.unsafe('REVOKE phase_b_carrier FROM edrion_app'); }
    await f.admin.unsafe('ALTER ROLE edrion_petros_document_evaluator BYPASSRLS');
    try { await expect(assertRestrictedDatabaseRole(evaluatorDb,'edrion_petros_document_evaluator')).rejects.toThrow('ROLE_UNSAFE'); }
    finally { await f.admin.unsafe('ALTER ROLE edrion_petros_document_evaluator NOBYPASSRLS'); }
  });
  it('requires explicit worker and evaluator credentials with no ordinary URL fallback',async()=> {
    const disabled = new PetrosDocumentDatabase({PETROS_DOCUMENT_TEACHING_ENABLED:false} as never);
    await expect(disabled.onModuleInit()).resolves.toBeUndefined();
    const missing = new PetrosDocumentDatabase({PETROS_DOCUMENT_TEACHING_ENABLED:true,DATABASE_URL:'postgres://unused.invalid'} as never);
    await expect(missing.onModuleInit()).rejects.toThrow('RESTRICTED_DATABASE_REQUIRED');
    expect(()=>disabled.worker(principal,async()=>undefined)).toThrow('WORKER_UNAVAILABLE');
  });
  it('scopes dedicated authority metadata and denies evaluator access to unrelated source columns',async()=> {
    for(const db of [workerDb,evaluatorDb]) {
      for(const table of ['students','institution_users','institution_user_roles','storage_objects','class_materials','courses','course_enrollments'])
        expect(await db.execute(sql.raw(`SELECT id FROM public.${table}`))).toHaveLength(0);
      const roles=await runInReadinessScope(db,principal,tx=>tx.select({user:schema.institutionUserRoles.institutionUserId}).from(schema.institutionUserRoles));
      expect(roles.length).toBeGreaterThan(0);expect(roles.every(role=>role.user===principal.institutionUserId)).toBe(true);
    }
    await expect(evaluatorDb.execute(sql`SELECT title FROM public.knowledge_items`)).rejects.toMatchObject({code:'42501'});
  });
  it('replaces all eleven scope keys and restores nested student and staff scopes',async()=> {
    await owned(async()=> {
      await runInStudentTenant(f.tenantDb,{institutionId:f.owners[1]!.institutionId,studentId:f.owners[1]!.studentId},async()=> {
        const [v]=await f.tenantDb.execute(sql`SELECT current_setting('app.student_id') AS student`);
        expect(v!.student).toBe(f.owners[1]!.studentId);
      });
      const [v]=await f.tenantDb.execute(sql`SELECT current_setting('app.student_id') AS student`);
      expect(v!.student).toBe(principal.studentId);
    });
    await runInReadinessScope(workerDb,{...principal,preparationId:randomUUID(),lessonId:randomUUID(),sessionId:randomUUID(),courseId:randomUUID(),sourceItemId:randomUUID(),assignmentId:randomUUID(),reviewRequestId:randomUUID()},async tx=> {
      await runInReadinessScope(tx,{independentUserId:f.independentUserId},async inner=> {
        const [row]=await inner.execute(sql`SELECT current_setting('app.student_id') AS s,current_setting('app.preparation_id') AS p,current_setting('app.lesson_id') AS l,current_setting('app.session_id') AS se,current_setting('app.course_id') AS c,current_setting('app.source_item_id') AS k,current_setting('app.assignment_id') AS a,current_setting('app.review_request_id') AS r`);
        expect(Object.values(row!)).toEqual(['','','','','','','','']);
      });
    });
  });
  it('publishes through the registered worker using scoped claim/progress/commit and public projections',async()=> {
    const done=await published();
    const lesson=await owned(()=>preparation.lesson(principal,done.lessonId));
    expect(lesson?.publicPlan.scenes.length).toBeGreaterThan(0);
    expect(Object.keys(lesson!)).toEqual(['id','publicPlan']);
    expect(JSON.stringify(lesson)).not.toMatch(/privatePlan|answerKey|referenceAnswer|rubric|documentTeachingInternalPlan/);
    const read=await owned(()=>preparation.read(principal,done.preparation.id)); expect(read?.status).toBe('ready');
    const path=await owned(()=>preparation.path(principal,f.owners[0]!.itemId)); expect(path?.concepts.length).toBeGreaterThan(0);
    expect(gateway.execute).not.toHaveBeenCalled();
    expect(jobs.enqueue).toHaveBeenCalledWith('ai',PETROS_DOCUMENT_PREPARATION_JOB,
      {preparationId:done.preparation.id,studentId:principal.studentId,institutionId:principal.institutionId},expect.objectContaining({attempts:3}));
    await expect(owned(()=>f.tenantDb.select({key:schema.petrosDocumentLessonArtifacts.privatePlan}).from(schema.petrosDocumentLessonArtifacts))).rejects.toMatchObject({code:'42501'});
  });
  it('restores all explicit worker scope after nested success, rollback and institution-only work',async()=> {
    const outer = {...principal,preparationId:randomUUID(),lessonId:randomUUID(),sessionId:randomUUID(),
      courseId:randomUUID(),sourceItemId:randomUUID(),assignmentId:randomUUID(),reviewRequestId:randomUUID()};
    const settings = async (tx: Database) => (await tx.execute(sql`
      SELECT jsonb_object_agg(key,nullif(current_setting('app.'||key,true),'')) AS scope
      FROM unnest(ARRAY['institution_id','student_id','independent_user_id','institution_user_id',
        'preparation_id','lesson_id','session_id','course_id','source_item_id','assignment_id','review_request_id']) AS key`))[0]!.scope;
    await runInReadinessScope(workerDb,outer,async tx=> {
      const before=await settings(tx);
      await runInReadinessScope(tx,f.owners[1]!,async inner=> {
        const [row]=await inner.execute(sql`SELECT current_setting('app.student_id') AS student`);
        expect(row!.student).toBe(f.owners[1]!.studentId);
      });
      expect(await settings(tx)).toEqual(before);
      await expect(runInReadinessScope(tx,f.owners[2]!,async()=> {
        throw new Error('Controlled nested rollback');
      })).rejects.toThrow('Controlled nested rollback');
      expect(await settings(tx)).toEqual(before);
      await withInstitutionScope(tx,f.owners[2]!.institutionId,async inner=> {
        const [row]=await inner.execute(sql`SELECT current_setting('app.student_id') AS student`);
        expect(row!.student).toBe('');
      });
      expect(await settings(tx)).toEqual(before);
    });
    expect(await workerDb.execute(sql`SELECT id FROM public.knowledge_items`)).toEqual([]);
  });
  it('serves signed-cookie HTTP preparation/path reads and denies absent/cross-owner/cross-institution sessions',async()=> {
    const done=await published(),url=`/student/petros/document-preparations/${done.preparation.id}`;
    const response=await supertest(app.getHttpServer()).get(url).set('Cookie',cookies[0]!).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store'); expect(response.body.status).toBe('ready');
    expect(JSON.stringify(response.body)).not.toMatch(/answerKey|privatePlan|rubric/);
    await supertest(app.getHttpServer()).get(url).expect(401);
    for(const cookie of cookies.slice(1)) await supertest(app.getHttpServer()).get(url).set('Cookie',cookie).expect(404);
    await supertest(app.getHttpServer()).get(`/student/petros/documents/${f.owners[0]!.itemId}/path`).set('Cookie',cookies[0]!).expect(200);
  });
  it('denies wrong owner/institution and unscoped jobs before provider work',async()=> {
    const q=await queued('live'); gateway.execute.mockClear();
    for(const owner of f.owners.slice(1)) await expect(work(q.preparation.id,owner)).rejects.toThrow('AUTHORITY_LOST');
    await expect(handler({data:{preparationId:q.preparation.id,studentId:'',institutionId:''}})).resolves.toEqual({denied:true});
    expect(gateway.execute).not.toHaveBeenCalled();
    const [p]=await f.admin`SELECT attempt_count FROM petros_document_preparations WHERE id=${q.preparation.id}`;expect(p!.attempt_count).toBe(0);
  });
  it.each(['source','storage','student','account','path','role','password_setup','disabled'] as const)('denies %s withdrawal before claiming or HTTP reads',async(kind)=> {
    const q=await queued('live'),o=f.owners[0]!; gateway.execute.mockClear();
    const mutations={source:()=>f.admin`UPDATE knowledge_items SET source_revoked_at=now() WHERE id=${o.itemId}`,
      storage:()=>f.admin`UPDATE storage_objects SET processing_status='failed' WHERE id=${o.objectId}`,
      student:()=>f.admin`UPDATE students SET status='withdrawn' WHERE id=${o.studentId}`,
      account:()=>f.admin`UPDATE institution_users SET status='disabled' WHERE id=${o.userId}`,
      path:()=>f.admin`UPDATE petros_document_learner_paths SET status='paused' WHERE id=${q.preparation.pathId}`,
      role:()=>f.admin`DELETE FROM institution_user_roles WHERE institution_user_id=${o.userId} AND role_key='student'`,
      password_setup:()=>f.admin`UPDATE institution_users SET password_reset_required_at=now() WHERE id=${o.userId}`,
      disabled:()=>f.admin`UPDATE institution_users SET disabled_at=now() WHERE id=${o.userId}`};
    await mutations[kind]();
    try {
      await expect(work(q.preparation.id)).rejects.toThrow('AUTHORITY_LOST'); expect(gateway.execute).not.toHaveBeenCalled();
      if(kind==='source'||kind==='storage') await supertest(app.getHttpServer()).get(`/student/petros/document-preparations/${q.preparation.id}`).set('Cookie',cookies[0]!).expect(404);
      if(kind==='role'||kind==='disabled') await supertest(app.getHttpServer()).get(`/student/petros/document-preparations/${q.preparation.id}`).set('Cookie',cookies[0]!).expect(401);
    } finally {
      await f.admin`UPDATE knowledge_items SET source_revoked_at=NULL WHERE id=${o.itemId}`;
      await f.admin`UPDATE storage_objects SET processing_status='ready' WHERE id=${o.objectId}`;
      await f.admin`UPDATE students SET status='enrolled' WHERE id=${o.studentId}`;
      await f.admin`UPDATE institution_users SET status='active',disabled_at=NULL,password_reset_required_at=NULL WHERE id=${o.userId}`;
      if(kind==='role')await f.admin`INSERT INTO institution_user_roles(institution_user_id,role_key) VALUES(${o.userId},'student')`;
      await f.admin`UPDATE petros_document_learner_paths SET status='active' WHERE source_revision_id=(SELECT source_revision_id FROM petros_document_preparations WHERE id=${q.preparation.id})`;
    }
  });
  it('rechecks before provider dispatch and blocks source withdrawal while a provider result is in flight',async()=> {
    const q=await queued('live');gateway.execute.mockClear();
    gateway.execute.mockImplementationOnce(async request=> {
      await request.authorizeAttempt();
      const [role]=await request.databaseScope(()=>f.tenantDb.execute(sql`SELECT current_user AS r`));expect(role.r).toBe('edrion_app');
      await f.admin`UPDATE knowledge_items SET source_revoked_at=now() WHERE id=${f.owners[0]!.itemId}`;
      throw new Error('Controlled provider failure after revocation');
    });
    try { await expect(work(q.preparation.id)).rejects.toThrow('Controlled provider');
      const rows=await f.admin`SELECT id FROM petros_document_lesson_artifacts WHERE preparation_id=${q.preparation.id}`;expect(rows).toHaveLength(0);
      const [row]=await f.admin`SELECT status FROM petros_document_preparations WHERE id=${q.preparation.id}`;expect(row!.status).toBe('preparing');
    }finally {await f.admin`UPDATE knowledge_items SET source_revoked_at=NULL WHERE id=${f.owners[0]!.itemId}`;}
  });
  it.each(['cancel','expire','steal'] as const)('fences a %s worker result and failure without clobbering another claim',async kind=> {
    const q=await queued('live');gateway.execute.mockClear();
    gateway.execute.mockImplementationOnce(async request=> {
      await request.authorizeAttempt();
      if(kind==='cancel')await f.admin`UPDATE petros_document_preparations SET status='cancelled' WHERE id=${q.preparation.id}`;
      if(kind==='expire')await f.admin`UPDATE petros_document_preparations SET lease_expires_at=now()-interval '1 second' WHERE id=${q.preparation.id}`;
      if(kind==='steal')await f.admin`UPDATE petros_document_preparations SET attempt_count=attempt_count+1,lease_owner='new-worker' WHERE id=${q.preparation.id}`;
      // Invalid controlled provider draft leads to the real validation/recovery path; its first progress write must fail closed.
      return {content:{invalid:true}};
    });
    await expect(work(q.preparation.id)).rejects.toThrow('LEASE_OR_AUTHORITY_LOST');
    const rows=await f.admin`SELECT id FROM petros_document_lesson_artifacts WHERE preparation_id=${q.preparation.id}`;expect(rows).toHaveLength(0);
    const [p]=await f.admin`SELECT status,lease_owner,attempt_count FROM petros_document_preparations WHERE id=${q.preparation.id}`;
    if(kind==='cancel')expect(p!.status).toBe('cancelled'); if(kind==='steal'){expect(p!.lease_owner).toBe('new-worker');expect(p!.attempt_count).toBe(2);}
  });
  it.each(['source','role','password_setup'] as const)('rejects a valid provider result after current %s revocation, with no published artifact',async kind=> {
    const q=await queued('live');gateway.execute.mockClear();
    gateway.execute.mockImplementationOnce(async request=> {
      await request.authorizeAttempt();
      const data=JSON.parse(request.input[0].text),pin=data.immutableProvenance;
      const content=fallbackDocumentTeachingPlan({documentId:pin.documentId,documentVersion:pin.documentVersion,
        sourceFingerprint:pin.sourceFingerprint,topicId:pin.topicId,title:data.concept.title,summary:data.concept.summary,
        prerequisites:[],pages:data.sourcePages,sourceComplete:pin.sourceComplete});
      if(kind==='source')await f.admin`UPDATE knowledge_items SET source_revoked_at=now() WHERE id=${f.owners[0]!.itemId}`;
      if(kind==='role')await f.admin`DELETE FROM institution_user_roles WHERE institution_user_id=${f.owners[0]!.userId} AND role_key='student'`;
      if(kind==='password_setup')await f.admin`UPDATE institution_users SET password_reset_required_at=now() WHERE id=${f.owners[0]!.userId}`;
      return {content,inputTokens:0,outputTokens:0,estimatedCostMicros:0,responseTimeMs:0};
    });
    try {await expect(work(q.preparation.id)).rejects.toThrow('AUTHORITY_LOST');
      expect(await f.admin`SELECT id FROM petros_document_lesson_artifacts WHERE preparation_id=${q.preparation.id}`).toHaveLength(0);
    }finally {
      await f.admin`UPDATE knowledge_items SET source_revoked_at=NULL WHERE id=${f.owners[0]!.itemId}`;
      await f.admin`UPDATE institution_users SET password_reset_required_at=NULL WHERE id=${f.owners[0]!.userId}`;
      if(kind==='role')await f.admin`INSERT INTO institution_user_roles(institution_user_id,role_key) VALUES(${f.owners[0]!.userId},'student')`;
    }
  });
  it('retains scoped failure receipts after the request rollback without opening a maintenance owner pool',async()=> {
    const intent=new PetrosSessionIntentRepository(f.tenantDb,documents),artifact=new PetrosArtifactsRepository(f.tenantDb,documents);
    const correlationId=randomUUID();
    await expect(owned(async()=> {
      await intent.recordFailureEvent({institutionId:principal.institutionId,studentId:principal.studentId,
        type:'failure',door:'uploaded_document',sessionType:'learn',idempotencyKey:randomUUID(),correlationId,payload:{code:'SYNTHETIC_DENIAL'}});
      await artifact.recordFailureEvent(principal,{type:'artifact.save_failed',payload:{code:'SYNTHETIC_DENIAL'}});
      throw new Error('Controlled request rollback');
    })).rejects.toThrow('Controlled request rollback');
    const rows=await owned(()=>f.tenantDb.select().from(schema.petrosDoorEvents).where(eq(schema.petrosDoorEvents.correlationId,correlationId)));
    expect(rows).toHaveLength(1);
    const other=f.owners[1]!;
    expect(await runInStudentTenant(f.tenantDb,other,()=>f.tenantDb.select().from(schema.petrosDoorEvents).where(eq(schema.petrosDoorEvents.correlationId,correlationId)))).toEqual([]);
  });
  it('allows the actual V1 teach-it-back recap to bind its rendered plan once and rejects rebinding',async()=> {
    const teachBack=new PetrosTeachBackRepository(f.tenantDb);
    const block=await owned(()=>teachBack.createArtifactBlock({scope:principal,learningSessionId:f.owners[0]!.sessions[1]!,
      topic:'Synthetic teach-it-back recap',correlationId:randomUUID(),
      verdict:{recapProposal:{kind:'note',title:'My recap',body:'Synthetic recap retained with explicit student consent.'}} as never}));
    expect(block?.decisionId).toBeTruthy();
    const [decision]=await owned(()=>f.tenantDb.select().from(schema.petrosPlanningDecisions).where(eq(schema.petrosPlanningDecisions.id,block!.decisionId!)));
    expect(decision).toMatchObject({status:'rendered',resultingBlockId:block!.id});
    await expect(owned(()=>f.tenantDb.update(schema.petrosPlanningDecisions).set({resultingBlockId:null})
      .where(eq(schema.petrosPlanningDecisions.id,block!.decisionId!)))).rejects.toThrow('lifecycle transition denied');
  });
  it('recovers expired leases through the real reader, caps attempts and reuses immutable publication',async()=> {
    const q=await queued();
    await f.admin`UPDATE petros_document_preparations SET status='preparing',lease_owner='lost',lease_expires_at=now()-interval '1 second',attempt_count=1 WHERE id=${q.preparation.id}`;
    expect((await owned(()=>preparation.read(principal,q.preparation.id)))?.status).toBe('queued');
    const done=await work(q.preparation.id) as {lessonId:string};
    const [before]=await f.admin`SELECT md5(private_plan::text||public_plan::text) AS h FROM petros_document_lesson_artifacts WHERE id=${done.lessonId}`;
    await f.admin`UPDATE petros_document_preparations SET status='queued' WHERE id=${q.preparation.id}`;
    expect(await work(q.preparation.id)).toEqual({lessonId:done.lessonId});
    const [after]=await f.admin`SELECT md5(private_plan::text||public_plan::text) AS h FROM petros_document_lesson_artifacts WHERE id=${done.lessonId}`;expect(after).toEqual(before);
    await f.admin`UPDATE petros_document_preparations SET status='queued' WHERE id=${q.preparation.id}`;
    expect(await work(q.preparation.id)).toEqual({reused:true});
  });
  it('prevents the locking privilege from mutating source authority and denies evaluator writes',async()=> {
    const q=await queued();
    await expect(runtime.worker({...principal,preparationId:q.preparation.id},tx=>tx.execute(sql`UPDATE knowledge_items SET id=id WHERE id=${f.owners[0]!.itemId}`))).rejects.toThrow('SOURCE_MUTATION_DENIED');
    await expect(f.worker`UPDATE petros_reviewer_qualifications SET status='revoked'`).rejects.toMatchObject({code:'42501'});
    await expect(f.evaluator`UPDATE petros_document_preparations SET status='ready'`).rejects.toMatchObject({code:'42501'});
  });
  it('removes pre-existing broad grants from both dedicated identities during repeated repair',async()=> {
    await f.admin`GRANT ALL ON public.petros_reviewer_qualifications TO edrion_petros_document_worker,edrion_petros_document_evaluator`;
    await f.admin`GRANT SELECT(storage_key) ON public.storage_objects TO edrion_petros_document_worker,edrion_petros_document_evaluator`;
    await f.applyRepair();
    for(const role of ['edrion_petros_document_worker','edrion_petros_document_evaluator']) {
      const [privileges]=await f.admin`SELECT has_table_privilege(${role},'public.petros_reviewer_qualifications','UPDATE') AS academic_write,
        has_column_privilege(${role},'public.storage_objects','storage_key','SELECT') AS storage_path`;
      expect(privileges).toMatchObject({academic_write:false,storage_path:false});
      const functions=await f.admin`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege(${role},p.oid,'EXECUTE')`;
      expect(functions).toEqual([]);
    }
  });
  it('refuses a partial composite-constraint install and rolls back the deliberate drift',async()=> {
    const overlay=readFileSync(join(__dirname,'../../../scripts/petros-v2-readiness-phase-b.sql'),'utf8');
    const preflight=overlay.split('-- BEGIN PHASE B CONSTRAINT PREFLIGHT')[1]!.split('-- END PHASE B CONSTRAINT PREFLIGHT')[0]!;
    await expect(f.admin.begin(async tx=> {
      await tx`ALTER TABLE public.petros_document_learner_paths DROP CONSTRAINT m0r_path_knowledge_owner_fk`;
      await tx.unsafe(preflight);
    })).rejects.toThrow('M0R_DOCUMENT_CONSTRAINT_DRIFT_REQUIRES_REVIEW');
    expect(await f.admin`SELECT conname FROM pg_constraint WHERE conname='m0r_path_knowledge_owner_fk'`).toHaveLength(1);
  });
  it('returns one private instrument to evaluator only and preserves historical V1 keys outside public repositories',async()=> {
    const done=await published(),sessionId=f.owners[0]!.sessions[0]!;
    const source=await owned(()=>documents.resolve(principal,f.owners[0]!.itemId));
    const sourceContext={door:'uploaded_document',referenceId:source.item.id,sourceFingerprint:source.version!.fingerprint,
      citations:[documentPageCitation(source.item,source.allPages[0]!,source.version!.fingerprint,'Source')]};
    await f.admin`UPDATE petros_learning_sessions SET source_context=${JSON.stringify(sourceContext)}::jsonb WHERE id=${sessionId}`;
    await f.admin`UPDATE petros_learning_sessions SET learner_context=jsonb_build_object('documentLessonId',${done.lessonId}::text) WHERE id=${sessionId}`;
    const assessment=await runtime.assessment(principal,sessionId,0,'diagnostic');
    expect(assessment.diagnostic?.rubric).toBeTruthy();expect(assessment.scene).toBeUndefined();
    await expect(runtime.assessment(principal,sessionId,99,'diagnostic')).rejects.toThrow('AUTHORITY_LOST');
    await expect(runtime.assessment({institutionId:f.owners[1]!.institutionId,studentId:f.owners[1]!.studentId},sessionId,0,'diagnostic')).rejects.toThrow('AUTHORITY_LOST');
    await expect(runtime.assessment(principal,sessionId,0,'unselected-key')).rejects.toThrow('UNAVAILABLE');
    await f.admin`UPDATE petros_learning_sessions SET source_context=jsonb_set(source_context,'{sourceFingerprint}',to_jsonb('stale'::text)) WHERE id=${sessionId}`;
    await expect(runtime.assessment(principal,sessionId,0,'diagnostic')).rejects.toThrow('AUTHORITY_LOST');
    await f.admin`UPDATE petros_learning_sessions SET source_context=${JSON.stringify(sourceContext)}::jsonb WHERE id=${sessionId}`;
    const [artifact]=await f.admin`SELECT private_plan FROM petros_document_lesson_artifacts WHERE id=${done.lessonId}`;
    await f.admin`UPDATE petros_learning_sessions SET learner_context=jsonb_build_object('documentTeachingInternalPlan',${JSON.stringify(artifact!.private_plan)}::jsonb) WHERE id=${sessionId}`;
    const publicSession=await owned(()=>repo.findSession(principal,sessionId));expect(publicSession!.learnerContext).toEqual({});
    expect((await runtime.assessment(principal,sessionId,0,'diagnostic')).diagnostic?.rubric).toBeTruthy();
    await owned(()=>repo.updateSessionLearnerContext(principal,sessionId,{safe:'preserved'}));
    const [history]=await f.admin`SELECT learner_context FROM petros_learning_sessions WHERE id=${sessionId}`;
    expect(history!.learner_context.documentTeachingInternalPlan).toEqual(artifact!.private_plan);
    expect((await owned(()=>repo.findSession(principal,sessionId)))!.learnerContext).toEqual({safe:'preserved'});
    for(const kind of ['role','password_setup'] as const) {
      if(kind==='role')await f.admin`DELETE FROM institution_user_roles WHERE institution_user_id=${principal.institutionUserId} AND role_key='student'`;
      else await f.admin`UPDATE institution_users SET password_reset_required_at=now() WHERE id=${principal.institutionUserId}`;
      try {await expect(runtime.assessment(principal,sessionId,0,'diagnostic')).rejects.toThrow('AUTHORITY_LOST');}
      finally {
        if(kind==='role')await f.admin`INSERT INTO institution_user_roles(institution_user_id,role_key) VALUES(${principal.institutionUserId},'student')`;
        else await f.admin`UPDATE institution_users SET password_reset_required_at=NULL WHERE id=${principal.institutionUserId}`;
      }
    }
    await f.admin`UPDATE knowledge_items SET source_revoked_at=now() WHERE id=${f.owners[0]!.itemId}`;
    try {
      await expect(runtime.assessment(principal,sessionId,0,'diagnostic')).rejects.toThrow('AUTHORITY_LOST');
      await expect(owned(()=>repo.findSession(principal,sessionId))).rejects.toThrow();
    }
    finally {await f.admin`UPDATE knowledge_items SET source_revoked_at=NULL WHERE id=${f.owners[0]!.itemId}`;}
  });
  it('compiles and reviews with current staff course authority, denies expired/revoked qualifications and later permission changes',async()=> {
    authority = await phase2AuthorityFixture({adminSql:f.admin,db:f.tenantDb,directory:f.directory,auditWriter:new AuditWriter(f.tenantDb)} as Phase2TestDatabase);
    const a=authority;
    await expect(a.approve()).rejects.toThrow();
    await a.qualify();await a.approve();expect(await a.current()).toBeTruthy();
    vi.useFakeTimers({toFake:['Date']});
    try {vi.setSystemTime(new Date('2031-01-01')); await expect(a.current()).rejects.toThrow();}
    finally {vi.useRealTimers();}
    await a.admin.insert(schema.petrosReviewerQualifications).values({id:a.qualificationId,version:2,institutionId:a.institutionId,
      reviewerUserId:a.teacherUserId,reviewerStaffId:a.teacherId,subjectKey:a.subjectId,status:'revoked',
      validFrom:new Date('2026-01-01'),validUntil:new Date('2030-01-01'),evidenceKind:'institution_record',evidenceHash:'d'.repeat(64),recordedByUserId:a.teacherUserId});
    await expect(a.current()).rejects.toThrow();
    await a.admin.delete(schema.institutionUserRoles).where(eq(schema.institutionUserRoles.institutionUserId,a.teacherUserId));
    await expect(a.institution(()=>a.packs.compile(a.ctx,{...a.compileCommand,commandId:randomUUID()}))).rejects.toThrow();
    await a.admin.insert(schema.institutionUserRoles).values({institutionUserId:a.teacherUserId,roleKey:'institution_owner'});
  });
  it('denies course source processing after enrollment or material withdrawal',async()=> {
    const a=authority,source=await a.owned(()=>a.knowledge.resolve(a.student,a.source.id));
    const q=await a.owned(()=>preparation.prepare(a.student,source,source.version!.fingerprint,{id:randomUUID(),title:'Projectile',summary:'Synthetic source'}));
    await a.admin.delete(schema.courseEnrollments).where(and(eq(schema.courseEnrollments.courseId,a.course.id),eq(schema.courseEnrollments.studentId,a.student.studentId)));
    await expect(work(q.preparation.id,{institutionId:a.institutionId,studentId:a.student.studentId} as typeof f.owners[0])).rejects.toThrow('AUTHORITY_LOST');
    await expect(a.owned(()=>a.knowledge.resolve(a.student,a.source.id))).rejects.toThrow();
    await a.admin.insert(schema.courseEnrollments).values({institutionId:a.institutionId,studentId:a.student.studentId,courseId:a.course.id});
    await a.admin.update(schema.classMaterials).set({contextId:randomUUID()}).where(eq(schema.classMaterials.id,a.material.id));
    await expect(work(q.preparation.id,{institutionId:a.institutionId,studentId:a.student.studentId} as typeof f.owners[0])).rejects.toThrow('AUTHORITY_LOST');
  });
  it('reviews and publishes an explicit assignment through current staff and recipient authority',async()=> {
    const a=await phase2AuthorityFixture({adminSql:f.admin,db:f.tenantDb,directory:f.directory,auditWriter:new AuditWriter(f.tenantDb)} as Phase2TestDatabase);
    await a.qualify();await a.approve();const approved=await a.current();
    const [year]=await a.admin.insert(schema.academicYears).values({institutionId:a.institutionId,name:'Synthetic',startDate:'2026-01-01',endDate:'2026-12-31'}).returning();
    const [grade]=await a.admin.insert(schema.gradeLevels).values({institutionId:a.institutionId,name:'Synthetic'}).returning();
    const [klass]=await a.admin.insert(schema.classes).values({institutionId:a.institutionId,academicYearId:year!.id,gradeLevelId:grade!.id,name:'Synthetic'}).returning();
    await a.admin.update(schema.students).set({classId:klass!.id}).where(eq(schema.students.id,a.student.studentId));
    const [assignment]=await a.admin.insert(schema.assignments).values({institutionId:a.institutionId,classId:klass!.id,
      academicYearId:year!.id,courseId:a.course.id,subjectId:a.subjectId,teacherId:a.teacherId,title:'Synthetic release',
      status:'published',aiPolicy:'full',audience:[{kind:'student',refId:a.student.studentId}]}).returning();
    await a.admin.insert(schema.assignmentAssignees).values({assignmentId:assignment!.id,studentId:a.student.studentId});
    const [session]=await a.admin.select().from(schema.petrosLearningSessions).where(eq(schema.petrosLearningSessions.id,a.sessionId));
    await a.admin.update(schema.petrosLearningSessions).set({sourceContext:{...session!.sourceContext,assignmentContext:{assignmentId:assignment!.id}}})
      .where(eq(schema.petrosLearningSessions.id,a.sessionId));
    const audit=new AuditWriter(f.tenantDb);
    const policies=new PetrosInstitutionalService(new PetrosInstitutionalRepository(f.tenantDb),gateway as never,audit,a.env as never);
    const service=new PetrosAssignmentLearningService(f.tenantDb,a.env as never,audit,new PortalAuthService(f.tenantDb,a.env as never),a.packs,policies);
    const input={schemaVersion:'petros.assignment-learning-release.v1',expectedAssignmentVersion:assignment!.version,
      target:{kind:'objective',courseId:a.course.id,source:{sessionId:a.sessionId,sourceVersion:a.candidate.sourceVersion,
        locators:approved.trustedContext.resolvedAnchors.map(x=>x.locator)},objective:a.candidate.objective,
        curriculumRevision:a.candidate.curriculumRevision,pack:a.candidate.pack},
      policy:{assistance:'guided_learning',resourceMode:'source_bound',answerDisclosure:'never',evidenceRequirement:'unseen_transfer'},
      recipientContexts:[{studentId:a.student.studentId,sessionId:a.sessionId}]};
    const preview=await service.preview(a.ctx,assignment!.id,input);
    const receipt=await service.commit(a.ctx,assignment!.id,{schemaVersion:input.schemaVersion,commandId:randomUUID(),candidate:preview});
    expect(receipt.state).toBe('released');expect(await a.current()).toBeTruthy();
    expect(await a.owned(()=>f.tenantDb.select().from(schema.petrosAssignmentLearningRecipients)
      .where(eq(schema.petrosAssignmentLearningRecipients.releaseId,receipt.releaseId)))).toHaveLength(1);
    await a.admin.delete(schema.courseEnrollments).where(eq(schema.courseEnrollments.courseId,a.course.id));
    await expect(service.preview(a.ctx,assignment!.id,input)).rejects.toThrow();
    await expect(a.institution(()=>a.packs.requireApprovedPackForReview(a.principal,{courseId:a.course.id,sessionId:a.sessionId,
      studentId:a.student.studentId,packId:a.candidate.pack.id,packVersion:a.candidate.pack.version}))).rejects.toThrow();
  });
  it('uploads/publishes teacher guidance, resumes recipient goals and preserves teacher participation metadata without keys',async()=> {
    const a=await phase2AuthorityFixture({adminSql:f.admin,db:f.tenantDb,directory:f.directory,auditWriter:new AuditWriter(f.tenantDb)} as Phase2TestDatabase);
    const [year]=await a.admin.insert(schema.academicYears).values({institutionId:a.institutionId,name:'Synthetic',startDate:'2026-01-01',endDate:'2026-12-31'}).returning();
    const [grade]=await a.admin.insert(schema.gradeLevels).values({institutionId:a.institutionId,name:'Synthetic',level:1}).returning();
    const [classRow]=await a.admin.insert(schema.classes).values({institutionId:a.institutionId,academicYearId:year!.id,gradeLevelId:grade!.id,name:'Synthetic'}).returning();
    await a.admin.insert(schema.classSubjectTeachers).values({institutionId:a.institutionId,classId:classRow!.id,subjectId:a.subjectId,teacherId:a.teacherId});
    await a.admin.update(schema.students).set({classId:classRow!.id}).where(eq(schema.students.id,a.student.studentId));
    const audit=new AuditWriter(f.tenantDb);
    const files=new PetrosTeacherGuidanceFilesService(f.tenantDb,{...env,STUDENT_STORAGE_DIR:f.directory} as never,new MaterialDocumentPreviewService(),{} as never);
    const guidance=new PetrosTeacherGuidanceService(f.tenantDb,new PortalTeachingService(f.tenantDb),audit,files);
    const uploaded=await a.institution(()=>guidance.uploadFile(a.ctx,classRow!.id,a.subjectId,'notes.txt','text/plain',Buffer.from('Synthetic learning goal reference.')));
    const goal=await a.institution(()=>guidance.create(a.ctx,classRow!.id,a.subjectId,{schemaVersion:'petros.teacher-guidance.v1',commandId:randomUUID(),
      focus:'Explain a synthetic source',instructions:'Use the attached reference.',approach:'practice',sessionMinutes:15,dueDate:'2099-10-14',
      audience:{kind:'students',studentIds:[a.student.studentId]},attachmentObjectIds:[uploaded.id]}));
    const studentAssignments=new StudentAssignmentsService(f.tenantDb,{} as never);
    const detail=await a.owned(()=>studentAssignments.detail(a.student,goal.id));expect(detail).toBeTruthy();
    await a.admin.update(schema.petrosLearningSessions).set({sourceContext:{door:'active_homework',assignmentContext:{assignmentId:goal.id}},
      learnerContext:{documentTeachingInternalPlan:{secret:'unrelated private answer'}}}).where(eq(schema.petrosLearningSessions.id,a.sessionId));
    const otherGoal=await a.institution(()=>guidance.create(a.ctx,classRow!.id,a.subjectId,{schemaVersion:'petros.teacher-guidance.v1',commandId:randomUUID(),
      focus:'A second synthetic goal',instructions:'Use a separate current scope.',approach:'practice',sessionMinutes:15,dueDate:'2099-10-14',
      audience:{kind:'students',studentIds:[a.student.studentId]},attachmentObjectIds:[]}));
    const [prior]=await a.admin.select().from(schema.petrosLearningSessions).where(eq(schema.petrosLearningSessions.id,a.sessionId));
    await a.admin.insert(schema.petrosLearningSessions).values({...prior!,id:randomUUID(),clientRequestId:randomUUID(),
      sourceContext:{door:'active_homework',assignmentContext:{assignmentId:otherGoal.id}},learnerContext:{},
      status:'closed',closeReason:'completed',closedAt:new Date()});
    const workspace=await a.institution(()=>guidance.workspace(a.ctx,classRow!.id,a.subjectId));
    expect(workspace.goals.find(value=>value.id===goal.id)!.recipients[0]!.progress).toBe('started');
    expect(workspace.goals.find(value=>value.id===otherGoal.id)!.recipients[0]!.progress).toBe('session_finished');
    expect(JSON.stringify(workspace)).not.toContain('private answer');
    const foreign=await runInStudentTenant(f.tenantDb,principal,()=>studentAssignments.detail(principal,goal.id)).catch(()=>null);expect(foreign).toBeNull();
    await a.institution(()=>guidance.close(a.ctx,classRow!.id,a.subjectId,goal.id,0));
    await expect(a.owned(()=>f.tenantDb.select().from(schema.storageObjects).where(eq(schema.storageObjects.id,uploaded.id)))).resolves.toEqual([]);
  });
  it('publishes PDF extraction through the real background lease/fence owner without a superuser connection',async()=> {
    const a=await phase2AuthorityFixture({adminSql:f.admin,db:f.tenantDb,directory:f.directory,auditWriter:new AuditWriter(f.tenantDb)} as Phase2TestDatabase);
    await a.admin.update(schema.storageObjects).set({ownerStaffUserId:a.teacherUserId,ownerStudentId:null,filename:'synthetic.pdf'}).where(eq(schema.storageObjects.id,a.object.id));
    const [file]=await a.admin.select().from(schema.storageObjects).where(eq(schema.storageObjects.id,a.object.id));
    const audit=new AuditWriter(f.tenantDb), receipts=new KnowledgePreparationRepository(f.tenantDb);
    const workerEnv={...env,STUDENT_STORAGE_DIR:f.directory,PETROS_PDF_PREPARATION_ENABLED:true,REDIS_ENABLED:true,QUEUE_WORKERS_ENABLED:true};
    const content=new PortalCourseContentService(new PortalCrudEngine(f.tenantDb,audit,{} as never),f.tenantDb,workerEnv as never,
      new MaterialDocumentPreviewService(),{} as never,receipts,audit);
    const parser={extract:vi.fn(async()=>({pages:['Synthetic controlled PDF extraction gives enough source text to explain horizontal and vertical velocity.'],fileSha256:file!.checksumSha256!}))};
    const worker=new PortalMaterialPreparationJobs(f.tenantDb,workerEnv as never,{enabled:false} as never,{} as never,receipts,parser as never,content,new PortalAuthService(f.tenantDb,workerEnv as never),audit);
    const receipt=await a.institution(()=>receipts.enqueue(a.ctx,a.material));
    await worker.execute(a.institutionId,receipt.id);
    const status=await a.institution(()=>receipts.get(a.institutionId,receipt.id));
    expect(status.state).toBe('succeeded');expect(status.fence).toBe(1);
    expect(parser.extract).toHaveBeenCalledOnce();
    const source=await a.owned(()=>a.knowledge.resolve(a.student,a.source.id));expect(source.version!.state).toBe('complete');
    expect(source.allPages[0]!.text).toContain('Synthetic controlled PDF');
    await worker.execute(a.institutionId,receipt.id);expect(parser.extract).toHaveBeenCalledOnce();
    await a.admin.delete(schema.institutionUserRoles).where(eq(schema.institutionUserRoles.institutionUserId,a.teacherUserId));
    await expect(worker.execute(a.institutionId,receipt.id)).rejects.toThrow('Publication permission removed');
    expect(parser.extract).toHaveBeenCalledOnce();
  });

});
