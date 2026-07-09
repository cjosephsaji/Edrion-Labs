import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { createDatabase, closeDatabase } from './client';
import { sql } from 'drizzle-orm';

async function main() {
  const db = createDatabase();
  console.log('→ Starting database login cleanup...');

  const appendOnlyTables = [
    'audit_events',
    'security_events',
    'activity_events',
    'webhook_deliveries',
    'parent_emergency_broadcasts',
    'gate_exit_events',
    'parent_digest_deliveries',
    'learning_events',
    'learn_ai_calls',
    'flashcard_reviews',
    'achievement_awards'
  ];

  await db.transaction(async (tx) => {
    // 1. Disable triggers on append-only tables to allow cascade deletes
    console.log('→ Temporarily disabling triggers on append-only tables...');
    for (const table of appendOnlyTables) {
      await tx.execute(sql.raw(`ALTER TABLE ${table} DISABLE TRIGGER ALL`));
    }

    // 2. Delete students who do not have a proper portal login
    console.log('→ Deleting students without a proper login...');
    const deleteStudents = await tx.execute(sql`
      DELETE FROM students
      WHERE institution_user_id IS NULL
         OR institution_user_id NOT IN (
           SELECT id FROM institution_users
           WHERE status = 'active'
             AND password_hash IS NOT NULL
             AND activated_at IS NOT NULL
         )
    `);
    console.log(`✓ Deleted students without proper login.`);

    // 3. Delete staff who do not have a proper portal login
    console.log('→ Deleting staff without a proper login...');
    const deleteStaff = await tx.execute(sql`
      DELETE FROM staff
      WHERE institution_user_id IS NULL
         OR institution_user_id NOT IN (
           SELECT id FROM institution_users
           WHERE status = 'active'
             AND password_hash IS NOT NULL
             AND activated_at IS NOT NULL
         )
    `);
    console.log(`✓ Deleted staff without proper login.`);

    // 4. Delete institution users who do not have a proper portal login
    console.log('→ Deleting institution_users without a proper login...');
    const deleteUsers = await tx.execute(sql`
      DELETE FROM institution_users
      WHERE status != 'active'
         OR password_hash IS NULL
         OR activated_at IS NULL
    `);
    console.log(`✓ Deleted institution_users without proper login.`);

    // 5. Delete academic terms whose names contain the word "bad" (case-insensitive)
    console.log('→ Deleting academic terms containing "bad"...');
    const deleteBadTerms = await tx.execute(sql`
      DELETE FROM academic_terms
      WHERE name ILIKE '%bad%'
    `);
    console.log(`✓ Deleted academic terms containing "bad".`);

    // 6. Re-enable triggers on append-only tables
    console.log('→ Re-enabling triggers on append-only tables...');
    for (const table of appendOnlyTables) {
      await tx.execute(sql.raw(`ALTER TABLE ${table} ENABLE TRIGGER ALL`));
    }
  });

  console.log('✓ Database cleanup complete!');
  await closeDatabase();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
