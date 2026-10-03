import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTenantAwareDatabase, runInInstitutionTenant, schema, type Database } from '@edrion/database';
import { AuditWriter } from '@edrion/audit';
import { CURRICULUM_ALIGNMENT_VERSION, PROVIDER_MAPPING_VERSION, type CurriculumAlignment, type ProviderEntityKind } from '@edrion/schemas';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { ProviderMappingsRepository } from './provider-mappings.repository';
import { ProviderMappingsService } from './provider-mappings.service';
import { FederationService } from '../federation/federation.service';
import { PortalFederationController } from '../federation/portal-federation.controller';
import { PortalAuthOidcController } from '../federation/portal-auth-oidc.controller';
import { PortalAuthSamlController } from '../federation/portal-auth-saml.controller';
import { PortalAuthService } from '../portal/portal-auth.service';
import { PortalSessionService } from '../portal/portal-session.service';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { InstitutionRateLimiter } from '../portal/portal-rate-limit';
import { PortalTenantInterceptor } from '../portal/portal-tenant.interceptor';
import { PortalCrudEngine } from '../portal/portal-crud.engine';
import { PortalEntityResolver } from '../portal/portal-entity-resolver';
import { PortalCoursesController } from '../portal/courses/portal-courses.controller';
import { PortalCoursesService } from '../portal/courses/portal-courses.service';
import { StudentCoursesController } from '../student/courses/student-courses.controller';
import { StudentCoursesService } from '../student/courses/student-courses.service';
import { StudentSessionService } from '../student/core/student-session.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentTenantInterceptor } from '../student/core/student-tenant.interceptor';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';

