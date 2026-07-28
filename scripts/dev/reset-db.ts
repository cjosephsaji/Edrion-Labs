import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { APP_SCHEMAS } from '@edrion/database/app-schemas';
import { DEV_AUTH_USER_EMAIL_PATTERN } from '@edrion/database/dev-constants';
import { closeDatabase, createDatabase } from '@edrion/database';
import { runDevSeed } from './seed/index.js';
import { printLoginSummary } from './seed/summary.js';
import type { DevSeedContext } from './seed/_context.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

dotenv.config({ path: join(repoRoot, '.env'), override: true });

function parseArgs(argv: string[]): { yes: boolean; noSeed: boolean } {
  return {
    yes: argv.includes('--yes'),
    noSeed: argv.includes('--no-seed'),
  };
}

function assertDevDatabaseGuards(url: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database when NODE_ENV=production');
  }

  const devRef = process.env.DEV_DB_REF?.trim();
  if (!devRef) {
    throw new Error('DEV_DB_REF is not set. Set it in .env to your dev Supabase project ref or local host token.');
  }
  if (!url.includes(devRef)) {
    throw new Error(
      `Connection URL does not contain DEV_DB_REF (${devRef}). Refusing to reset an unexpected target.`,
    );
  }

  const prodRef = process.env.PROD_DB_REF?.trim();
  if (prodRef && url.includes(prodRef)) {
    throw new Error(`Connection URL contains PROD_DB_REF (${prodRef}). Refusing to reset production.`);
  }
}

function resolveTargetHost(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgres:/, 'postgresql:'));
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

async function confirmOrExit(requireYes: boolean): Promise<void> {
  if (requireYes) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Type "reset" to destroy app data and continue: ', resolve);
  });
  rl.close();
  if (answer.trim().toLowerCase() !== 'reset') {
    throw new Error('Aborted.');
  }
}

async function dropAppSchemas(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    // eslint-disable-next-line no-console
    console.log('→ Dropping Drizzle migration tracking schema…');
    await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    for (const schema of APP_SCHEMAS) {
      // eslint-disable-next-line no-console
      console.log(`→ Dropping schema ${schema}…`);
      await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.unsafe(`CREATE SCHEMA ${schema}`);
      await client.unsafe(`GRANT ALL ON SCHEMA ${schema} TO PUBLIC`);
    }
  } finally {
    await client.end();
  }
}

async function purgeDevAuthUsers(url: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    const [{ exists }] = await client<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'
      ) AS exists
    `;
    if (!exists) {
      // eslint-disable-next-line no-console
      console.log('→ auth schema not present; skipping auth.users cleanup');
      return;
    }
    // eslint-disable-next-line no-console
    console.log('→ Removing dev-pattern rows from auth.users…');
    await client.unsafe(
      `DELETE FROM auth.users WHERE email ~* '${DEV_AUTH_USER_EMAIL_PATTERN}'`,
    );
  } finally {
    await client.end();
  }
}

function runMigrations(): void {
  // eslint-disable-next-line no-console
  console.log('→ Running Drizzle migrations…');
  const result = spawnSync('pnpm', ['db:migrate'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('Migration failed');
  }
}

async function main(): Promise<void> {
  const { yes, noSeed } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL / DATABASE_URL is not set');

  assertDevDatabaseGuards(url);
  const host = resolveTargetHost(url);

  // eslint-disable-next-line no-console
  console.log(`\nTarget database host: ${host}`);
  // eslint-disable-next-line no-console
  console.log(`App schemas to reset: ${APP_SCHEMAS.join(', ')}`);
  // eslint-disable-next-line no-console
  console.log(`Seed after migrate: ${noSeed ? 'no' : 'yes'}\n`);

  const nonInteractive = !process.stdin.isTTY;
  if (nonInteractive && !yes) {
    throw new Error('Non-interactive run requires --yes');
  }
  await confirmOrExit(yes);

  await dropAppSchemas(url);
  await purgeDevAuthUsers(url);
  runMigrations();

  if (noSeed) {
    // eslint-disable-next-line no-console
    console.log('\n✓ Database reset complete (schema only, no seed).');
    return;
  }

  const db = createDatabase({ url: process.env.DATABASE_URL ?? url });
  const ctx: DevSeedContext = { db, logins: [] };
  try {
    const logins = await runDevSeed(ctx);
    printLoginSummary(logins);
    // eslint-disable-next-line no-console
    console.log('✓ Database reset and dev seed complete.');
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ db:reset failed:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }
  process.exit(1);
});
