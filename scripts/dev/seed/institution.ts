import { and, eq } from 'drizzle-orm';
import type { Database } from '@edrion/database';
import { schema as s } from '@edrion/database';
import {
  STUDENT_MODULE_CATALOG,
  STUDENT_PORTAL_PRESETS,
  TERMINOLOGY_KEYS,
} from '@edrion/feature-flags';
import { seedInstitutionScheduleDefaults } from '@edrion/database';
import type { DevSeedContext } from './_context.js';
import { GREENWOOD_PUBLIC_ID } from './_context.js';

const PRESET = STUDENT_PORTAL_PRESETS.cbse_k12;

export interface InstitutionSeedResult {
  institutionId: string;
  campusId: string;
  publicId: string;
}

export async function seedInstitution(
  ctx: DevSeedContext,
  planVersionId: string | undefined,
): Promise<InstitutionSeedResult> {
  const { db } = ctx;

  const [existing] = await db
    .select({ id: s.institutions.id })
    .from(s.institutions)
    .where(eq(s.institutions.publicId, GREENWOOD_PUBLIC_ID))
    .limit(1);

  let institutionId = existing?.id;
  if (!institutionId) {
    const [created] = await db
      .insert(s.institutions)
      .values({
        publicId: GREENWOOD_PUBLIC_ID,
        legalName: 'Greenwood Academy Trust',
        displayName: 'Greenwood Academy',
        type: 'school',
        country: 'IN',
        region: 'Kerala',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        status: 'active',
        onboardingStatus: 'completed',
        supportTier: 'standard',
        primaryContact: {
          name: 'Adam Admin',
          email: 'admin@greenwood.edu',
          phone: '+919800000001',
          title: 'Administrator',
        },
        activatedAt: new Date(),
      })
      .returning({ id: s.institutions.id });
    institutionId = created?.id;
  }
  if (!institutionId) throw new Error('Failed to upsert Greenwood Academy institution.');

  const [campusRow] = await db
    .select({ id: s.campuses.id })
    .from(s.campuses)
    .where(and(eq(s.campuses.institutionId, institutionId), eq(s.campuses.code, 'MAIN')))
    .limit(1);

  let campusId = campusRow?.id;
  if (!campusId) {
    const [campus] = await db
      .insert(s.campuses)
      .values({
        institutionId,
        name: 'Main Campus',
        code: 'MAIN',
        isActive: true,
        billingStatus: 'included',
        currentUserCount: 120,
      })
      .returning({ id: s.campuses.id });
    campusId = campus?.id;
  }
  if (!campusId) throw new Error('Failed to upsert Greenwood campus.');

  if (planVersionId) {
    const [sub] = await db
      .select({ id: s.subscriptions.id })
      .from(s.subscriptions)
      .where(eq(s.subscriptions.institutionId, institutionId))
      .limit(1);
    if (!sub) {
      await db.insert(s.subscriptions).values({
        institutionId,
        planVersionId,
        status: 'active',
        billingCycle: 'monthly',
        currency: 'INR',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      });
    }
  }

  await seedInstitutionScheduleDefaults(db, institutionId);
  await applyStudentPortalPreset(ctx, institutionId);

  return { institutionId, campusId, publicId: GREENWOOD_PUBLIC_ID };
}

async function upsertFeatureAssignment(
  db: Database,
  input: { featureId: string; institutionId: string; value: boolean },
): Promise<void> {
  const [existing] = await db
    .select({ id: s.featureAssignments.id })
    .from(s.featureAssignments)
    .where(
      and(
        eq(s.featureAssignments.featureId, input.featureId),
        eq(s.featureAssignments.scope, 'institution'),
        eq(s.featureAssignments.scopeId, input.institutionId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(s.featureAssignments)
      .set({ value: input.value, enabled: true, updatedAt: new Date() })
      .where(eq(s.featureAssignments.id, existing.id));
    return;
  }
  await db.insert(s.featureAssignments).values({
    featureId: input.featureId,
    scope: 'institution',
    scopeId: input.institutionId,
    value: input.value,
    enabled: true,
    reason: 'Dev reset cbse_k12 preset',
    setByName: 'Platform Owner',
  });
}

async function applyStudentPortalPreset(ctx: DevSeedContext, institutionId: string): Promise<void> {
  const { db } = ctx;
  const definitions = await db.select().from(s.featureDefinitions);
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  for (const mod of STUDENT_MODULE_CATALOG) {
    const surfaceKey = `student.surface.${mod.key}`;
    const surfaceDef = byKey.get(surfaceKey);
    if (surfaceDef) {
      await upsertFeatureAssignment(db, {
        featureId: surfaceDef.id,
        institutionId,
        value: PRESET.modules[mod.key],
      });
    }
    if (mod.requiresInstitutionModule) {
      const modKey = `institution.module.${mod.requiresInstitutionModule}`;
      const modDef = byKey.get(modKey);
      if (modDef) {
        await upsertFeatureAssignment(db, {
          featureId: modDef.id,
          institutionId,
          value: true,
        });
      }
    }
  }

  await db
    .insert(s.institutionSettings)
    .values({
      institutionId,
      category: 'student_portal',
      key: 'preset_key',
      label: 'Student portal preset',
      valueType: 'string',
      value: PRESET.key,
      description: 'Active student portal preset',
    })
    .onConflictDoNothing();

  for (const key of TERMINOLOGY_KEYS) {
    await db
      .insert(s.institutionSettings)
      .values({
        institutionId,
        category: 'terminology',
        key,
        label: `Terminology: ${key}`,
        valueType: 'string',
        value: PRESET.terminology[key],
      })
      .onConflictDoNothing();
  }

  await db
    .insert(s.institutionSettings)
    .values({
      institutionId,
      category: 'student_portal',
      key: 'attendance_threshold',
      label: 'Attendance threshold',
      valueType: 'number',
      value: String(PRESET.defaults.attendanceThreshold),
    })
    .onConflictDoNothing();

  await db
    .insert(s.institutionSettings)
    .values({
      institutionId,
      category: 'student_portal',
      key: 'grading_scheme',
      label: 'Grading scheme',
      valueType: 'string',
      value: PRESET.defaults.gradingScheme,
    })
    .onConflictDoNothing();
}
