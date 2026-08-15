import { seedDevResetPlatform } from "@edrion/database/seed-platform";
import {
  DEV_PASSWORD_HASH,
  DEV_PASSWORD_PLAINTEXT,
} from "@edrion/database/dev-constants";
import { eq, schema as s } from "@edrion/database";
import type { DevSeedContext } from "./_context.js";
import { registerLogin, URLS } from "./_context.js";

export async function seedPlatform(
  ctx: DevSeedContext,
): Promise<{ planVersionId: string | undefined }> {
  const { planVersionId } = await seedDevResetPlatform(ctx.db);
  registerLogin(ctx, {
    email: "owner@edrion.dev",
    password: DEV_PASSWORD_PLAINTEXT,
    role: "platform_owner",
    url: URLS.superAdmin,
  });
  await seedRestrictedSupportEmployee(ctx);
  return { planVersionId };
}

/** Deliberately lacks ai.view/configure; used for authorization acceptance checks. */
async function seedRestrictedSupportEmployee(ctx: DevSeedContext) {
  const email = "support@edrion.dev";
  const [employee] = await ctx.db
    .insert(s.platformEmployees)
    .values({
      authUserId: "00000000-0000-0000-0000-000000000002",
      email,
      fullName: "Restricted Support",
      title: "Customer Support Administrator",
      status: "active",
      passwordHash: DEV_PASSWORD_HASH,
      mfaEnrolled: false,
      lastAuthAt: new Date(),
    })
    .onConflictDoUpdate({
      target: s.platformEmployees.email,
      set: {
        passwordHash: DEV_PASSWORD_HASH,
        status: "active",
        mfaEnrolled: false,
      },
    })
    .returning({ id: s.platformEmployees.id });
  const [role] = await ctx.db
    .select({ id: s.platformRoles.id })
    .from(s.platformRoles)
    .where(eq(s.platformRoles.key, "support_administrator"))
    .limit(1);
  if (!employee || !role)
    throw new Error("Could not seed restricted support acceptance user");
  await ctx.db
    .delete(s.employeeRoleAssignments)
    .where(eq(s.employeeRoleAssignments.employeeId, employee.id));
  await ctx.db
    .insert(s.employeeRoleAssignments)
    .values({ employeeId: employee.id, roleId: role.id });
  registerLogin(ctx, {
    email,
    password: DEV_PASSWORD_PLAINTEXT,
    role: "support_administrator_no_ai",
    url: URLS.superAdmin,
  });
}
