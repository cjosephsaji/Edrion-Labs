import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { runInStudentTenant, schema } from '@edrion/database';
import { StudentSessionService } from '../student/core/student-session.service';
import { readGuidanceFiles } from '../student/assignments/petros-guidance-files';
import { petrosGuidanceVisibility } from '../student/assignments/petros-guidance-visibility';
import {
  documentTables,
  refuseApplicationTargets,
  scoped,
  scopeAdapter,
  startReadinessRehearsal,
  type ReadinessRehearsal,
} from '../../../scripts/rehearse-petros-v2-readiness-repair';
import {
  assertRestrictedApplicationDatabase,
  bindReadinessScope,
  resolveOwnedTransactions,
} from '../../../scripts/petros-v2-readiness-runtime-candidate';

describe('M0-R disposable target boundary', () => {
  it('refuses target flags before allocating a database', () => {
    expect(() => refuseApplicationTargets(['--url', 'postgres://example.invalid/live'])).toThrow(
      'M0R_TARGET_REFUSED',
    );
  });
  it('refuses configured application URLs even if local', () => {
    const old = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = 'postgres://localhost/configured_application';
      expect(() => refuseApplicationTargets()).toThrow('M0R_TARGET_REFUSED');
    } finally {
      if (old === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = old;
    }
  });
  it('tests the proposed method/class transaction-marker resolution', () => {
    const marker = Symbol('server-only'),
      handler = {},
      controller = {};
    expect(resolveOwnedTransactions(marker, handler, controller)).toBe(false);
    Reflect.defineMetadata(marker, true, controller);
    expect(resolveOwnedTransactions(marker, handler, controller)).toBe(true);
    Reflect.defineMetadata(marker, false, handler);
    expect(resolveOwnedTransactions(marker, handler, controller)).toBe(false);
  });
});

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')(
  'M0-R Phase A / real disposable restricted roles',
  () => {
    let f: ReadinessRehearsal;
    let before: Awaited<ReturnType<ReadinessRehearsal['snapshot']>>;
    let ledgerBefore: string;
    let saved: Awaited<ReturnType<ReadinessRehearsal['backup']>>;
    let revisionId: string, preparationId: string, pathId: string, artifactId: string;
    beforeAll(async () => {
      f = await startReadinessRehearsal();
      before = await f.snapshot();
      ledgerBefore = await f.ledgerHash();
      saved = await f.backup();
    }, 60000);
    afterAll(async () => {
      await f?.close();
    }, 30000);

    it('reproduces the applied branch, missing DDL, integer-seed hash and manual guidance', async () => {
      const [count] = await f.admin`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
      expect(count!.n).toBe(153);
      expect(before.knowledge_item_versions!.rows).toBe(3);
      expect(before.knowledge_item_version_pages!.rows).toBe(3);
      expect(before.petros_session_commands!.rows).toBe(9);
      expect(before.grade_entries!.rows).toBe(1);
      expect(before.mark_revisions!.rows).toBe(1);
      for (const table of documentTables) expect(before[table]).toBeUndefined();
      const columns =
        await f.admin`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND (column_name IN('lesson_plan','petros_guidance') OR (table_name='petros_quality_runs' AND column_name='seed'))`;
      expect(
        columns.some(
          (c) =>
            c.table_name === 'petros_document_lesson_outlines' && c.column_name === 'lesson_plan',
        ),
      ).toBe(false);
      expect(
        columns.some((c) => c.table_name === 'assignments' && c.column_name === 'petros_guidance'),
      ).toBe(true);
      expect(
        columns.some((c) => c.table_name === 'petros_quality_runs' && c.data_type === 'bigint'),
      ).toBe(true);
      const [original] =
        await f.admin`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=1788700000000`;
      expect(original!.hash).toBe(
        'd5b1aa14dc4e337de1fe84e7ea4b79ea954a969f965d19e59bf4a48a7d0e95a5',
      );
    });

    it('refuses SQL without the per-transaction disposable marker', async () => {
      await expect(f.admin.begin((tx) => tx.unsafe(f.repairText))).rejects.toMatchObject({
        code: 'P0001',
      });
      expect(await f.snapshot()).toEqual(before);
    });

    it('rolls back DDL, grants and policies after an injected failure, then retries', async () => {
      await expect(f.applyRepair('SELECT 1/0')).rejects.toMatchObject({ code: '22012' });
      expect(await f.snapshot()).toEqual(before);
      expect(await f.ledgerHash()).toBe(ledgerBefore);
      await f.applyRepair();
      const after = await f.snapshot();
      for (const [name, receipt] of Object.entries(before))
        expect(after[name], name).toEqual(receipt);
      for (const name of documentTables) expect(after[name]!.rows).toBe(0);
    }, 30000);

    it('repeats the repair and complete ordered grants/RLS effects without rewriting history', async () => {
      await f.replayStandalone();
      // The original broad grants reopen private columns: the final overlay is required.
      const [old] =
        await f.admin`SELECT has_column_privilege('edrion_app','petros_document_lesson_artifacts','private_plan','SELECT') AS yes`;
      expect(old!.yes).toBe(true);
      await f.applyRepair();
      const first = await f.snapshot();
      await f.applyRepair();
      expect(await f.snapshot()).toEqual(first);
      expect(await f.ledgerHash()).toBe(ledgerBefore);
      const [corrected] =
        await f.admin`SELECT has_column_privilege('edrion_app','petros_document_lesson_artifacts','private_plan','SELECT') AS yes`;
      expect(corrected!.yes).toBe(false);
    }, 30000);

    it('authenticates as separate non-superuser, non-BYPASSRLS, non-owner roles', async () => {
      for (const sql of [f.app, f.worker]) {
        const [role] =
          await sql`SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user`;
        expect(role).toEqual({
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
        });
        await expect(sql.unsafe('SET ROLE petros_test')).rejects.toMatchObject({ code: '42501' });
        await expect(
          sql.unsafe('CREATE TABLE public.unauthorized_table(id int)'),
        ).rejects.toMatchObject({ code: '42501' });
      }
      const owned =
        await f.admin`SELECT relname FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname='edrion_app')`;
      expect(owned).toHaveLength(0);
    });

    it('tests the proposed startup guard against superuser, worker and inherited-role connections', async () => {
      await expect(assertRestrictedApplicationDatabase(f.tenantDb)).resolves.toBeUndefined();
      await expect(
        assertRestrictedApplicationDatabase(drizzle(f.admin, { schema })),
      ).rejects.toThrow('ROLE_UNSAFE');
      await expect(
        assertRestrictedApplicationDatabase(drizzle(f.worker, { schema })),
      ).rejects.toThrow('ROLE_UNSAFE');
      await f.admin.unsafe(
        'CREATE ROLE m0r_admin_carrier NOLOGIN; GRANT m0r_admin_carrier TO edrion_app',
      );
      try {
        await expect(assertRestrictedApplicationDatabase(f.tenantDb)).rejects.toThrow(
          'ROLE_UNSAFE',
        );
      } finally {
        await f.admin.unsafe('REVOKE m0r_admin_carrier FROM edrion_app');
      }
      await expect(assertRestrictedApplicationDatabase(f.tenantDb)).resolves.toBeUndefined();
    });

    it('tests the proposed scope replacement against stale pooled institutional/job GUCs', async () => {
      await f.app.begin(async (tx) => {
        await tx`SELECT set_config('app.institution_id',${f.owners[0]!.institutionId},true),set_config('app.student_id',${f.owners[0]!.studentId},true),set_config('app.preparation_id','stale-job',true)`;
        await bindReadinessScope(scopeAdapter(tx), { independentUserId: f.independentUserId });
        const [row] =
          await tx`SELECT current_setting('app.institution_id') AS institution,current_setting('app.student_id') AS student,current_setting('app.preparation_id') AS job`;
        expect(row).toEqual({ institution: '', student: '', job: '' });
        expect(await tx`SELECT id FROM knowledge_collections`).toHaveLength(1);
      });
    });

    it('denies unscoped, wrong-institution and same-institution foreign-owner reads', async () => {
      expect(await f.app`SELECT id FROM petros_learning_sessions`).toHaveLength(0);
      const a = f.owners[0]!,
        other = f.owners[1]!,
        foreign = f.owners[2]!;
      const rows = await scoped(f.app, a, (tx) => tx`SELECT id FROM petros_learning_sessions`);
      expect(rows.map((r) => r.id).sort()).toEqual([...a.sessions].sort());
      expect(
        await scoped(
          f.app,
          { institutionId: foreign.institutionId, studentId: a.studentId },
          (tx) => tx`SELECT id FROM petros_learning_sessions`,
        ),
      ).toHaveLength(0);
      expect(
        await scoped(
          f.app,
          a,
          (tx) => tx`SELECT id FROM petros_learning_sessions WHERE student_id=${other.studentId}`,
        ),
      ).toHaveLength(0);
      expect(await scoped(f.app, a, (tx) => tx`SELECT id FROM knowledge_items`)).toHaveLength(1);
      expect(await scoped(f.app, a, (tx) => tx`SELECT id FROM knowledge_item_pages`)).toHaveLength(
        1,
      );
      expect(
        await scoped(
          f.app,
          { institutionId: a.institutionId },
          (tx) => tx`SELECT id FROM knowledge_items`,
        ),
      ).toHaveLength(0);
    });

    it('denies cross-owner writes even when a query omits the owner filter', async () => {
      const a = f.owners[0]!,
        other = f.owners[1]!;
      expect(
        await scoped(
          f.app,
          a,
          (tx) =>
            tx`UPDATE petros_learning_sessions SET topic='forbidden' WHERE student_id=${other.studentId} RETURNING id`,
        ),
      ).toHaveLength(0);
      await expect(
        scoped(
          f.app,
          a,
          (tx) =>
            tx`INSERT INTO knowledge_collections(institution_id,student_id,name) VALUES(${a.institutionId},${other.studentId},'forbidden')`,
        ),
      ).rejects.toMatchObject({ code: '42501' });
      expect(
        await scoped(
          f.app,
          a,
          (tx) => tx`SELECT id FROM storage_objects WHERE owner_student_id=${other.studentId}`,
        ),
      ).toHaveLength(0);
      await expect(
        scoped(
          f.app,
          a,
          (tx) =>
            tx`INSERT INTO petros_session_events(session_id,institution_id,student_id,type,payload,correlation_id) VALUES(${other.sessions[0]!},${a.institutionId},${a.studentId},'fixture','{}',${randomUUID()})`,
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('isolates independent learners and denies mixed institutional/independent scope', async () => {
      expect(
        await scoped(
          f.app,
          { independentUserId: f.independentUserId },
          (tx) => tx`SELECT id FROM knowledge_collections`,
        ),
      ).toHaveLength(1);
      expect(
        await scoped(
          f.app,
          { independentUserId: randomUUID() },
          (tx) => tx`SELECT id FROM knowledge_collections`,
        ),
      ).toHaveLength(0);
      expect(
        await scoped(
          f.app,
          { ...f.owners[0]!, independentUserId: f.independentUserId },
          (tx) => tx`SELECT id FROM knowledge_collections`,
        ),
      ).toHaveLength(0);
    });

    it('keeps V1 active, paused and completed-history sessions readable through the tenant proxy', async () => {
      const a = f.owners[0]!;
      const rows = await runInStudentTenant(f.tenantDb, a, () =>
        f.tenantDb.select().from(schema.petrosLearningSessions),
      );
      expect(rows.map((r) => r.status).sort()).toEqual(['active', 'closed', 'paused']);
      expect(rows.find((r) => r.status === 'closed')!.closeReason).toBe('completed');
      expect(
        rows.every(
          (r) => r.stateVersion === 'petros.session-state.v3' && r.currentCheckpointId === 'old',
        ),
      ).toBe(true);
      expect(await f.app`SELECT id FROM petros_learning_sessions`).toHaveLength(0);
      await expect(
        scoped(f.app, a, async (tx) => {
          await tx`SELECT id FROM knowledge_items`;
          throw new Error('fixture rollback');
        }),
      ).rejects.toThrow('fixture rollback');
      expect(await f.app`SELECT id FROM knowledge_items`).toHaveLength(0);
    });

    it('preserves V1 login-session verification and rejects a revoked cookie using the real service', async () => {
      const a = f.owners[0]!;
      const sessions = new StudentSessionService(f.tenantDb, {
        SESSION_COOKIE_SECRET: 'm0r-synthetic-test-secret-at-least-32-characters',
        SESSION_TTL_SECONDS: 3600,
      } as never);
      const issued = await sessions.issue({
        kind: 'institutional',
        institutionId: a.institutionId,
        userId: a.userId,
      });
      expect((await sessions.verify(issued.token)).userId).toBe(a.userId);
      await f.admin`UPDATE portal_sessions SET revoked_at=now() WHERE id=${issued.sessionId}`;
      await expect(sessions.verify(issued.token)).rejects.toThrow('Session has been revoked');
    });

    it('adds all four tables and a scoped owner preparation without fake academic authority', async () => {
      const a = f.owners[0]!;
      revisionId = randomUUID();
      preparationId = randomUUID();
      pathId = randomUUID();
      artifactId = randomUUID();
      await scoped(f.app, a, async (tx) => {
        await tx`INSERT INTO petros_document_source_revisions(id,institution_id,canonical_knowledge_item_id,source_key,title,document_version,checksum,parser_version,structure)
        VALUES(${revisionId},${a.institutionId},${a.itemId},${`knowledge:${a.itemId}`},'Synthetic document',1,${a.sourceChecksum},'fixture-parser','{}')`;
        await tx`INSERT INTO petros_document_preparations(id,institution_id,source_revision_id,generator_version) VALUES(${preparationId},${a.institutionId},${revisionId},'fixture-generator')`;
        await tx`INSERT INTO petros_document_learner_paths(id,institution_id,student_id,knowledge_item_id,source_revision_id,preparation_id) VALUES(${pathId},${a.institutionId},${a.studentId},${a.itemId},${revisionId},${preparationId})`;
      });
      expect(
        await scoped(f.app, f.owners[1]!, (tx) => tx`SELECT id FROM petros_document_preparations`),
      ).toHaveLength(0);
      expect(
        await scoped(f.app, f.owners[2]!, (tx) => tx`SELECT id FROM petros_document_learner_paths`),
      ).toHaveLength(0);
      const flags =
        await f.admin`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ${f.admin(documentTables)}`;
      expect(flags).toHaveLength(4);
      expect(flags.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
      const [academic] =
        await f.admin`SELECT (SELECT count(*)::int FROM courses) AS courses,(SELECT count(*)::int FROM petros_reviewer_qualifications) AS qualifications`;
      expect(academic).toEqual({ courses: 0, qualifications: 0 });
    });

    it('claims and publishes only the authorized worker preparation', async () => {
      const a = f.owners[0]!;
      expect(await f.worker`SELECT id FROM petros_document_preparations`).toHaveLength(0);
      expect(
        await scoped(
          f.worker,
          a,
          (tx) => tx`UPDATE petros_document_preparations SET status='preparing' RETURNING id`,
        ),
      ).toHaveLength(0);
      expect(
        await scoped(
          f.worker,
          f.owners[1]!,
          (tx) => tx`UPDATE petros_document_preparations SET status='preparing' RETURNING id`,
          preparationId,
        ),
      ).toHaveLength(0);
      const claimed = await scoped(
        f.worker,
        a,
        (tx) =>
          tx`UPDATE petros_document_preparations SET status='preparing',attempt_count=attempt_count+1 WHERE id=${preparationId} RETURNING id`,
        preparationId,
      );
      expect(claimed.map((r) => r.id)).toEqual([preparationId]);
      await scoped(
        f.worker,
        a,
        async (tx) => {
          await tx`INSERT INTO petros_document_lesson_artifacts(id,institution_id,source_revision_id,preparation_id,concept_id,subject,generator_version,status,public_plan,private_plan)
        VALUES(${artifactId},${a.institutionId},${revisionId},${preparationId},'fixture-concept','fixture-subject','fixture-generator','published','{"prompt":"Synthetic"}','{"answer":"private synthetic"}')`;
          await tx`UPDATE petros_document_preparations SET first_lesson_id=${artifactId},status='ready',progress=100 WHERE id=${preparationId}`;
        },
        preparationId,
      );
    });

    it('denies student private-answer reads and unauthorized worker writes/academic grants', async () => {
      const a = f.owners[0]!;
      expect(
        await scoped(
          f.app,
          a,
          (tx) => tx`SELECT id,public_plan FROM petros_document_lesson_artifacts`,
        ),
      ).toHaveLength(1);
      await expect(
        scoped(f.app, a, (tx) => tx`SELECT private_plan FROM petros_document_lesson_artifacts`),
      ).rejects.toMatchObject({ code: '42501' });
      for (const db of [f.app, f.worker])
        await expect(
          db.unsafe('INSERT INTO petros_reviewer_qualifications DEFAULT VALUES'),
        ).rejects.toMatchObject({ code: '42501' });
      await expect(
        scoped(
          f.worker,
          a,
          (tx) =>
            tx`UPDATE petros_document_preparations SET institution_id=${f.owners[2]!.institutionId}`,
          preparationId,
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(f.worker`SELECT id FROM petros_learning_sessions`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(f.worker`SELECT edrion_petros_operations()`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(f.worker`SELECT * FROM edrion_due_petros_questions()`).rejects.toMatchObject({
        code: '42501',
      });
    });

    it('denies current extraction withdrawal, unavailable storage and cancelled worker path', async () => {
      const a = f.owners[0]!;
      const claim = () =>
        scoped(
          f.worker,
          a,
          (tx) =>
            tx`UPDATE petros_document_preparations SET status='preparing' WHERE id=${preparationId} RETURNING id`,
          preparationId,
        );
      await f.admin`UPDATE knowledge_items SET source_revoked_at=now() WHERE id=${a.itemId}`;
      expect(await claim()).toHaveLength(0);
      expect(
        await scoped(f.app, a, (tx) => tx`SELECT id FROM petros_document_source_revisions`),
      ).toHaveLength(0);
      await f.admin`UPDATE knowledge_items SET source_revoked_at=NULL WHERE id=${a.itemId}`;
      await f.admin`UPDATE storage_objects SET processing_status='error' WHERE id=${a.objectId}`;
      expect(await claim()).toHaveLength(0);
      await f.admin`UPDATE storage_objects SET processing_status='ready' WHERE id=${a.objectId}`;
      await f.admin`UPDATE knowledge_item_pages SET text='replaced synthetic source' WHERE item_id=${a.itemId}`;
      // Mutable legacy pages cannot override the published immutable extraction.
      expect(await claim()).toHaveLength(1);
      await f.admin`UPDATE knowledge_item_pages SET text='Synthetic public document. No real learner content.' WHERE item_id=${a.itemId}`;
      await f.admin`UPDATE petros_document_learner_paths SET status='cancelled' WHERE id=${pathId}`;
      expect(await claim()).toHaveLength(0);
      await f.admin`UPDATE petros_document_learner_paths SET status='active' WHERE id=${pathId}`;
      await f.admin`UPDATE institution_users SET status='disabled' WHERE id=${a.userId}`;
      expect(await claim()).toHaveLength(0);
      await f.admin`UPDATE institution_users SET status='active' WHERE id=${a.userId}`;
    });

    it('preserves teacher-goal file access only for the published explicit recipient', async () => {
      const a = f.owners[0]!,
        other = f.owners[1]!,
        admin = drizzle(f.admin, { schema });
      const yearId = randomUUID(),
        gradeId = randomUUID(),
        classId = randomUUID(),
        subjectId = randomUUID(),
        fileId = randomUUID(),
        goalId = randomUUID();
      await admin.insert(schema.academicYears).values({
        id: yearId,
        institutionId: a.institutionId,
        name: 'Fixture year',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      await admin
        .insert(schema.gradeLevels)
        .values({ id: gradeId, institutionId: a.institutionId, name: 'Fixture grade' });
      await admin.insert(schema.classes).values({
        id: classId,
        institutionId: a.institutionId,
        academicYearId: yearId,
        gradeLevelId: gradeId,
        name: 'Fixture class',
      });
      await admin.insert(schema.subjects).values({
        id: subjectId,
        institutionId: a.institutionId,
        name: 'Fixture subject',
        code: randomUUID(),
      });
      await admin.insert(schema.storageObjects).values({
        id: fileId,
        institutionId: a.institutionId,
        kind: 'petros_guidance_attachment',
        driver: 'local',
        storageKey: 'fixture-goal.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        processingStatus: 'ready',
        derived: { guidanceBinding: { classId, subjectId } },
      });
      const [goal] = await admin
        .insert(schema.assignments)
        .values({
          id: goalId,
          institutionId: a.institutionId,
          classId,
          subjectId,
          title: 'Fixture explicit goal',
          status: 'published',
          petrosGuidance: { attachmentObjectIds: [fileId] } as never,
        })
        .returning();
      await admin
        .insert(schema.assignmentAssignees)
        .values({ assignmentId: goalId, studentId: a.studentId });
      const files = (owner: typeof a) =>
        runInStudentTenant(f.tenantDb, owner, () => readGuidanceFiles(f.tenantDb, goal!));
      expect((await files(a)).map((r) => r.id)).toEqual([fileId]);
      expect(await files(other)).toHaveLength(0);
      expect(await files(f.owners[2]!)).toHaveLength(0);
      const visible = await runInStudentTenant(f.tenantDb, other, () =>
        f.tenantDb
          .select()
          .from(schema.assignments)
          .where(petrosGuidanceVisibility(other.studentId)),
      );
      expect(visible).toHaveLength(0);
      await f.admin`UPDATE assignments SET status='draft' WHERE id=${goalId}`;
      expect(await files(a)).toHaveLength(0);
      await f.admin`UPDATE assignments SET status='published' WHERE id=${goalId}`;
      await f.admin`UPDATE storage_objects SET derived='{"guidanceBinding":{"classId":"wrong","subjectId":"wrong"}}' WHERE id=${fileId}`;
      expect(await files(a)).toHaveLength(0);
    });

    it('permits a shared course source only while the current learner is enrolled', async () => {
      const a = f.owners[0]!,
        other = f.owners[1]!,
        admin = drizzle(f.admin, { schema });
      const courseId = randomUUID(),
        materialId = randomUUID(),
        sharedRevisionId = randomUUID();
      await admin.insert(schema.courses).values({
        id: courseId,
        institutionId: a.institutionId,
        code: randomUUID(),
        name: 'Synthetic enrollment test',
      });
      await admin.insert(schema.courseEnrollments).values([
        { courseId, institutionId: a.institutionId, studentId: a.studentId },
        { courseId, institutionId: other.institutionId, studentId: other.studentId },
      ]);
      await admin.insert(schema.classMaterials).values({
        id: materialId,
        institutionId: a.institutionId,
        contextType: 'course',
        contextId: courseId,
        title: 'Synthetic shared material',
        objectId: a.objectId,
      });
      await f.admin`UPDATE knowledge_items SET origin=${JSON.stringify({ source: 'teacher_class_material', classMaterialId: materialId })}::text::jsonb,object_ids=${JSON.stringify([a.objectId])}::text::jsonb WHERE id IN (${a.itemId},${other.itemId})`;
      await scoped(
        f.app,
        a,
        (tx) =>
          tx`INSERT INTO petros_document_source_revisions(id,institution_id,canonical_knowledge_item_id,class_material_id,source_key,title,document_version,checksum,parser_version,structure) VALUES(${sharedRevisionId},${a.institutionId},${a.itemId},${materialId},${`material:${materialId}`},'Shared fixture',1,${a.sourceChecksum},'fixture-parser','{}')`,
      );
      expect(
        await scoped(
          f.app,
          other,
          (tx) => tx`SELECT id FROM petros_document_source_revisions WHERE id=${sharedRevisionId}`,
        ),
      ).toHaveLength(1);
      await f.admin`DELETE FROM course_enrollments WHERE course_id=${courseId} AND student_id=${other.studentId}`;
      expect(
        await scoped(
          f.app,
          other,
          (tx) => tx`SELECT id FROM petros_document_source_revisions WHERE id=${sharedRevisionId}`,
        ),
      ).toHaveLength(0);
      await f.admin`UPDATE courses SET status='archived' WHERE id=${courseId}`;
      expect(
        await scoped(
          f.app,
          a,
          (tx) => tx`SELECT id FROM petros_document_source_revisions WHERE id=${sharedRevisionId}`,
        ),
      ).toHaveLength(0);
      // Restore the original source binding used by other fixture tests.
      await f.admin`UPDATE knowledge_items SET origin='{}' WHERE id=${a.itemId}`;
    });

    it('recovers from a cancelled in-flight transaction without committing partial data or leaking scope', async () => {
      const a = f.owners[0]!;
      let announce!: (pid: number) => void;
      const entered = new Promise<number>((r) => {
        announce = r;
      });
      const transaction = scoped(f.app, a, async (tx) => {
        const [row] = await tx`SELECT pg_backend_pid() AS pid`;
        await tx`INSERT INTO knowledge_collections(institution_id,student_id,name) VALUES(${a.institutionId},${a.studentId},'interrupted fixture')`;
        announce(row!.pid);
        await tx`SELECT pg_sleep(20)`;
      });
      const outcome = transaction.then(
        () => ({ error: undefined }),
        (error) => ({ error }),
      );
      const pid = await entered;
      const deadline = Date.now() + 2000;
      while (true) {
        const [active] = await f.admin`SELECT wait_event FROM pg_stat_activity WHERE pid=${pid}`;
        if (active?.wait_event === 'PgSleep') break;
        if (Date.now() > deadline) throw new Error('Fixture query did not enter cancellable sleep');
        await new Promise((r) => setTimeout(r, 10));
      }
      await f.admin`SELECT pg_cancel_backend(${pid})`;
      expect((await outcome).error).toMatchObject({ code: '57014' });
      const [count] =
        await f.admin`SELECT count(*)::int AS n FROM knowledge_collections WHERE name='interrupted fixture'`;
      expect(count!.n).toBe(0);
      expect(await f.app`SELECT id FROM petros_learning_sessions`).toHaveLength(0);
    });

    it('enforces dedupe, progress bounds and cross-tenant/owner FKs even for the DDL owner', async () => {
      const a = f.owners[0]!,
        other = f.owners[1]!,
        b = f.owners[2]!;
      await expect(
        f.admin`INSERT INTO petros_document_preparations(institution_id,source_revision_id,generator_version) VALUES(${a.institutionId},${revisionId},'fixture-generator')`,
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        f.admin`UPDATE petros_document_preparations SET progress=101 WHERE id=${preparationId}`,
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.admin`INSERT INTO petros_document_preparations(institution_id,source_revision_id,generator_version) VALUES(${b.institutionId},${revisionId},'other')`,
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        f.admin`INSERT INTO petros_document_learner_paths(institution_id,student_id,knowledge_item_id,source_revision_id,preparation_id) VALUES(${a.institutionId},${other.studentId},${a.itemId},${revisionId},${preparationId})`,
      ).rejects.toMatchObject({ code: '23503' });
    });

    it('rejects history mutation and TRUNCATE, including from an owner/admin connection', async () => {
      const a = f.owners[0]!;
      await expect(
        scoped(f.app, a, (tx) => tx`UPDATE petros_session_events SET payload='{}'`),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(f.admin`UPDATE petros_session_events SET payload='{}'`).rejects.toMatchObject({
        code: 'P0001',
      });
      await expect(f.admin`UPDATE knowledge_item_versions SET snapshot='{}'`).rejects.toMatchObject(
        { code: 'P0001' },
      );
      await expect(
        scoped(f.app, a, (tx) => tx`UPDATE mark_revisions SET new_score=0`),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(f.admin.unsafe('TRUNCATE petros_session_events')).rejects.toMatchObject({
        code: 'P0001',
      });
      await expect(
        f.admin`UPDATE petros_document_source_revisions SET structure='{}',title='changed' WHERE id=${revisionId}`,
      ).rejects.toMatchObject({ code: 'P0001' });
      await expect(
        scoped(
          f.worker,
          a,
          (tx) =>
            tx`UPDATE petros_document_lesson_artifacts SET private_plan='{}' WHERE id=${artifactId}`,
          preparationId,
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('replays the exact proposed production migration/grants/RLS diff with populated documents', async () => {
      const original = await f.snapshot();
      await f.replayProposedFiles();
      await f.replayProposedFiles();
      expect(await f.snapshot()).toEqual(original);
      expect(await f.ledgerHash()).toBe(ledgerBefore);
      await expect(assertRestrictedApplicationDatabase(f.tenantDb)).resolves.toBeUndefined();
      const [privilege] =
        await f.admin`SELECT has_column_privilege('edrion_app','petros_document_lesson_artifacts','private_plan','SELECT') AS yes`;
      expect(privilege!.yes).toBe(false);
    }, 30000);

    it('refuses a conflicting installed index without silently replacing it', async () => {
      await f.admin.unsafe(
        'DROP INDEX petros_document_preparations_status_idx; CREATE INDEX petros_document_preparations_status_idx ON petros_document_preparations(progress)',
      );
      try {
        await expect(f.applyRepair()).rejects.toMatchObject({ code: 'P0001' });
      } finally {
        await f.admin.unsafe(
          'DROP INDEX petros_document_preparations_status_idx; CREATE INDEX petros_document_preparations_status_idx ON petros_document_preparations(status,updated_at)',
        );
      }
      expect(await f.ledgerHash()).toBe(ledgerBefore);
    });

    it('FORCE RLS denies a non-superuser table owner without policy scope', async () => {
      await f.admin.unsafe('CREATE ROLE m0r_owner_test NOSUPERUSER NOBYPASSRLS');
      await f.admin.unsafe('ALTER TABLE petros_learning_sessions OWNER TO m0r_owner_test');
      try {
        const rows = await f.admin.begin(async (tx) => {
          await tx.unsafe('SET LOCAL ROLE m0r_owner_test');
          return tx`SELECT id FROM public.petros_learning_sessions`;
        });
        expect(rows).toHaveLength(0);
      } finally {
        await f.admin.unsafe('ALTER TABLE petros_learning_sessions OWNER TO petros_test');
      }
    });

    it('denies invalidated extraction versions while retaining their immutable content', async () => {
      const a = f.owners[0]!;
      await f.admin`UPDATE knowledge_item_versions SET invalidated_at=now(),invalidation_reason='synthetic withdrawal' WHERE item_id=${a.itemId}`;
      expect(
        await scoped(
          f.worker,
          a,
          (tx) =>
            tx`UPDATE petros_document_preparations SET status='preparing' WHERE id=${preparationId} RETURNING id`,
          preparationId,
        ),
      ).toHaveLength(0);
      expect(
        await scoped(
          f.app,
          a,
          (tx) => tx`SELECT id FROM petros_document_source_revisions WHERE id=${revisionId}`,
        ),
      ).toHaveLength(0);
      const [retained] =
        await f.admin`SELECT count(*)::int AS n FROM knowledge_item_versions WHERE item_id=${a.itemId} AND state='complete'`;
      expect(retained!.n).toBe(1);
    });

    it('rehearses the real V1 backfill with unchanged original artifact bytes and repeatability', async () => {
      const original = (await f.snapshot()).knowledge_artifacts;
      const first = await f.backfill(),
        second = await f.backfill();
      expect(first).toMatchObject({ scanned: 3, migrated: 3, skippedInvalid: 0 });
      expect(second).toMatchObject({ scanned: 0, migrated: 0 });
      expect((await f.snapshot()).knowledge_artifacts).toEqual(original);
    }, 30000);

    it('restores a separate database and original/derived fixture assets with matching row/hash receipts', async () => {
      const names = readdirSync(join(f.directory, 'assets'));
      rmSync(join(f.directory, 'assets', names[0]!));
      writeFileSync(join(f.directory, 'assets', names[1]!), 'corrupt synthetic asset');
      const restored = await f.restore(saved);
      const hash = (v: Buffer) => createHash('sha256').update(v).digest('hex');
      for (const name of readdirSync(restored.assetsDirectory))
        expect(hash(readFileSync(join(restored.assetsDirectory, name)))).toBe(
          hash(saved.assets[name]!),
        );
      for (const [name, receipt] of Object.entries(before)) {
        const [row] = await restored.sql.unsafe(
          `SELECT count(*)::int AS rows,coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]') AS contents FROM public."${name}" t`,
        );
        expect(
          { rows: row!.rows, hash: createHash('sha256').update(row!.contents).digest('hex') },
          name,
        ).toEqual(receipt);
      }
      const [tables] =
        await restored.sql`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'petros_document_%' AND tablename<>'petros_document_lesson_outlines'`;
      expect(tables!.n).toBe(0);
      expect(await f.ledgerHash()).toBe(ledgerBefore);
    }, 30000);
  },
);
