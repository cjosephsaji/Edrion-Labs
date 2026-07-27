import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { createDatabase, closeDatabase } from './client';
import { runLegacyDevelopmentSeed, truncateLegacySeedTables } from './seed-platform';

/**
 * Development seed. Resets app tables (NOT a production operation) and inserts a coherent
 * dataset: permission catalogue, roles, a platform owner, plans, institutions with campuses +
 * subscriptions, sample users and a few activity rows. Re-runnable.
 */
async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the destructive seed with NODE_ENV=production');
  }
  const db = createDatabase();

  // eslint-disable-next-line no-console
  console.log('→ Resetting tables (dev only)…');
  await truncateLegacySeedTables(db);

  // eslint-disable-next-line no-console
  console.log('→ Seeding platform catalogue…');
  await runLegacyDevelopmentSeed(db);

  // eslint-disable-next-line no-console
  console.log('✓ Seed complete');
  await closeDatabase();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
