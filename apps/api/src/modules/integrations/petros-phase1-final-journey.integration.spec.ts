import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { defaultInstitutionPolicy } from '../petros-institutional/petros-institutional.engine';
import { PetrosAiGatewayService } from '../petros-ai-routing/petros-ai-gateway.service';
import { PetrosAiRoutingRepository } from '../petros-ai-routing/petros-ai-routing.repository';
import { PetrosAiRoutingService } from '../petros-ai-routing/petros-ai-routing.service';
import { AuditWriter } from '@edrion/audit';
import { PetrosLearnerModelService } from '../petros-learner-model/petros-learner-model.service';
import { PetrosLearnerModelRepository } from '../petros-learner-model/petros-learner-model.repository';
import { PetrosQuestionExecutionService } from '../student/petros-loop/petros-question-execution.service';
import { PetrosQuestionExecutionRepository } from '../student/petros-loop/petros-question-execution.repository';
import { StudentPetrosQuestionExecutionController } from '../student/petros-loop/petros-question-execution.controller';
import { PortalCourseContentController } from '../portal/course-content/portal-course-content.controller';
import { PortalSessionService } from '../portal/portal-session.service';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { PortalTenantInterceptor } from '../portal/portal-tenant.interceptor';
import { KnowledgePreparationRepository } from '../student/knowledge/knowledge-preparation.repository';
import { KnowledgePdfProcess } from '../student/knowledge/knowledge-pdf-process';
import { PortalMaterialPreparationJobs } from '../portal/course-content/portal-material-preparation.jobs';
import { PortalAuthService } from '../portal/portal-auth.service';
import { PortalCrudEngine } from '../portal/portal-crud.engine';
import { StudentPetrosLoopController } from '../student/petros-loop/petros-loop.controller';
import { StudentPetrosArtifactsController } from '../student/petros-artifacts/petros-artifacts.controller';
import { PetrosArtifactsService } from '../student/petros-artifacts/petros-artifacts.service';
import { PetrosArtifactsRepository } from '../student/petros-artifacts/petros-artifacts.repository';
import { KnowledgeDocumentService, publishKnowledgeExtraction } from '../student/knowledge/knowledge-document.service';
import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  createTenantAwareDatabase,
  runInStudentTenant,
  runInInstitutionTenant,
  eq,
  and,
  sql,
  schema,
  type Database,
} from '@edrion/database';
import {
  CURRICULUM_ALIGNMENT_VERSION,
  PROVIDER_MAPPING_VERSION,
  PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  type CurriculumAlignment,
} from '@edrion/schemas';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { petrosDetourSchema as previousDetourReader } from '../../../../../packages/schemas/src/__fixtures__/petros-detour-89c1ca2';
import { petrosSessionIntentSchema as previousReader } from '../../../../../packages/schemas/src/__fixtures__/petros-session-intent-89c1ca2';
import { StudentPetrosSessionIntentController } from '../student/petros-session-intent/petros-session-intent.controller';
import { StudentPetrosCompanionController } from '../student/petros-companion/petros-companion.controller';
import { PetrosCompanionService } from '../student/petros-companion/petros-companion.service';
import { PetrosCompanionRepository } from '../student/petros-companion/petros-companion.repository';
import { PetrosActionRegistryService } from '../student/petros-companion/petros-action-registry.service';
import { PetrosBriefingService } from '../student/petros-companion/petros-briefing.service';
import { PetrosMentorService } from '../student/petros-companion/petros-mentor.service';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { StudentSessionService } from '../student/core/student-session.service';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import { StudentTenantInterceptor } from '../student/core/student-tenant.interceptor';
import { AllExceptionsFilter } from '../../common/all-exceptions.filter';
import { PortalCourseContentService } from '../portal/course-content/portal-course-content.service';
import { MaterialDocumentPreviewService } from '../student/materials/material-document-preview.service';
import { StudentMaterialsService } from '../student/materials/student-materials.service';
import { PetrosSessionIntentRepository } from '../student/petros-session-intent/petros-session-intent.repository';
import { PetrosSessionIntentService } from '../student/petros-session-intent/petros-session-intent.service';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import { PetrosLoopService } from '../student/petros-loop/petros-loop.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { previousPetrosDiagramSchema } from '../../../../../packages/schemas/src/__fixtures__/petros-diagram-89c1ca2';
import { assessmentEvidenceFixture, criterionResultFixture } from '../../../../../packages/schemas/src/__fixtures__/petros-assessment';
import { petrosVisualSnapshotSchema, petrosAssessmentSchema } from '@edrion/schemas';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import { ProviderMappingsRepository } from './provider-mappings.repository';
import { ProviderMappingsService } from './provider-mappings.service';
import { FederationService } from '../federation/federation.service';
import { PortalFederationController } from '../federation/portal-federation.controller';
import { PortalAuthOidcController } from '../federation/portal-auth-oidc.controller';
import { PortalAuthSamlController } from '../federation/portal-auth-saml.controller';
import { PortalCoursesController } from '../portal/courses/portal-courses.controller';
import { PortalCoursesService } from '../portal/courses/portal-courses.service';
import { StudentCoursesController } from '../student/courses/student-courses.controller';
import { StudentCoursesService } from '../student/courses/student-courses.service';
import { PortalEntityResolver } from '../portal/portal-entity-resolver';

