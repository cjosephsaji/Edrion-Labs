import { seedDevResetPlatform } from '@edrion/database/seed-platform';
import { DEV_PASSWORD_PLAINTEXT } from '@edrion/database/dev-constants';
import type { DevSeedContext } from './_context.js';
import { registerLogin, URLS } from './_context.js';

export async function seedPlatform(ctx: DevSeedContext): Promise<{ planVersionId: string | undefined }> {
  const { planVersionId } = await seedDevResetPlatform(ctx.db);
  registerLogin(ctx, {
    email: 'owner@edrion.dev',
    password: DEV_PASSWORD_PLAINTEXT,
    role: 'platform_owner',
    url: URLS.superAdmin,
  });
  return { planVersionId };
}
