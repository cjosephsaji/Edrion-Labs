import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { eq, schema } from '@edrion/database';
import { petrosNoteContentSchema } from '@edrion/schemas';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { PortalAuthService } from '../portal/portal-auth.service';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { InstitutionRateLimiter } from '../portal/portal-rate-limit';
import { PortalSessionService } from '../portal/portal-session.service';
import { PortalTenantInterceptor } from '../portal/portal-tenant.interceptor';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import { StudentSessionService } from '../student/core/student-session.service';
import { StudentTenantInterceptor } from '../student/core/student-tenant.interceptor';
import {
  PortalPetrosTeachingPackController,
  StudentPetrosTeachingPackController,
} from '../student/knowledge/petros-teaching-pack.controller';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { StudentPetrosAdaptiveController } from '../student/petros-loop/petros-adaptive.controller';
import { PetrosArtifactsRepository } from '../student/petros-artifacts/petros-artifacts.repository';
import { PetrosArtifactsService } from '../student/petros-artifacts/petros-artifacts.service';
import { PetrosLearningArtifactsService } from '../student/petros-artifacts/petros-learning-artifacts.service';
import {
  PortalPetrosQualitativeReviewController,
  StudentPetrosQualitativeReviewController,
} from '../student/petros-artifacts/petros-qualitative-review.controller';
import { PetrosQualitativeReviewRepository } from '../student/petros-artifacts/petros-qualitative-review.repository';
import { PetrosQualitativeReviewService } from '../student/petros-artifacts/petros-qualitative-review.service';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