/**
 * Opt in with PETROS_LOCAL_DB_TESTS=1. Always starts its OWN cluster, private Unix socket,
 * no TCP listener. Never reads DATABASE_URL or .env. Requires initdb/pg_ctl on PATH.
 * Applies real migrations and policies. Student requests use the non-superuser application
 * role and the production tenant transaction/proxy. No shared infrastructure is used.
 */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'Petros Phase 1 literal S1-S11 journey / disposable Postgres',
  () => {
    let directory: string;
    let client: ReturnType<typeof postgres>;
    let db: Database;
    let appClient: ReturnType<typeof postgres>;
    let tenantDb: Database;
    let running = false;
    let app: INestApplication;
    let cookie: string;
    let staffCookie: string;
    let instructorCookie: string;
    let portalPublisher: PortalCourseContentService;
    let portalJobs: PortalMaterialPreparationJobs;
    let httpServices: ReturnType<typeof services>;
    let registry: PetrosActionRegistryService;
    let artifacts: PetrosArtifactsService;
    let preMigrationItemId: string;
    let preMigrationPageId: string;
    let preS3Snapshot: typeof schema.knowledgeItemVersions.$inferSelect;
    let companionRepo: PetrosCompanionRepository;
    let questionJobs: PetrosQuestionExecutionService;
    let questionRepo: PetrosQuestionExecutionRepository;
    let questionEnv: Record<string, unknown>;
    let preS5Command: Record<string, unknown>;
    const knowledgePolicyIds: string[] = [];
    let knowledgePolicyVersion = 100;
    const visualEnv = { PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED: false, PETROS_VISUAL_PROGRAM_ENABLED: false, PETROS_ASSESSMENT_CONTRACT_ENABLED: false };
    const visualMaterialIds: string[] = [];
    let assessmentProfile = false;
    const questionSurfaces = { isPortalEnabled: vi.fn(async () => true) };
    const staffUserId = randomUUID();
    const instructorUserId = randomUUID();
    const instructorStaffId = randomUUID();
    const courseId = randomUUID();
    const providerId = randomUUID();
    const institutionId = randomUUID();
    const studentId = randomUUID();
    const classId = randomUUID();
    const principal: InstitutionalStudentPrincipal = {
      kind: 'institutional',
      institutionId,
      studentId,
      campusId: null,
      institutionUserId: randomUUID(),
      email: 'synthetic@example.test',
      fullName: 'Synthetic fixture',
      permissions: ['student.learn.use'],
      lastAuthAt: null,
    };

    beforeAll(async () => {
      directory = mkdtempSync(join(tmpdir(), 'petros-source-test-'));
      execFileSync(
        'initdb',
        [
          '-D',
          join(directory, 'data'),
          '-U',
          'petros_test',
          '-A',
          'trust',
          '--no-locale',
          '-E',
          'UTF8',
        ],
        { stdio: 'pipe' },
      );
      execFileSync(
        'pg_ctl',
        [
          '-D',
          join(directory, 'data'),
          '-l',
          join(directory, 'postgres.log'),
          '-o',
          `-F -k ${directory} -h ''`,
          '-w',
          'start',
        ],
        { stdio: 'pipe' },
      );
      running = true;
      client = postgres({
        host: directory,
        username: 'petros_test',
        database: 'postgres',
        max: 4,
        onnotice: () => {},
      });
      db = drizzle(client, { schema });
      const migrations = join(__dirname, '../../../../../packages/database/migrations');
      // Use the real migrations against this socket only; never import migrate.ts (.env loader).
      await client.unsafe('CREATE ROLE edrion_app LOGIN NOBYPASSRLS');
      // Historical migrations assume these production policy helpers already exist.
      const rlsSql = readFileSync(join(migrations, 'sql/zzz_rls.sql'), 'utf8');
      await client.unsafe(rlsSql.slice(0, rlsSql.indexOf('-- institutions:')));
      const previousMigrations = join(directory, 'previous-migrations');
      mkdirSync(join(previousMigrations, 'meta'), { recursive: true });
      const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
      journal.entries = journal.entries.filter(
        (entry: { idx: number }) => entry.idx < 128,
      );
      writeFileSync(join(previousMigrations, 'meta/_journal.json'), JSON.stringify(journal));
      for (const entry of journal.entries)
        copyFileSync(
          join(migrations, `${entry.tag}.sql`),
          join(previousMigrations, `${entry.tag}.sql`),
        );
      await migrate(db, { migrationsFolder: previousMigrations });
      for (const filename of readdirSync(join(migrations, 'sql'))
        .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
        .sort()) {
        await client.unsafe(readFileSync(join(migrations, 'sql', filename), 'utf8'));
      }
      await client.unsafe('ALTER ROLE edrion_app LOGIN');
      appClient = postgres({
        host: directory,
        username: 'edrion_app',
        connection: { statement_timeout: 4000, lock_timeout: 3000 },
        database: 'postgres',
        max: 6,
        onnotice: () => {},
      });
      tenantDb = createTenantAwareDatabase(drizzle(appClient, { schema }));
      await db.insert(schema.institutions).values({
        id: institutionId,
        publicId: 'synthetic-test',
        legalName: 'Synthetic',
        displayName: 'Synthetic',
        type: 'school',
        country: 'IN',
        primaryContact: { name: 'Synthetic', email: 'synthetic@example.test' },
      });
      await db.insert(schema.institutionUsers).values({
        id: principal.institutionUserId,
        institutionId,
        fullName: principal.fullName,
        email: principal.email,
        status: 'active',
      });
      await db
        .insert(schema.institutionUserRoles)
        .values({ institutionUserId: principal.institutionUserId, roleKey: 'student' });
      await db.insert(schema.institutionUsers).values({ id: staffUserId, institutionId,
        fullName: 'Synthetic preparation staff', email: 'preparation-staff@example.test', status: 'active' });
      await db.insert(schema.institutionUserRoles).values({ institutionUserId: staffUserId, roleKey: 'institution_owner' });
      await db.insert(schema.institutionUsers).values({
        id: instructorUserId,
        institutionId,
        fullName: 'Assigned synthetic instructor',
        email: 'assigned-instructor@example.test',
        status: 'active',
        directGrants: ['syllabus.manage'],
      });
      await db.insert(schema.institutionUserRoles).values({
        institutionUserId: instructorUserId,
        roleKey: 'teacher',
      });
      const [year] = await db
        .insert(schema.academicYears)
        .values({
          institutionId,
          name: 'Synthetic',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        })
        .returning();
      const [grade] = await db
        .insert(schema.gradeLevels)
        .values({ institutionId, name: 'Synthetic' })
        .returning();
      await db.insert(schema.classes).values({
        id: classId,
        institutionId,
        academicYearId: year!.id,
        gradeLevelId: grade!.id,
        name: 'Synthetic class',
      });
      await db.insert(schema.students).values({
        id: studentId,
        institutionId,
        institutionUserId: principal.institutionUserId,
        classId,
        admissionNo: 'synthetic-only',
        firstName: 'Synthetic',
        lastName: 'Fixture',
      });
      // Representative pre-S2 rows exist BEFORE the additive migration. No history is backfilled.
      const [legacyObject] =
        await client`INSERT INTO storage_objects (institution_id, owner_student_id, kind, driver, storage_key, mime_type, size_bytes)
        VALUES (${institutionId}, ${studentId}, 'pdf', 'local', 'synthetic-pre-migration', 'application/pdf', 50) RETURNING id`;
      const [legacyItem] =
        await client`INSERT INTO knowledge_items (institution_id, student_id, kind, title, object_ids, page_count, pages_done, extracted_text_ready, status)
        VALUES (${institutionId}, ${studentId}, 'pdf', 'Pre-S2 synthetic source', ${JSON.stringify([legacyObject!.id])}::jsonb, 1, 1, true, 'ready') RETURNING id`;
      const [legacyPage] =
        await client`INSERT INTO knowledge_item_pages (item_id, object_id, page_index, text)
        VALUES (${legacyItem!.id}, ${legacyObject!.id}, 0, 'Existing text must survive the additive migration unchanged.') RETURNING id`;
      preMigrationItemId = legacyItem!.id;
      preMigrationPageId = legacyPage!.id;
      // Apply S2, create an actual immutable S2 snapshot, then apply S3 over existing data.
      const s2Journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
      s2Journal.entries = s2Journal.entries.slice(0, s2Journal.entries.findIndex((entry: { tag: string }) => entry.tag === '0208_knowledge_extraction_versions') + 1);
      writeFileSync(join(previousMigrations, 'meta/_journal.json'), JSON.stringify(s2Journal));
      for (const entry of s2Journal.entries) copyFileSync(join(migrations, `${entry.tag}.sql`), join(previousMigrations, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: previousMigrations });
      const [s2Owner] = await db.insert(schema.knowledgeItems).values({ institutionId, studentId, kind: 'pdf',
        title: 'Synthetic pre-S3 extraction', objectIds: [legacyObject!.id], pageCount: 1, pagesDone: 1,
        extractedTextReady: true, status: 'ready', origin: { petrosExtraction: {
          schemaVersion: 'petros.document-source.v1', fileSha256: 'a'.repeat(64), indexing: 'not_built',
          representation: 'pdf_text', extractorVersion: 'pdfjs-4.10.38-text-v1', truncated: false, readable: true,
        } } }).returning();
      preS3Snapshot = (await db.transaction(tx => publishKnowledgeExtraction(tx, s2Owner!, ['Existing immutable source text survives S3 migration.']))).version;
      // Apply S3 first, preserving a real pre-S5 command across the additive execution migration.
      const s3Journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8'));
      s3Journal.entries = s3Journal.entries.slice(0, s3Journal.entries.findIndex((entry: { tag: string }) => entry.tag === '0209_knowledge_preparations') + 1);
      writeFileSync(join(previousMigrations, 'meta/_journal.json'), JSON.stringify(s3Journal));
      for (const entry of s3Journal.entries) copyFileSync(join(migrations, `${entry.tag}.sql`), join(previousMigrations, `${entry.tag}.sql`));
      await migrate(db, { migrationsFolder: previousMigrations });
      const [oldSession] = await client`insert into petros_learning_sessions (institution_id, student_id, client_request_id,
        state_version, session_type, topic, current_goal, time_budget_seconds, max_moves, checkpoints, current_checkpoint_id, prompt_version, output_schema_version)
        values (${institutionId}, ${studentId}, ${randomUUID()}, 'synthetic', 'learn', 'synthetic', 'synthetic', 600, 3, '[]', 'synthetic', 'synthetic', 'synthetic') returning id`;
      const [oldCommand] = await client`insert into petros_session_commands (session_id, institution_id, student_id, idempotency_key, command, status, response)
        values (${oldSession!.id}, ${institutionId}, ${studentId}, ${randomUUID()}, 'composer_question', 'completed', '{"synthetic":"old-payload"}') returning *`;
      preS5Command = { ...oldCommand! };
      await migrate(db, { migrationsFolder: migrations });
      // The grants script runs after a production migration batch. Reapply it after the staged
      // pre-S2/S3/S5 replay so tables introduced by the later migrations are reachable by the
      // restricted application role too.
      await client.unsafe(readFileSync(join(migrations, 'sql/zzz_grants.sql'), 'utf8'));
      await db.insert(schema.staff).values({
        id: instructorStaffId,
        institutionId,
        institutionUserId: instructorUserId,
        firstName: 'Assigned',
        lastName: 'Instructor',
      });
      await db.insert(schema.courses).values({
        id: courseId,
        institutionId,
        code: 'PHASE1-FINAL',
        name: 'Phase 1 final synthetic course',
        professorTeacherId: instructorStaffId,
      });
      await db.insert(schema.courseEnrollments).values({ institutionId, studentId, courseId });
      await db.insert(schema.institutionIdentityProviders).values({
        id: providerId,
        institutionId,
        kind: 'oidc',
        name: 'Synthetic disabled federation',
        issuer: 'https://synthetic-provider.invalid',
        clientId: 'synthetic-private',
        clientSecret: 'must-never-leak',
        enabled: true,
      });
      const profile = stage4ProfileFixture('cloud', institutionId);
      await db.insert(schema.petrosTopicProfiles).values({
        id: profile.profileId,
        topicKey: 'synthetic-cloud',
        canonicalTitle: 'Synthetic cloud',
        subjectKey: 'synthetic',
        subjectLabel: 'Synthetic',
        gradeBand: 'fixture',
        curriculumKey: 'fixture',
        curriculumLabel: 'Synthetic only',
        cacheKey: 'synthetic-profile',
      });
      await db.insert(schema.petrosTopicProfileVersions).values({
        id: profile.canonicalVersionId,
        profileId: profile.profileId,
        version: 1,
        source: 'generated',
        profile: profile.profile,
        profileHash: 'a'.repeat(64),
        confidenceBasisPoints: 0,
        generatorVersion: 'synthetic',
        promptVersion: 'synthetic',
        schemaVersion: profile.profile.schemaVersion,
        changeSummary: 'Synthetic persistence fixture; no educator approval',
      });
      httpServices = services();
      artifacts = new PetrosArtifactsService(
        new PetrosArtifactsRepository(
          tenantDb,
          new KnowledgeDocumentService(tenantDb, new StudentMaterialsService(tenantDb), {
            STUDENT_STORAGE_DIR: directory,
          } as never),
        ),
        {} as never,
      );
      registry = new PetrosActionRegistryService(tenantDb, httpServices.rawService, documents());
      companionRepo = new PetrosCompanionRepository(tenantDb);
      const companion = new PetrosCompanionService(
        companionRepo,
        {} as never,
        registry,
        {} as never,
        httpServices.gateway as never,
        {} as never,
        {} as never,
      );
      const env = {
        STUDENT_AUTH_DEV_HEADER: false,
        STUDENT_SESSION_COOKIE_NAME: 'petros_test_session',
        SESSION_COOKIE_SECRET: 'synthetic-local-test-secret-at-least-32-characters',
        SESSION_TTL_SECONDS: 3600,
        RATE_LIMIT_ENABLED: false,
        PORTAL_AUTH_DEV_HEADER: false,
        PORTAL_SESSION_COOKIE_NAME: 'petros_staff_test_session',
        STUDENT_STORAGE_DIR: directory,
        PETROS_PROVIDER_MAPPING_ENABLED: true,
        PETROS_CURRICULUM_ALIGNMENT_ENABLED: true,
      } as never;
      const sessions = new StudentSessionService(tenantDb, env);
      const auth = new StudentAuthService(
        tenantDb,
        {} as never,
        env,
        sessions,
        {} as never,
        {} as never,
      );
      const reflector = new Reflector();
      // Vitest's esbuild transform omits emitted constructor metadata. Match Nest's production DI.
      Reflect.defineMetadata(
        'design:paramtypes',
        [PetrosSessionIntentService],
        StudentPetrosSessionIntentController,
      );
      Reflect.defineMetadata(
        'design:paramtypes',
        [PetrosCompanionService, PetrosBriefingService, PetrosMentorService],
        StudentPetrosCompanionController,
      );
      questionEnv = { ...(env as unknown as Record<string, unknown>), PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED: false, PETROS_DOCUMENT_RETRIEVAL_ENABLED: true, REDIS_ENABLED: true, QUEUE_WORKERS_ENABLED: true };
      questionRepo = new PetrosQuestionExecutionRepository(tenantDb, new AuditWriter(tenantDb));
      questionJobs = new PetrosQuestionExecutionService(tenantDb, questionEnv as never, questionRepo, httpServices.rawLoop['repo'],
        httpServices.rawLoop, auth, questionSurfaces as never, { enabled: false } as never, { register: vi.fn() } as never,
        new PetrosAiRoutingRepository(tenantDb));
      Reflect.defineMetadata('design:paramtypes', [PetrosQuestionExecutionService], StudentPetrosQuestionExecutionController);
      Reflect.defineMetadata('design:paramtypes', [PetrosLoopService, PetrosQuestionExecutionService], StudentPetrosLoopController);
      Reflect.defineMetadata(
        'design:paramtypes',
        [PetrosArtifactsService],
        StudentPetrosArtifactsController,
      );
      portalPublisher = makePublisher();
      portalJobs = new PortalMaterialPreparationJobs(tenantDb, env,
        { enabled: false } as never, { register: vi.fn() } as never, preparationRepo(), new KnowledgePdfProcess(),
        portalPublisher, new PortalAuthService(tenantDb, env), { logAudit: vi.fn() } as never);
      const portalSessions = new PortalSessionService(tenantDb, env);
      const audit = new AuditWriter(tenantDb);
      const mappings = new ProviderMappingsService(
        new ProviderMappingsRepository(tenantDb), tenantDb, env, audit,
      );
      const federation = new FederationService(tenantDb, env, mappings, audit);
      const portalCourses = new PortalCoursesService(
        new PortalCrudEngine(tenantDb, audit, new PortalEntityResolver(tenantDb)),
        tenantDb,
        env,
        audit,
      );
      const studentCourses = new StudentCoursesService(tenantDb);
      Reflect.defineMetadata('design:paramtypes', [PortalCourseContentService, PortalMaterialPreparationJobs], PortalCourseContentController);
      Reflect.defineMetadata('design:paramtypes', [FederationService, ProviderMappingsService], PortalFederationController);
      Reflect.defineMetadata('design:paramtypes', [FederationService], PortalAuthOidcController);
      Reflect.defineMetadata('design:paramtypes', [FederationService], PortalAuthSamlController);
      Reflect.defineMetadata('design:paramtypes', [PortalCoursesService], PortalCoursesController);
      Reflect.defineMetadata('design:paramtypes', [StudentCoursesService], StudentCoursesController);
      const module = await Test.createTestingModule({
        controllers: [
          StudentPetrosSessionIntentController,
          PortalCourseContentController,
          StudentPetrosCompanionController,
          StudentPetrosLoopController,
          StudentPetrosQuestionExecutionController,
          StudentPetrosArtifactsController,
          PortalFederationController,
          PortalAuthOidcController,
          PortalAuthSamlController,
          PortalCoursesController,
          StudentCoursesController,
        ],
        providers: [
          { provide: PortalCourseContentService, useValue: portalPublisher },
          { provide: PortalMaterialPreparationJobs, useValue: portalJobs },
          { provide: PetrosQuestionExecutionService, useValue: questionJobs },
          { provide: PetrosLoopService, useValue: httpServices.rawLoop },
          { provide: PetrosArtifactsService, useValue: artifacts },
          { provide: PetrosSessionIntentService, useValue: httpServices.rawService },
          { provide: PetrosCompanionService, useValue: companion },
          { provide: PetrosBriefingService, useValue: {} },
          { provide: PetrosMentorService, useValue: {} },
          { provide: ProviderMappingsService, useValue: mappings },
          { provide: FederationService, useValue: federation },
          { provide: PortalCoursesService, useValue: portalCourses },
          { provide: StudentCoursesService, useValue: studentCourses },
        ],
      })
        .overrideGuard(InstitutionAuthGuard)
        .useValue(new InstitutionAuthGuard(new PortalAuthService(tenantDb, env), portalSessions, { enforce: vi.fn() } as never, env))
        .overrideGuard(InstitutionPermissionsGuard)
        .useValue(new InstitutionPermissionsGuard(reflector, env))
        .overrideGuard(StudentAuthGuard)
        .useValue(new StudentAuthGuard(auth, sessions, env))
        .overrideGuard(StudentPermissionsGuard)
        .useValue(new StudentPermissionsGuard(reflector))
        .overrideGuard(StudentPortalGuard)
        .useValue(new StudentPortalGuard({ isPortalEnabled: async () => true } as never))
        .overrideGuard(StudentRateLimitGuard)
        .useValue(new StudentRateLimitGuard(reflector, env, { enabled: false } as never))
        .compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('v1');
      app.use((req: { context: object }, _res: unknown, next: () => void) => {
        req.context = { requestId: randomUUID(), correlationId: randomUUID(), apiEndpoint: 'synthetic-http' }; next();
      });
      app.useGlobalInterceptors(new StudentTenantInterceptor(tenantDb), new PortalTenantInterceptor(tenantDb));
      const logger = { child: () => logger, error: vi.fn(), warn: vi.fn() };
      app.useGlobalFilters(
        new AllExceptionsFilter(logger as never, { captureException: vi.fn() } as never),
      );
      await app.listen(0, '127.0.0.1');
      const issued = await sessions.issue({
        kind: 'institutional',
        userId: principal.institutionUserId,
        institutionId,
      });
      cookie = `${sessions.cookieName}=${issued.token}`;
      const issuedStaff = await portalSessions.issue({ institutionId, institutionUserId: staffUserId, aal: 'aal1' });
      staffCookie = `${portalSessions.cookieName}=${issuedStaff.token}`;
      const issuedInstructor = await portalSessions.issue({ institutionId, institutionUserId: instructorUserId, aal: 'aal1' });
      instructorCookie = `${portalSessions.cookieName}=${issuedInstructor.token}`;
    }, 30_000);

    afterEach(async () => {
      visualEnv.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED = false;
      questionEnv.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED = false;
      Object.assign(httpServices.rawLoop, { institutional: undefined });
      for (const id of knowledgePolicyIds.splice(0)) await db.update(schema.petrosInstitutionPolicyVersions).set({ status: 'rolled_back' }).where(eq(schema.petrosInstitutionPolicyVersions.id, id));
      visualEnv.PETROS_VISUAL_PROGRAM_ENABLED = false;
      visualEnv.PETROS_ASSESSMENT_CONTRACT_ENABLED = false;
      assessmentProfile = false;
      if (questionEnv?.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED) {
        await db.update(schema.petrosSessionCommands).set({ executionState: 'cancelled', executionLeaseUntil: null,
          executionFence: sql`execution_fence + 1`, executionRevision: sql`execution_revision + 1` })
          .where(sql`execution_state in ('queued','running')`);
        questionEnv.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED = false;
        questionSurfaces.isPortalEnabled.mockResolvedValue(true);
      }
      resetQuestionGateway();
      // Disposable fixture isolation: S7 documents must not spend later tests' daily admission.
      // Only this bootstrap DB role can delete receipts; production app denial stays tested.
      for (const materialId of visualMaterialIds.splice(0)) {
        await db.delete(schema.knowledgePreparations).where(eq(schema.knowledgePreparations.materialId, materialId));
      }
    });

    afterAll(async () => {
      await appClient?.end({ timeout: 1 });
      await app?.close();
      await client?.end({ timeout: 1 });
      if (running)
        execFileSync('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], {
          stdio: 'pipe',
        });
      if (directory) rmSync(directory, { recursive: true, force: true });
    });

    function services(serviceDb = tenantDb, retrievalEnabled = true) {
      const repo = new PetrosSessionIntentRepository(
        serviceDb,
        new KnowledgeDocumentService(serviceDb, new StudentMaterialsService(serviceDb), {
          STUDENT_STORAGE_DIR: directory, PETROS_DOCUMENT_RETRIEVAL_ENABLED: retrievalEnabled,
        } as never),
      );
      // Maintenance/failure telemetry must also stay in this disposable database.
      vi.spyOn(repo, 'recordFailureEvent').mockImplementation((event) =>
        new PetrosSessionIntentRepository(
          db,
          new KnowledgeDocumentService(db, new StudentMaterialsService(db), {
            STUDENT_STORAGE_DIR: directory, PETROS_DOCUMENT_RETRIEVAL_ENABLED: retrievalEnabled,
          } as never),
        ).recordEvent(event),
      );
      vi.spyOn(repo, 'documentSchedule').mockResolvedValue(null);
      const gateway = {
        execute: vi.fn((_request: { input: Array<{ type: string; text?: string }> }): unknown => {
          throw new Error('No external calls permitted');
        }),
      };
      const loopRepo = new PetrosLoopRepository(
        serviceDb,
        new KnowledgeDocumentService(serviceDb, new StudentMaterialsService(serviceDb), {
          STUDENT_STORAGE_DIR: directory, PETROS_DOCUMENT_RETRIEVAL_ENABLED: retrievalEnabled,
        } as never),
      );
      const learner = new PetrosLearnerModelService(new PetrosLearnerModelRepository(serviceDb), new AuditWriter(serviceDb));
      const loop = new PetrosLoopService(
        loopRepo,
        gateway as never,
        {
          resolveForSession: vi
            .fn()
            .mockImplementation(async () => {
              const profile = stage4ProfileFixture('cloud', institutionId);
              if (assessmentProfile) {
                profile.profile.dimensions.moves.practicePattern = ['recall_check'];
                profile.profile.dimensions.moves.weights.recall_check = 10000;
              }
              return profile;
            }),
        } as never,
        {
          snapshot: vi.fn(async () => ({
            schemaVersion: PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
            algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
            generatedAt: new Date().toISOString(), topicId: 'synthetic-cloud',
            neutral: true, stale: false, mastery: [], moveOutcomes: [], errors: [],
            preference: { pace: 'neutral', depth: 'neutral', observed: { skips: 0, expands: 0, reads: 0, responses: 0, meanResponseTimeMs: 0 }, evidenceCount: 0, confidenceBasisPoints: 0, minimumEvidenceMet: false },
            calibration: { buckets: ['sure', 'think_so', 'guessing'].flatMap((confidence) => ['correct', 'partial', 'wrong'].map((outcome) => ({ confidence, outcome, count: 0 }))), scoreBasisPoints: 5000, uncertaintyBasisPoints: 10000, fragileConfidence: false, evidenceCount: 0 },
            causalFactors: [], evidenceEventIds: [], sessionOverride: null,
          })),
          recordPlanSnapshot: vi.fn(async () => undefined),
          ingest: vi.fn((scope, input) => visualEnv.PETROS_ASSESSMENT_CONTRACT_ENABLED ? learner.ingest(scope, input) : Promise.resolve(undefined)),
        } as never,
        new AuditWriter(serviceDb),
        undefined,
        visualEnv as never,
      );
      // The real document projection executes; only learner/profile generation use adapters.
      const create = vi.spyOn(loop, 'create');
      const service = new PetrosSessionIntentService(
        repo,
        loop,
        gateway as never,
        undefined as never,
        { PETROS_AI_MODE: 'demo', PETROS_DOCUMENT_TEACHING_ENABLED: false } as never,
        { logAudit: vi.fn() } as never,
      );
      const transactional = new Proxy(service, {
        get(target, key) {
          const value = Reflect.get(target, key);
          return typeof value === 'function'
            ? (...args: unknown[]) =>
                runInStudentTenant(serviceDb, args[0] as InstitutionalStudentPrincipal, () =>
                  value.apply(target, args),
                )
            : value;
        },
      });
      return {
        repo,
        service: transactional,
        rawService: service,
        rawLoop: loop,
        learner,
        loop: { create },
        gateway,
      };
    }

    function makePublisher() {
      return new PortalCourseContentService(
        new PortalCrudEngine(tenantDb, { logAudit: vi.fn() } as never, {} as never), tenantDb,
        { STUDENT_STORAGE_DIR: directory, NODE_ENV: 'test' } as never,
        new MaterialDocumentPreviewService(), { resolve: vi.fn().mockResolvedValue(null) } as never,
        new KnowledgePreparationRepository(tenantDb),
      );
    }
    const preparationRepo = () => new KnowledgePreparationRepository(tenantDb);
    const documents = (retrievalEnabled = true) =>
      new KnowledgeDocumentService(tenantDb, new StudentMaterialsService(tenantDb), {
        STUDENT_STORAGE_DIR: directory, PETROS_DOCUMENT_RETRIEVAL_ENABLED: retrievalEnabled,
      } as never);
    const asStudent = <T>(work: () => Promise<T>) => runInStudentTenant(tenantDb, principal, work);
    const versions = (itemId: string) =>
      db
        .select()
        .from(schema.knowledgeItemVersions)
        .where(eq(schema.knowledgeItemVersions.itemId, itemId));
    const startHttp = (intentId: string) =>
      http()
        .post(`/v1/student/petros/intents/${intentId}/start`)
        .set('Cookie', cookie)
        .send({ idempotencyKey: randomUUID() });
    const locatorHttp = (itemId: string, locator: object) =>
      http()
        .post(`/v1/student/petros/documents/${itemId}/resolve-locator`)
        .set('Cookie', cookie)
        .send(locator);

    const request = (sourceId: string, page?: number) => ({
      door: 'uploaded_document' as const,
      sourceId,
      page,
      idempotencyKey: randomUUID(),
      timeBudgetSeconds: 600,
      language: 'en',
      accessibility: [],
    });

    const http = () => supertest(app.getHttpServer());
    const resolveHttp = (input: ReturnType<typeof request>, extensions = true) => {
      const call = http().post('/v1/student/petros/intents/resolve').set('Cookie', cookie);
      if (extensions) call.set('x-petros-document-source', 'petros.document-source.v1');
      return call.send(input);
    };

    const preparationHttp = (materialId: string) => http().get(`/v1/portal/course-content/materials/${materialId}/preparation`).set('Cookie', staffCookie);
    const prep = (id: string) => runInInstitutionTenant(tenantDb, institutionId, () => preparationRepo().get(institutionId, id));
    const inPortal = <T>(work: () => Promise<T>) => runInInstitutionTenant(tenantDb, institutionId, work);
    const copies = (materialId: string) => db.select().from(schema.knowledgeItems).where(sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${materialId}`);
    const searchHttp = (id: string, sourceVersion: string, query: string, pages = [1]) => http()
      .post(`/v1/student/petros/documents/${id}/search`).set('Cookie', cookie)
      .send({ sourceVersion, query, purpose: 'source_lookup', pages, limit: 3 });
    const resetQuestionGateway = () => httpServices.gateway.execute.mockReset().mockImplementation(() => { throw new Error('No external calls permitted'); });
    const answerFrom = (request: { input: Array<{ text?: string }> }) => {
      const evidence = JSON.parse(request.input[0]!.text!).evidence;
      return { content: { answer: 'Capacity changes with demand.', citedSpanIds: [evidence.hits[0].spanId] } };
    };

    it('combines the literal S1-S11 source, durable gateway, recovery, visual, assessment, roster, syllabus, SSO, instructor, student and voice paths', async () => {
      // One private API/database journey. Every network-capable boundary below is either a
      // local Nest listener, a Unix socket, or a controlled adapter that forbids external I/O.
      const { PetrosInputModesService } = await import('../student/petros-input-modes/petros-input-modes.service');
      const { PetrosInputModesRepository } = await import('../student/petros-input-modes/petros-input-modes.repository');
      const { ProviderCallError } = await import('../petros-ai-routing/petros-provider-adapters');

      // S1/S2/S3/S5 rollback baseline: rows written before each additive migration remain
      // readable and unchanged after the full migration journal has completed.
      const [legacyItem] = await db.select().from(schema.knowledgeItems)
        .where(eq(schema.knowledgeItems.id, preMigrationItemId));
      const [legacyPage] = await db.select().from(schema.knowledgeItemPages)
        .where(eq(schema.knowledgeItemPages.id, preMigrationPageId));
      expect(legacyItem).toMatchObject({ id: preMigrationItemId, extractedTextReady: true, status: 'ready' });
      expect(legacyPage).toMatchObject({ id: preMigrationPageId, itemId: preMigrationItemId,
        text: 'Existing text must survive the additive migration unchanged.' });
      const [preservedSnapshot] = await db.select().from(schema.knowledgeItemVersions)
        .where(eq(schema.knowledgeItemVersions.id, preS3Snapshot.id));
      expect(preservedSnapshot).toMatchObject(preS3Snapshot);
      const oldCommandId = preS5Command.id;
      if (typeof oldCommandId !== 'string') throw new Error('Synthetic pre-S5 command is missing its id');
      const [preservedCommand] = await db.select().from(schema.petrosSessionCommands)
        .where(eq(schema.petrosSessionCommands.id, oldCommandId));
      expect(preservedCommand).toMatchObject({ id: oldCommandId, command: 'composer_question', status: 'completed',
        response: { synthetic: 'old-payload' }, executionVersion: null });

      // S1 → S3: portal publication is durable, worker-only, fenced, and produces an S2 snapshot.
      const publication = await http().post(`/v1/portal/course-content/materials/publish?contextType=class&contextId=${classId}&filename=cloud-reference-v1.pdf`)
        .set('Cookie', staffCookie).set('Content-Type', 'application/pdf')
        .send(pdfFixture(['Elasticity follows demand by adding and removing capacity.',
          'Scalability increases capacity for larger workloads.', ''])).expect(201);
      const materialId = publication.body.id as string;
      visualMaterialIds.push(materialId);
      const preparation = (await preparationHttp(materialId).expect(200)).body;
      expect(preparation).toMatchObject({ state: 'queued', attempts: 0 });
      const abandonedPreparation = await inPortal(() => preparationRepo().claim(institutionId, preparation.id));
      await db.update(schema.knowledgePreparations).set({ leaseUntil: new Date(0) })
        .where(eq(schema.knowledgePreparations.id, preparation.id));
      await portalJobs.execute(institutionId, preparation.id);
      expect(await prep(preparation.id)).toMatchObject({ state: 'succeeded', attempts: 2, fence: 2 });
      await expect(inPortal(() => preparationRepo().complete(abandonedPreparation!))).rejects.toMatchObject({ status: 409 });
      const [source] = await copies(materialId);
      expect(source).toBeTruthy();
      const snapshots = await versions(source!.id);
      expect(snapshots).toHaveLength(1);
      expect((await resolveHttp(request(source!.id)).expect(409)).body).toMatchObject({
        code: 'PETROS_DOCUMENT_SOURCE_NOT_READY', meta: { readiness: { unavailablePages: [3], scopeReady: false } },
      });
      const intentInput = { ...request(source!.id, 1), timeBudgetSeconds: 1200 };
      const intent = (await resolveHttp(intentInput).expect(201)).body;
      expect(intent.documentReadiness).toMatchObject({ selectedPages: [1], omittedPageCount: 2, unavailablePages: [3], scopeReady: true });
      expect((await resolveHttp(intentInput).expect(201)).body.id).toBe(intent.id);
      const previous = (await http().get(`/v1/student/petros/intents/${intent.id}`).set('Cookie', cookie).expect(200)).body;
      expect(previousReader.safeParse(previous).success).toBe(true);
      expect(previous).not.toHaveProperty('documentReadiness');
      const locator = intent.citations[0].locator;
      expect(locator).toMatchObject({ page: 1, sourceVersion: intent.sourceFingerprint });
      await locatorHttp(source!.id, locator).expect(201);
      await locatorHttp(source!.id, { ...locator, sourceVersion: 'f'.repeat(64) }).expect(409);
      const evidence = (await searchHttp(source!.id, intent.sourceFingerprint, 'What is elasticity?').expect(201)).body;
      expect(JSON.stringify(evidence)).toContain('Elasticity follows demand');
      expect(JSON.stringify(evidence)).not.toContain('Scalability increases capacity');
      const anotherUserId = randomUUID();
      const anotherStudentId = randomUUID();
      const foreignInstitutionId = randomUUID();
      const foreignUserId = randomUUID();
      const foreignStudentId = randomUUID();
      await db.insert(schema.institutions).values({
        id: foreignInstitutionId, publicId: `synthetic-foreign-${foreignInstitutionId.slice(0, 8)}`,
        legalName: 'Synthetic foreign', displayName: 'Synthetic foreign', type: 'school', country: 'IN',
        primaryContact: { name: 'Synthetic', email: 'synthetic-foreign@example.test' },
      });
      await db.insert(schema.institutionUsers).values([
        { id: anotherUserId, institutionId, fullName: principal.fullName, email: 'another-student@example.test', status: 'active' },
        { id: foreignUserId, institutionId: foreignInstitutionId, fullName: principal.fullName, email: principal.email, status: 'active' },
      ]);
      await db.insert(schema.institutionUserRoles).values([
        { institutionUserId: anotherUserId, roleKey: 'student' },
        { institutionUserId: foreignUserId, roleKey: 'student' },
      ]);
      await db.insert(schema.students).values([
        { id: anotherStudentId, institutionId, institutionUserId: anotherUserId, admissionNo: 'synthetic-another', firstName: 'Synthetic', lastName: 'Fixture' },
        { id: foreignStudentId, institutionId: foreignInstitutionId, institutionUserId: foreignUserId,
          admissionNo: 'synthetic-same-looking', firstName: 'Synthetic', lastName: 'Fixture' },
      ]);
      const otherPrincipals: InstitutionalStudentPrincipal[] = [
        { ...principal, institutionUserId: anotherUserId, studentId: anotherStudentId, email: 'another-student@example.test' },
        { ...principal, institutionId: foreignInstitutionId, institutionUserId: foreignUserId, studentId: foreignStudentId },
      ];
      for (const foreign of otherPrincipals) {
        await expect(runInStudentTenant(tenantDb, foreign, () => httpServices.rawService.read(foreign, intent.id)))
          .rejects.toMatchObject({ status: 404 });
        expect(await runInStudentTenant(tenantDb, foreign, () => tenantDb.select().from(schema.knowledgeItemVersions)
          .where(eq(schema.knowledgeItemVersions.itemId, source!.id)))).toEqual([]);
      }
      const started = (await startHttp(intent.id).expect(201)).body.session;
      expect((await startHttp(intent.id).expect(201)).body.session.id).toBe(started.id);
      const sessionId = started.id as string;
      const sessionBase = `/v1/student/petros/sessions/${sessionId}`;
      const questionBase = `${sessionBase}/document-questions`;
      const document = async () => (await http().get(sessionBase).set('Cookie', cookie).expect(200)).body;
      const nextInput = async (question = 'What is elasticity?') => ({ question, idempotencyKey: randomUUID(), expectedSessionVersion: (await document()).version });
      const submit = (input: Awaited<ReturnType<typeof nextInput>>, negotiated = false) => {
        const call = http().post(questionBase).set('Cookie', cookie);
        if (negotiated) call.set('x-petros-knowledge-policy', 'petros.knowledge-policy.v1');
        return call.send(input);
      };
      const status = (key: string, negotiated = false) => {
        const call = http().get(`${questionBase}/${key}`).set('Cookie', cookie);
        if (negotiated) call.set('x-petros-knowledge-policy', 'petros.knowledge-policy.v1');
        return call;
      };
      const observations = () => db.select().from(schema.petrosObservations)
        .where(and(eq(schema.petrosObservations.sessionId, sessionId), eq(schema.petrosObservations.type, 'question_asked')));
      await http().post(`${sessionBase}/continue`).set('Cookie', cookie)
        .send({ idempotencyKey: randomUUID() }).expect(201);
      const [media] = await db.insert(schema.petrosMediaObjects).values({
        schemaVersion: 'petros.media.v1', institutionId, studentId, sessionId,
        // The synthetic confirmed-media fixture stops before storage/transcription access.
        storageObjectId: source!.objectIds[0], kind: 'voice_turn', mode: 'voice', state: 'needs_confirmation',
        filename: 'synthetic-confirmed-turn.webm', declaredMimeType: 'audio/webm', detectedMimeType: 'audio/webm', sizeBytes: 1,
        structuredResult: { transcription: { text: 'What is elasticity?', language: 'en', confidence: 1, uncertainSegments: [] } },
        idempotencyKey: randomUUID(), correlationId: randomUUID(),
        uploadExpiresAt: new Date(Date.now() + 60_000), rawMediaExpiresAt: new Date(Date.now() + 60_000),
      }).returning();
      const voice = new PetrosInputModesService(new PetrosInputModesRepository(tenantDb), {} as never,
        httpServices.gateway as never, httpServices.rawLoop, {} as never, new AuditWriter(tenantDb));
      const voiceInput = { sessionId, mediaId: media!.id, idempotencyKey: randomUUID(), language: 'en', confidence: 'sure' as const,
        mixedLanguage: false, interruptPrevious: false };
      const denyBypasses = async (code: string) => {
        const before = await observations();
        const blocks = await db.select().from(schema.petrosTeachingBlocks).where(eq(schema.petrosTeachingBlocks.sessionId, sessionId));
        const commands = await db.select().from(schema.petrosSessionCommands).where(eq(schema.petrosSessionCommands.sessionId, sessionId));
        const gatewayCalls = httpServices.gateway.execute.mock.calls.length;
        await expect(asStudent(() => httpServices.rawLoop.composerQuestion(principal, sessionId, {
          question: 'What is elasticity?', idempotencyKey: randomUUID(), expectedSessionVersion: started.version,
        }))).rejects.toMatchObject({ response: { code } });
        await expect(asStudent(() => voice.voiceTurn(principal, voiceInput))).rejects.toMatchObject({ response: { code } });
        expect(await observations()).toEqual(before);
        expect(await db.select().from(schema.petrosTeachingBlocks).where(eq(schema.petrosTeachingBlocks.sessionId, sessionId))).toEqual(blocks);
        expect(await db.select().from(schema.petrosSessionCommands).where(eq(schema.petrosSessionCommands.sessionId, sessionId))).toEqual(commands);
        expect((await db.select().from(schema.petrosMediaObjects).where(eq(schema.petrosMediaObjects.id, media!.id)))[0]).toEqual(media);
        expect(httpServices.gateway.execute.mock.calls.length).toBe(gatewayCalls);
      };
      questionEnv.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED = true;
      Object.assign(visualEnv, { PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED: true });
      await denyBypasses('PETROS_QUESTION_EXECUTION_REQUIRED');

      const routingRepo = new PetrosAiRoutingRepository(tenantDb);
      const routing = new PetrosAiRoutingService(routingRepo, {} as never, {} as never, new AuditWriter(tenantDb));
      await asStudent(() => routing.ensureRegistry());
      const fn = (await asStudent(() => routingRepo.findFunctionByKey('hint.generate')))!;
      await db.update(schema.petrosAiFunctions).set({ settings: { ...fn.settings, maxRetries: 1 } }).where(eq(schema.petrosAiFunctions.id, fn.id));
      const [provider] = await db.insert(schema.petrosAiProviders).values({ key: `integrated-${randomUUID()}`,
        displayName: 'Synthetic integrated adapter', adapterType: 'openai_compatible', healthStatus: 'healthy',
        dailyBudgetMicros: 10_000_000, monthlyBudgetMicros: 10_000_000 }).returning();
      const [model] = await db.insert(schema.petrosAiModels).values({ providerId: provider!.id,
        modelKey: 'integrated', displayName: 'Synthetic local model', capabilities: fn.requiredCapabilities,
        pricing: { inputPerMillionMicros: 1_000_000, outputPerMillionMicros: 1_000_000 } }).returning();
      const [route] = await db.insert(schema.petrosAiFunctionRoutes)
        .values({ functionId: fn.id, providerId: provider!.id, modelId: model!.id }).returning();
      await db.update(schema.petrosAiBudgetPolicies).set({ dailyBudgetMicros: 10_000_000, monthlyBudgetMicros: 10_000_000 })
        .where(eq(schema.petrosAiBudgetPolicies.scope, 'global'));
      const observationsBeforeDisabledRoute = await observations();
      await db.update(schema.petrosAiFunctionRoutes).set({ enabled: false })
        .where(eq(schema.petrosAiFunctionRoutes.id, route!.id));
      await expect(asStudent(() => routing.previewRoute({
        functionKey: 'hint.generate', inputModality: 'text', estimatedTokens: 10,
        currentCostMicros: 0, previousFailures: 0, institutionId, studentId,
      }))).rejects.toMatchObject({ code: 'NO_CAPABLE_ROUTE' });
      expect(await observations()).toEqual(observationsBeforeDisabledRoute);
      await db.update(schema.petrosAiFunctionRoutes).set({ enabled: true })
        .where(eq(schema.petrosAiFunctionRoutes.id, route!.id));
      let policyId: string | undefined;
      let adapterMode: 'answer' | 'revoke_membership_retry' | 'knowledge' | 'revoke_policy_retry' | 'revoke_policy_commit' = 'answer';
      const adapter = vi.fn(async (_provider: unknown, _model: unknown, input: { input: Array<{ text?: string }> }) => {
        expect(await client`select pid from pg_stat_activity where usename = 'edrion_app' and state = 'idle in transaction'`).toHaveLength(0);
        if (adapterMode === 'revoke_membership_retry') {
          await db.update(schema.students).set({ classId: null }).where(eq(schema.students.id, studentId));
          throw new ProviderCallError('SYNTHETIC_RETRY', 'Retry after membership revocation', true,
            { kind: 'json', content: null, inputTokens: 1, outputTokens: 0, cachedTokens: 0, estimatedCostMicros: 1 });
        }
        if (adapterMode === 'revoke_policy_retry' || adapterMode === 'revoke_policy_commit') {
          await db.update(schema.petrosInstitutionPolicyVersions).set({ config: defaultInstitutionPolicy() })
            .where(eq(schema.petrosInstitutionPolicyVersions.id, policyId!));
          if (adapterMode === 'revoke_policy_retry') throw new ProviderCallError('SYNTHETIC_RETRY', 'Retry after policy revocation', true,
            { kind: 'json', content: null, inputTokens: 1, outputTokens: 0, cachedTokens: 0, estimatedCostMicros: 1 });
        }
        const content = adapterMode === 'answer' ? answerFrom(input).content : {
          units: [{ basis: 'material_supported', spanId: JSON.parse(input.input[0]!.text!).evidence.hits[0].spanId },
            { basis: 'analogy', text: 'Integrated analogy: opening more checkout counters for a queue.' }],
        };
        return { kind: 'json' as const, content, inputTokens: 50, outputTokens: 20, cachedTokens: 0 };
      });
      const gateway = new PetrosAiGatewayService(routing, routingRepo, { adapter: () => ({ execute: adapter }) } as never,
        { get: vi.fn(), set: vi.fn() } as never, { PETROS_AI_MODE: 'live' } as never);
      const originalGateway = httpServices.rawLoop['gateway'];
      Object.assign(httpServices.rawLoop, { gateway });
      try {
        const input = await nextInput();
        const receipt = (await submit(input).expect(201)).body;
        expect((await submit(input).expect(201)).body).toEqual(receipt);
        await questionJobs.execute(principal, receipt.id);
        const completed = (await status(input.idempotencyKey).expect(200)).body;
        expect(completed).toMatchObject({ state: 'succeeded', attempts: 1 });
        expect(previousDetourReader.safeParse(completed.result.detours.at(-1)).success).toBe(true);
        expect((await submit(input).expect(201)).body).toEqual(completed);
        expect(adapter).toHaveBeenCalledTimes(1);
        const [hold] = await db.select().from(schema.petrosAiAttemptReservations).where(eq(schema.petrosAiAttemptReservations.commandId, receipt.id));
        expect(hold).toMatchObject({ state: 'settled', institutionId, studentId, settledMicros: 70 });
        const usage = await db.select().from(schema.petrosAiUsageEvents).where(eq(schema.petrosAiUsageEvents.budgetReservationId, hold!.id));
        expect(usage).toHaveLength(1);
        expect(usage[0]).toMatchObject({ status: 'success', metadata: { applicationContractVersion: 'petros.document-question.v1' } });
        expect(await observations()).toHaveLength(1);

        // A real gateway retry must recheck membership before any fallback answer.
        adapterMode = 'revoke_membership_retry';
        const revokedInput = await nextInput();
        const revoked = (await submit(revokedInput).expect(201)).body;
        const callsBefore = adapter.mock.calls.length;
        await questionJobs.execute(principal, revoked.id);
        await db.update(schema.students).set({ classId }).where(eq(schema.students.id, studentId));
        expect(adapter.mock.calls.length).toBe(callsBefore + 1);
        expect((await status(revokedInput.idempotencyKey).expect(200)).body).toMatchObject({ state: 'failed', result: null });
        expect(await observations()).toHaveLength(1);
        adapterMode = 'answer';

        // An older dispatched reservation is accounted exactly once even when recovery
        // cannot find evidence and therefore never invokes this real gateway.
        const missingInput = await nextInput('What is mitochondria?');
        const missing = (await submit(missingInput).expect(201)).body;
        const claim = (await asStudent(() => questionRepo.claim(principal, missing.id)))!;
        const abandoned = await asStudent(() => routingRepo.reserveDocumentAttempt({
          commandId: missing.id, fence: claim.executionFence,
          attemptKey: `${missing.id}:${claim.executionFence}:abandoned`, requestId: missing.id,
          institutionId, studentId, functionId: fn.id, providerId: provider!.id, modelId: model!.id, reserveMicros: 40_000,
        }));
        await asStudent(() => routingRepo.markDocumentAttemptDispatched(abandoned.id));
        await db.update(schema.petrosSessionCommands).set({ executionLeaseUntil: new Date(0) }).where(eq(schema.petrosSessionCommands.id, missing.id));
        questionEnv.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED = false;
        Object.assign(visualEnv, { PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED: false });
        await denyBypasses('PETROS_QUESTION_EXECUTION_REQUIRED');
        questionEnv.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED = true;
        Object.assign(visualEnv, { PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED: true });
        const callsBeforeRecovery = adapter.mock.calls.length;
        await questionJobs.execute(principal, missing.id);
        expect((await status(missingInput.idempotencyKey).expect(200)).body).toMatchObject({ state: 'succeeded', attempts: 2 });
        expect(adapter.mock.calls.length).toBe(callsBeforeRecovery);
        expect((await db.select().from(schema.petrosAiAttemptReservations).where(eq(schema.petrosAiAttemptReservations.id, abandoned.id)))[0])
          .toMatchObject({ state: 'ambiguous', settledMicros: 40_000 });
        expect(await asStudent(() => routingRepo.reconcileDocumentCommand(missing.id, claim.executionFence + 2))).toBe(0);
        expect(await db.select().from(schema.petrosAiUsageEvents).where(eq(schema.petrosAiUsageEvents.budgetReservationId, abandoned.id))).toHaveLength(1);

        const policyConfig = defaultInstitutionPolicy();
        policyConfig.syllabus.allowExternalSources = true;
        policyConfig.syllabus.knowledgeMode = 'source_primary';
        const [policy] = await db.insert(schema.petrosInstitutionPolicyVersions).values({ institutionId, scopeLevel: 'institution',
          version: knowledgePolicyVersion++, status: 'published', schemaVersion: 'petros.institutional.policy.v1', config: policyConfig,
          reason: 'Synthetic integrated journey', authorId: staffUserId }).returning();
        policyId = policy!.id;
        knowledgePolicyIds.push(policyId);
        const institutional = new PetrosInstitutionalService(new PetrosInstitutionalRepository(tenantDb), gateway, new AuditWriter(tenantDb));
        Object.assign(httpServices.rawLoop, { institutional });
        questionEnv.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED = true;
        visualEnv.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED = true;
        await denyBypasses('PETROS_KNOWLEDGE_DURABLE_EXECUTION_REQUIRED');
        adapterMode = 'knowledge';
        const knowledgeInput = await nextInput();
        const knowledge = (await submit(knowledgeInput, true).expect(201)).body;
        expect(knowledge.knowledgePolicy).toMatchObject({ mode: 'source_primary', sourceId: source!.id });
        await questionJobs.execute(principal, knowledge.id);
        const knowledgeResult = (await status(knowledgeInput.idempotencyKey, true).expect(200)).body;
        expect(knowledgeResult.state).toBe('succeeded');
        expect(knowledgeResult.result.detours.at(-1).acknowledgement).toContain('Analogy — outside your material');
        const [knowledgeObservation] = await db.select().from(schema.petrosObservations).where(eq(schema.petrosObservations.correlationId, knowledge.id));
        expect(knowledgeObservation!.payload.knowledgePolicy).toEqual(knowledge.knowledgePolicy);
        expect(knowledgeObservation!.payload.knowledgeUnits).toMatchObject([{ basis: 'material_supported', page: 1 }, { basis: 'analogy' }]);
        expect((await status(knowledgeInput.idempotencyKey).expect(200)).body).not.toHaveProperty('knowledgePolicy');

        for (const failure of ['revoke_policy_retry', 'revoke_policy_commit'] as const) {
          adapterMode = failure;
          const deniedInput = await nextInput();
          const denied = (await submit(deniedInput, true).expect(201)).body;
          const before = (await observations()).length;
          const beforeCalls = adapter.mock.calls.length;
          await questionJobs.execute(principal, denied.id);
          expect(adapter.mock.calls.length).toBe(beforeCalls + 1);
          expect((await status(deniedInput.idempotencyKey, true).expect(200)).body)
            .toMatchObject({ state: 'failed', result: null, admission: { category: 'pedagogical_attempt_policy' } });
          expect(await observations()).toHaveLength(before);
          await db.update(schema.petrosInstitutionPolicyVersions).set({ config: policyConfig }).where(eq(schema.petrosInstitutionPolicyVersions.id, policyId));
        }

        // Rollback readers retain the immutable S9 restrictions on committed history.
        await db.update(schema.petrosInstitutionPolicyVersions).set({ config: defaultInstitutionPolicy() }).where(eq(schema.petrosInstitutionPolicyVersions.id, policyId));
        questionEnv.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED = false;
        visualEnv.PETROS_DOCUMENT_KNOWLEDGE_POLICY_ENABLED = false;
        expect((await status(knowledgeInput.idempotencyKey, true).expect(200)).body)
          .toMatchObject({ state: 'failed', result: null, errorCode: 'PETROS_KNOWLEDGE_POLICY_CHANGED' });
        expect(JSON.stringify(await document())).not.toContain('Integrated analogy');
        await db.update(schema.petrosInstitutionPolicyVersions).set({ config: policyConfig }).where(eq(schema.petrosInstitutionPolicyVersions.id, policyId));
        questionEnv.PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED = false;
        Object.assign(visualEnv, { PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED: false });
        const futureKey = randomUUID();
        const [futureCommand] = await client`
          insert into petros_session_commands
            (session_id, institution_id, student_id, idempotency_key, command, status,
             execution_version, execution_state, execution_input, input_sha256,
             requested_by, source_fingerprint, next_dispatch_at)
          values
            (${sessionId}, ${institutionId}, ${studentId}, ${futureKey},
             'document_question.future.v99', 'in_progress',
             'petros.document-question-execution.v99', 'queued', ${JSON.stringify(knowledgeInput)}::jsonb,
             ${'9'.repeat(64)}, ${principal.institutionUserId}, ${intent.sourceFingerprint}, now())
          returning id
        `;
        await denyBypasses('PETROS_QUESTION_EXECUTION_REQUIRED');
        await expect(asStudent(() => httpServices.rawLoop['repo'].beginCommand(
          principal, sessionId, futureKey, 'composer_question',
        ))).rejects.toMatchObject({ response: { code: 'PETROS_QUESTION_EXECUTION_REQUIRED' } });
        await client`update petros_session_commands set execution_state = 'cancelled' where id = ${futureCommand!.id}`;
        await expect(asStudent(() => httpServices.rawLoop.assertComposerQuestionAllowed(principal, sessionId))).resolves.toMatchObject({ id: sessionId });
        const rollbackLegacy = await asStudent(() => httpServices.rawLoop['repo'].beginCommand(
          principal, sessionId, randomUUID(), 'composer_question',
        ));
        expect(rollbackLegacy.state).toBe('started');
        await asStudent(() => httpServices.rawLoop['repo'].failCommand(rollbackLegacy.row!.id, 'SYNTHETIC_TERMINAL'));

        // Resume the same source/session with the ordinary controlled no-provider teaching
        // fallback, then use the real visual and objective assessment producers and owners.
        Object.assign(httpServices.rawLoop, { gateway: originalGateway, institutional: undefined });
        visualEnv.PETROS_VISUAL_PROGRAM_ENABLED = true;
        visualEnv.PETROS_ASSESSMENT_CONTRACT_ENABLED = true;
        assessmentProfile = true;
        const teachingIntent = (await resolveHttp({ ...request(source!.id, 1), timeBudgetSeconds: 1200 }).expect(201)).body;
        const teachingSession = (await startHttp(teachingIntent.id).expect(201)).body.session;
        const teachingBase = `/v1/student/petros/sessions/${teachingSession.id}`;
        const teachingFirst = (await http().post(`${teachingBase}/continue`).set('Cookie', cookie)
          .send({ idempotencyKey: randomUUID() }).expect(201)).body.blocks[0];
        await http().post(`${teachingBase}/blocks/${teachingFirst.id}/complete`).set('Cookie', cookie)
          .send({ idempotencyKey: randomUUID(), blockType: teachingFirst.content.type, expectedBlockVersion: teachingFirst.version,
            interactionState: {}, observedOutcome: { completed: true } }).expect(201);
        let diagramId: string | undefined;
        let assessed = false;
        for (let step = 0; step < 8 && !assessed; step++) {
          const rendered = (await http().post(`${teachingBase}/continue`).set('Cookie', cookie)
            .send({ idempotencyKey: randomUUID() }).expect(201)).body;
          const block = rendered.blocks.find((candidate: { status: string }) => candidate.status === 'current');
          expect(block, JSON.stringify(rendered.blocks.map((candidate: { content: { type: string }; status: string }) =>
            [candidate.content.type, candidate.status]))).toBeTruthy();
          if (block.content.type === 'diagram') {
            diagramId = block.id;
            const visualBase = `${teachingBase}/blocks/${block.id}/visual`;
            const visual = (await http().get(visualBase).set('Cookie', cookie).expect(200)).body;
            expect(petrosVisualSnapshotSchema.safeParse(visual.snapshot).success).toBe(true);
            const operation = { operationId: randomUUID(), expectedRevision: 1, expectedVersion: 0,
              action: { type: 'set_parameter', parameterId: 'showRelations', value: false } };
            const checkpoint = (await http().put(visualBase).set('Cookie', cookie).send(operation).expect(200)).body;
            expect((await http().put(visualBase).set('Cookie', cookie).send(operation).expect(200)).body).toEqual(checkpoint);
            await http().put(visualBase).set('Cookie', cookie).send({ ...operation, operationId: randomUUID(),
              expectedVersion: 1, action: { type: 'execute', script: 'alert(1)' } }).expect(400);
            expect(previousPetrosDiagramSchema.safeParse(block.content).success).toBe(true);
          }
          if (block.questions.length) {
            const [question] = await db.select().from(schema.petrosQuestionSpecs).where(eq(schema.petrosQuestionSpecs.id, block.questions[0].id));
            expect(question!.evaluationMode).toBe('deterministic');
            const answer = { idempotencyKey: randomUUID(), questionId: question!.id,
              answer: question!.correctChoiceId ?? question!.acceptableAnswers[0], confidence: 'sure', expectedBlockVersion: block.version };
            const answerUrl = `${teachingBase}/blocks/${block.id}/answers`;
            const fail = vi.spyOn(httpServices.rawLoop['audit'], 'logAudit').mockRejectedValueOnce(new Error('integrated audit rollback'));
            try { await http().post(answerUrl).set('Cookie', cookie).send(answer).expect(500); } finally { fail.mockRestore(); }
            expect(await db.select().from(schema.petrosAnswerEvaluations).where(eq(schema.petrosAnswerEvaluations.questionId, question!.id))).toEqual([]);
            await http().post(answerUrl).set('Cookie', cookie).send(answer).expect(201);
            await http().post(answerUrl).set('Cookie', cookie).send(answer).expect(201);
            const evaluations = await db.select().from(schema.petrosAnswerEvaluations).where(eq(schema.petrosAnswerEvaluations.questionId, question!.id));
            expect(evaluations).toHaveLength(1);
            expect(petrosAssessmentSchema.parse(evaluations[0]!.assessment).result).toMatchObject({ kind: 'objective', judgment: { status: 'evaluated', outcome: 'correct' } });
            expect(await db.select().from(schema.petrosLearnerEvidenceEvents).where(eq(schema.petrosLearnerEvidenceEvents.sourceEventId, evaluations[0]!.observationId))).toHaveLength(1);
            assessed = true;
          } else {
            await http().post(`${teachingBase}/blocks/${block.id}/complete`).set('Cookie', cookie)
              .send({ idempotencyKey: randomUUID(), blockType: block.content.type, expectedBlockVersion: block.version,
                interactionState: {}, observedOutcome: { completed: true } }).expect(201);
          }
        }
        expect(diagramId).toBeTruthy();
        expect(assessed).toBe(true);
        const qualitative = assessmentEvidenceFixture();
        qualitative.sourceEventId = randomUUID();
        qualitative.assessment.result = criterionResultFixture();
        expect(await asStudent(() => httpServices.learner.ingest(principal, qualitative)))
          .toMatchObject({ accepted: false, reason: 'qualitative_assessment_disabled' });

        // V10/V11 share this exact institution, student, source and HTTP server. The roster
        // preview is negotiated and immutable; no canonical identity/enrollment is applied.
        const rosterCsv = 'sourcedId,role,givenName,familyName\nphase1-new,student,Final,Journey';
        const [mappingCountBefore] = await client`
          select count(*)::int as count from integration_provider_mappings where connection_id = ${providerId}
        `;
        const unsupportedMapping = await http()
          .put(`/v1/portal/federation/identity-providers/${providerId}/mappings`)
          .set('Cookie', staffCookie)
          .send({
            schemaVersion: 'petros.provider-mapping.v99', namespace: 'Synthetic.FinalJourney',
            entityKind: 'student', externalId: 'unsupported-version', commandId: randomUUID(), expectedVersion: 0,
            internalId: studentId, purpose: 'roster', status: 'proposed',
            effective: { from: '2020-01-01T00:00:00.000Z', until: null },
            upstreamRevision: 'phase1-unsupported', upstreamHash: '8'.repeat(64),
            fieldAuthority: [{ field: 'identity', owner: 'canonical' }],
            provenance: { method: 'manual', sourceRef: 'phase1-final', sourceHash: '8'.repeat(64),
              observedAt: '2020-01-01T00:00:00.000Z', licence: 'synthetic-only' },
            reason: 'Unsupported version must never fall back',
          })
          .expect(400);
        expect(unsupportedMapping.text).toContain('schemaVersion');
        const [mappingCountAfter] = await client`
          select count(*)::int as count from integration_provider_mappings where connection_id = ${providerId}
        `;
        expect(mappingCountAfter).toEqual(mappingCountBefore);
        const [canonicalBefore] = await client`
          select
            (select count(*) from students where institution_id = ${institutionId})::int as students,
            (select count(*) from course_enrollments where institution_id = ${institutionId})::int as enrollments
        `;
        const roster = await http().post('/v1/portal/federation/roster/oneroster/import')
          .set('Cookie', staffCookie)
          .set('x-petros-provider-mapping', PROVIDER_MAPPING_VERSION)
          .send({ csv: rosterCsv, mappingContext: {
            schemaVersion: PROVIDER_MAPPING_VERSION,
            connectionId: providerId,
            namespace: 'Synthetic.FinalJourney',
            upstreamRevision: 'phase1-final-1',
          } });
        expect(roster.status, JSON.stringify(roster.body)).toBe(201);
        expect(roster.body.compatibility).toMatchObject({
          mode: 'preview', applied: 0, mapped: 0, unresolved: 1,
        });
        const [canonicalAfter] = await client`
          select
            (select count(*) from students where institution_id = ${institutionId})::int as students,
            (select count(*) from course_enrollments where institution_id = ${institutionId})::int as enrollments
        `;
        expect(canonicalAfter).toEqual(canonicalBefore);

        // Actual external roster and SSO boundaries fail before transport, session or job effects.
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
          new Error('external network is prohibited in the private final journey'),
        );
        try {
          const [effectsBefore] = await client`
            select
              (select count(*) from portal_sessions where institution_id = ${institutionId})::int as sessions,
              (select count(*) from roster_sync_jobs where institution_id = ${institutionId})::int as jobs,
              (select count(*) from audit_events where institution_id = ${institutionId})::int as audits,
              (select count(*) from students where institution_id = ${institutionId})::int as students,
              (select count(*) from institution_user_roles r join institution_users u on u.id = r.institution_user_id where u.institution_id = ${institutionId})::int as roles,
              (select count(*) from course_enrollments where institution_id = ${institutionId})::int as enrollments
          `;
          for (const provider of ['clever', 'classlink', 'oneroster']) {
            const blocked = await http().post(`/v1/portal/federation/roster/${provider}/sync`)
              .set('Cookie', staffCookie)
              .send(provider === 'oneroster'
                ? { baseUrl: 'https://synthetic-provider.invalid', token: 'never-used' }
                : {})
              .expect(409);
            expect(blocked.body.code).toBe('EXTERNAL_ROSTER_SYNC_DISABLED');
          }
          for (const protocol of ['oidc', 'saml']) {
            const blocked = await http().post(`/v1/portal/auth/${protocol}/start`)
              .set('Cookie', staffCookie)
              .send({ providerId, redirectUri: 'https://synthetic-return.invalid' })
              .expect(409);
            expect(blocked.body.code).toBe('FEDERATION_AUTHENTICATION_DISABLED');
            expect(blocked.headers['set-cookie']).toBeUndefined();
          }
          const [effectsAfter] = await client`
            select
              (select count(*) from portal_sessions where institution_id = ${institutionId})::int as sessions,
              (select count(*) from roster_sync_jobs where institution_id = ${institutionId})::int as jobs,
              (select count(*) from audit_events where institution_id = ${institutionId})::int as audits,
              (select count(*) from students where institution_id = ${institutionId})::int as students,
              (select count(*) from institution_user_roles r join institution_users u on u.id = r.institution_user_id where u.institution_id = ${institutionId})::int as roles,
              (select count(*) from course_enrollments where institution_id = ${institutionId})::int as enrollments
          `;
          expect(effectsAfter).toEqual(effectsBefore);
          expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
          fetchSpy.mockRestore();
        }

        // The assigned instructor has syllabus-read/write scope without courses.manage. The
        // owner uses the protected review route; the raw student response receives approved
        // projection only and creates no learner evidence.
        const syllabusPath = `/v1/portal/courses/${courseId}/syllabus`;
        const modules = [{ weekNo: 1, title: 'Elasticity objective', topics: ['Elasticity'], covered: false }];
        const curriculum = curriculumFixture();
        const proposed = await http().post(syllabusPath)
          .set('Cookie', instructorCookie)
          .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION)
          .send({ modules, curriculum: {
            commandId: randomUUID(), expectedRevision: 0,
            reason: 'Private final-journey proposal', payload: curriculum,
          } })
          .expect(201);
        expect(proposed.body.curriculum).toMatchObject({ status: 'ready', revision: 1 });
        const reviewed = structuredClone(curriculum);
        reviewed.alignments[0]!.status = 'approved';
        reviewed.alignments[0]!.version = 2;
        reviewed.alignments[2]!.status = 'rejected';
        reviewed.alignments[2]!.version = 2;
        reviewed.alignments[2]!.overrideReason = 'Synthetic rejected review-only record';
        await http().post(`${syllabusPath}/review`)
          .set('Cookie', staffCookie)
          .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION)
          .send({ modules, curriculum: {
            commandId: randomUUID(), expectedRevision: 1,
            reason: 'Private final-journey review', payload: reviewed,
          } })
          .expect(201);
        const instructorRead = await http().get(syllabusPath)
          .set('Cookie', instructorCookie)
          .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION)
          .expect(200);
        expect(instructorRead.body.curriculum.data.alignments).toHaveLength(3);
        const evidenceBeforeSyllabus = await db.select().from(schema.petrosLearnerEvidenceEvents);
        const studentRead = await http().get(`/v1/student/courses/${courseId}/syllabus`)
          .set('Cookie', cookie)
          .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION)
          .expect(200);
        expect(studentRead.body.curriculum).toMatchObject({ status: 'ready', evidence: 'not_assessed' });
        expect(studentRead.body.curriculum.data.alignments).toHaveLength(1);
        expect(studentRead.body.curriculum.data.alignments[0]).toMatchObject({
          id: reviewed.alignments[0]!.id, state: 'approved',
        });
        for (const index of [1, 2]) {
          expect(studentRead.text).not.toContain(reviewed.alignments[index]!.id);
          expect(studentRead.text).not.toContain(reviewed.items[index]!.descriptor);
        }
        expect(await db.select().from(schema.petrosLearnerEvidenceEvents)).toEqual(evidenceBeforeSyllabus);
        await client`
          insert into course_curriculum_revisions
            (institution_id, course_id, revision, schema_version, command_id, request_hash,
             syllabus_hash, subject_id, payload, actor_id, reason)
          select institution_id, course_id, 3, ${CURRICULUM_ALIGNMENT_VERSION}, ${randomUUID()}, ${'7'.repeat(64)},
                 syllabus_hash, subject_id,
                 '{"schemaVersion":"petros.curriculum-alignment.v1","objectives":[{}],"frameworks":[],"releases":[],"items":[],"relationships":[],"alignments":[],"moduleObjectives":[]}'::jsonb,
                 ${staffUserId}, 'Unsupported stored curriculum version fixture'
          from course_curriculum_revisions
          where course_id = ${courseId}
          order by revision desc limit 1
        `;
        const unsupportedCurriculum = await http().get(`/v1/student/courses/${courseId}/syllabus`)
          .set('Cookie', cookie)
          .set('x-petros-curriculum-alignment', CURRICULUM_ALIGNMENT_VERSION)
          .expect(200);
        expect(unsupportedCurriculum.body.curriculum).toMatchObject({
          status: 'unsupported_version', revision: 3, evidence: 'not_assessed',
        });
        expect(unsupportedCurriculum.body.curriculum).not.toHaveProperty('data');
        expect(unsupportedCurriculum.text).not.toContain(reviewed.items[0]!.descriptor);

        await db.update(schema.students).set({ classId: null }).where(eq(schema.students.id, studentId));
        await http().get(sessionBase).set('Cookie', cookie).expect(404);
        await http().get(teachingBase).set('Cookie', cookie).expect(404);
        await searchHttp(source!.id, intent.sourceFingerprint, 'elasticity').expect(404);
        await db.update(schema.students).set({ classId }).where(eq(schema.students.id, studentId));
        await db.update(schema.knowledgeItems).set({ sourceRevokedAt: new Date() }).where(eq(schema.knowledgeItems.id, source!.id));
        await http().get(sessionBase).set('Cookie', cookie).expect(404);
        await locatorHttp(source!.id, locator).expect(404);
        await status(knowledgeInput.idempotencyKey, true).expect(404);
        await http().get(`${teachingBase}/blocks/${diagramId}/visual`).set('Cookie', cookie).expect(404);
        expect(await versions(source!.id)).toEqual(snapshots);
        process.stdout.write(`PETROS_PHASE1_SYNTHETIC_IDS ${JSON.stringify({
          institutionId, studentId, courseId, providerId,
          sourceId: source!.id, intentId: intent.id, sessionId,
          durableQuestionKey: input.idempotencyKey,
        })}\n`);
      } finally {
        Object.assign(httpServices.rawLoop, { gateway: originalGateway });
        Object.assign(visualEnv, { PETROS_DOCUMENT_QUESTION_EXECUTION_ENABLED: false });
        await db.update(schema.students).set({ classId }).where(eq(schema.students.id, studentId));
        await db.update(schema.petrosAiFunctions).set({ settings: fn.settings }).where(eq(schema.petrosAiFunctions.id, fn.id));
      }
    }, 60_000);

  },
);

/** Tiny valid PDF generator for parser tests, no demo assets or external tooling. */
function pdfFixture(texts: string[]): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${texts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  texts.forEach((text, index) => {
    // Wrap long synthetic text onto the physical page. Off-page text is correctly omitted by pdfjs.
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (line && line.length + word.length > 100) { lines.push(line); line = ''; }
      line += `${line ? ' ' : ''}${word}`;
    }
    lines.push(line);
    if (lines.length > 48) throw new Error('Synthetic PDF fixture exceeds one physical page');
    const stream = `BT /F1 12 Tf 14 TL 20 700 Td ${lines.map((line, i) => `${i ? "T* " : ''}(${line.replace(/[()\\]/g, '\\$&')}) Tj`).join(' ')} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}

