import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { sql } from 'drizzle-orm';
import { createDatabase, closeDatabase } from './client';

/** Tables guarded by edrion_block_mutation(); DELETE/TRUNCATE must disable triggers first. */
const APPEND_ONLY_TABLES = [
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
  'achievement_awards',
] as const;

const SUPER_ADMIN_EMAIL = 'owner@edrion.dev';

async function clearUsers() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the destructive clear with NODE_ENV=production');
  }

  const db = createDatabase();
  console.log('→ Clearing database (keeping super admin only)…');

  await db.transaction(async (tx) => {
    console.log('→ Temporarily disabling append-only triggers…');
    for (const table of APPEND_ONLY_TABLES) {
      await tx.execute(sql.raw(`ALTER TABLE ${table} DISABLE TRIGGER ALL`));
    }

    console.log('→ Removing platform employees except super admin…');
    await tx.execute(sql`
      DELETE FROM platform_employees
      WHERE email != ${SUPER_ADMIN_EMAIL}
    `);

    console.log('→ Clearing institutions (cascades tenant data)…');
    await tx.execute(sql`DELETE FROM institutions`);

    console.log('→ Clearing independent users…');
    await tx.execute(sql`DELETE FROM independent_users`);

    console.log('→ Clearing registration requests…');
    await tx.execute(sql`DELETE FROM institution_registration_requests`);

    console.log('→ Clearing auth sessions…');
    await tx.execute(sql`DELETE FROM auth_sessions`);

    console.log('→ Truncating append-only log tables…');
    await tx.execute(
      sql.raw(`TRUNCATE TABLE ${APPEND_ONLY_TABLES.join(', ')} RESTART IDENTITY CASCADE`),
    );

    console.log('→ Re-enabling append-only triggers…');
    for (const table of APPEND_ONLY_TABLES) {
      await tx.execute(sql.raw(`ALTER TABLE ${table} ENABLE TRIGGER ALL`));
    }
  });

  console.log(`✓ Database clear complete — super admin preserved (${SUPER_ADMIN_EMAIL}).`);
  await closeDatabase();
}

clearUsers().catch((err) => {
  console.error('Clear failed:', err);
  process.exit(1);
});
