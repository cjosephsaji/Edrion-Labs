import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { AuditWriter } from '@edrion/audit';
import {
  assertRestrictedApplicationDatabase,
  createTenantAwareDatabase,
  schema,
  type Database,
} from '@edrion/database';

export type Phase2TestDatabase = {
  adminSql: ReturnType<typeof postgres>;
  appSql: ReturnType<typeof postgres>;
  /** Drizzle routed through the non-superuser edrion_app connection. */
  db: Database;
  tenantDb: Database;
  auditWriter: AuditWriter;
  directory: string;
  close: () => Promise<void>;
};

/** Observe a real competing transaction, rather than guessing an interleaving from a delay. */
export async function waitForPhase2AdvisoryWait(database: Phase2TestDatabase) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const rows =
      await database.adminSql`select pid from pg_locks where locktype='advisory' and not granted`;
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected competing advisory-lock waiter was not observed');
}

/**
 * Starts a private PostgreSQL cluster for opted-in integration tests. It never reads
 * application .env/DATABASE_URL, listens only on a private Unix socket, and applies
 * the checked-in journal plus post-migration SQL before returning the restricted app DB.
 */
export async function startPhase2TestDatabase(
  options: { deferM1?: boolean; deferM4?: boolean; temporaryRoot?: string } = {},
): Promise<Phase2TestDatabase> {
  const directory = mkdtempSync(join(options.temporaryRoot ?? tmpdir(), 'petros-phase2-test-'));
  const dataDirectory = join(directory, 'data');
  const logPath = join(directory, 'postgres.log');
  let serverStarted = false;
  let adminSql: ReturnType<typeof postgres> | undefined;
  let appSql: ReturnType<typeof postgres> | undefined;
  let closed = false;
  const stop = async () => {
    if (closed) return;
    closed = true;
    await appSql?.end({ timeout: 5 }).catch(() => undefined);
    await adminSql?.end({ timeout: 5 }).catch(() => undefined);
    if (serverStarted) {
      try {
        execFileSync('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], {
          stdio: 'pipe',
        });
      } catch {
        /* cleanup continues; preserve the test's original failure */
      }
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
      ['-D', dataDirectory, '-l', logPath, '-o', `-F -k ${directory} -h ''`, '-w', 'start'],
      { stdio: 'pipe' },
    );
    serverStarted = true;

    adminSql = postgres({
      host: directory,
      username: 'petros_test',
      database: 'postgres',
      max: 4,
      onnotice: () => {},
    });
    await adminSql.unsafe('CREATE ROLE edrion_app LOGIN NOBYPASSRLS');

    const migrationsDirectory = join(__dirname, '../../../../../packages/database/migrations');
    // Historical migration DDL references tenant helpers before the full RLS SQL runs.
    const rlsSql = readFileSync(join(migrationsDirectory, 'sql/zzz_rls.sql'), 'utf8');
    const institutionsMarker = rlsSql.indexOf('-- institutions:');
    if (institutionsMarker < 0) throw new Error('PHASE2_TEST_RLS_BOOTSTRAP_MARKER_MISSING');
    await adminSql.unsafe(rlsSql.slice(0, institutionsMarker));

    // Work on a private copy because Drizzle's migrator writes its journal table there.
    const privateMigrationsDirectory = join(directory, 'packages/database/migrations');
    cpSync(migrationsDirectory, privateMigrationsDirectory, { recursive: true });
    if (options.deferM1 || options.deferM4) {
      const journalPath = join(privateMigrationsDirectory, 'meta/_journal.json');
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
      // Only the exclusively allocated test copy is changed; historical receipts are genuine
      // executions of the same original migration bytes, never invented ledger rows.
      const deferred = options.deferM1
        ? [
            '0235_petros_v2_content_identity',
            '0236_petros_m2_preparation_progress',
            '0237_petros_v2_session_assessment',
            '0238_petros_v2_teaching_beliefs',
          ]
        : ['0237_petros_v2_session_assessment', '0238_petros_v2_teaching_beliefs'];
      journal.entries = journal.entries.filter((e: { tag: string }) => !deferred.includes(e.tag));
      writeFileSync(journalPath, JSON.stringify(journal));
    }
    // Explicit opt-in exercises the complete review SQL in this newly initialized
    // private cluster. It never modifies the checkout's automatic migration tree.
    const repaired = process.env.PETROS_READINESS_PROPOSAL_TESTS === '1';
    if (repaired) {
      if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL)
        throw new Error('M0R_CONFIGURED_TARGET_ENV_REFUSED');
      execFileSync(
        'git',
        [
          'apply',
          '--include=packages/database/migrations/*',
          '--include=packages/database/migrations/sql/*',
          '--include=packages/database/migrations/meta/*',
          join(__dirname, '../../../../../docs/verification/petros-v2/proposed-production.diff'),
        ],
        {
          cwd: directory,
          stdio: 'pipe',
        },
      );
    }
    const migrationDb = drizzle(adminSql, { schema });
    await migrate(migrationDb, { migrationsFolder: privateMigrationsDirectory });

    const sqlDirectory = join(privateMigrationsDirectory, 'sql');
    for (const filename of readdirSync(sqlDirectory)
      .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
      .sort()) {
      await adminSql.unsafe(readFileSync(join(sqlDirectory, filename), 'utf8'));
    }
    // Test-only authority for opt-in synthetic instrumentation. Never installed in application DDL.
    await adminSql.unsafe(
      'CREATE FUNCTION edrion_petros_synthetic_fixture() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$',
    );

    appSql = postgres({
      host: directory,
      username: 'edrion_app',
      database: 'postgres',
      max: 6,
      connection: { statement_timeout: 4_000, lock_timeout: 3_000 },
      onnotice: () => {},
    });
    const db = createTenantAwareDatabase(drizzle(appSql, { schema }));
    if (repaired) await assertRestrictedApplicationDatabase(db);
    return {
      adminSql,
      appSql,
      db,
      tenantDb: db,
      auditWriter: new AuditWriter(db),
      directory,
      close: stop,
    };
  } catch (error) {
    const startupLog =
      !serverStarted && existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-4000) : null;
    await stop();
    if (startupLog)
      throw new Error(`Disposable PostgreSQL startup failed: ${startupLog}`, { cause: error });
    throw error;
  }
}