function curriculumFixture(): CurriculumAlignment {
  const effective = { from: '2020-01-01T00:00:00.000Z', until: null };
  const common = () => ({
    id: randomUUID(),
    version: 1,
    provenance: {
      method: 'manual' as const,
      sourceRef: 'synthetic-private-final-journey',
      sourceHash: 'a'.repeat(64),
      observedAt: '2020-01-01T00:00:00.000Z',
      licence: 'synthetic-only',
    },
  });
  const ref = (record: { id: string; version: number }) => ({
    id: record.id,
    version: record.version,
  });
  const objectives = ['Approved objective', 'Proposed objective', 'Rejected objective']
    .map((descriptor) => ({ ...common(), descriptor, effective }));
  const framework = {
    ...common(),
    title: 'Synthetic private framework',
    jurisdiction: 'Test',
    subject: 'Computing',
    level: 'Intro',
    issuingBody: 'Synthetic publisher',
    externalId: 'SYN-FINAL-FW',
    uri: null,
  };
  const release = {
    ...common(),
    framework: ref(framework),
    publisherVersion: 'synthetic-final-1',
    effective,
    supersedes: null,
  };
  const items = objectives.map((_, index) => ({
    ...common(),
    release: ref(release),
    externalId: `SYN-FINAL-${index}`,
    uri: null,
    descriptor: `Synthetic private standard ${index}`,
  }));
  return {
    schemaVersion: CURRICULUM_ALIGNMENT_VERSION,
    objectives,
    frameworks: [framework],
    releases: [release],
    items,
    relationships: [],
    moduleObjectives: [{ weekNo: 1, objectives: objectives.map(ref) }],
    alignments: objectives.map((objective, index) => ({
      ...common(),
      objective: ref(objective),
      standard: ref(items[index]!),
      relation: 'addresses',
      rationale: `Synthetic rationale ${index}`,
      gaps: [],
      confidence: 1,
      status: 'proposed',
      effective,
      overrideReason: null,
    })),
  };
}
