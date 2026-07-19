import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { eq, sql } from 'drizzle-orm';
import { PERMISSIONS, DEFAULT_ROLES, WILDCARD_PERMISSION, ALL_PERMISSION_KEYS } from '@edrion/permissions';
import { createDatabase, closeDatabase } from './client';
import * as s from './schema/index';

/**
 * Dev-only bcrypt hash of the password `password` (cost 10), so the seeded owner can sign in via the
 * native email+password login locally without a hosted Supabase. NEVER use in production.
 */
const DEV_PASSWORD_HASH = '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';

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
  // TRUNCATE … CASCADE clears every seeded table + dependents in one shot, making the seed
  // idempotent. Requires a privileged connection (dev uses the Postgres superuser URL).
  await db.execute(sql`TRUNCATE TABLE
    institutions, plans, independent_users, feature_definitions,
    platform_employees, platform_roles, platform_permissions,
    activity_events, audit_events, security_events,
    ai_policies, ai_action_rules
    RESTART IDENTITY CASCADE`);

  // eslint-disable-next-line no-console
  console.log('→ Seeding permissions catalogue…');
  await db
    .insert(s.platformPermissions)
    .values(PERMISSIONS.map((p) => ({ key: p.key, group: p.group, description: p.description, sensitive: p.sensitive ?? false })))
    .onConflictDoNothing();

  // eslint-disable-next-line no-console
  console.log('→ Seeding roles…');
  for (const role of DEFAULT_ROLES) {
    const [row] = await db
      .insert(s.platformRoles)
      .values({ key: role.key, name: role.name, description: role.description, isSystem: true })
      .onConflictDoNothing()
      .returning();
    const roleId =
      row?.id ??
      (await db.select().from(s.platformRoles).where(eq(s.platformRoles.key, role.key)))[0]?.id;
    if (!roleId) continue;
    const keys = role.permissions.includes(WILDCARD_PERMISSION)
      ? [...ALL_PERMISSION_KEYS]
      : role.permissions;
    if (keys.length) {
      await db
        .insert(s.platformRolePermissions)
        .values(keys.map((permissionKey) => ({ roleId, permissionKey })))
        .onConflictDoNothing();
    }
  }

  // eslint-disable-next-line no-console
  console.log('→ Seeding platform owner employee…');
  const [owner] = await db
    .insert(s.platformEmployees)
    .values({
      // Stable Supabase auth subject so the JWT (sub → auth_user_id) login path is reproducible
      // in local smokes without a hosted Supabase instance.
      authUserId: '00000000-0000-0000-0000-000000000001',
      email: 'owner@edrion.dev',
      fullName: 'Platform Owner',
      title: 'Platform Owner',
      status: 'active',
      // Dev password login: owner@edrion.dev / password (see DEV_PASSWORD_HASH).
      passwordHash: DEV_PASSWORD_HASH,
      mfaEnrolled: true,
      // Dev convenience: fresh recent-auth so sensitive actions aren't blocked before the
      // MFA re-auth flow exists. In production this is set by an actual authentication.
      lastAuthAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  const ownerRole = (
    await db.select().from(s.platformRoles).where(eq(s.platformRoles.key, 'platform_owner'))
  )[0];
  if (owner && ownerRole) {
    await db
      .insert(s.employeeRoleAssignments)
      .values({ employeeId: owner.id, roleId: ownerRole.id })
      .onConflictDoNothing();
  }

  // eslint-disable-next-line no-console
  console.log('→ Seeding plans…');
  const [plan] = await db
    .insert(s.plans)
    .values({ key: 'institution_standard', name: 'Institution Standard', audience: 'institution', status: 'published' })
    .onConflictDoNothing()
    .returning();
  const planId =
    plan?.id ??
    (await db.select().from(s.plans).where(eq(s.plans.key, 'institution_standard')))[0]?.id;
  let planVersionId: string | undefined;
  if (planId) {
    const [pv] = await db
      .insert(s.planVersions)
      .values({
        planId,
        version: 1,
        status: 'published',
        currency: 'USD',
        monthlyPriceMinor: 49900,
        annualPriceMinor: 499000,
        baseCampusAllowance: 2,
        perCampusPriceMinor: 9900,
        trialDays: 30,
        publishedAt: new Date(),
      })
      .returning();
    planVersionId = pv?.id;
  }

  // eslint-disable-next-line no-console
  console.log('→ Seeding institutions + campuses + subscriptions…');
  const samples = [
    { name: 'Riverside Public School', type: 'school', country: 'US', status: 'active', campuses: 3 },
    { name: 'Northgate College', type: 'college', country: 'GB', status: 'trial', campuses: 1 },
    { name: 'Lakeside Academy', type: 'school', country: 'AE', status: 'onboarding', campuses: 2 },
    { name: 'Summit University', type: 'university', country: 'IN', status: 'past_due', campuses: 5 },
  ] as const;

  let n = 1;
  let firstInstitutionId: string | undefined;
  for (const sample of samples) {
    const publicId = `INST-${String(1000 + n).padStart(5, '0')}`;
    const [inst] = await db
      .insert(s.institutions)
      .values({
        publicId,
        legalName: `${sample.name} Trust`,
        displayName: sample.name,
        type: sample.type,
        country: sample.country,
        timezone: 'UTC',
        currency: 'USD',
        status: sample.status,
        onboardingStatus: sample.status === 'onboarding' ? 'in_progress' : 'completed',
        supportTier: 'standard',
        primaryContact: { name: 'Priya Menon', email: `admin@${slug(sample.name)}.edu` },
        activatedAt: sample.status === 'active' ? new Date() : null,
        trialEndsAt: sample.status === 'trial' ? daysFromNow(5) : null,
        riskFlags: sample.status === 'past_due' ? ['payment_failed'] : [],
      })
      .returning();
    if (!inst) continue;
    firstInstitutionId ??= inst.id;

    for (let c = 1; c <= sample.campuses; c++) {
      const included = c <= 2;
      await db.insert(s.campuses).values({
        institutionId: inst.id,
        name: c === 1 ? 'Main Campus' : `Campus ${c}`,
        code: `C${c}`,
        isActive: true,
        billingStatus: included ? 'included' : 'paid_addon',
        addonPriceMinor: included ? null : 9900,
        currentUserCount: 20 * c,
      });
    }

    if (planVersionId) {
      await db.insert(s.subscriptions).values({
        institutionId: inst.id,
        planVersionId,
        status: sample.status === 'past_due' ? 'past_due' : sample.status === 'trial' ? 'trial' : 'active',
        billingCycle: 'monthly',
        currency: 'USD',
        periodStart: new Date(),
        periodEnd: daysFromNow(30),
        trialEndsAt: sample.status === 'trial' ? daysFromNow(5) : null,
      });
    }

    await db.insert(s.institutionUsers).values({
      institutionId: inst.id,
      email: `admin@${slug(sample.name)}.edu`,
      fullName: 'Priya Menon',
      status: 'active',
      // Dev password login: admin@<slug>.edu / password (see DEV_PASSWORD_HASH).
      passwordHash: DEV_PASSWORD_HASH,
      activatedAt: new Date(),
    });

    await db.insert(s.activityEvents).values({
      category: 'institutions',
      actorName: 'Platform Owner',
      summary: `Institution ${sample.name} seeded with status ${sample.status}`,
      institutionId: inst.id,
      entityType: 'institution',
      entityId: inst.id,
    });
    n++;
  }

  // eslint-disable-next-line no-console
  console.log('→ Seeding feature registry…');
  // Keep student.* keys in sync with migration 0049 / 0075 — TRUNCATE above wipes them.
  const features = [
    {
      key: 'ai_copilot',
      name: 'AI Copilot',
      module: 'copilot',
      defaultValue: false,
      releaseStage: 'beta',
      owner: 'Product',
      availableScopes: ['global', 'plan', 'institution', 'institution_user'],
    },
    {
      key: 'advanced_analytics',
      name: 'Advanced Analytics',
      module: 'analytics',
      defaultValue: true,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['global', 'plan', 'institution'],
    },
    {
      key: 'realtime_attendance',
      name: 'Realtime Attendance',
      module: 'attendance',
      defaultValue: false,
      releaseStage: 'alpha',
      owner: 'Platform',
      availableScopes: ['global', 'institution', 'campus'],
    },
    {
      key: 'student.portal',
      name: 'Student portal',
      module: 'student-portal',
      defaultValue: true,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.surface.fees',
      name: 'Fees surface',
      module: 'student-portal',
      defaultValue: false,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.surface.transport',
      name: 'Transport surface',
      module: 'student-portal',
      defaultValue: false,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.surface.hostel',
      name: 'Hostel surface',
      module: 'student-portal',
      defaultValue: false,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.surface.documents',
      name: 'Documents surface',
      module: 'student-portal',
      defaultValue: false,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.surface.content',
      name: 'Content pages surface',
      module: 'student-portal',
      defaultValue: false,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.surface.exams',
      name: 'Exams surface',
      module: 'student-portal',
      defaultValue: false,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.expert_mode',
      name: 'Expert mode',
      module: 'student-portal',
      defaultValue: true,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution_user'],
    },
    {
      key: 'student.learn.engine',
      name: 'Learn engine',
      module: 'student-portal',
      defaultValue: true,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution', 'campus', 'institution_user'],
    },
    {
      key: 'student.lab.debate_friend',
      name: 'Debate friend mode',
      module: 'student-portal',
      defaultValue: true,
      releaseStage: 'ga',
      owner: 'Product',
      availableScopes: ['institution_user'],
    },
  ] as const;
  for (const f of features) {
    const [fd] = await db
      .insert(s.featureDefinitions)
      .values({
        key: f.key,
        name: f.name,
        module: f.module,
        defaultValue: f.defaultValue,
        releaseStage: f.releaseStage,
        owner: f.owner,
        availableScopes: [...f.availableScopes] as never,
        status: 'active',
      })
      .onConflictDoNothing()
      .returning();
    if (!fd) continue;
    // An institution-scoped override + a percentage rollout so the Effective-Value preview has data.
    if (f.key === 'ai_copilot' && firstInstitutionId) {
      await db.insert(s.featureAssignments).values({
        featureId: fd.id,
        scope: 'institution',
        scopeId: firstInstitutionId,
        value: true,
        enabled: true,
        reason: 'Pilot programme',
        setByName: 'Platform Owner',
      });
      await db.insert(s.featureRollouts).values({
        featureId: fd.id,
        type: 'percentage',
        enabled: true,
        percentage: 25,
        reason: 'Gradual rollout',
        setByName: 'Platform Owner',
      });
    }
  }

  await db.insert(s.independentUsers).values([
    { email: 'lea@example.com', fullName: 'Lea Park', country: 'US', signupSource: 'web', status: 'active' },
    { email: 'sam@example.com', fullName: 'Sam Idris', country: 'GB', signupSource: 'ios', status: 'active' },
  ]).onConflictDoNothing();

  // eslint-disable-next-line no-console
  console.log('→ Seeding AI governance policy…');
  // Global baseline: Copilot can act in full mode but every state change still needs a human
  // confirmation; sensitive money/permission moves escalate to a second approver. Kill switch off.
  await db.insert(s.aiPolicies).values({
    scope: 'global',
    scopeId: null,
    enabled: true,
    mode: 'full',
    capabilities: {
      search: true,
      analysis: true,
      recommendations: true,
      report: true,
      drafting: true,
      record_create: true,
      record_edit: true,
      billing: true,
      user: true,
      permission: true,
      institution_access: true,
      feature: true,
      communications: true,
    } as never,
    maxFinancialImpactMinor: 500_000,
    maxAffectedUsers: 5000,
    twoPersonThresholdMinor: 100_000,
    secondApproverCapabilities: ['billing', 'permission', 'institution_access'] as never,
    killSwitch: false,
    reason: 'Initial global AI governance baseline',
    setByName: 'Platform Owner',
  }).onConflictDoNothing();
  // Action rules: feature kill switches and refunds always need two-person approval.
  await db.insert(s.aiActionRules).values([
    { capability: 'feature', action: 'feature.kill_switch', effect: 'require_second_approver', riskLevel: 'critical', description: 'Feature kill switches require two-person approval', setByName: 'Platform Owner' },
    { capability: 'billing', action: 'billing.refund', effect: 'require_second_approver', riskLevel: 'high', description: 'Refunds require two-person approval', setByName: 'Platform Owner' },
  ]).onConflictDoNothing();

  // eslint-disable-next-line no-console
  console.log('✓ Seed complete');
  await closeDatabase();
}

function slug(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
