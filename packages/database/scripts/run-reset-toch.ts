import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../../.env') });

const INSTITUTION_ID = '973384e5-cd29-4133-91f5-91f04982303c';

async function main() {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_MIGRATION_URL / DATABASE_URL not set');

  const sql = readFileSync(join(__dirname, 'reset-toch-onboarding.sql'), 'utf8');
  const client = postgres(url, { max: 1 });

  try {
    await client.unsafe(sql);

    const [inst] = await client`
      SELECT display_name, status, onboarding_status, activated_at
      FROM institutions
      WHERE id = ${INSTITUTION_ID}
    `;
    const [counts] = await client`
      SELECT
        (SELECT count(*)::int FROM academic_years WHERE institution_id = ${INSTITUTION_ID}) AS years,
        (SELECT count(*)::int FROM departments WHERE institution_id = ${INSTITUTION_ID}) AS departments,
        (SELECT count(*)::int FROM subjects WHERE institution_id = ${INSTITUTION_ID}) AS subjects,
        (SELECT count(*)::int FROM students WHERE institution_id = ${INSTITUTION_ID}) AS students,
        (SELECT count(*)::int FROM institution_users WHERE institution_id = ${INSTITUTION_ID}) AS users
    `;

    console.log('Reset complete.');
    console.log('Institution:', inst);
    console.log('Counts:', counts);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
