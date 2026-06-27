import dotenv from 'dotenv';
import { join } from 'path';

// Load env variables from workspace root
dotenv.config({ path: join(__dirname, '../../.env') });

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config. `generate` produces SQL migrations from the schema without a live DB;
 * `migrate`/`studio` use DATABASE_MIGRATION_URL (higher privilege) when present.
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_MIGRATION_URL ??
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/edrion',
  },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
