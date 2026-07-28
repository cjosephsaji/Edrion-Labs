import { and, eq } from 'drizzle-orm';
import { DEV_PASSWORD_HASH } from '@edrion/database/dev-constants';
import { schema as s } from '@edrion/database';
import type { DevSeedContext } from './_context.js';
import { DEV_PASSWORD, registerLogin, URLS } from './_context.js';

const INDEPENDENT_EMAIL = 'learner@edrion.dev';
const INDIVIDUAL_SURFACE_KEYS = [
  'student.surface.learn',
  'student.surface.library',
  'student.surface.lab',
  'student.surface.planner',
  'student.surface.progress',
  'student.surface.exam_prep',
] as const;

export async function seedIndependentUser(ctx: DevSeedContext): Promise<void> {
  const { db } = ctx;

  const [existing] = await db
    .select({ id: s.independentUsers.id })
    .from(s.independentUsers)
    .where(eq(s.independentUsers.email, INDEPENDENT_EMAIL))
    .limit(1);

  let userId = existing?.id;
  if (!userId) {
    const [created] = await db
      .insert(s.independentUsers)
      .values({
        email: INDEPENDENT_EMAIL,
        fullName: 'Indie Learner',
        country: 'IN',
        signupSource: 'web',
        status: 'active',
        passwordHash: DEV_PASSWORD_HASH,
      })
      .returning({ id: s.independentUsers.id });
    userId = created?.id;
  }
  if (!userId) throw new Error('Failed to seed independent user');

  const allDefs = await db.select().from(s.featureDefinitions);
  const byKey = new Map(allDefs.map((d) => [d.key, d]));

  for (const key of INDIVIDUAL_SURFACE_KEYS) {
    const def = byKey.get(key);
    if (!def) continue;
    const [row] = await db
      .select({ id: s.featureAssignments.id })
      .from(s.featureAssignments)
      .where(
        and(
          eq(s.featureAssignments.featureId, def.id),
          eq(s.featureAssignments.scope, 'independent_user'),
          eq(s.featureAssignments.scopeId, userId),
        ),
      )
      .limit(1);
    if (row) continue;
    await db.insert(s.featureAssignments).values({
      featureId: def.id,
      scope: 'independent_user',
      scopeId: userId,
      value: true,
      enabled: true,
      reason: 'Individual student-portal preset',
    });
  }

  registerLogin(ctx, {
    email: INDEPENDENT_EMAIL,
    password: DEV_PASSWORD,
    role: 'independent_learner',
    url: URLS.student,
  });
}
