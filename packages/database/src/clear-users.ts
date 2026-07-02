import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { sql } from 'drizzle-orm';
import { createDatabase, closeDatabase } from './client';

async function clearUsers() {
  const db = createDatabase();
  console.log('→ Clearing user/client database tables...');

  // 1. Delete platform employees except the platform owner (owner@edrion.dev)
  await db.execute(sql`
    DELETE FROM platform_employees
    WHERE email != 'owner@edrion.dev'
  `);
  console.log('✓ Cleared platform employees');

  // 2. Delete all institutions (which cascade deletes campuses, institution users, subscriptions, etc.)
  await db.execute(sql`
    DELETE FROM institutions
  `);
  console.log('✓ Cleared institutions (and all cascaded tenant data)');

  // 3. Delete independent users
  await db.execute(sql`
    DELETE FROM independent_users
  `);
  console.log('✓ Cleared independent users');

  // 4. Delete registration requests
  await db.execute(sql`
    DELETE FROM institution_registration_requests
  `);
  console.log('✓ Cleared registration requests');

  // 5. Truncate append-only log tables (which blocks normal DELETEs but allows TRUNCATE)
  await db.execute(sql`
    TRUNCATE TABLE activity_events, audit_events, security_events, webhook_deliveries RESTART IDENTITY CASCADE
  `);
  console.log('✓ Truncated append-only log tables');

  console.log('✓ Database clear complete!');
  await closeDatabase();
}

clearUsers().catch((err) => {
  console.error('Clear failed:', err);
  process.exit(1);
});
