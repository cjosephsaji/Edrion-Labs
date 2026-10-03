import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuditWriter } from '@edrion/audit';
import { createTenantAwareDatabase, schema, type Database } from '@edrion/database';
import { PROVIDER_MAPPING_VERSION, type ProviderMappingInput } from '@edrion/schemas';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { FederationService } from '../federation/federation.service';
import { PortalFederationController } from '../federation/portal-federation.controller';
import { PortalAuthService } from '../portal/portal-auth.service';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { InstitutionRateLimiter } from '../portal/portal-rate-limit';
import { PortalSessionService } from '../portal/portal-session.service';
import { PortalTenantInterceptor } from '../portal/portal-tenant.interceptor';
import { StudentSessionService } from '../student/core/student-session.service';
import { ProviderMappingsRepository } from './provider-mappings.repository';
import { ProviderMappingsService } from './provider-mappings.service';

/**
 * Remaining V10 provider-mapping closure evidence. The suite owns a private PostgreSQL cluster,
 * migrates it from scratch, signs a real portal session, and executes application requests as the
 * NOBYPASSRLS edrion_app role. Administrator access is used only for synthetic fixture setup and
 * deliberate canonical/stored-record fault injection; no shared or production database is read.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Petros provider mapping closure / disposable PostgreSQL',
  () => {
    const institutionId = randomUUID();
    const ownerId = randomUUID();
    const unrelatedId = randomUUID();
    const studentUserId = randomUUID();
    const independentUserId = randomUUID();
    const foreignInstitutionId = randomUUID();
    const foreignOwnerId = randomUUID();
    const campusId = randomUUID();
    const studentId = randomUUID();
    const courseId = randomUUID();
    const connectionId = randomUUID();
    const studentVersion = 7;
    const forcedAuditReason = 'synthetic forced provider audit rollback';
    const env = {
      NODE_ENV: 'test',
      PORTAL_AUTH_DEV_HEADER: false,
      PORTAL_SESSION_COOKIE_NAME: 'petros_provider_closure',
      STUDENT_SESSION_COOKIE_NAME: 'petros_provider_closure_student',
      SESSION_COOKIE_SECRET: 'private-provider-closure-secret-at-least-32-characters',
      SESSION_TTL_SECONDS: 3600,
      RATE_LIMIT_ENABLED: false,
      RECENT_AUTH_ENABLED: true,
      RECENT_AUTH_WINDOW_SECONDS: 900,
      PETROS_PROVIDER_MAPPING_ENABLED: true,
    };

    let directory = '';
    let running = false;
    let admin!: ReturnType<typeof postgres>;
    let application!: ReturnType<typeof postgres>;
    let tenantDb!: Database;
    let app: INestApplication | undefined;
    let ownerCookie = '';
    let unrelatedCookie = '';
    let studentPortalCookie = '';
    let studentCookie = '';
    let independentCookie = '';
    let foreignCookie = '';
    let protectedBaseline: unknown;

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), 'petros-provider-closure-'));
      execFileSync('initdb', [
        '-D', join(directory, 'data'), '-U', 'petros_test', '-A', 'trust', '--no-locale', '-E', 'UTF8',
      ], { stdio: 'pipe' });
      execFileSync('pg_ctl', [
        '-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
        '-o', `-F -k ${directory} -h ''`, '-w', 'start',
      ], { stdio: 'pipe' });
      running = true;

      admin = postgres({ host: directory, username: 'petros_test', database: 'postgres', max: 4, onnotice: () => {} });
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
      await admin.unsafe(`
        CREATE FUNCTION petros_provider_closure_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'roster.mapping_changed'
             AND NEW.reason = 'synthetic forced provider audit rollback' THEN
            RAISE EXCEPTION 'synthetic provider audit failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER petros_provider_closure_fail_audit
          BEFORE INSERT ON audit_events
          FOR EACH ROW EXECUTE FUNCTION petros_provider_closure_fail_audit();
      `);

      application = postgres({ host: directory, username: 'edrion_app', database: 'postgres', max: 6, onnotice: () => {} });
      const adminDb = drizzle(admin, { schema });
      tenantDb = createTenantAwareDatabase(drizzle(application, { schema }));
      await adminDb.insert(schema.institutions).values({
        id: institutionId,
        publicId: `provider-closure-${institutionId}`,
        legalName: 'Provider closure institution',
        displayName: 'Provider closure institution',
        type: 'school',
        country: 'IN',
        primaryContact: { name: 'Synthetic owner', email: 'owner@provider-closure.test' },
      });
      await adminDb.insert(schema.institutions).values({
        id: foreignInstitutionId,
        publicId: `provider-foreign-${foreignInstitutionId}`,
        legalName: 'Foreign provider closure institution',
        displayName: 'Foreign provider closure institution',
        type: 'school',
        country: 'IN',
        primaryContact: { name: 'Foreign synthetic owner', email: 'foreign@provider-closure.test' },
      });
      await adminDb.insert(schema.campuses).values({
        id: campusId, institutionId, name: 'Synthetic provider campus', code: 'PROVIDER-CLOSURE',
      });
      await adminDb.insert(schema.institutionUsers).values([
        { id: ownerId, institutionId, email: 'owner@provider-closure.test',
          fullName: 'Synthetic provider owner', status: 'active' },
        { id: unrelatedId, institutionId, email: 'unrelated@provider-closure.test',
          fullName: 'Synthetic unrelated reviewer', status: 'active', directDenies: ['students.update'] },
        { id: studentUserId, institutionId, email: 'student@provider-closure.test',
          fullName: 'Synthetic student', status: 'active' },
        { id: foreignOwnerId, institutionId: foreignInstitutionId, email: 'foreign@provider-closure.test',
          fullName: 'Synthetic foreign owner', status: 'active' },
      ]);
      await adminDb.insert(schema.institutionUserRoles).values([
        { institutionUserId: ownerId, roleKey: 'institution_owner' },
        { institutionUserId: unrelatedId, roleKey: 'institution_admin' },
        { institutionUserId: studentUserId, roleKey: 'student' },
        { institutionUserId: foreignOwnerId, roleKey: 'institution_owner' },
      ]);
      await adminDb.insert(schema.independentUsers).values({
        id: independentUserId, email: 'independent@provider-closure.test', fullName: 'Synthetic independent learner',
      });
      await adminDb.insert(schema.students).values({
        id: studentId,
        institutionId,
        admissionNo: `SYN-${studentId}`,
        firstName: 'Synthetic',
        lastName: 'Canonical',
        status: 'enrolled',
        version: studentVersion,
      });
      await adminDb.insert(schema.courses).values({
        id: courseId,
        institutionId,
        code: `SYN-${courseId}`,
        name: 'Synthetic closure course',
      });
      await adminDb.insert(schema.courseEnrollments).values({ institutionId, courseId, studentId });
      await adminDb.insert(schema.institutionIdentityProviders).values({
        id: connectionId,
        institutionId,
        kind: 'oidc',
        name: 'Synthetic mapping provider',
        issuer: 'https://provider-closure.invalid',
        clientId: 'synthetic-provider-closure',
        clientSecret: 'synthetic-private-secret',
        enabled: true,
      });

      const audit = new AuditWriter(tenantDb);
      const mappings = new ProviderMappingsService(
        new ProviderMappingsRepository(tenantDb),
        tenantDb,
        env as never,
        audit,
      );
      const sessions = new PortalSessionService(tenantDb, env as never);
      const studentSessions = new StudentSessionService(tenantDb, env as never);
      const reflector = new Reflector();
      Reflect.defineMetadata(
        'design:paramtypes',
        [FederationService, ProviderMappingsService],
        PortalFederationController,
      );
      const module = await Test.createTestingModule({
        controllers: [PortalFederationController],
        providers: [
          { provide: FederationService, useValue: {} },
          { provide: ProviderMappingsService, useValue: mappings },
        ],
      })
        .overrideGuard(InstitutionAuthGuard)
        .useValue(new InstitutionAuthGuard(
          new PortalAuthService(tenantDb, env as never),
          sessions,
          new InstitutionRateLimiter(env as never, { enabled: false } as never),
          env as never,
        ))
        .overrideGuard(InstitutionPermissionsGuard)
        .useValue(new InstitutionPermissionsGuard(reflector, env as never))
        .compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('v1');
      app.use((req: { context: object }, _res: unknown, next: () => void) => {
        req.context = {
          requestId: randomUUID(),
          correlationId: randomUUID(),
          apiEndpoint: 'provider-mapping-closure-http',
        };
        next();
      });
      app.useGlobalInterceptors(new PortalTenantInterceptor(tenantDb));
      const logger = { child: () => logger, warn: vi.fn(), error: vi.fn() };
      app.useGlobalFilters(new AllExceptionsFilter(logger as never, { captureException: vi.fn() } as never));
      await app.listen(0, '127.0.0.1');

      const issued = await sessions.issue({ institutionId, institutionUserId: ownerId, aal: 'aal1' });
      ownerCookie = `${sessions.cookieName}=${issued.token}`;
      const unrelated = await sessions.issue({ institutionId, institutionUserId: unrelatedId, aal: 'aal1' });
      unrelatedCookie = `${sessions.cookieName}=${unrelated.token}`;
      const studentPortal = await sessions.issue({ institutionId, institutionUserId: studentUserId, aal: 'aal1' });
      studentPortalCookie = `${sessions.cookieName}=${studentPortal.token}`;
      const institutionalStudent = await studentSessions.issue({
        kind: 'institutional', userId: studentUserId, institutionId,
      });
      studentCookie = `${studentSessions.cookieName}=${institutionalStudent.token}`;
      const independent = await studentSessions.issue({ kind: 'independent', userId: independentUserId });
      independentCookie = `${studentSessions.cookieName}=${independent.token}`;
      const foreign = await sessions.issue({
        institutionId: foreignInstitutionId, institutionUserId: foreignOwnerId, aal: 'aal1',
      });
      foreignCookie = `${sessions.cookieName}=${foreign.token}`;
      protectedBaseline = await protectedTables();
    }, 30_000);

    afterAll(async () => {
      await app?.close();
      await application?.end({ timeout: 1 });
      await admin?.end({ timeout: 1 });
      if (running) {
        execFileSync('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
      }
      if (directory) rmSync(directory, { recursive: true, force: true });
    }, 15_000);

    const path = () => `/v1/portal/federation/identity-providers/${connectionId}/mappings`;
    const request = () => supertest(app!.getHttpServer());

    function input(externalId: string, overrides: Partial<ProviderMappingInput> = {}): ProviderMappingInput {
      return {
        schemaVersion: PROVIDER_MAPPING_VERSION,
        namespace: 'Synthetic.Provider.Closure',
        entityKind: 'student',
        externalId,
        commandId: randomUUID(),
        expectedVersion: 0,
        internalId: studentId,
        purpose: 'roster',
        status: 'proposed',
        effective: { from: '2000-01-01T00:00:00.000Z', until: null },
        upstreamRevision: 'synthetic-closure-1',
        upstreamHash: 'a'.repeat(64),
        fieldAuthority: [
          { field: 'identity', owner: 'canonical' },
          { field: 'enrollment', owner: 'canonical' },
        ],
        provenance: {
          method: 'manual',
          sourceRef: 'synthetic-private-provider-closure',
          sourceHash: 'b'.repeat(64),
          observedAt: '2026-09-22T00:00:00.000Z',
          licence: 'synthetic-only',
        },
        reason: 'Synthetic provider closure proposal',
        ...overrides,
      };
    }

    async function put(body: ProviderMappingInput) {
      return request().put(path()).set('Cookie', ownerCookie).send(body);
    }

    async function resolve(externalId: string) {
      return request().post(`${path()}/resolve`).set('Cookie', ownerCookie).send({
        namespace: 'Synthetic.Provider.Closure',
        entityKind: 'student',
        externalId,
      });
    }

    async function approve(
      externalId: string,
      overrides: Partial<ProviderMappingInput> = {},
    ) {
      const proposed = input(externalId, { ...overrides, status: 'proposed', expectedVersion: 0, commandId: randomUUID() });
      await put(proposed).then((response) => expect(response.status).toBe(200));
      const approved = input(externalId, {
        ...overrides,
        status: 'approved',
        expectedVersion: 1,
        commandId: randomUUID(),
        reason: 'Synthetic provider closure approval',
      });
      await put(approved).then((response) => expect(response.status).toBe(200));
    }

    async function protectedTables() {
      const identityProviders = await admin`
        SELECT *
        FROM institution_identity_providers WHERE institution_id = ${institutionId} ORDER BY id
      `;
      const identities = await admin`
        SELECT *
        FROM institution_users WHERE institution_id = ${institutionId} ORDER BY id
      `;
      const roles = await admin`
        SELECT r.*
        FROM institution_user_roles r
        JOIN institution_users u ON u.id = r.institution_user_id
        WHERE u.institution_id = ${institutionId} ORDER BY r.id
      `;
      const students = await admin`
        SELECT *
        FROM students WHERE institution_id = ${institutionId} ORDER BY id
      `;
      const enrollments = await admin`
        SELECT *
        FROM course_enrollments WHERE institution_id = ${institutionId} ORDER BY id
      `;
      return { identityProviders, identities, roles, students, enrollments };
    }

    async function historyCounts() {
      const [counts] = await admin`
        SELECT
          (SELECT count(*) FROM integration_provider_mappings WHERE institution_id = ${institutionId})::int AS mappings,
          (SELECT count(*) FROM audit_events WHERE institution_id = ${institutionId}
           AND action = 'roster.mapping_changed')::int AS audits
      `;
      return counts;
    }

    it('uses a signed session and restricted RLS path for rejected, tombstoned, and effective-window states', async () => {
      await request().post(`${path()}/resolve`).send({
        namespace: 'Synthetic.Provider.Closure', entityKind: 'student', externalId: 'unauthenticated',
      }).expect(401);
      expect(await application`SELECT id FROM integration_provider_mappings`).toEqual([]);

      const lifecycle = 'Lifecycle-Student';
      await put(input(lifecycle)).then((response) => expect(response.status).toBe(200));
      const rejected = await put(input(lifecycle, {
        status: 'rejected', expectedVersion: 1, reason: 'Synthetic rejection',
      }));
      expect(rejected.status).toBe(200);
      expect(rejected.body.record).toMatchObject({ version: 2, input: { status: 'rejected' } });
      expect((await resolve(lifecycle)).body.resolution).toMatchObject({ status: 'unreviewed', version: 2 });
      const tombstoned = await put(input(lifecycle, {
        status: 'tombstoned', expectedVersion: 2, reason: 'Synthetic tombstone',
      }));
      expect(tombstoned.status).toBe(200);
      expect((await resolve(lifecycle)).body.resolution).toMatchObject({ status: 'tombstoned', version: 3 });

      await approve('Effective-Active');
      expect((await resolve('Effective-Active')).body.resolution).toMatchObject({
        status: 'mapped', canonicalId: studentId,
      });
      await approve('Effective-Future', {
        effective: { from: '2099-01-01T00:00:00.000Z', until: null },
      });
      expect((await resolve('Effective-Future')).body.resolution).toMatchObject({ status: 'not_effective' });
      await approve('Effective-Expired', {
        effective: { from: '2000-01-01T00:00:00.000Z', until: '2001-01-01T00:00:00.000Z' },
      });
      expect((await resolve('Effective-Expired')).body.resolution).toMatchObject({ status: 'not_effective' });
    });

    it('denies campus scope, unrelated authority, student, independent, and foreign tenants without mutations', async () => {
      const beforeHistory = await historyCounts();
      const beforeCanonical = await protectedTables();
      const deniedInput = input('Denied-Principal');
      const key = {
        namespace: deniedInput.namespace,
        entityKind: deniedInput.entityKind,
        externalId: deniedInput.externalId,
      };

      const campus = await request().put(path()).set('Cookie', ownerCookie)
        .set('x-institution-scope', `campus:${campusId}`).send(deniedInput);
      expect(campus.status).toBe(403);
      expect(campus.body.code).toBe('PROVIDER_MAPPING_AUTHORITY');

      const unrelated = await request().put(path()).set('Cookie', unrelatedCookie).send(deniedInput);
      expect(unrelated.status).toBe(403);
      expect(unrelated.body.code).toBe('PROVIDER_MAPPING_AUTHORITY');

      const student = await request().put(path()).set('Cookie', studentPortalCookie).send(deniedInput);
      expect(student.status).toBe(403);
      await request().post(`${path()}/resolve`).set('Cookie', studentPortalCookie).send(key).expect(403);
      await request().post(`${path()}/resolve`).set('Cookie', studentCookie).send(key).expect(401);
      await request().post(`${path()}/resolve`).set('Cookie', independentCookie).send(key).expect(401);

      const foreign = await request().put(path()).set('Cookie', foreignCookie).send(deniedInput);
      expect(foreign.status).toBe(404);
      expect(foreign.body.code).toBe('PROVIDER_CONNECTION_NOT_FOUND');
      const foreignRead = await request().post(`${path()}/resolve`).set('Cookie', foreignCookie).send(key);
      expect(foreignRead.status).toBe(404);
      expect(foreignRead.body.code).toBe('PROVIDER_CONNECTION_NOT_FOUND');

      // The restricted DB role also denies reads when a student/independent GUC is present,
      // even if the institution GUC is otherwise valid.
      for (const [guc, userId] of [
        ['app.student_id', studentId],
        ['app.independent_user_id', independentUserId],
      ] as const) {
        const rows = await application.begin(async (tx) => {
          await tx`SELECT set_config('app.institution_id', ${institutionId}, true)`;
          await tx`SELECT set_config(${guc}, ${userId}, true)`;
          return tx`SELECT id FROM integration_provider_mappings`;
        });
        expect(rows).toEqual([]);
      }
      const foreignRows = await application.begin(async (tx) => {
        await tx`SELECT set_config('app.institution_id', ${foreignInstitutionId}, true)`;
        return tx`SELECT id FROM integration_provider_mappings`;
      });
      expect(foreignRows).toEqual([]);
      expect(await historyCounts()).toEqual(beforeHistory);
      expect(await protectedTables()).toEqual(beforeCanonical);
    });

    it('rejects a changed same-command replay without a second mapping or audit event', async () => {
      const externalId = 'Changed-Command-Replay';
      const command = input(externalId);
      expect((await put(command)).status).toBe(200);
      const beforeHistory = await historyCounts();
      const beforeCanonical = await protectedTables();
      const changed = await put({ ...command, reason: 'Synthetic changed replay payload' });
      expect(changed.status).toBe(409);
      expect(changed.body.code).toBe('PROVIDER_MAPPING_RETRY_CONFLICT');
      const [rows] = await admin`
        SELECT count(*)::int AS count FROM integration_provider_mappings
        WHERE connection_id = ${connectionId} AND external_id = ${externalId}
      `;
      expect(rows?.count).toBe(1);
      expect(await historyCounts()).toEqual(beforeHistory);
      expect(await protectedTables()).toEqual(beforeCanonical);
    });

    it('uses exact namespace identity and never auto-merges a canonical email or name', async () => {
      const externalId = 'Namespace-Exact-Identity';
      await approve(externalId);
      expect((await resolve(externalId)).body.resolution).toMatchObject({
        status: 'mapped', canonicalId: studentId,
      });
      const [canonical] = await admin`
        SELECT email, full_name FROM institution_users WHERE id = ${ownerId}
      `;
      if (!canonical) throw new Error('Synthetic canonical owner missing');
      expect(canonical).toEqual({
        email: 'owner@provider-closure.test',
        full_name: 'Synthetic provider owner',
      });
      const beforeHistory = await historyCounts();
      const beforeCanonical = await protectedTables();

      const namespaceCase = await request().post(`${path()}/resolve`).set('Cookie', ownerCookie).send({
        namespace: 'synthetic.Provider.Closure',
        entityKind: 'student',
        externalId,
      });
      expect(namespaceCase.status).toBe(201);
      expect(namespaceCase.body).toMatchObject({ record: null, resolution: { status: 'missing' } });
      expect(namespaceCase.body.resolution).not.toHaveProperty('canonicalId');

      for (const externalIdentity of [canonical.email, canonical.full_name]) {
        const unmatched = await request().post(`${path()}/resolve`).set('Cookie', ownerCookie).send({
          namespace: 'Synthetic.Provider.Closure',
          entityKind: 'institution_user',
          externalId: externalIdentity,
        });
        expect(unmatched.status).toBe(201);
        expect(unmatched.body).toMatchObject({ record: null, resolution: { status: 'missing' } });
        expect(unmatched.body.resolution).not.toHaveProperty('canonicalId');
      }

      expect(await historyCounts()).toEqual(beforeHistory);
      expect(await protectedTables()).toEqual(beforeCanonical);
    });

    it('fails closed after a connection is disabled or reconfigured without appending', async () => {
      const externalId = 'Connection-Fail-Closed';
      const proposed = input(externalId);
      expect((await put(proposed)).status).toBe(200);
      const approved = {
        ...proposed,
        commandId: randomUUID(),
        expectedVersion: 1,
        status: 'approved' as const,
        reason: 'Synthetic connection review',
      };
      expect((await put(approved)).status).toBe(200);
      const pending = input('Connection-Review-Pending');
      expect((await put(pending)).status).toBe(200);
      const beforeHistory = await historyCounts();
      const baselineConnection = await protectedTables();

      await admin`UPDATE institution_identity_providers SET enabled = false WHERE id = ${connectionId}`;
      const disabled = await resolve(externalId);
      expect(disabled.body.resolution).toMatchObject({ status: 'stale' });
      expect(disabled.body.resolution).not.toHaveProperty('canonicalId');
      const disabledReplay = await put(approved);
      expect(disabledReplay.status).toBe(409);
      expect(disabledReplay.body.code).toBe('PROVIDER_MAPPING_STALE');
      const disabledReview = await put({
        ...pending, commandId: randomUUID(), expectedVersion: 1,
        status: 'approved', reason: 'Synthetic disabled-connection review',
      });
      expect(disabledReview.status).toBe(409);
      expect(disabledReview.body.code).toBe('PROVIDER_MAPPING_REVIEW_REQUIRED');
      await admin`UPDATE institution_identity_providers SET enabled = true WHERE id = ${connectionId}`;

      await admin`
        UPDATE institution_identity_providers SET issuer = 'https://provider-closure-changed.invalid'
        WHERE id = ${connectionId}
      `;
      const changed = await resolve(externalId);
      expect(changed.body.resolution).toMatchObject({ status: 'stale' });
      expect(changed.body.resolution).not.toHaveProperty('canonicalId');
      const changedReplay = await put(approved);
      expect(changedReplay.status).toBe(409);
      expect(changedReplay.body.code).toBe('PROVIDER_MAPPING_STALE');
      await admin`
        UPDATE institution_identity_providers SET issuer = 'https://provider-closure.invalid'
        WHERE id = ${connectionId}
      `;
      expect((await resolve(externalId)).body.resolution).toMatchObject({
        status: 'mapped', canonicalId: studentId,
      });
      expect(await historyCounts()).toEqual(beforeHistory);
      expect(await protectedTables()).toEqual(baselineConnection);
    });

    it('fails closed for missing and changed canonical owners', async () => {
      await approve('Canonical-Missing');
      await admin`UPDATE students SET status = 'inactive' WHERE id = ${studentId}`;
      expect((await resolve('Canonical-Missing')).body.resolution).toMatchObject({ status: 'missing_reference' });
      await admin`UPDATE students SET status = 'enrolled' WHERE id = ${studentId}`;
      expect((await resolve('Canonical-Missing')).body.resolution).toMatchObject({ status: 'mapped', canonicalId: studentId });

      await approve('Canonical-Changed');
      await admin`UPDATE students SET version = ${studentVersion + 1} WHERE id = ${studentId}`;
      expect((await resolve('Canonical-Changed')).body.resolution).toMatchObject({ status: 'stale' });
      await admin`UPDATE students SET version = ${studentVersion} WHERE id = ${studentId}`;
      expect((await resolve('Canonical-Changed')).body.resolution).toMatchObject({ status: 'mapped', canonicalId: studentId });
    });

    it('reports unsupported stored records and blocks appending over them', async () => {
      const externalId = 'Unsupported-Stored-Version';
      const first = await put(input(externalId));
      expect(first.status).toBe(200);
      const commandId = randomUUID();
      const unsupportedRecord = structuredClone(first.body.record) as Record<string, unknown> & {
        input: Record<string, unknown>;
      };
      unsupportedRecord.version = 2;
      unsupportedRecord.recordedAt = new Date().toISOString();
      unsupportedRecord.input = {
        ...unsupportedRecord.input,
        commandId,
        expectedVersion: 1,
        reason: 'Synthetic unsupported stored revision',
      };
      unsupportedRecord.unsupportedRevision = 2;
      await admin`
        INSERT INTO integration_provider_mappings
          (institution_id, connection_id, namespace, entity_kind, external_id, version, command_id, request_hash, record)
        VALUES
          (${institutionId}, ${connectionId}, 'Synthetic.Provider.Closure', 'student', ${externalId}, 2,
           ${commandId}, ${'c'.repeat(64)}, ${JSON.stringify(unsupportedRecord)}::jsonb)
      `;

      const read = await resolve(externalId);
      expect(read.status).toBe(201);
      expect(read.body).toMatchObject({ record: null, resolution: { status: 'unsupported_version', version: 2 } });
      const append = await put(input(externalId, { expectedVersion: 2 }));
      expect(append.status).toBe(409);
      expect(append.body.code).toBe('PROVIDER_MAPPING_VERSION_UNSUPPORTED');
    });

    it('serializes a true concurrent revision race through the restricted connection', async () => {
      const externalId = 'Concurrent-Revision';
      const [one, two] = await Promise.all([
        put(input(externalId, { commandId: randomUUID(), reason: 'Synthetic concurrent writer one' })),
        put(input(externalId, { commandId: randomUUID(), reason: 'Synthetic concurrent writer two' })),
      ]);
      expect([one.status, two.status].sort()).toEqual([200, 409]);
      const conflict = [one, two].find((response) => response.status === 409)!;
      expect(conflict.body.code).toBe('PROVIDER_MAPPING_VERSION_CONFLICT');
      const [count] = await admin`
        SELECT count(*)::int AS count FROM integration_provider_mappings
        WHERE connection_id = ${connectionId} AND external_id = ${externalId}
      `;
      expect(count?.count).toBe(1);
    });

    it('rolls the mapping append back when the real database audit insert fails', async () => {
      const externalId = 'Audit-Rollback';
      const failed = await put(input(externalId, { reason: forcedAuditReason }));
      expect(failed.status).toBe(500);
      const [rows] = await admin`
        SELECT
          (SELECT count(*) FROM integration_provider_mappings
           WHERE connection_id = ${connectionId} AND external_id = ${externalId})::int AS mappings,
          (SELECT count(*) FROM audit_events
           WHERE institution_id = ${institutionId} AND reason = ${forcedAuditReason})::int AS audits
      `;
      expect(rows).toEqual({ mappings: 0, audits: 0 });
    });

    it('leaves identity, provider, role, student, and enrollment state byte-for-byte unchanged', async () => {
      expect(await protectedTables()).toEqual(protectedBaseline);
    });
  },
);