/**
 * Production-boundary V10 storage and HTTP checks. This suite owns a private Unix-socket PostgreSQL
 * cluster, applies the real journal and auxiliary grants/policies, and uses the restricted
 * application role. It never reads DATABASE_URL or a shared database.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Petros compatibility / disposable PostgreSQL',
  () => {
    let directory = '';
    let running = false;
    let admin: ReturnType<typeof postgres>;
    let application: ReturnType<typeof postgres>;
    let app: INestApplication;
    let tenantDb: Database;
    let ownerCookie: string;
    let instructorCookie: string;
    let deniedCookie: string;
    let studentCookie: string;
    let sessions: PortalSessionService;
    const ownerId = randomUUID();
    const instructorId = randomUUID();
    const deniedId = randomUUID();
    const studentUserId = randomUUID();
    const studentId = randomUUID();
    const staffId = randomUUID();
    const campusId = randomUUID();
    const academicYearId = randomUUID();
    const gradeLevelId = randomUUID();
    const classId = randomUUID();
    const academicTermId = randomUUID();
    const assignmentId = randomUUID();
    const courseId = randomUUID();
    const otherCourseId = randomUUID();
    const crossCourseId = randomUUID();
    const enabledProvider = randomUUID();
    const env = {
      NODE_ENV: 'test', PORTAL_AUTH_DEV_HEADER: false, STUDENT_AUTH_DEV_HEADER: false,
      PORTAL_SESSION_COOKIE_NAME: 'petros_compat_portal', STUDENT_SESSION_COOKIE_NAME: 'petros_compat_student',
      SESSION_COOKIE_SECRET: 'private-compatibility-test-secret-at-least-32-characters',
      SESSION_TTL_SECONDS: 3600, RATE_LIMIT_ENABLED: false, RECENT_AUTH_ENABLED: true,
      RECENT_AUTH_WINDOW_SECONDS: 900, PETROS_PROVIDER_MAPPING_ENABLED: true,
      PETROS_CURRICULUM_ALIGNMENT_ENABLED: true,
    };
    const firstInstitution = randomUUID();
    const secondInstitution = randomUUID();
    const firstProvider = randomUUID();
    const secondProvider = randomUUID();
    const firstJob = randomUUID();

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), 'petros-compatibility-test-'));
      execFileSync('initdb', [
        '-D', join(directory, 'data'), '-U', 'petros_test', '-A', 'trust', '--no-locale', '-E', 'UTF8',
      ], { stdio: 'pipe' });
      execFileSync('pg_ctl', [
        '-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
        '-o', `-F -k ${directory} -h ''`, '-w', 'start',
      ], { stdio: 'pipe' });
      running = true;
      admin = postgres({ host: directory, username: 'petros_test', database: 'postgres', max: 2, onnotice: () => {} });
      await admin.unsafe('CREATE ROLE edrion_app LOGIN NOBYPASSRLS');

      const migrations = join(__dirname, '../../../../../packages/database/migrations');
      // Petros migrations refer to the production tenant helper functions.
      const rls = readFileSync(join(migrations, 'sql/zzz_rls.sql'), 'utf8');
      await admin.unsafe(rls.slice(0, rls.indexOf('-- institutions:')));
      await migrate(drizzle(admin, { schema }), { migrationsFolder: migrations });
      for (const filename of readdirSync(join(migrations, 'sql'))
        .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
        .sort()) {
        await admin.unsafe(readFileSync(join(migrations, 'sql', filename), 'utf8'));
      }

      await admin`
        INSERT INTO institutions (id, public_id, legal_name, display_name, type, country, primary_contact)
        VALUES
          (${firstInstitution}, 'petros-compat-one', 'Compatibility one', 'Compatibility one', 'school', 'IN', '{"name":"One","email":"one@example.test"}'::jsonb),
          (${secondInstitution}, 'petros-compat-two', 'Compatibility two', 'Compatibility two', 'school', 'IN', '{"name":"Two","email":"two@example.test"}'::jsonb)
      `;
      await admin`
        INSERT INTO institution_identity_providers
          (id, institution_id, kind, name, issuer, client_id, client_secret, enabled)
        VALUES
          (${firstProvider}, ${firstInstitution}, 'oidc', 'One', 'https://one.invalid', 'one', 'secret-one', false),
          (${secondProvider}, ${secondInstitution}, 'oidc', 'Two', 'https://two.invalid', 'two', 'secret-two', false)
      `;
      await admin`
        INSERT INTO roster_sync_jobs (id, institution_id, provider, status, compatibility)
        VALUES (${firstJob}, ${firstInstitution}, 'oneroster_csv', 'succeeded',
          '{"schemaVersion":"petros.roster-preview.v1","mode":"preview","applied":0}'::jsonb)
      `;
      application = postgres({ host: directory, username: 'edrion_app', database: 'postgres', max: 2, onnotice: () => {} });
      const db = drizzle(admin, { schema });
      tenantDb = createTenantAwareDatabase(drizzle(application, { schema }));
      await db.insert(schema.campuses).values({ id: campusId, institutionId: firstInstitution,
        name: 'Compatibility campus', code: 'COMPAT' });
      await db.insert(schema.academicYears).values({ id: academicYearId, institutionId: firstInstitution,
        campusId, name: 'Synthetic 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'active' });
      await db.insert(schema.gradeLevels).values({ id: gradeLevelId, institutionId: firstInstitution,
        campusId, name: 'Synthetic grade', level: 1 });
      await db.insert(schema.academicTerms).values({ id: academicTermId, institutionId: firstInstitution,
        campusId, academicYearId, name: 'Synthetic term', startDate: '2026-01-01', endDate: '2026-06-30', status: 'active' });
      await db.insert(schema.classes).values({ id: classId, institutionId: firstInstitution, campusId,
        academicYearId, gradeLevelId, termId: academicTermId, name: 'Compatibility class' });
      await db.insert(schema.institutionUsers).values([
        { id: ownerId, institutionId: firstInstitution, fullName: 'Owner', email: 'owner@example.test', status: 'active' },
        { id: instructorId, institutionId: firstInstitution, fullName: 'Instructor', email: 'instructor@example.test', status: 'active', directGrants: ['syllabus.manage'] },
        { id: deniedId, institutionId: firstInstitution, fullName: 'No permissions', email: 'denied@example.test', status: 'active' },
        { id: studentUserId, institutionId: firstInstitution, fullName: 'Student', email: 'student@example.test', status: 'active' },
      ]);
      await db.insert(schema.institutionUserRoles).values([
        { institutionUserId: ownerId, roleKey: 'institution_owner' },
        { institutionUserId: instructorId, roleKey: 'teacher' },
        { institutionUserId: studentUserId, roleKey: 'student' },
      ]);
      await db.insert(schema.campusUserAccess).values({
        institutionUserId: instructorId, campusId, accessLevel: 'manage',
      });
      await db.insert(schema.staff).values({ id: staffId, institutionId: firstInstitution,
        campusId, institutionUserId: instructorId, firstName: 'Assigned', lastName: 'Instructor' });
      await db.insert(schema.students).values({ id: studentId, institutionId: firstInstitution,
        campusId, classId, institutionUserId: studentUserId, admissionNo: 'COMPAT-1', firstName: 'Synthetic', lastName: 'Student' });
      await db.insert(schema.courses).values([
        { id: courseId, institutionId: firstInstitution, campusId, code: 'COMPAT-1', name: 'Assigned course', professorTeacherId: staffId },
        { id: otherCourseId, institutionId: firstInstitution, code: 'COMPAT-2', name: 'Unassigned course' },
        { id: crossCourseId, institutionId: secondInstitution, code: 'COMPAT-3', name: 'Other institution' },
      ]);
      await db.insert(schema.assignments).values({ id: assignmentId, institutionId: firstInstitution,
        campusId, classId, academicYearId, termId: academicTermId, teacherId: staffId,
        title: 'Compatibility assignment', status: 'published' });
      await db.insert(schema.courseEnrollments).values({ institutionId: firstInstitution, studentId, courseId });
      await db.insert(schema.institutionIdentityProviders).values({ id: enabledProvider, institutionId: firstInstitution,
        kind: 'oidc', name: 'Mapping-only provider', issuer: 'https://mapping.invalid', clientId: 'mapping',
        clientSecret: 'never-return-this-secret', enabled: true });

      const audit = new AuditWriter(tenantDb);
      const mappings = new ProviderMappingsService(new ProviderMappingsRepository(tenantDb), tenantDb, env as never, audit);
      const federation = new FederationService(tenantDb, env as never, mappings, audit);
      const courses = new PortalCoursesService(new PortalCrudEngine(tenantDb, audit, new PortalEntityResolver(tenantDb)), tenantDb, env as never, audit);
      sessions = new PortalSessionService(tenantDb, env as never);
      const studentSessions = new StudentSessionService(tenantDb, env as never);
      const studentAuth = new StudentAuthService(tenantDb, audit, env as never, studentSessions, {} as never, {} as never);
      const reflector = new Reflector();
      // Vitest omits emitted constructor metadata; bind the real production service instances.
      Reflect.defineMetadata('design:paramtypes', [FederationService, ProviderMappingsService], PortalFederationController);
      Reflect.defineMetadata('design:paramtypes', [FederationService], PortalAuthOidcController);
      Reflect.defineMetadata('design:paramtypes', [FederationService], PortalAuthSamlController);
      Reflect.defineMetadata('design:paramtypes', [PortalCoursesService], PortalCoursesController);
      Reflect.defineMetadata('design:paramtypes', [StudentCoursesService], StudentCoursesController);
      const module = await Test.createTestingModule({
        controllers: [PortalFederationController, PortalAuthOidcController, PortalAuthSamlController, PortalCoursesController, StudentCoursesController],
        providers: [
          { provide: ProviderMappingsService, useValue: mappings },
          { provide: FederationService, useValue: federation },
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
        req.context = { requestId: randomUUID(), correlationId: randomUUID(), apiEndpoint: 'compatibility-http' }; next();
      });
      app.useGlobalInterceptors(new PortalTenantInterceptor(tenantDb), new StudentTenantInterceptor(tenantDb));
      const logger = { child: () => logger, warn: vi.fn(), error: vi.fn() };
      app.useGlobalFilters(new AllExceptionsFilter(logger as never, { captureException: vi.fn() } as never));
      await app.listen(0, '127.0.0.1');
      ownerCookie = await portalCookie(ownerId);
      instructorCookie = await portalCookie(instructorId);
      deniedCookie = await portalCookie(deniedId);
      const studentSession = await studentSessions.issue({ kind: 'institutional', userId: studentUserId, institutionId: firstInstitution });
      studentCookie = `${studentSessions.cookieName}=${studentSession.token}`;
    }, 30_000);

    afterAll(async () => {
      await app?.close();
      await application?.end({ timeout: 1 });
      await admin?.end({ timeout: 1 });
      if (running) {
        execFileSync('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
      }
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    async function portalCookie(institutionUserId: string) {
      const issued = await sessions.issue({ institutionId: firstInstitution, institutionUserId, aal: 'aal1' });
      return `${sessions.cookieName}=${issued.token}`;
    }

    it('confines identity-provider secrets to the current institution for edrion_app', async () => {
      const unscoped = await application`SELECT id FROM institution_identity_providers`;
      expect(unscoped).toHaveLength(0);

      const scoped = await application.begin(async (tx) => {
        await tx`SELECT set_config('app.institution_id', ${firstInstitution}, true)`;
        return tx`SELECT id, client_secret FROM institution_identity_providers ORDER BY id`;
      });
      expect(scoped).toEqual(expect.arrayContaining([
        { id: firstProvider, client_secret: 'secret-one' },
        { id: enabledProvider, client_secret: 'never-return-this-secret' },
      ]));
      expect(scoped).toHaveLength(2);
      expect(scoped).not.toContainEqual(expect.objectContaining({ id: secondProvider }));

      for (const [key, value] of [['app.student_id', studentId], ['app.independent_user_id', randomUUID()]] as const) {
        const denied = await application.begin(async (tx) => {
          await tx`SELECT set_config('app.institution_id', ${firstInstitution}, true)`;
          await tx`SELECT set_config(${key}, ${value}, true)`;
          return tx`SELECT id FROM institution_identity_providers`;
        });
        expect(denied).toEqual([]);
      }

      await expect(application.begin(async (tx) => {
        await tx`SELECT set_config('app.institution_id', ${firstInstitution}, true)`;
        await tx`
          INSERT INTO institution_identity_providers
            (institution_id, kind, name, issuer, client_id, enabled)
          VALUES (${secondInstitution}, 'oidc', 'Cross tenant', 'https://cross.invalid', 'cross', false)
        `;
      })).rejects.toThrow();
    });

    it('keeps roster preview history immutable for application and migration roles', async () => {
      await expect(application.begin(async (tx) => {
        await tx`SELECT set_config('app.institution_id', ${firstInstitution}, true)`;
        await tx`DELETE FROM roster_sync_jobs WHERE id = ${firstJob}`;
      })).rejects.toThrow();
      await expect(application`TRUNCATE roster_sync_jobs`).rejects.toThrow();
      await expect(admin`DELETE FROM roster_sync_jobs WHERE id = ${firstJob}`).rejects.toThrow(
        /append-only/i,
      );
      const [preserved] = await admin`SELECT compatibility FROM roster_sync_jobs WHERE id = ${firstJob}`;
      expect(preserved?.compatibility).toMatchObject({ mode: 'preview', applied: 0 });
    });

    it('executes every whitelisted canonical owner query using the application role', async () => {
      const repo = new ProviderMappingsRepository(tenantDb);
      const kinds: ProviderEntityKind[] = ['institution', 'campus', 'institution_user', 'student', 'staff', 'course', 'class', 'academic_term', 'assignment'];
      await runInInstitutionTenant(tenantDb, firstInstitution, async () => {
        // Even an absent ID requires PostgreSQL to resolve the real owner's selected columns.
        for (const kind of kinds) expect(await repo.canonical(firstInstitution, kind, randomUUID())).toBeNull();
        const actual: Record<ProviderEntityKind, string> = {
          institution: firstInstitution, campus: campusId, institution_user: ownerId,
          student: studentId, staff: staffId, course: courseId, class: classId,
          academic_term: academicTermId, assignment: assignmentId,
        };
        for (const kind of kinds) expect(await repo.canonical(firstInstitution, kind, actual[kind]))
          .toMatchObject({ id: actual[kind] });
        expect(await repo.canonical(firstInstitution, 'campus', campusId)).toMatchObject({ status: 'active', campusId: null });
        expect(await repo.canonical(firstInstitution, 'class', classId)).toMatchObject({ status: 'present', campusId });
        expect(await repo.canonical(firstInstitution, 'course', crossCourseId)).toBeNull();
      });
    });

    it('uses signed live sessions and production permission checks at the HTTP boundary', async () => {
      const path = '/v1/portal/federation/identity-providers';
      await supertest(app.getHttpServer()).get(path).expect(401);
      await supertest(app.getHttpServer()).get(path).set('x-institution-user-email', 'owner@example.test').expect(401);
      await supertest(app.getHttpServer()).get(path).set('Cookie', deniedCookie).expect(403);
      const response = await supertest(app.getHttpServer()).get(path).set('Cookie', ownerCookie).expect(200);
      expect(response.body.map((row: { id: string }) => row.id).sort()).toEqual([firstProvider, enabledProvider].sort());
      expect(response.text).not.toContain('secret-one');
      expect(response.text).not.toContain('never-return-this-secret');
      expect(response.text).not.toContain(secondProvider);
      const revoked = await sessions.issue({ institutionId: firstInstitution, institutionUserId: ownerId, aal: 'aal1' });
      await sessions.revoke(revoked.session.id, 'Synthetic revocation check');
      const rejected = await supertest(app.getHttpServer()).get(path).set('Cookie', `${sessions.cookieName}=${revoked.token}`).expect(401);
      expect(rejected.body.code).toBe('SESSION_REVOKED');
    });

    it('proposes, approves, retries and resolves provider mappings through authenticated HTTP', async () => {
      const path = `/v1/portal/federation/identity-providers/${enabledProvider}/mappings`;
      const key = { namespace: 'Synthetic.Provider', entityKind: 'student', externalId: 'Student-007' };
      const proposed = { schemaVersion: PROVIDER_MAPPING_VERSION, ...key, commandId: randomUUID(), expectedVersion: 0,
        internalId: studentId, purpose: 'roster', status: 'proposed', effective: { from: '2020-01-01T00:00:00.000Z', until: null },
        upstreamRevision: 'synthetic-1', upstreamHash: 'a'.repeat(64), fieldAuthority: [{ field: 'identity', owner: 'canonical' }],
        provenance: provenance(), reason: 'Synthetic proposal' };
      await supertest(app.getHttpServer()).put(path).set('Cookie', instructorCookie).send(proposed).expect(403);
      const first = await supertest(app.getHttpServer()).put(path).set('Cookie', ownerCookie).send(proposed).expect(200);
      expect(first.body.record).toMatchObject({ version: 1, actorId: ownerId, connection: { authentication: 'disabled' } });
      const unreviewed = await supertest(app.getHttpServer()).post(`${path}/resolve`).set('Cookie', ownerCookie).send(key).expect(201);
      expect(unreviewed.body.resolution).toMatchObject({ status: 'unreviewed' });
      expect(unreviewed.body.resolution).not.toHaveProperty('canonicalId');
      const approved = { ...proposed, commandId: randomUUID(), expectedVersion: 1, status: 'approved', reason: 'Synthetic reviewed mapping' };
      const second = await supertest(app.getHttpServer()).put(path).set('Cookie', ownerCookie).send(approved).expect(200);
      const replay = await supertest(app.getHttpServer()).put(path).set('Cookie', ownerCookie).send(approved).expect(200);
      expect(replay.body).toEqual(second.body);
      const resolved = await supertest(app.getHttpServer()).post(`${path}/resolve`).set('Cookie', ownerCookie).send(key).expect(201);
      expect(resolved.body.resolution).toMatchObject({ status: 'mapped', canonicalId: studentId, version: 2 });
      expect(resolved.headers['cache-control']).toBe('private, no-store');
      expect(resolved.text).not.toContain('never-return-this-secret');
      const differentCase = await supertest(app.getHttpServer()).post(`${path}/resolve`).set('Cookie', ownerCookie)
        .send({ ...key, externalId: 'student-007' }).expect(201);
      expect(differentCase.body.resolution).toEqual({ status: 'missing' });
      const crossTenant = await supertest(app.getHttpServer()).post(`/v1/portal/federation/identity-providers/${secondProvider}/mappings/resolve`)
        .set('Cookie', ownerCookie).send(key).expect(404);
      expect(crossTenant.body.code).toBe('PROVIDER_CONNECTION_NOT_FOUND');
      const conflict = await supertest(app.getHttpServer()).put(path).set('Cookie', ownerCookie)
        .send({ ...approved, commandId: randomUUID() }).expect(409);
      expect(conflict.body.code).toBe('PROVIDER_MAPPING_VERSION_CONFLICT');
      const [counts] = await admin`SELECT count(*)::int AS count FROM integration_provider_mappings WHERE connection_id = ${enabledProvider}`;
      expect(counts?.count).toBe(2);
      const [audit] = await admin`SELECT count(*)::int AS count FROM audit_events WHERE action = 'roster.mapping_changed' AND institution_id = ${firstInstitution}`;
      expect(audit?.count).toBe(2);
    });

    it('keeps external synchronization and both SSO protocols disabled without issuing sessions or calling providers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External network prohibited in private test'));
      const [before] = await admin`SELECT (SELECT count(*) FROM portal_sessions)::int AS sessions, (SELECT count(*) FROM roster_sync_jobs)::int AS jobs`;
      try {
        for (const provider of ['clever', 'classlink', 'oneroster']) {
          const result = await supertest(app.getHttpServer()).post(`/v1/portal/federation/roster/${provider}/sync`)
            .set('Cookie', ownerCookie).send(provider === 'oneroster' ? { baseUrl: 'https://provider.invalid', token: 'synthetic' } : {}).expect(409);
          expect(result.body.code).toBe('EXTERNAL_ROSTER_SYNC_DISABLED');
        }
        for (const protocol of ['oidc', 'saml']) {
          const result = await supertest(app.getHttpServer()).post(`/v1/portal/auth/${protocol}/start`).set('Cookie', ownerCookie)
            .send({ providerId: enabledProvider, redirectUri: 'https://return.invalid' }).expect(409);
          expect(result.body.code).toBe('FEDERATION_AUTHENTICATION_DISABLED');
          expect(result.headers['set-cookie']).toBeUndefined();
          expect(result.headers.location).toBeUndefined();
        }
        const oidc = await supertest(app.getHttpServer()).get('/v1/portal/auth/oidc/callback').query({ code: 'synthetic', state: 'synthetic' }).expect(409);
        const saml = await supertest(app.getHttpServer()).post('/v1/portal/auth/saml/acs').send({ SAMLResponse: 'synthetic', RelayState: 'synthetic' }).expect(409);
        expect(oidc.body.code).toBe('FEDERATION_AUTHENTICATION_DISABLED');
        expect(saml.body.code).toBe('FEDERATION_AUTHENTICATION_DISABLED');
        expect(fetchSpy).not.toHaveBeenCalled();
        const [after] = await admin`SELECT (SELECT count(*) FROM portal_sessions)::int AS sessions, (SELECT count(*) FROM roster_sync_jobs)::int AS jobs`;
        expect(after).toEqual(before);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('preserves legacy roster responses while negotiated CSV preview stays read-only', async () => {
      const csv = 'sourcedId,role,givenName,familyName\nSynthetic-New,student,Synthetic,Student';
      const [before] = await admin`SELECT count(*)::int AS count FROM students`;
      const legacy = await supertest(app.getHttpServer()).post('/v1/portal/federation/roster/oneroster/import')
        .set('Cookie', ownerCookie).send({ csv }).expect(201);
      expect(Object.keys(legacy.body).sort()).toEqual(['jobId', 'parsed', 'students', 'teachers']);
      const negotiated = await supertest(app.getHttpServer()).post('/v1/portal/federation/roster/oneroster/import')
        .set('Cookie', ownerCookie).set('x-petros-provider-mapping', PROVIDER_MAPPING_VERSION)
        .send({ csv, mappingContext: { schemaVersion: PROVIDER_MAPPING_VERSION, connectionId: enabledProvider,
          namespace: 'Synthetic.Provider', upstreamRevision: 'synthetic-1' } }).expect(201);
      expect(negotiated.body.compatibility).toMatchObject({ mode: 'preview', applied: 0, mapped: 0, unresolved: 1 });
      expect(negotiated.body.compatibility.rows[0]).toMatchObject({ externalId: 'Synthetic-New', status: 'missing' });
      const [after] = await admin`SELECT count(*)::int AS count FROM students`;
      expect(after).toEqual(before);
      const jobs = await supertest(app.getHttpServer()).get('/v1/portal/federation/roster/jobs').set('Cookie', ownerCookie).expect(200);
      expect(jobs.body.every((row: object) => !Object.hasOwn(row, 'compatibility'))).toBe(true);
      const newJobs = await supertest(app.getHttpServer()).get('/v1/portal/federation/roster/jobs').set('Cookie', ownerCookie)
        .set('x-petros-provider-mapping', PROVIDER_MAPPING_VERSION).expect(200);
      expect(newJobs.body.find((row: { id: string }) => row.id === negotiated.body.jobId).compatibility).toMatchObject({
        schemaVersion: 'petros.roster-preview.v1', mode: 'preview', historical: true,
        currentMappingStatus: 'not_revalidated', applied: 0, mappedAtPreview: 0, unresolvedAtPreview: 1,
      });
    });

    it('strictly bounds negotiated CSV and rejects padding, quoting and duplicate identities', async () => {
      const path = '/v1/portal/federation/roster/oneroster/import';
      const mappingContext = { schemaVersion: PROVIDER_MAPPING_VERSION, connectionId: enabledProvider,
        namespace: 'Synthetic.Provider', upstreamRevision: 'synthetic-strict' };
      const preview = (csv: string) => supertest(app.getHttpServer()).post(path).set('Cookie', ownerCookie)
        .set('x-petros-provider-mapping', PROVIDER_MAPPING_VERSION).send({ csv, mappingContext });
      for (const csv of [
        'sourcedId,role,givenName\n padded,student,Synthetic',
        'sourcedId,role,givenName\nquoted,student,"Synthetic, Name"',
        'sourcedId,role\nduplicate,student\nduplicate,student',
        `sourcedId,role\n${Array.from({ length: 201 }, (_, index) => `id-${index},student`).join('\n')}`,
      ]) {
        const rejected = await preview(csv).expect(400);
        expect(['ROSTER_MAPPING_CSV_UNSUPPORTED', 'PROVIDER_PREVIEW_BOUNDS']).toContain(rejected.body.code);
      }
      const unknown = await preview('sourcedId,role\nunknown-role,guardian').expect(201);
      expect(unknown.body.compatibility).toMatchObject({ applied: 0, mapped: 0, unresolved: 1,
        context: { upstreamRevision: 'synthetic-strict' } });
      expect(unknown.body.compatibility.rows[0]).toMatchObject({ externalId: 'unknown-role', status: 'incompatible',
        upstreamHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    });

    it('writes reviewed curriculum via HTTP and exposes only approved records in the raw student response', async () => {
      const path = `/v1/portal/courses/${courseId}/syllabus`;
      const modules = [{ weekNo: 1, title: 'Explicit objectives', topics: ['Synthetic topic'], covered: false }];
      const payload = curriculumFixture();
      const input = { modules, curriculum: { commandId: randomUUID(), expectedRevision: 0, reason: 'Synthetic proposal', payload } };
      const proposed = await supertest(app.getHttpServer()).post(path).set('Cookie', instructorCookie)
        .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION).send(input).expect(201);
      expect(proposed.body.curriculum).toMatchObject({ status: 'ready', revision: 1 });
      const reviewed = structuredClone(payload);
      reviewed.alignments[0]!.status = 'approved';
      reviewed.alignments[0]!.version = 2;
      reviewed.alignments[2]!.status = 'rejected';
      reviewed.alignments[2]!.version = 2;
      reviewed.alignments[2]!.overrideReason = 'Synthetic rejected reference';
      const reviewInput = { modules, curriculum: { commandId: randomUUID(), expectedRevision: 1, reason: 'Synthetic review', payload: reviewed } };
      await supertest(app.getHttpServer()).post(`${path}/review`).set('Cookie', instructorCookie).send(reviewInput).expect(403);
      const wrongRoute = await supertest(app.getHttpServer()).post(path).set('Cookie', ownerCookie).send(reviewInput).expect(403);
      expect(wrongRoute.body.code).toBe('CURRICULUM_REVIEW_ROUTE_REQUIRED');
      await supertest(app.getHttpServer()).post(`${path}/review`).set('Cookie', ownerCookie)
        .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION).send(reviewInput).expect(201);
      const instructor = await supertest(app.getHttpServer()).get(path).set('Cookie', instructorCookie)
        .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION).expect(200);
      expect(instructor.body.curriculum.data.alignments.map((a: { state: string }) => a.state)).toEqual(['approved', 'proposed', 'rejected']);
      const student = await supertest(app.getHttpServer()).get(`/v1/student/courses/${courseId}/syllabus`).set('Cookie', studentCookie)
        .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION).expect(200);
      expect(student.headers['cache-control']).toBe('private, no-store');
      expect(student.headers.vary).toContain('x-petros-curriculum-alignment');
      expect(student.body.curriculum).toMatchObject({ status: 'ready', evidence: 'not_assessed' });
      expect(student.body.curriculum.data.alignments).toHaveLength(1);
      expect(student.body.curriculum.data.alignments[0]).toMatchObject({ id: reviewed.alignments[0]!.id, state: 'approved' });
      expect(student.body.curriculum.data.items.map((item: { id: string }) => item.id)).toEqual([reviewed.items[0]!.id]);
      // Inspect the actual serialized body: hiding rejected records in UI is not sufficient.
      for (const index of [1, 2]) {
        expect(student.text).not.toContain(reviewed.alignments[index]!.id);
        expect(student.text).not.toContain(reviewed.items[index]!.id);
        expect(student.text).not.toContain(reviewed.items[index]!.descriptor);
      }
      expect(student.text).not.toContain('Synthetic rejected reference');
      expect(student.body.curriculum.data.unmappedObjectives.sort()).toEqual(reviewed.objectives.slice(1).map((o) => o.id).sort());
      expect(student.body).not.toHaveProperty('history');
    });

    it('keeps instructor and student legacy syllabus shapes and denies unrelated course reads', async () => {
      const path = `/v1/portal/courses/${courseId}/syllabus`;
      const instructor = await supertest(app.getHttpServer()).get(path).set('Cookie', instructorCookie).expect(200);
      expect(Array.isArray(instructor.body)).toBe(true);
      expect(instructor.body[0]).toMatchObject({ weekNo: 1, title: 'Explicit objectives' });
      const student = await supertest(app.getHttpServer()).get(`/v1/student/courses/${courseId}/syllabus`).set('Cookie', studentCookie).expect(200);
      expect(Object.keys(student.body)).toEqual(['modules']);
      expect(Object.keys(student.body.modules[0]).sort()).toEqual(['covered', 'isCurrentWeek', 'title', 'topics', 'weekNo']);
      await supertest(app.getHttpServer()).get(path).set('Cookie', deniedCookie).expect(403);
      const unassigned = await supertest(app.getHttpServer()).get(`/v1/portal/courses/${otherCourseId}/syllabus`)
        .set('Cookie', instructorCookie).expect(403);
      expect(unassigned.body.code).toBe('COURSE_SCOPE_REQUIRED');
      await supertest(app.getHttpServer()).get(`/v1/portal/courses/${crossCourseId}/syllabus`).set('Cookie', ownerCookie).expect(404);
      for (const id of [otherCourseId, crossCourseId]) {
        const denied = await supertest(app.getHttpServer()).get(`/v1/student/courses/${id}/syllabus`).set('Cookie', studentCookie)
          .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION).expect(404);
        expect(denied.body).not.toHaveProperty('curriculum');
      }
      await supertest(app.getHttpServer()).get(`/v1/student/courses/${courseId}/syllabus`).expect(401);
    });
  },
);

function provenance() {
  return { method: 'manual' as const, sourceRef: 'synthetic-private-http-test', sourceHash: 'a'.repeat(64),
    observedAt: '2020-01-01T00:00:00.000Z', licence: 'synthetic-only' };
}

function curriculumFixture(): CurriculumAlignment {
  const effective = { from: '2020-01-01T00:00:00.000Z', until: null };
  const common = () => ({ id: randomUUID(), version: 1, provenance: provenance() });
  const ref = (record: { id: string; version: number }) => ({ id: record.id, version: record.version });
  const objectives = ['Approved objective', 'Proposed objective', 'Rejected objective'].map((descriptor) => ({ ...common(), descriptor, effective }));
  const framework = { ...common(), title: 'Synthetic framework', jurisdiction: 'Test', subject: 'Computing', level: 'Intro',
    issuingBody: 'Synthetic publisher', externalId: 'SYN-FW', uri: null };
  const release = { ...common(), framework: ref(framework), publisherVersion: 'synthetic-1', effective, supersedes: null };
  const items = objectives.map((_, index) => ({ ...common(), release: ref(release), externalId: `SYN-${index}`,
    uri: null, descriptor: `Synthetic private standard ${index}` }));
  return { schemaVersion: CURRICULUM_ALIGNMENT_VERSION, objectives, frameworks: [framework], releases: [release], items,
    relationships: [], moduleObjectives: [{ weekNo: 1, objectives: objectives.map(ref) }],
    alignments: objectives.map((objective, index) => ({ ...common(), objective: ref(objective), standard: ref(items[index]!),
      relation: 'addresses', rationale: `Synthetic rationale ${index}`, gaps: [], confidence: 1,
      status: 'proposed', effective, overrideReason: null })) };
}