/**
 * Authenticated Phase 2 HTTP closure. The database is a private Unix-socket cluster migrated from
 * the checked-in journal. Requests use real signed-cookie guards, permission guards, tenant
 * interceptors, production services and the restricted edrion_app role. The only controlled
 * collaborators are the unavailable provider and the already-covered portal availability switch.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Petros Phase 2 authenticated HTTP / disposable PostgreSQL',
  () => {
    let database: Phase2TestDatabase;
    let app: INestApplication;
    let fixture: Awaited<ReturnType<typeof phase2AuthorityFixture>>;
    let foreign: Awaited<ReturnType<typeof phase2AuthorityFixture>>;
    let env: Awaited<ReturnType<typeof phase2AuthorityFixture>>['env'] & Record<string, unknown>;
    let studentCookie = '';
    let teacherCookie = '';
    let foreignStudentCookie = '';
    let foreignTeacherCookie = '';
    let artifacts: PetrosArtifactsService;

    beforeAll(async () => {
      database = await startPhase2TestDatabase();
      fixture = await phase2AuthorityFixture(database);
      foreign = await phase2AuthorityFixture(database);
      env = Object.assign(fixture.env, {
        NODE_ENV: 'test',
        PORTAL_AUTH_DEV_HEADER: false,
        STUDENT_AUTH_DEV_HEADER: false,
        PORTAL_SESSION_COOKIE_NAME: 'petros_phase2_http_portal',
        STUDENT_SESSION_COOKIE_NAME: 'petros_phase2_http_student',
        SESSION_COOKIE_SECRET: 'private-phase2-http-test-secret-at-least-32-characters',
        SESSION_TTL_SECONDS: 3_600,
        RATE_LIMIT_ENABLED: false,
        RECENT_AUTH_ENABLED: true,
        RECENT_AUTH_WINDOW_SECONDS: 900,
      });

      const portalSessions = new PortalSessionService(database.db, env as never);
      const studentSessions = new StudentSessionService(database.db, env as never);
      const studentAuth = new StudentAuthService(
        database.db, database.auditWriter, env as never, studentSessions, {} as never, {} as never,
      );
      const surfaces = { isPortalEnabled: vi.fn(async () => true) };
      const provider = { execute: vi.fn(() => { throw new Error('Provider calls are not permitted'); }) };
      const policies = new PetrosInstitutionalService(
        new PetrosInstitutionalRepository(database.db), provider as never,
        database.auditWriter, env as never,
      );
      const adaptive = new PetrosAdaptiveService(
        database.db, env as never, database.auditWriter, studentAuth, surfaces as never,
        fixture.packs, policies,
      );
      const learning = new PetrosLearningArtifactsService(
        database.db, env as never, database.auditWriter, studentAuth, surfaces as never,
        fixture.packs, policies,
      );
      artifacts = new PetrosArtifactsService(
        new PetrosArtifactsRepository(database.db, fixture.knowledge), {} as never, learning,
      );
      const qualitative = new PetrosQualitativeReviewService(
        database.db, env as never, database.auditWriter,
        new PetrosQualitativeReviewRepository(database.db), fixture.packs, policies,
        studentAuth, surfaces as never,
      );

      const reflector = new Reflector();
      Reflect.defineMetadata('design:paramtypes', [PetrosTeachingPackService], PortalPetrosTeachingPackController);
      Reflect.defineMetadata('design:paramtypes', [PetrosTeachingPackService], StudentPetrosTeachingPackController);
      Reflect.defineMetadata('design:paramtypes', [PetrosAdaptiveService], StudentPetrosAdaptiveController);
      Reflect.defineMetadata('design:paramtypes', [PetrosQualitativeReviewService], PortalPetrosQualitativeReviewController);
      Reflect.defineMetadata('design:paramtypes', [PetrosQualitativeReviewService], StudentPetrosQualitativeReviewController);
      const module = await Test.createTestingModule({
        controllers: [
          PortalPetrosTeachingPackController,
          StudentPetrosTeachingPackController,
          StudentPetrosAdaptiveController,
          PortalPetrosQualitativeReviewController,
          StudentPetrosQualitativeReviewController,
        ],
        providers: [
          { provide: PetrosTeachingPackService, useValue: fixture.packs },
          { provide: PetrosAdaptiveService, useValue: adaptive },
          { provide: PetrosQualitativeReviewService, useValue: qualitative },
        ],
      })
        .overrideGuard(InstitutionAuthGuard)
        .useValue(new InstitutionAuthGuard(
          new PortalAuthService(database.db, env as never), portalSessions,
          new InstitutionRateLimiter(env as never, { enabled: false } as never), env as never,
        ))
        .overrideGuard(InstitutionPermissionsGuard)
        .useValue(new InstitutionPermissionsGuard(reflector, env as never))
        .overrideGuard(StudentAuthGuard)
        .useValue(new StudentAuthGuard(studentAuth, studentSessions, env as never))
        .overrideGuard(StudentPermissionsGuard)
        .useValue(new StudentPermissionsGuard(reflector))
        .overrideGuard(StudentPortalGuard)
        .useValue(new StudentPortalGuard(surfaces as never))
        .overrideGuard(StudentRateLimitGuard)
        .useValue(new StudentRateLimitGuard(reflector, env as never, { enabled: false } as never))
        .compile();

      app = module.createNestApplication();
      app.setGlobalPrefix('v1');
      app.use((req: { context: object }, _res: unknown, next: () => void) => {
        req.context = {
          requestId: randomUUID(), correlationId: randomUUID(), apiEndpoint: 'petros-phase2-http',
        };
        next();
      });
      app.useGlobalInterceptors(
        new PortalTenantInterceptor(database.db), new StudentTenantInterceptor(database.db),
      );
      const logger = { child: () => logger, warn: vi.fn(), error: vi.fn() };
      app.useGlobalFilters(new AllExceptionsFilter(logger as never, { captureException: vi.fn() } as never));
      await app.listen(0, '127.0.0.1');

      const issuedTeacher = await portalSessions.issue({
        institutionId: fixture.institutionId, institutionUserId: fixture.teacherUserId, aal: 'aal2',
      });
      teacherCookie = `${portalSessions.cookieName}=${issuedTeacher.token}`;
      const issuedStudent = await studentSessions.issue({
        kind: 'institutional', userId: fixture.student.institutionUserId,
        institutionId: fixture.institutionId,
      });
      studentCookie = `${studentSessions.cookieName}=${issuedStudent.token}`;
      const issuedForeignTeacher = await portalSessions.issue({
        institutionId: foreign.institutionId, institutionUserId: foreign.teacherUserId, aal: 'aal2',
      });
      foreignTeacherCookie = `${portalSessions.cookieName}=${issuedForeignTeacher.token}`;
      const issuedForeignStudent = await studentSessions.issue({
        kind: 'institutional', userId: foreign.student.institutionUserId,
        institutionId: foreign.institutionId,
      });
      foreignStudentCookie = `${studentSessions.cookieName}=${issuedForeignStudent.token}`;
    }, 90_000);

    afterAll(async () => {
      await app?.close();
      await database?.close();
    });

    it('enforces cookies, permissions, tenant scope and default-off gates across the Phase 2 HTTP journey', async () => {
      const http = supertest(app.getHttpServer());
      const compilePath = '/v1/portal/petros/teaching-packs/candidates/compile';
      const reviewPath = `/v1/portal/petros/teaching-packs/candidates/${fixture.compiled.candidateId}/reviews`;
      const packsPath = `/v1/student/petros/sessions/${fixture.sessionId}/teaching-packs`;
      const adaptivePath = `/v1/student/petros/sessions/${fixture.sessionId}/adaptive`;

      await http.post(compilePath).send(fixture.compileCommand).expect(401);
      await http.post(compilePath)
        .set('x-institution-user-email', fixture.principal.email)
        .send(fixture.compileCommand)
        .expect(401);
      const compiled = await http.post(compilePath).set('Cookie', teacherCookie)
        .send(fixture.compileCommand).expect(201);
      expect(compiled.body).toMatchObject({ candidateId: fixture.compiled.candidateId, replayed: true });

      const unqualified = await http.post(reviewPath).set('Cookie', teacherCookie)
        .send(fixture.reviewCommand).expect(403);
      expect(unqualified.body.code).toBe('PETROS_REVIEWER_QUALIFICATION_REQUIRED');
      await fixture.qualify();
      const reviewed = await http.post(reviewPath).set('Cookie', teacherCookie)
        .send(fixture.reviewCommand).expect(201);
      expect(reviewed.body).toMatchObject({ replayed: false, receipt: { decision: 'approved' } });

      await http.get(packsPath).expect(401);
      const packs = await http.get(packsPath).set('Cookie', studentCookie).expect(200);
      expect(packs.headers['cache-control']).toBe('private, no-store');
      expect(packs.body).toMatchObject({ status: 'ready', packs: [{ pack: fixture.candidate.pack }] });
      expect(JSON.stringify(packs.body)).not.toContain('answerKey');
      expect(JSON.stringify(packs.body)).not.toContain('authoritySnapshot');
      await http.get(packsPath).set('Cookie', foreignStudentCookie).expect(404);
      await http.get(adaptivePath).expect(401);
      await http.get(adaptivePath).set('Cookie',foreignStudentCookie).expect(404);
      expect((await http.get(adaptivePath).set('Cookie',studentCookie).expect(200)).body)
        .toMatchObject({status:'available',packs:[{pack:fixture.candidate.pack}]});

      const bind = { commandId: randomUUID(), pack: fixture.candidate.pack };
      const forged = await http.post(adaptivePath).set('Cookie', studentCookie)
        .send({ ...bind, candidateHash: fixture.compiled.payloadHash, reviewerAuthority: {} }).expect(400);
      expect(forged.body.code).toBe('VALIDATION_ERROR');
      expect(await fixture.admin.select().from(schema.petrosAdaptiveBindings)
        .where(eq(schema.petrosAdaptiveBindings.sessionId, fixture.sessionId))).toEqual([]);

      fixture.env.PETROS_ADAPTIVE_TEACHING_ENABLED = false;
      expect((await http.get(adaptivePath).set('Cookie',studentCookie).expect(200)).body).toEqual({status:'disabled'});
      const disabled = await http.post(adaptivePath).set('Cookie', studentCookie).send(bind).expect(409);
      expect(disabled.body.code).toBe('PETROS_ADAPTIVE_TEACHING_DISABLED');
      fixture.env.PETROS_ADAPTIVE_TEACHING_ENABLED = true;
      expect((await http.post(adaptivePath).set('Cookie', studentCookie).send(bind).expect(201)).body)
        .toMatchObject({ status: 'bound', replayed: false, pack: fixture.candidate.pack });
      expect((await http.post(adaptivePath).set('Cookie', studentCookie).send(bind).expect(201)).body)
        .toMatchObject({ status: 'bound', replayed: true });
      expect((await http.get(adaptivePath).set('Cookie',studentCookie).expect(200)).body)
        .toMatchObject({status:'bound',pack:fixture.candidate.pack,objective:fixture.candidate.objective});

      const scope = {
        institutionId: fixture.institutionId,
        studentId: fixture.student.studentId,
        sessionId: fixture.sessionId,
      };
      const decisionId = randomUUID();
      const blockId = randomUUID();
      await fixture.admin.insert(schema.petrosPlanningDecisions).values({
        ...scope, id: decisionId, sequence: 1, selectedMoveType: 'layered_explanation',
        targetConcept: fixture.candidate.objective.id, studentSafeReason: 'Reviewed source',
        decisionFactors: [], moveParameters: {}, expectedEvidence: 'none', progressEffect: {},
        termination: {}, guessFirst: {}, observationResponse: {}, source: 'deterministic_fallback',
        functionKey: 'synthetic', promptVersion: 'synthetic', schemaVersion: 'synthetic',
        correlationId: randomUUID(),
      });
      await fixture.admin.insert(schema.petrosTeachingBlocks).values({
        ...scope, id: blockId, decisionId, sequence: 1, type: 'layered_explanation', content: {},
        delivery: 'deterministic_fallback', functionKey: 'synthetic', promptVersion: 'synthetic',
        schemaVersion: 'synthetic', correlationId: randomUUID(),
      });
      const note = petrosNoteContentSchema.parse({
        kind: 'note', title: 'Component explanation',
        body: 'Both components are zero at the apex.', tags: [],
      });
      const saved = await fixture.owned(() => artifacts.saveBlockArtifact(
        fixture.student, fixture.sessionId, blockId, { idempotencyKey: randomUUID(), content: note },
      ));
      const task = fixture.candidate.assessments[0]!;
      const draftCommand = {
        schemaVersion: 'petros.qualitative-review.v1', commandId: randomUUID(),
        artifactId: saved.id, sessionId: fixture.sessionId, expectedRevision: 1,
        courseId: fixture.course.id, objective: fixture.candidate.objective,
        pack: fixture.candidate.pack, task: { id: task.id, variant: task.variant },
      };
      const requested = await http.post('/v1/student/petros/qualitative-submissions/draft-feedback-requests')
        .set('Cookie', studentCookie).send(draftCommand).expect(201);
      const requestId = requested.body.request.submissionId as string;
      const criterionId = fixture.candidate.rubric.criteria[0]!.id;
      const draftFeedback = await http.post('/v1/portal/petros/qualitative-reviews/draft-feedback')
        .set('Cookie', teacherCookie).send({
          schemaVersion: 'petros.qualitative-review.v1', commandId: randomUUID(), requestId,
          qualificationId: fixture.qualificationId, expectedQualificationVersion: 1,
          reason: 'Please distinguish the two components in the revision.',
          productFeedback: [{ criterionId, observation: { status: 'observed', spans: [{ start: 0, end: 20 }] },
            feedback: 'Check which component gravity changes.', uncertainty: 'low' }],
        }).expect(201);
      const revised = {
        ...note,
        body: 'Only vertical velocity is zero at the apex. Horizontal velocity remains constant.',
      };
      await fixture.owned(() => artifacts.updateSaved(
        fixture.student, saved.id, { expectedRevision: 1, content: revised },
      ));
      const submitted = await http.post('/v1/student/petros/qualitative-submissions')
        .set('Cookie', studentCookie).send({
          ...draftCommand, commandId: randomUUID(), expectedRevision: 2,
          draftFeedbackId: draftFeedback.body.feedback.id, shareLearningProvenance: false,
        }).expect(201);
      const submissionId = submitted.body.submissionId as string;
      const inspectionPath = `/v1/portal/petros/qualitative-reviews/submissions/${submissionId}/inspection`;

      await http.get(inspectionPath).expect(401);
      await http.get(inspectionPath).set('Cookie', foreignTeacherCookie).expect(404);
      const pending = await http.get(inspectionPath).set('Cookie', teacherCookie).expect(200);
      expect(pending.body).toMatchObject({
        submissionId, studentId: fixture.student.studentId, reviewStatus: 'pending',
        provenance: { status: 'not_shared' }, evidenceAdmission: 'not_granted', numericProjection: false,
      });
      const publicJson = JSON.stringify(pending.body);
      for (const privateKey of ['answerKey', 'rawAnswer', 'chainOfThought', 'privateHistory'])
        expect(publicJson).not.toContain(privateKey);

      const approval = await http.post('/v1/portal/petros/qualitative-reviews')
        .set('Cookie', teacherCookie).send({
          schemaVersion: 'petros.qualitative-review.v1', commandId: randomUUID(), submissionId,
          qualificationId: fixture.qualificationId, expectedQualificationVersion: 1,
          decision: 'approved', reason: 'Synthetic explicit review for isolated verification.',
          productFeedback: [{ criterionId, observation: { status: 'observed', spans: [{ start: 0, end: 20 }] },
            feedback: 'The revision distinguishes the components.', uncertainty: 'low' }],
        }).expect(201);
      expect(approval.body).toMatchObject({ evidenceAdmission: 'not_granted', numericProjection: false });
      const approvedInspection = await http.get(inspectionPath).set('Cookie', teacherCookie).expect(200);
      expect(approvedInspection.body).toMatchObject({ reviewStatus: 'approved', numericProjection: false });
      expect(JSON.stringify(approvedInspection.body)).not.toContain('answerKey');

      fixture.env.PETROS_QUALITATIVE_REVIEW_ENABLED = false;
      const qualitativeDisabled = await http.get(inspectionPath).set('Cookie', teacherCookie).expect(409);
      expect(qualitativeDisabled.body.code).toBe('PETROS_QUALITATIVE_REVIEW_DISABLED');
      fixture.env.PETROS_QUALITATIVE_REVIEW_ENABLED = true;
    }, 60_000);
  },
);
