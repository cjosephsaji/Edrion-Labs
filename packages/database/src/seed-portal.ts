/**
 * Institution-Portal demo seed. Idempotent. Attaches a set of demo portal users (one per
 * representative role) to the FIRST seeded institution + its campuses, wiring
 * institution_user_roles and campus_user_access so the portal's permission + scope system has
 * real data to resolve. Safe to run repeatedly.
 *
 *   pnpm --filter @edrion/database seed:portal
 *
 * Requires the platform seed to have run first (it creates the institutions + campuses).
 * Log in to the portal in dev with any email below via the x-institution-user-email header
 * (PORTAL_AUTH_DEV_HEADER=true). Default web user: owner@greenwood.edu.
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { and, asc, eq, schema as s } from './index';
import { createDatabase } from './client';

interface DemoUser {
  email: string;
  fullName: string;
  roleKey: string;
  /** Number of campuses (from the start of the campus list) this user may access. 0 = none / wide. */
  campusCount: number;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'owner@greenwood.edu', fullName: 'Olivia Owner', roleKey: 'institution_owner', campusCount: 0 },
  { email: 'admin@greenwood.edu', fullName: 'Adam Admin', roleKey: 'institution_admin', campusCount: 0 },
  { email: 'campus.north@greenwood.edu', fullName: 'Cara Campus', roleKey: 'campus_admin', campusCount: 1 },
  { email: 'principal@greenwood.edu', fullName: 'Pat Principal', roleKey: 'principal', campusCount: 1 },
  { email: 'finance@greenwood.edu', fullName: 'Fred Finance', roleKey: 'finance_manager', campusCount: 0 },
  { email: 'hr@greenwood.edu', fullName: 'Hira HR', roleKey: 'hr_manager', campusCount: 0 },
  { email: 'teacher@greenwood.edu', fullName: 'Tina Teacher', roleKey: 'teacher', campusCount: 1 },
  { email: 'parent@greenwood.edu', fullName: 'Paul Parent', roleKey: 'parent', campusCount: 1 },
  { email: 'student@greenwood.edu', fullName: 'Sam Student', roleKey: 'student', campusCount: 1 },
];

async function main() {
  const db = createDatabase();

  // The first institution (lowest createdAt) + its campuses.
  const [institution] = await db
    .select({ id: s.institutions.id, name: s.institutions.displayName })
    .from(s.institutions)
    .orderBy(asc(s.institutions.createdAt))
    .limit(1);

  if (!institution) {
    throw new Error('No institutions found. Run the platform seed first (pnpm db:seed).');
  }

  const campuses = await db
    .select({ id: s.campuses.id, name: s.campuses.name })
    .from(s.campuses)
    .where(eq(s.campuses.institutionId, institution.id))
    .orderBy(asc(s.campuses.code));

  // eslint-disable-next-line no-console
  console.log(`→ Seeding portal users for "${institution.name}" (${campuses.length} campuses)…`);

  for (const demo of DEMO_USERS) {
    const email = demo.email.toLowerCase();

    // Upsert the institution user (unique per institution+email).
    const [existing] = await db
      .select({ id: s.institutionUsers.id })
      .from(s.institutionUsers)
      .where(and(eq(s.institutionUsers.institutionId, institution.id), eq(s.institutionUsers.email, email)))
      .limit(1);

    let userId = existing?.id;
    if (!userId) {
      const [created] = await db
        .insert(s.institutionUsers)
        .values({ institutionId: institution.id, email, fullName: demo.fullName, status: 'active' })
        .returning({ id: s.institutionUsers.id });
      userId = created?.id;
    }
    if (!userId) continue;

    // Reset roles to exactly this demo role.
    await db.delete(s.institutionUserRoles).where(eq(s.institutionUserRoles.institutionUserId, userId));
    await db.insert(s.institutionUserRoles).values({ institutionUserId: userId, roleKey: demo.roleKey });

    // Reset + grant campus access for confined users.
    await db.delete(s.campusUserAccess).where(eq(s.campusUserAccess.institutionUserId, userId));
    if (demo.campusCount > 0) {
      const grantTo = campuses.slice(0, demo.campusCount);
      for (const c of grantTo) {
        await db
          .insert(s.campusUserAccess)
          .values({ institutionUserId: userId, campusId: c.id, accessLevel: 'manage' });
      }
    }

    // eslint-disable-next-line no-console
    console.log(`  ✓ ${email} → ${demo.roleKey}${demo.campusCount ? ` (+${demo.campusCount} campus)` : ''}`);
  }

  // eslint-disable-next-line no-console
  console.log('✓ Portal demo users seeded.');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Portal seed failed:', err);
  process.exit(1);
});
