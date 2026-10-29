/** M0-R Phase A. No dotenv, URL input, app bootstrap, migrator or provider calls.
 * env -u DATABASE_URL -u DATABASE_MIGRATION_URL pnpm --filter @edrion/database exec tsx
 *   --tsconfig ../../apps/api/tsconfig.json ../../apps/api/scripts/rehearse-petros-v2-readiness-repair.ts
 */
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { createTenantAwareDatabase, schema, type Database } from '@edrion/database';
import { runVisualCanvasesV1Backfill } from '../../../packages/database/src/data-migrations/visual-canvases-v1';
import {
  assertRestrictedApplicationDatabase,
  bindReadinessScope,
} from './petros-v2-readiness-runtime-candidate';
import { publishKnowledgeExtraction } from '../src/modules/student/knowledge/knowledge-document.service';

const root = resolve(__dirname, '../../..');
const migrations = join(root, 'packages/database/migrations');
const digest = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
type Sql = ReturnType<typeof postgres>;
export const documentTables = [
  'petros_document_source_revisions',
  'petros_document_preparations',
  'petros_document_lesson_artifacts',
  'petros_document_learner_paths',
] as const;

export function refuseApplicationTargets(args: string[] = []) {
  if (
    process.env.DATABASE_URL ||
    process.env.DATABASE_MIGRATION_URL ||
    Object.entries(process.env).some(([key, value]) => key.startsWith('PG') && value) ||
    args.length
  )
    throw new Error(
      'M0R_TARGET_REFUSED: clear application/PG targets; external targets and arguments are unsupported',
    );
}

/** Reconstruct the branch that is actually installed, not a fresh merged schema.
 * Historical hashes are engineering fixtures, never alleged production receipts.
 */
