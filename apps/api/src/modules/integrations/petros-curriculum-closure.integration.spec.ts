import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditWriter } from '@edrion/audit';
import { createTenantAwareDatabase, schema, type Database } from '@edrion/database';
import {
  CURRICULUM_ALIGNMENT_VERSION,
  type CurriculumAlignment,
} from '@edrion/schemas';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentSessionService } from '../student/core/student-session.service';
import { StudentTenantInterceptor } from '../student/core/student-tenant.interceptor';
import { StudentCoursesController } from '../student/courses/student-courses.controller';
import { StudentCoursesService } from '../student/courses/student-courses.service';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { PortalAuthService } from '../portal/portal-auth.service';
import { PortalCrudEngine } from '../portal/portal-crud.engine';
import { PortalEntityResolver } from '../portal/portal-entity-resolver';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { InstitutionRateLimiter } from '../portal/portal-rate-limit';
import { PortalSessionService } from '../portal/portal-session.service';
import { PortalTenantInterceptor } from '../portal/portal-tenant.interceptor';
import { PortalCoursesController } from '../portal/courses/portal-courses.controller';
import { PortalCoursesService } from '../portal/courses/portal-courses.service';
import { syllabusIdentityHash } from '../portal/courses/course-curriculum.repository';

/**
 * V11-06/07 closure evidence. The suite owns a private PostgreSQL cluster, migrates the real
 * schema, connects production services through the restricted application role, and crosses the
 * actual cookie auth, permission, scope, tenant and HTTP serialization boundaries.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Petros curriculum closure / disposable PostgreSQL',
  () => {
    let directory = '';
    let running = false;
    let admin: ReturnType<typeof postgres>;
    let application: ReturnType<typeof postgres>;
    let app: INestApplication;
    let tenantDb: Database;
    let sessions: PortalSessionService;
    let studentSessions: StudentSessionService;
    let ownerCookie = '';
    let instructorCookie = '';
    let courseManagerCookie = '';
    let assignedWithoutSyllabusCookie = '';
    let studentCookie = '';
    let foreignStudentCookie = '';

    const institutionId = randomUUID();
    const foreignInstitutionId = randomUUID();
    const campusId = randomUUID();
    const excludedCampusId = randomUUID();
    const academicYearId = randomUUID();
    const gradeLevelId = randomUUID();
    const classId = randomUUID();
    const ownerId = randomUUID();
    const instructorId = randomUUID();
    const courseManagerId = randomUUID();
    const assignedWithoutSyllabusId = randomUUID();
    const studentUserId = randomUUID();
    const foreignStudentUserId = randomUUID();
    const studentId = randomUUID();
    const foreignStudentId = randomUUID();
    const staffId = randomUUID();
    const replacementStaffId = randomUUID();
    const assignedWithoutSyllabusStaffId = randomUUID();
    const courseIds = {
      projection: randomUUID(),
      history: randomUUID(),
      stale: randomUUID(),
      unsupported: randomUUID(),
      unmapped: randomUUID(),
      auth: randomUUID(),
      rollbackManifest: randomUUID(),
      rollbackSyllabus: randomUUID(),
      rollbackAudit: randomUUID(),
      race: randomUUID(),
      approvalWithoutProposal: randomUUID(),
      coverageOnly: randomUUID(),
      supersession: randomUUID(),
      leastPrivilege: randomUUID(),
    } as const;
    const env = {
      NODE_ENV: 'test',
      PORTAL_AUTH_DEV_HEADER: false,
      STUDENT_AUTH_DEV_HEADER: false,
      PORTAL_SESSION_COOKIE_NAME: 'petros_curriculum_closure_portal',
      STUDENT_SESSION_COOKIE_NAME: 'petros_curriculum_closure_student',
      SESSION_COOKIE_SECRET: 'private-curriculum-closure-secret-at-least-32-characters',
      SESSION_TTL_SECONDS: 3600,
      RATE_LIMIT_ENABLED: false,
      RECENT_AUTH_ENABLED: true,
      RECENT_AUTH_WINDOW_SECONDS: 900,
      PETROS_CURRICULUM_ALIGNMENT_ENABLED: true,
    };

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), 'petros-curriculum-closure-'));
      execFileSync('initdb', [
        '-D', join(directory, 'data'), '-U', 'petros_test', '-A', 'trust', '--no-locale', '-E', 'UTF8',
      ], { stdio: 'pipe' });
      execFileSync('pg_ctl', [
        '-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
        '-o', `-F -k ${directory} -h ''`, '-w', 'start',
      ], { stdio: 'pipe' });
      running = true;
      admin = postgres({ host: directory, username: 'petros_test', database: 'postgres', max: 3, onnotice: () => {} });
      await admin.unsafe('CREATE ROLE edrion_app LOGIN NOBYPASSRLS');

      const migrations = join(__dirname, '../../../../../packages/database/migrations');
      const rls = readFileSync(join(migrations, 'sql/zzz_rls.sql'), 'utf8');
      await admin.unsafe(rls.slice(0, rls.indexOf('-- institutions:')));
      await migrate(drizzle(admin, { schema }), { migrationsFolder: migrations });
      for (const filename of readdirSync(join(migrations, 'sql'))
        .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
        .sort()) {
        await admin.unsafe(readFileSync(join(migrations, 'sql', filename), 'utf8'));
      }

      application = postgres({ host: directory, username: 'edrion_app', database: 'postgres', max: 8, onnotice: () => {} });
      tenantDb = createTenantAwareDatabase(drizzle(application, { schema }));
      const db = drizzle(admin, { schema });
      await db.insert(schema.institutions).values([
        { id: institutionId, publicId: 'curriculum-closure', legalName: 'Curriculum closure', displayName: 'Curriculum closure', type: 'school', country: 'IN', primaryContact: { name: 'Closure', email: 'closure@example.test' } },
        { id: foreignInstitutionId, publicId: 'curriculum-foreign', legalName: 'Curriculum foreign', displayName: 'Curriculum foreign', type: 'school', country: 'IN', primaryContact: { name: 'Foreign', email: 'foreign@example.test' } },
      ]);
      await db.insert(schema.campuses).values([
        { id: campusId, institutionId, name: 'Curriculum campus', code: 'CURR' },
        { id: excludedCampusId, institutionId, name: 'Excluded campus', code: 'EXCL' },
      ]);
      await db.insert(schema.academicYears).values({ id: academicYearId, institutionId, campusId,
        name: 'Closure 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' });
      await db.insert(schema.gradeLevels).values({ id: gradeLevelId, institutionId, campusId,
        name: 'Closure grade', level: 1 });
      await db.insert(schema.classes).values({ id: classId, institutionId, campusId,
        academicYearId, gradeLevelId, name: 'Closure class' });
      await db.insert(schema.institutionUsers).values([
        { id: ownerId, institutionId, fullName: 'Curriculum owner', email: 'curriculum-owner@example.test', status: 'active' },
        { id: instructorId, institutionId, fullName: 'Assigned instructor', email: 'curriculum-instructor@example.test', status: 'active', directGrants: ['syllabus.manage'] },
        { id: courseManagerId, institutionId, fullName: 'Course manager only', email: 'curriculum-course-manager@example.test', status: 'active', directGrants: ['courses.manage'] },
        { id: assignedWithoutSyllabusId, institutionId, fullName: 'Assigned without syllabus access', email: 'curriculum-assigned-no-syllabus@example.test', status: 'active' },
        { id: studentUserId, institutionId, fullName: 'Closure student', email: 'curriculum-student@example.test', status: 'active' },
        { id: foreignStudentUserId, institutionId: foreignInstitutionId, fullName: 'Foreign student', email: 'foreign-student@example.test', status: 'active' },
      ]);
      await db.insert(schema.institutionUserRoles).values([
        { institutionUserId: ownerId, roleKey: 'institution_owner' },
        { institutionUserId: instructorId, roleKey: 'teacher' },
        { institutionUserId: courseManagerId, roleKey: 'teacher' },
        { institutionUserId: assignedWithoutSyllabusId, roleKey: 'teacher' },
        { institutionUserId: studentUserId, roleKey: 'student' },
        { institutionUserId: foreignStudentUserId, roleKey: 'student' },
      ]);
      await db.insert(schema.campusUserAccess).values([
        { institutionUserId: instructorId, campusId, accessLevel: 'manage' },
        { institutionUserId: courseManagerId, campusId, accessLevel: 'manage' },
        { institutionUserId: assignedWithoutSyllabusId, campusId, accessLevel: 'manage' },
      ]);
      await db.insert(schema.staff).values([
        { id: staffId, institutionId, campusId, institutionUserId: instructorId, firstName: 'Assigned', lastName: 'Instructor' },
        { id: replacementStaffId, institutionId, campusId, firstName: 'Replacement', lastName: 'Instructor' },
        { id: assignedWithoutSyllabusStaffId, institutionId, campusId, institutionUserId: assignedWithoutSyllabusId, firstName: 'Assigned', lastName: 'No syllabus' },
      ]);
      await db.insert(schema.students).values([
        { id: studentId, institutionId, campusId, classId, institutionUserId: studentUserId, admissionNo: 'CLOSE-1', firstName: 'Closure', lastName: 'Student' },
        { id: foreignStudentId, institutionId: foreignInstitutionId, institutionUserId: foreignStudentUserId, admissionNo: 'FOREIGN-1', firstName: 'Foreign', lastName: 'Student' },
      ]);
      await db.insert(schema.courses).values(Object.entries(courseIds).map(([name, id]) => ({
        id, institutionId, campusId, code: `CLOSE-${name}`, name: `Closure ${name}`,
        professorTeacherId: name === 'leastPrivilege' ? assignedWithoutSyllabusStaffId : staffId,
      })));
      await db.insert(schema.courseEnrollments).values(
        [courseIds.projection, courseIds.stale, courseIds.unsupported, courseIds.unmapped, courseIds.coverageOnly, courseIds.supersession]
          .map((courseId) => ({ institutionId, campusId, studentId, courseId })),
      );

      const audit = new AuditWriter(tenantDb);
      const courses = new PortalCoursesService(
        new PortalCrudEngine(tenantDb, audit, new PortalEntityResolver(tenantDb)), tenantDb, env as never, audit,
      );
      sessions = new PortalSessionService(tenantDb, env as never);
      studentSessions = new StudentSessionService(tenantDb, env as never);
      const studentAuth = new StudentAuthService(tenantDb, audit, env as never, studentSessions, {} as never, {} as never);
      const reflector = new Reflector();
      Reflect.defineMetadata('design:paramtypes', [PortalCoursesService], PortalCoursesController);
      Reflect.defineMetadata('design:paramtypes', [StudentCoursesService], StudentCoursesController);
      const module = await Test.createTestingModule({
        controllers: [PortalCoursesController, StudentCoursesController],
        providers: [
          { provide: PortalCoursesService, useValue: courses },
          { provide: StudentCoursesService, useValue: new StudentCoursesService(tenantDb) },
        ],
      }).overrideGuard(InstitutionAuthGuard).useValue(new InstitutionAuthGuard(
        new PortalAuthService(tenantDb, env as never), sessions,
        new InstitutionRateLimiter(env as never, { enabled: false } as never), env as never,
      )).overrideGuard(InstitutionPermissionsGuard).useValue(new InstitutionPermissionsGuard(reflector, env as never))
        .overrideGuard(StudentAuthGuard).useValue(new StudentAuthGuard(studentAuth, studentSessions, env as never))
        .overrideGuard(StudentPermissionsGuard).useValue(new StudentPermissionsGuard(reflector)).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('v1');
      app.use((req: { context: object }, _res: unknown, next: () => void) => {
        req.context = { requestId: randomUUID(), correlationId: randomUUID(), apiEndpoint: 'curriculum-closure-http' };
        next();
      });
      app.useGlobalInterceptors(new PortalTenantInterceptor(tenantDb), new StudentTenantInterceptor(tenantDb));
      const logger = { child: () => logger, warn: vi.fn(), error: vi.fn() };
      app.useGlobalFilters(new AllExceptionsFilter(logger as never, { captureException: vi.fn() } as never));
      await app.listen(0, '127.0.0.1');

      ownerCookie = (await issuePortalCookie(ownerId, 'aal2')).cookie;
      instructorCookie = (await issuePortalCookie(instructorId, 'aal1')).cookie;
      courseManagerCookie = (await issuePortalCookie(courseManagerId, 'aal1')).cookie;
      assignedWithoutSyllabusCookie = (await issuePortalCookie(assignedWithoutSyllabusId, 'aal1')).cookie;
      studentCookie = await issueStudentCookie(studentUserId, institutionId);
      foreignStudentCookie = await issueStudentCookie(foreignStudentUserId, foreignInstitutionId);
    }, 60_000);

    afterAll(async () => {
      await app?.close();
      await application?.end({ timeout: 1 });
      await admin?.end({ timeout: 1 });
      if (running) execFileSync('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    async function issuePortalCookie(institutionUserId: string, aal: 'aal1' | 'aal2') {
      const issued = await sessions.issue({ institutionId, institutionUserId, aal });
      return { cookie: `${sessions.cookieName}=${issued.token}`, sessionId: issued.session.id };
    }

    async function issueStudentCookie(userId: string, ownerInstitutionId: string) {
      const issued = await studentSessions.issue({ kind: 'institutional', userId, institutionId: ownerInstitutionId });
      return `${studentSessions.cookieName}=${issued.token}`;
    }

    const portalPath = (courseId: string) => `/v1/portal/courses/${courseId}/syllabus`;
    const studentPath = (courseId: string) => `/v1/student/courses/${courseId}/syllabus`;
    const negotiated = (request: supertest.Test) => request.set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION);
    const modulesOne = [{ weekNo: 1, title: 'Closure module', topics: ['Explicit closure topic'], covered: false }];

    async function propose(courseId: string, payload: CurriculumAlignment, modules = modulesOne, cookie = ownerCookie) {
      const commandId = randomUUID();
      const response = await negotiated(supertest(app.getHttpServer()).post(portalPath(courseId)).set('Cookie', cookie))
        .send({ modules, curriculum: { commandId, expectedRevision: 0, reason: 'Closure proposal', payload } });
      return { commandId, response };
    }

    it('projects the complete approved reference closure and every alignment state through raw student HTTP', async () => {
      const proposal = projectionFixture();
      const modules = [
        { weekNo: 1, title: 'Projection references', topics: ['Explicit reference closure'], covered: false },
        { weekNo: 2, title: 'Future-only references', topics: ['Not yet effective'], covered: false },
      ];
      const first = await propose(courseIds.projection, proposal, modules, instructorCookie);
      expect(first.response.status).toBe(201);

      const reviewed = reviewProjection(proposal);
      const review = await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.projection)}/review`).set('Cookie', ownerCookie))
        .send({ modules, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'Closure review', payload: reviewed } });
      expect(review.status).toBe(201);

      const portal = await negotiated(supertest(app.getHttpServer()).get(portalPath(courseIds.projection)).set('Cookie', instructorCookie)).expect(200);
      expect(portal.body.curriculum.data.alignments.map((row: { state: string }) => row.state)).toEqual([
        'approved', 'approved', 'proposed', 'rejected', 'not_effective', 'stale',
      ]);

      const student = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.projection)).set('Cookie', studentCookie)).expect(200);
      const data = student.body.curriculum.data;
      expect(student.headers['cache-control']).toBe('private, no-store');
      expect(student.body.curriculum).toMatchObject({ status: 'ready', revision: 2, evidence: 'not_assessed' });
      expect(data.alignments.map((row: { id: string; state: string }) => [row.id, row.state])).toEqual([
        [reviewed.alignments[0]!.id, 'approved'], [reviewed.alignments[1]!.id, 'approved'],
      ]);
      expect(data.items.map((row: { id: string }) => row.id)).toEqual(reviewed.items.slice(0, 2).map((row) => row.id));
      expect(data.relationships.map((row: { id: string }) => row.id)).toEqual([reviewed.relationships[0]!.id]);
      expect(data.releases.map((row: { id: string }) => row.id)).toEqual([
        reviewed.releases[0]!.id, reviewed.releases[1]!.id,
      ]);
      expect(data.releases[1].supersedes).toEqual({ id: reviewed.releases[0]!.id, version: 1 });
      expect(data.frameworks.map((row: { id: string }) => row.id)).toEqual([reviewed.frameworks[0]!.id]);
      expect(data.moduleObjectives).toEqual([{
        weekNo: 1,
        objectives: [0, 1, 2, 6].map((index) => ({ id: reviewed.objectives[index]!.id, version: 1 })),
      }]);
      expect(data.unmappedObjectives.sort()).toEqual([2, 3, 5, 6].map((index) => reviewed.objectives[index]!.id).sort());
      expect(student.body).not.toHaveProperty('history');
      for (const index of [2, 3, 4, 5]) {
        expect(student.text).not.toContain(reviewed.alignments[index]!.id);
        expect(student.text).not.toContain(reviewed.items[index]!.id);
        expect(student.text).not.toContain(reviewed.items[index]!.descriptor);
        expect(student.text).not.toContain(reviewed.alignments[index]!.rationale);
      }
      expect(student.text).not.toContain(reviewed.frameworks[1]!.id);
      expect(student.text).not.toContain(reviewed.releases[2]!.id);
      expect(student.text).not.toContain(reviewed.relationships[1]!.id);
    });

    it('fails closed for withdrawn and foreign students without curriculum disclosure', async () => {
      await admin`UPDATE students SET status = 'inactive' WHERE id = ${studentId}`;
      const withdrawn = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.projection)).set('Cookie', studentCookie)).expect(404);
      expect(withdrawn.body).not.toHaveProperty('curriculum');
      await admin`UPDATE students SET status = 'enrolled' WHERE id = ${studentId}`;

      const foreign = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.projection)).set('Cookie', foreignStudentCookie)).expect(404);
      expect(foreign.body).not.toHaveProperty('curriculum');
      expect(foreign.text).not.toContain(courseIds.projection);
    });

    it('denies inactive, reassigned and campus-excluded instructors at the real guard/service boundary', async () => {
      const path = portalPath(courseIds.projection);
      await admin`UPDATE staff SET status = 'inactive' WHERE id = ${staffId}`;
      expect((await negotiated(supertest(app.getHttpServer()).get(path).set('Cookie', instructorCookie))).body.code)
        .toBe('COURSE_SCOPE_REQUIRED');
      await admin`UPDATE staff SET status = 'active' WHERE id = ${staffId}`;

      await admin`UPDATE courses SET professor_teacher_id = ${replacementStaffId} WHERE id = ${courseIds.projection}`;
      expect((await negotiated(supertest(app.getHttpServer()).get(path).set('Cookie', instructorCookie))).body.code)
        .toBe('COURSE_SCOPE_REQUIRED');
      await admin`UPDATE courses SET professor_teacher_id = ${staffId} WHERE id = ${courseIds.projection}`;

      await admin`DELETE FROM campus_user_access WHERE institution_user_id = ${instructorId}`;
      await admin`INSERT INTO campus_user_access (institution_user_id, campus_id, access_level) VALUES (${instructorId}, ${excludedCampusId}, 'manage')`;
      const excluded = await negotiated(supertest(app.getHttpServer()).get(path).set('Cookie', instructorCookie)
        .set('x-institution-scope', `campus:${campusId}`)).expect(403);
      expect(excluded.body.code).toBe('SCOPE_FORBIDDEN');
      await admin`DELETE FROM campus_user_access WHERE institution_user_id = ${instructorId}`;
      await admin`INSERT INTO campus_user_access (institution_user_id, campus_id, access_level) VALUES (${instructorId}, ${campusId}, 'manage')`;
    });

    it('does not let course management or an instructor assignment substitute for direct syllabus access', async () => {
      const courseId = courseIds.leastPrivilege;
      const before = await courseState(courseId);
      const review = () => ({ modules: modulesOne, curriculum: {
        commandId: randomUUID(), expectedRevision: 0, reason: 'Unauthorized syllabus review', payload: minimalFixture(),
      } });

      const courseManagerGet = await negotiated(supertest(app.getHttpServer()).get(portalPath(courseId))
        .set('Cookie', courseManagerCookie)).expect(403);
      const courseManagerReview = await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseId)}/review`)
        .set('Cookie', courseManagerCookie)).send(review()).expect(403);
      expect(courseManagerGet.body.code).toBe('FORBIDDEN');
      expect(courseManagerReview.body.code).toBe('FORBIDDEN');

      const assignedGet = await negotiated(supertest(app.getHttpServer()).get(portalPath(courseId))
        .set('Cookie', assignedWithoutSyllabusCookie)).expect(403);
      const assignedReview = await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseId)}/review`)
        .set('Cookie', assignedWithoutSyllabusCookie)).send(review()).expect(403);
      expect(assignedGet.body.code).toBe('FORBIDDEN');
      expect(assignedReview.body.code).toBe('FORBIDDEN');
      expect(await courseState(courseId)).toEqual(before);
    });

    it('enforces route-specific recent-auth and MFA before an alignment review', async () => {
      const proposal = minimalFixture();
      expect((await propose(courseIds.auth, proposal)).response.status).toBe(201);
      const reviewed = approveMinimal(proposal);
      await admin`UPDATE institution_users SET mfa_enrolled = true WHERE id = ${ownerId}`;

      const stale = await issuePortalCookie(ownerId, 'aal2');
      await admin`UPDATE portal_sessions SET last_auth_at = now() - interval '1 hour' WHERE id = ${stale.sessionId}`;
      const staleDenied = await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.auth)}/review`).set('Cookie', stale.cookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'Stale denial', payload: reviewed } }).expect(403);
      expect(staleDenied.body.code).toBe('RECENT_AUTH_REQUIRED');

      const aal1 = await issuePortalCookie(ownerId, 'aal1');
      const stepUpDenied = await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.auth)}/review`).set('Cookie', aal1.cookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'MFA denial', payload: reviewed } }).expect(403);
      expect(stepUpDenied.body.code).toBe('STEP_UP_REQUIRED');

      const aal2 = await issuePortalCookie(ownerId, 'aal2');
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.auth)}/review`).set('Cookie', aal2.cookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'Strong review', payload: reviewed } }).expect(201);
      await admin`UPDATE institution_users SET mfa_enrolled = false WHERE id = ${ownerId}`;
      const [counts] = await admin`SELECT count(*)::int AS revisions FROM course_curriculum_revisions WHERE course_id = ${courseIds.auth}`;
      expect(counts?.revisions).toBe(2);
    });

    it('rejects direct approval without a prior proposal without writing a record, revision or audit', async () => {
      const directlyApproved = minimalFixture();
      directlyApproved.alignments[0] = { ...directlyApproved.alignments[0]!, status: 'approved' };
      const rejected = await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.approvalWithoutProposal)}/review`)
        .set('Cookie', ownerCookie)).send({ modules: modulesOne, curriculum: {
          commandId: randomUUID(), expectedRevision: 0, reason: 'Attempt unsupported direct approval', payload: directlyApproved,
        } }).expect(409);
      expect(rejected.body.code).toBe('CURRICULUM_REVIEW_REQUIRED');
      const [writes] = await admin`
        SELECT
          (SELECT count(*)::int FROM course_curriculum_records WHERE course_id = ${courseIds.approvalWithoutProposal}) AS records,
          (SELECT count(*)::int FROM course_curriculum_revisions WHERE course_id = ${courseIds.approvalWithoutProposal}) AS revisions,
          (SELECT count(*)::int FROM audit_events WHERE entity_id = ${courseIds.approvalWithoutProposal}) AS audits
      `;
      expect(writes).toEqual({ records: 0, revisions: 0, audits: 0 });
    });

    it('preserves curriculum identity when a syllabus update changes coverage only', async () => {
      const originalModules = [{ ...modulesOne[0]!, covered: false }];
      expect((await propose(courseIds.coverageOnly, minimalFixture(), originalModules)).response.status).toBe(201);
      const [before] = await admin`SELECT syllabus_hash FROM course_curriculum_revisions WHERE course_id = ${courseIds.coverageOnly}`;

      await supertest(app.getHttpServer()).post(portalPath(courseIds.coverageOnly)).set('Cookie', ownerCookie)
        .send({ modules: [{ ...originalModules[0]!, covered: true }] }).expect(201);

      const portal = await negotiated(supertest(app.getHttpServer()).get(portalPath(courseIds.coverageOnly)).set('Cookie', ownerCookie)).expect(200);
      const student = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.coverageOnly)).set('Cookie', studentCookie)).expect(200);
      const [after] = await admin`SELECT syllabus_hash, count(*) OVER ()::int AS revisions FROM course_curriculum_revisions WHERE course_id = ${courseIds.coverageOnly}`;
      expect(portal.body.modules).toMatchObject([{ weekNo: 1, covered: true }]);
      expect(student.body.curriculum).toMatchObject({ status: 'ready', revision: 1, evidence: 'not_assessed' });
      expect(after).toEqual({ syllabus_hash: before?.syllabus_hash, revisions: 1 });
    });

    it('marks an approved superseded release stale until it is explicitly proposed and reviewed against the replacement', async () => {
      const proposal = minimalFixture('Supersession objective');
      expect((await propose(courseIds.supersession, proposal)).response.status).toBe(201);
      const approved = approveMinimal(proposal);
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.supersession)}/review`).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'Approve original release', payload: approved } }).expect(201);

      const superseding = structuredClone(approved);
      const oldRelease = superseding.releases[0]!;
      const replacementRelease = {
        ...oldRelease,
        id: randomUUID(),
        publisherVersion: 'close-2',
        supersedes: ref(oldRelease),
      };
      const replacementItem = {
        ...superseding.items[0]!,
        id: randomUUID(),
        release: ref(replacementRelease),
        externalId: 'CLOSE-2',
        descriptor: 'Replacement standard item',
      };
      superseding.releases.push(replacementRelease);
      superseding.items.push(replacementItem);
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.supersession)}/review`).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 2, reason: 'Effective publisher supersession', payload: superseding } }).expect(201);
      const portalStale = await negotiated(supertest(app.getHttpServer()).get(portalPath(courseIds.supersession)).set('Cookie', ownerCookie)).expect(200);
      const stale = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.supersession)).set('Cookie', studentCookie)).expect(200);
      expect(portalStale.body.curriculum.data.alignments).toMatchObject([{ id: proposal.alignments[0]!.id, state: 'stale' }]);
      expect(stale.body.curriculum.data.alignments).toEqual([]);
      expect(stale.body.curriculum.data.unmappedObjectives).toEqual([proposal.objectives[0]!.id]);

      const realignedProposal = structuredClone(superseding);
      realignedProposal.alignments[0] = {
        ...realignedProposal.alignments[0]!, version: 3, status: 'proposed', standard: ref(replacementItem),
        overrideReason: 'Explicitly realign to the effective publisher release',
      };
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.supersession)}/review`).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 3, reason: 'Propose replacement realignment', payload: realignedProposal } }).expect(201);
      const realigned = structuredClone(realignedProposal);
      realigned.alignments[0] = { ...realigned.alignments[0]!, version: 4, status: 'approved', overrideReason: null };
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.supersession)}/review`).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 4, reason: 'Approve replacement realignment', payload: realigned } }).expect(201);
      const restored = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.supersession)).set('Cookie', studentCookie)).expect(200);
      expect(restored.body.curriculum).toMatchObject({ status: 'ready', revision: 5, evidence: 'not_assessed' });
      expect(restored.body.curriculum.data.alignments).toMatchObject([{
        id: proposal.alignments[0]!.id, state: 'approved', standard: ref(replacementItem),
      }]);
    });

    it('retains immutable record/history rows after explicit rejection and manifest removal', async () => {
      const proposal = minimalFixture();
      expect((await propose(courseIds.history, proposal)).response.status).toBe(201);
      const approved = approveMinimal(proposal);
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.history)}/review`).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'Approve history', payload: approved } }).expect(201);
      const rejected = structuredClone(approved);
      rejected.alignments[0] = { ...rejected.alignments[0]!, version: 3, status: 'rejected', overrideReason: 'Explicit historical withdrawal' };
      await negotiated(supertest(app.getHttpServer()).post(`${portalPath(courseIds.history)}/review`).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 2, reason: 'Reject history', payload: rejected } }).expect(201);
      const empty = emptyFixture();
      await negotiated(supertest(app.getHttpServer()).post(portalPath(courseIds.history)).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 3, reason: 'Remove current manifest records', payload: empty } }).expect(201);

      const portal = await negotiated(supertest(app.getHttpServer()).get(portalPath(courseIds.history)).set('Cookie', ownerCookie)).expect(200);
      expect(portal.body.history.map((row: { revision: number }) => row.revision)).toEqual([4, 3, 2, 1]);
      expect(portal.body.curriculum.data).toMatchObject({ objectives: [], alignments: [] });
      const records = await admin`SELECT kind, record_id, record_version FROM course_curriculum_records WHERE course_id = ${courseIds.history} ORDER BY kind, record_version`;
      expect(records.some((row) => row.kind === 'objectives' && row.record_id === proposal.objectives[0]!.id && row.record_version === 1)).toBe(true);
      expect(records.filter((row) => row.kind === 'alignments').map((row) => row.record_version)).toEqual([1, 2, 3]);

      const changedReuse = emptyFixture();
      changedReuse.objectives = [{ ...proposal.objectives[0]!, descriptor: 'Illicit same-version rewrite' }];
      const denied = await negotiated(supertest(app.getHttpServer()).post(portalPath(courseIds.history)).set('Cookie', ownerCookie))
        .send({ modules: modulesOne, curriculum: { commandId: randomUUID(), expectedRevision: 4, reason: 'Same version rewrite', payload: changedReuse } }).expect(409);
      expect(denied.body.code).toBe('CURRICULUM_RECORD_VERSION_CONFLICT');
      expect((await admin`SELECT count(*)::int AS count FROM course_curriculum_revisions WHERE course_id = ${courseIds.history}`)[0]?.count).toBe(4);
    });

    it('returns content-free unmapped, stale and unsupported student states', async () => {
      await supertest(app.getHttpServer()).post(portalPath(courseIds.unmapped)).set('Cookie', ownerCookie).send({ modules: modulesOne }).expect(201);
      const unmapped = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.unmapped)).set('Cookie', studentCookie)).expect(200);
      expect(unmapped.body.curriculum).toEqual({ schemaVersion: CURRICULUM_ALIGNMENT_VERSION, status: 'unmapped', revision: 0, evidence: 'not_assessed' });

      expect((await propose(courseIds.stale, minimalFixture())).response.status).toBe(201);
      await supertest(app.getHttpServer()).post(portalPath(courseIds.stale)).set('Cookie', ownerCookie)
        .send({ modules: [{ ...modulesOne[0], title: 'Changed syllabus identity' }] }).expect(201);
      const stale = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.stale)).set('Cookie', studentCookie)).expect(200);
      expect(stale.body.curriculum).toMatchObject({ status: 'stale', revision: 1, evidence: 'not_assessed' });
      expect(stale.body.curriculum).not.toHaveProperty('data');

      await supertest(app.getHttpServer()).post(portalPath(courseIds.unsupported)).set('Cookie', ownerCookie).send({ modules: modulesOne }).expect(201);
      await admin`
        INSERT INTO course_curriculum_revisions
          (institution_id, course_id, revision, schema_version, command_id, request_hash, syllabus_hash, subject_id, payload, actor_id, reason)
        VALUES
          (${institutionId}, ${courseIds.unsupported}, 1, ${CURRICULUM_ALIGNMENT_VERSION}, ${randomUUID()}, ${'f'.repeat(64)},
           ${syllabusIdentityHash(modulesOne)}, NULL,
           '{"schemaVersion":"petros.curriculum-alignment.v1","objectives":[{}],"frameworks":[],"releases":[],"items":[],"relationships":[],"alignments":[],"moduleObjectives":[]}'::jsonb,
           ${ownerId}, 'Unsupported reader fixture')
      `;
      const unsupported = await negotiated(supertest(app.getHttpServer()).get(studentPath(courseIds.unsupported)).set('Cookie', studentCookie)).expect(200);
      expect(unsupported.body.curriculum).toMatchObject({ status: 'unsupported_version', revision: 1, evidence: 'not_assessed' });
      expect(unsupported.body.curriculum).not.toHaveProperty('data');
      for (const response of [unmapped, stale, unsupported]) expect(response.text).not.toContain('Immutable objective');
    });

    it('rolls back records, manifest, syllabus and audit on each downstream write failure', async () => {
      const cases = [
        ['course_curriculum_revisions', courseIds.rollbackManifest],
        ['course_syllabus_modules', courseIds.rollbackSyllabus],
        ['audit_events', courseIds.rollbackAudit],
      ] as const;
      for (const [table, courseId] of cases) {
        await supertest(app.getHttpServer()).post(portalPath(courseId)).set('Cookie', ownerCookie).send({ modules: modulesOne }).expect(201);
        const before = await courseState(courseId);
        await installInsertFailure(table);
        try {
          const response = await negotiated(supertest(app.getHttpServer()).post(portalPath(courseId)).set('Cookie', ownerCookie))
            .send({ modules: [{ ...modulesOne[0], title: `Must roll back at ${table}` }], curriculum: {
              commandId: randomUUID(), expectedRevision: 0, reason: `Forced ${table} failure`, payload: minimalFixture(),
            } }).expect(500);
          expect(response.body.code).toBe('INTERNAL_ERROR');
        } finally {
          await removeInsertFailure(table);
        }
        expect(await courseState(courseId)).toEqual(before);
      }
    });

    it('serializes overlapping HTTP writers so exactly one revision commits', async () => {
      const firstPayload = minimalFixture('Race winner candidate A');
      const secondPayload = minimalFixture('Race winner candidate B');
      const request = (payload: CurriculumAlignment) => negotiated(
        supertest(app.getHttpServer()).post(portalPath(courseIds.race)).set('Cookie', ownerCookie),
      ).send({ modules: modulesOne, curriculum: {
        commandId: randomUUID(), expectedRevision: 0, reason: payload.objectives[0]!.descriptor, payload,
      } });
      const responses = await Promise.all([request(firstPayload), request(secondPayload)]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      expect(responses.find((response) => response.status === 409)?.body.code).toBe('CURRICULUM_REVISION_CONFLICT');
      const [state] = await admin`
        SELECT
          (SELECT count(*)::int FROM course_curriculum_revisions WHERE course_id = ${courseIds.race}) AS revisions,
          (SELECT count(*)::int FROM course_curriculum_records WHERE course_id = ${courseIds.race}) AS records,
          (SELECT count(*)::int FROM audit_events WHERE entity_id = ${courseIds.race} AND action = 'standard.alignment_changed') AS audits
      `;
      expect(state).toEqual({ revisions: 1, records: 5, audits: 1 });
    });

    async function installInsertFailure(table: 'course_curriculum_revisions' | 'course_syllabus_modules' | 'audit_events') {
      await admin.unsafe(`
        CREATE OR REPLACE FUNCTION petros_curriculum_forced_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'forced curriculum closure failure'; END $$
      `);
      await admin.unsafe(`CREATE TRIGGER petros_curriculum_forced_failure BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION petros_curriculum_forced_failure()`);
    }

    async function removeInsertFailure(table: 'course_curriculum_revisions' | 'course_syllabus_modules' | 'audit_events') {
      await admin.unsafe(`DROP TRIGGER IF EXISTS petros_curriculum_forced_failure ON ${table}`);
    }

    async function courseState(courseId: string) {
      const [row] = await admin`
        SELECT
          (SELECT count(*)::int FROM course_curriculum_records WHERE course_id = ${courseId}) AS records,
          (SELECT count(*)::int FROM course_curriculum_revisions WHERE course_id = ${courseId}) AS revisions,
          (SELECT COALESCE(jsonb_agg(jsonb_build_object('week', week_no, 'title', title, 'topics', topics, 'covered', covered) ORDER BY week_no), '[]'::jsonb)
             FROM course_syllabus_modules WHERE course_id = ${courseId}) AS modules,
          (SELECT count(*)::int FROM audit_events WHERE entity_id = ${courseId}) AS audits
      `;
      return row;
    }
  },
);

function provenance() {
  return {
    method: 'manual' as const,
    sourceRef: 'private-curriculum-closure',
    sourceHash: 'a'.repeat(64),
    observedAt: '2026-01-01T00:00:00.000Z',
    licence: 'synthetic-only',
  };
}

function emptyFixture(): CurriculumAlignment {
  return {
    schemaVersion: CURRICULUM_ALIGNMENT_VERSION,
    objectives: [], frameworks: [], releases: [], items: [], relationships: [], alignments: [], moduleObjectives: [],
  };
}

function minimalFixture(descriptor = 'Immutable objective'): CurriculumAlignment {
  const effective = { from: '2020-01-01T00:00:00.000Z', until: null };
  const common = () => ({ id: randomUUID(), version: 1, provenance: provenance() });
  const objective = { ...common(), descriptor, effective };
  const framework = { ...common(), title: 'Closure framework', jurisdiction: 'Test', subject: 'Physics', level: 'Intro',
    issuingBody: 'Closure publisher', externalId: 'CLOSE-FW', uri: null };
  const release = { ...common(), framework: ref(framework), publisherVersion: 'close-1', effective, supersedes: null };
  const item = { ...common(), release: ref(release), externalId: 'CLOSE-1', uri: null, descriptor: 'Immutable standard item' };
  const alignment = { ...common(), objective: ref(objective), standard: ref(item), relation: 'addresses' as const,
    rationale: 'Immutable explicit rationale', gaps: [], confidence: 1, status: 'proposed' as const, effective, overrideReason: null };
  return { schemaVersion: CURRICULUM_ALIGNMENT_VERSION, objectives: [objective], frameworks: [framework], releases: [release],
    items: [item], relationships: [], alignments: [alignment], moduleObjectives: [{ weekNo: 1, objectives: [ref(objective)] }] };
}

function approveMinimal(payload: CurriculumAlignment): CurriculumAlignment {
  const reviewed = structuredClone(payload);
  reviewed.alignments[0] = { ...reviewed.alignments[0]!, version: 2, status: 'approved' };
  return reviewed;
}

function projectionFixture(): CurriculumAlignment {
  const effective = { from: '2020-01-01T00:00:00.000Z', until: null };
  const future = { from: '2100-01-01T00:00:00.000Z', until: null };
  const common = () => ({ id: randomUUID(), version: 1, provenance: provenance() });
  const objectives = [
    'Approved objective A', 'Approved objective B', 'Proposed objective', 'Rejected objective',
    'Future objective', 'Superseded objective', 'Explicitly unmapped objective',
  ].map((descriptor, index) => ({ ...common(), descriptor, effective: index === 4 ? future : effective }));
  const frameworks = [
    { ...common(), title: 'Retained framework', jurisdiction: 'Test', subject: 'Physics', level: 'Intro', issuingBody: 'Closure publisher', externalId: 'FRAME-KEEP', uri: null },
    { ...common(), title: 'Unrelated framework', jurisdiction: 'Test', subject: 'Physics', level: 'Intro', issuingBody: 'Other publisher', externalId: 'FRAME-DROP', uri: null },
  ];
  const oldRelease = { ...common(), framework: ref(frameworks[0]!), publisherVersion: 'release-old', effective, supersedes: null };
  const currentRelease = { ...common(), framework: ref(frameworks[0]!), publisherVersion: 'release-current', effective, supersedes: ref(oldRelease) };
  const unrelatedRelease = { ...common(), framework: ref(frameworks[1]!), publisherVersion: 'release-unrelated', effective, supersedes: null };
  const releases = [oldRelease, currentRelease, unrelatedRelease];
  const items = objectives.slice(0, 6).map((_, index) => ({
    ...common(), release: ref(index === 5 ? oldRelease : index >= 2 && index <= 3 ? unrelatedRelease : currentRelease),
    externalId: `ITEM-${index}`, uri: null, descriptor: `Projection standard ${index}`,
  }));
  const relationships = [
    { ...common(), from: ref(items[0]!), to: ref(items[1]!), relation: 'parent_of' as const, declaredRelation: null },
    { ...common(), from: ref(items[0]!), to: ref(items[2]!), relation: 'related_to' as const, declaredRelation: null },
    { ...common(), from: ref(items[2]!), to: ref(items[3]!), relation: 'publisher_declared' as const, declaredRelation: 'unrelated-fixture' },
  ];
  const alignments = objectives.slice(0, 6).map((objective, index) => ({
    ...common(), objective: ref(objective), standard: ref(items[index]!), relation: 'addresses' as const,
    rationale: `Projection rationale ${index}`, gaps: [], confidence: 0.9, status: 'proposed' as const, effective, overrideReason: null,
  }));
  return {
    schemaVersion: CURRICULUM_ALIGNMENT_VERSION,
    objectives, frameworks, releases, items, relationships, alignments,
    moduleObjectives: [
      { weekNo: 1, objectives: [0, 1, 2, 4, 6].map((index) => ref(objectives[index]!)) },
      { weekNo: 2, objectives: [ref(objectives[4]!)] },
    ],
  };
}

function reviewProjection(payload: CurriculumAlignment): CurriculumAlignment {
  const reviewed = structuredClone(payload);
  for (const index of [0, 1, 4, 5]) {
    reviewed.alignments[index] = { ...reviewed.alignments[index]!, version: 2, status: 'approved' };
  }
  reviewed.alignments[3] = {
    ...reviewed.alignments[3]!, version: 2, status: 'rejected', overrideReason: 'Explicitly rejected closure reference',
  };
  return reviewed;
}

function ref(record: { id: string; version: number }) {
  return { id: record.id, version: record.version };
}
