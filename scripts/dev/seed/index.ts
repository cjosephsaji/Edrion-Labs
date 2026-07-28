import type { DevLoginRow, DevSeedContext } from './_context.js';
import { seedAcademics } from './academics.js';
import { seedInstitution } from './institution.js';
import { seedIndependentUser } from './independent.js';
import { seedOperations } from './operations.js';
import { seedPlatform } from './platform.js';
import { seedUsers } from './users.js';

export async function runDevSeed(ctx: DevSeedContext): Promise<DevLoginRow[]> {
  const { planVersionId } = await seedPlatform(ctx);
  const inst = await seedInstitution(ctx, planVersionId);
  const people = await seedUsers(ctx, inst);
  const academics = await seedAcademics(ctx, inst, people);
  await seedOperations(ctx, inst, academics, people);
  await seedIndependentUser(ctx);
  return ctx.logins;
}