export async function startReadinessRehearsal() {
  refuseApplicationTargets();
  const directory = mkdtempSync(join(tmpdir(), 'petros-m0r-'));
  const dataDirectory = join(directory, 'data');
  const databaseName = `petros_m0r_${randomBytes(12).toString('hex')}`;
  const clients: Sql[] = [];
  let running = false;
  const connect = (username: string, database = databaseName) => {
    const db = postgres({
      host: directory,
      username,
      database,
      max: username === 'edrion_app' ? 4 : 1,
      prepare: false,
      connect_timeout: 5,
      onnotice: () => {},
      connection: { statement_timeout: 15000, lock_timeout: 2000 },
    });
    clients.push(db);
    return db;
  };
  const close = async () => {
    await Promise.all(clients.map((c) => c.end({ timeout: 5 }).catch(() => undefined)));
    if (running) {
      // Preserve files if PostgreSQL cannot be stopped: never remove a running cluster.
      execFileSync('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
      running = false;
    }
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    execFileSync(
      'initdb',
      ['-D', dataDirectory, '-U', 'petros_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'],
      { stdio: 'pipe' },
    );
    execFileSync(
      'pg_ctl',
      [
        '-D',
        dataDirectory,
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
    const bootstrap = connect('petros_test', 'postgres');
    await bootstrap.unsafe(`CREATE DATABASE "${databaseName}"`);
    const admin = connect('petros_test');
    await admin.unsafe('CREATE ROLE edrion_app LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT');
    const rls = readFileSync(join(migrations, 'sql/zzz_rls.sql'), 'utf8');
    const marker = rls.indexOf('-- institutions:');
    if (marker < 0) throw new Error('M0R_RLS_BOOTSTRAP_MARKER_MISSING');
    await admin.unsafe(rls.slice(0, marker));
    await admin.unsafe(
      'CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint)',
    );
    const journal = JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')) as {
      entries: { tag: string; when: number }[];
    };
    for (const entry of journal.entries) {
      if (
        [
          '0208_petros_document_teaching_plans',
          '0209_petros_document_learning_path',
          '0233_petros_teacher_guidance',
        ].includes(entry.tag)
      )
        continue;
      let text = readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8');
      let when = entry.when;
      if (entry.tag === '0190_petros_quality_harness') {
        text = text.replaceAll('seed bigint', 'seed integer');
        if (digest(text) !== 'd5b1aa14dc4e337de1fe84e7ea4b79ea954a969f965d19e59bf4a48a7d0e95a5')
          throw new Error('M0R_HISTORICAL_QUALITY_HASH_CHANGED');
      }
      if (entry.tag === '0208_knowledge_extraction_versions') when = 1789800700000;
      if (entry.tag === '0209_knowledge_preparations') when = 1789800800000;
      await admin.begin(async (tx) => {
        for (const statement of text.split('--> statement-breakpoint')) await tx.unsafe(statement);
        await tx`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${digest(text)},${when})`;
      });
    }
    // Reproduce documented separately applied guidance DDL without inventing a journal row.
    await admin.unsafe(readFileSync(join(migrations, '0233_petros_teacher_guidance.sql'), 'utf8'));
    const replayStandalone = async () => {
      for (const name of readdirSync(join(migrations, 'sql'))
        .filter((n) => n.endsWith('.sql') && !n.startsWith('._'))
        .sort())
        await admin.unsafe(readFileSync(join(migrations, 'sql', name), 'utf8'));
    };
    await replayStandalone();
    const db = drizzle(admin, { schema });
    const institutionA = randomUUID(),
      institutionB = randomUUID();
    for (const id of [institutionA, institutionB])
      await db.insert(schema.institutions).values({
        id,
        publicId: randomUUID(),
        legalName: 'M0R synthetic historical institution',
        displayName: 'M0R fixture',
        type: 'school',
        country: 'IN',
        primaryContact: { name: 'Fixture', email: 'fixture@example.test' },
      });
    const owners = [];
    for (const institutionId of [institutionA, institutionA, institutionB]) {
      const studentId = randomUUID(),
        userId = randomUUID(),
        itemId = randomUUID(),
        objectId = randomUUID();
      await db.insert(schema.institutionUsers).values({
        id: userId,
        institutionId,
        fullName: 'M0R historical learner',
        email: `${userId}@example.test`,
        status: 'active',
      });
      await db.insert(schema.students).values({
        id: studentId,
        institutionId,
        institutionUserId: userId,
        admissionNo: randomUUID(),
        firstName: 'Synthetic',
        lastName: 'Learner',
      });
      const bytes = Buffer.from('Synthetic public document. No real learner content.');
      const storageKey = `${objectId}.bin`;
      mkdirSync(join(directory, 'assets'), { recursive: true });
      writeFileSync(join(directory, 'assets', storageKey), bytes);
      const previewKey = `${objectId}.preview.txt`;
      writeFileSync(join(directory, 'assets', previewKey), 'Synthetic derived preview.');
      await db.insert(schema.storageObjects).values({
        id: objectId,
        institutionId,
        ownerStudentId: studentId,
        kind: 'pdf',
        driver: 'local',
        storageKey,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        checksumSha256: digest(bytes),
        processingStatus: 'ready',
        derived: { m0rFixturePreview: { storageKey: previewKey } },
      });
      const [item] = await db
        .insert(schema.knowledgeItems)
        .values({
          id: itemId,
          institutionId,
          studentId,
          kind: 'pdf',
          title: 'Historical synthetic source',
          objectIds: [objectId],
          status: 'ready',
          version: 1,
          extractedTextReady: true,
          pageCount: 1,
          pagesDone: 1,
          origin: {
            petrosExtraction: {
              schemaVersion: 'petros.document-source.v1',
              fileSha256: digest(bytes),
              indexing: 'not_built',
              representation: 'pdf_text',
              extractorVersion: 'm0r-fixture.v1',
              truncated: false,
              readable: true,
            },
          },
        })
        .returning();
      await db
        .insert(schema.knowledgeItemPages)
        .values({ itemId, pageIndex: 0, objectId, text: bytes.toString() });
      await db.transaction((tx) => publishKnowledgeExtraction(tx, item!, [bytes.toString()]));
      const sessions: string[] = [];
      for (const status of ['active', 'paused', 'closed']) {
        const id = randomUUID();
        sessions.push(id);
        await db.insert(schema.petrosLearningSessions).values({
          id,
          institutionId,
          studentId,
          status,
          clientRequestId: randomUUID(),
          stateVersion: 'petros.session-state.v3',
          sessionType: 'learn',
          topic: 'Historical V1',
          currentGoal: 'Preserve V1',
          timeBudgetSeconds: 600,
          maxMoves: 8,
          ...(status === 'closed'
            ? { closeReason: 'completed', closedAt: new Date('2026-10-01') }
            : {}),
          checkpoints: [{ id: 'old', label: 'Old checkpoint', status: 'current' }],
          currentCheckpointId: 'old',
          promptVersion: 'historical-v1',
          outputSchemaVersion: 'historical-v1',
          sourceContext: { referenceId: itemId },
        });
        await db.insert(schema.petrosSessionEvents).values({
          sessionId: id,
          institutionId,
          studentId,
          type: 'historical_fixture',
          correlationId: randomUUID(),
          payload: { answer: 'Synthetic historical answer', score: 70 },
        });
        await db.insert(schema.petrosSessionCommands).values({
          sessionId: id,
          institutionId,
          studentId,
          idempotencyKey: randomUUID(),
          command: 'historical_v1',
          status: 'completed',
          response: { preserved: 'Synthetic V1 response' },
          completedAt: new Date('2026-10-01'),
        });
      }
      await db.insert(schema.knowledgeArtifacts).values({
        institutionId,
        studentId,
        itemId,
        kind: 'visual',
        title: 'Historical visual',
        fromLabel: 'Historical source',
        content: {
          layout: 'mind_map',
          nodes: [
            { id: 'a', label: 'Historical topic', detail: 'Synthetic parent concept.' },
            { id: 'b', label: 'Historical child', detail: 'Synthetic child concept.' },
          ],
          edges: [{ from: 'b', to: 'a' }],
        },
      });
      owners.push({
        institutionId,
        studentId,
        userId,
        itemId,
        objectId,
        sessions,
        sourceChecksum: digest(`0:${bytes.toString()}`),
      });
    }
    const independentUserId = randomUUID();
    await db.insert(schema.independentUsers).values({
      id: independentUserId,
      email: `${independentUserId}@example.test`,
      fullName: 'Synthetic independent',
    });
    await db
      .insert(schema.knowledgeCollections)
      .values({ independentUserId, name: 'Independent historical collection' });
    const preservationSubjectId = randomUUID();
    await db.insert(schema.subjects).values({
      id: preservationSubjectId,
      institutionId: institutionA,
      name: 'Synthetic preservation subject',
      code: randomUUID(),
    });
    const [grade] = await db
      .insert(schema.gradeEntries)
      .values({
        institutionId: institutionA,
        studentId: owners[0]!.studentId,
        subjectId: preservationSubjectId,
        assessmentName: 'Synthetic historic mark',
        marksObtained: 70,
        maxMarks: 100,
        published: true,
      })
      .returning();
    await db.insert(schema.markRevisions).values({
      institutionId: institutionA,
      studentId: owners[0]!.studentId,
      gradeEntryId: grade!.id,
      oldScore: 67,
      newScore: 70,
      reasonKind: 'correction',
      note: 'Synthetic historic correction',
    });

    const repairText = readFileSync(join(__dirname, 'petros-v2-readiness-repair.sql'), 'utf8') + '\n' + readFileSync(join(__dirname, 'petros-v2-readiness-phase-b.sql'), 'utf8');
    const applyRepair = async (suffix = '') =>
      admin.begin(async (tx) => {
        await tx.unsafe(
          'CREATE TEMP TABLE petros_m0r_guard(database_name text,data_directory text) ON COMMIT DROP',
        );
        await tx`INSERT INTO petros_m0r_guard VALUES(${databaseName},${dataDirectory})`;
        await tx.unsafe(repairText);
        if (suffix) await tx.unsafe(suffix);
      });
    const snapshot = async () => {
      const tables =
        await admin`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const result: Record<string, { rows: number; hash: string }> = {};
      for (const { tablename } of tables) {
        const [row] = await admin.unsafe(
          `SELECT count(*)::int AS rows, coalesce(jsonb_agg(to_jsonb(t)${tablename === 'petros_document_lesson_outlines' ? "-'lesson_plan'" : ''} ORDER BY to_jsonb(t)::text)::text,'[]') AS contents FROM public."${tablename}" t`,
        );
        result[tablename] = { rows: row!.rows, hash: digest(row!.contents) };
      }
      return result;
    };
    const ledgerHash = async () =>
      digest(
        JSON.stringify(
          await admin`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
        ),
      );
    const backup = async () => {
      const path = join(directory, 'before.dump');
      execFileSync(
        'pg_dump',
        ['-h', directory, '-U', 'petros_test', '-d', databaseName, '-Fc', '-f', path],
        { stdio: 'pipe' },
      );
      const assets = Object.fromEntries(
        readdirSync(join(directory, 'assets')).map((n) => [
          n,
          readFileSync(join(directory, 'assets', n)),
        ]),
      );
      return { path, assets };
    };
    const restore = async (saved: Awaited<ReturnType<typeof backup>>) => {
      const restoredName = `petros_m0r_${randomBytes(12).toString('hex')}`;
      await bootstrap.unsafe(`CREATE DATABASE "${restoredName}"`);
      execFileSync(
        'pg_restore',
        ['-h', directory, '-U', 'petros_test', '-d', restoredName, '--exit-on-error', saved.path],
        { stdio: 'pipe' },
      );
      const assetsDirectory = join(directory, `restored-assets-${restoredName}`);
      mkdirSync(assetsDirectory, { recursive: true });
      for (const [name, bytes] of Object.entries(saved.assets))
        writeFileSync(join(assetsDirectory, name), bytes);
      return { sql: connect('petros_test', restoredName), assetsDirectory };
    };
    const app = connect('edrion_app');
    // This is created before SQL so tests can authenticate directly as a distinct restricted worker.
    await admin.unsafe(
      'CREATE ROLE edrion_petros_document_worker LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE',
    );
    const worker = connect('edrion_petros_document_worker');
    await admin.unsafe('CREATE ROLE edrion_petros_document_evaluator LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE');
    const evaluator = connect('edrion_petros_document_evaluator');
    const tenantDb = createTenantAwareDatabase(drizzle(app, { schema }));
    const backfill = () => runVisualCanvasesV1Backfill(drizzle(admin, { schema }));
    const replayProposedFiles = async () => {
      // Apply the review diff only to exclusively created private copies. Never
      // git apply in the working repository, stage files, or invoke migrate.ts.
      const privateTree = mkdtempSync(join(directory, 'proposal-'));
      const dossier = join(root, 'docs/verification/petros-v2');
      const manifest = JSON.parse(
        readFileSync(join(dossier, 'proposed-production-files.json'), 'utf8'),
      ) as { path: string; newFile: boolean }[];
      for (const item of manifest) {
        if (
          !/^(packages\/(database|config)\/|apps\/api\/src\/)[a-zA-Z0-9_./-]+$/.test(item.path) ||
          item.path.includes('..')
        )
          throw new Error('M0R_PROPOSAL_PATH_REFUSED');
        const destination = join(privateTree, item.path);
        mkdirSync(resolve(destination, '..'), { recursive: true });
        if (!item.newFile) writeFileSync(destination, readFileSync(join(root, item.path)));
      }
      execFileSync('git', ['apply', '--include=packages/database/migrations/*', '--include=packages/database/migrations/sql/*', '--include=packages/database/migrations/meta/*', join(dossier, 'proposed-production.diff')], {
        cwd: privateTree,
        stdio: 'pipe',
      });
      const privateMigrations = join(privateTree, 'packages/database/migrations');
      await admin.begin((tx) =>
        tx.unsafe(
          readFileSync(join(privateMigrations, '0234_petros_readiness_repair.sql'), 'utf8'),
        ),
      );
      for (const name of readdirSync(join(privateMigrations, 'sql'))
        .filter((n) => n.endsWith('.sql'))
        .sort())
        await admin.unsafe(readFileSync(join(privateMigrations, 'sql', name), 'utf8'));
    };
    return {
      admin,
      app,
      worker,
      evaluator,
      tenantDb,
      directory,
      databaseName,
      owners,
      independentUserId,
      applyRepair,
      replayStandalone,
      replayProposedFiles,
      snapshot,
      ledgerHash,
      backup,
      restore,
      backfill,
      repairText,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export type ReadinessRehearsal = Awaited<ReturnType<typeof startReadinessRehearsal>>;

/** Compile the same Drizzle SQL against an already open postgres.js transaction.
 * Drizzle's pool constructor cannot wrap a raw TransactionSql (it lacks options).
 */
export const scopeAdapter = (tx: postgres.TransactionSql) =>
  ({
    execute(query: SQL) {
      const compiled = new PgDialect().sqlToQuery(query);
      const parameters = compiled.params.map((value) => {
        if (typeof value !== 'string') throw new Error('M0R_SCOPE_PARAMETER_REFUSED');
        return value;
      });
      return tx.unsafe(compiled.sql, parameters);
    },
  }) as unknown as Pick<Database, 'execute'>;

/** Shared real-role scoping, deliberately independent of ambient application URLs. */
export async function scoped<T>(
  db: Sql,
  owner: { institutionId?: string; studentId?: string; independentUserId?: string },
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  preparationId = '',
) {
  return db.begin(async (tx) => {
    await bindReadinessScope(scopeAdapter(tx), { ...owner, preparationId });
    return fn(tx);
  }) as Promise<T>;
}

async function main() {
  refuseApplicationTargets(process.argv.slice(2));
  const fixture = await startReadinessRehearsal();
  try {
    const before = await fixture.snapshot(),
      ledgerBefore = await fixture.ledgerHash();
    const saved = await fixture.backup();
    await fixture.applyRepair();
    await fixture.replayProposedFiles();
    await fixture.applyRepair();
    await assertRestrictedApplicationDatabase(fixture.tenantDb);
    const after = await fixture.snapshot();
    const changed = Object.keys(before).filter(
      (t) => JSON.stringify(before[t]) !== JSON.stringify(after[t]),
    );
    if (changed.length || ledgerBefore !== (await fixture.ledgerHash()))
      throw new Error('M0R_HISTORY_CHANGED');
    const first = await fixture.backfill(),
      second = await fixture.backfill();
    if (first.migrated !== 3 || second.migrated !== 0)
      throw new Error('M0R_BACKFILL_NOT_REPEATABLE');
    const restored = await fixture.restore(saved);
    const [counts] = await restored.sql`SELECT count(*)::int AS n FROM petros_learning_sessions`;
    if (counts?.n !== 9) throw new Error('M0R_RESTORE_FAILED');
    const [role] =
      await fixture.app`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
    process.stdout.write(
      JSON.stringify(
        {
          phase: 'M0-R A',
          configuredDatabaseChanged: false,
          gate: 'BLOCKED',
          historicalTablesPreserved: Object.keys(before).length,
          changed,
          ledgerPreserved: true,
          roles: role,
          backfill: { first, second },
          restoredSessions: counts.n,
          repairSha256: digest(fixture.repairText),
          securityTests: 'run the dedicated integration suite',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await fixture.close();
  }
}
if (require.main === module)
  main().catch((error) => {
    // No connection strings, SQL values or raw database errors in command output.
    process.stderr.write(
      `M0R_REHEARSAL_FAILED: ${/^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'SEE_DEDICATED_TESTS'}\n`,
    );
    if (error?.code) process.stderr.write(`Disposable diagnostic: ${error.message}\n`);
    process.exitCode = 1;
  });
