import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { closeDatabase, createDatabase } from '@edrion/database';
import { runDevSeed } from './seed/index.js';
import { printLoginSummary } from './seed/summary.js';
import type { DevSeedContext } from './seed/_context.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDatabase({ url });
  const ctx: DevSeedContext = { db, logins: [] };
  try {
    const logins = await runDevSeed(ctx);
    printLoginSummary(logins);
    // eslint-disable-next-line no-console
    console.log('✓ Dev seed complete.');
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ db:seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
