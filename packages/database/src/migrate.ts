import dotenv from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { runVisualCanvasesV1Backfill } from './data-migrations/visual-canvases-v1';
import * as schema from './schema/index';

/**
 * Runs generated Drizzle migrations, then applies any hand-written SQL in `migrations/sql/`
 * (grants, RLS, append-only enforcement) ordered by filename. Uses the migration URL
 * (higher privilege) when available.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load environment variables from the workspace root .env file
dotenv.config({ path: join(root, '..', '..', '.env'), override: true });

async function run() {
  const url =
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL / DATABASE_URL not set');

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  // eslint-disable-next-line no-console
  console.log('→ Applying Drizzle migrations…');
  await migrate(db, { migrationsFolder: join(root, 'migrations') });

  const sqlDir = join(root, 'migrations', 'sql');
  try {
    const files = (await readdir(sqlDir))
      .filter((f) => f.endsWith('.sql') && !f.startsWith('._')) // skip macOS AppleDouble (exFAT)
      .sort();
    for (const f of files) {
      // eslint-disable-next-line no-console
      console.log(`→ Applying post-migration SQL: ${f}`);
      await client.unsafe(await readFile(join(sqlDir, f), 'utf8'));
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // eslint-disable-next-line no-console
  console.log('→ Running visual canvases v1 backfill…');
  const backfillReport = await runVisualCanvasesV1Backfill(db);
  // eslint-disable-next-line no-console
  console.log(
    `✓ Visual canvases backfill: scanned=${backfillReport.scanned} migrated=${backfillReport.migrated} skippedInvalid=${backfillReport.skippedInvalid} orphanEdges=${backfillReport.skippedOrphanEdges}`,
  );

  await client.end();
  // eslint-disable-next-line no-console
  console.log('✓ Migrations complete');
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
