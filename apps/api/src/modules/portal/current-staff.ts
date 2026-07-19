import { and, eq, schema, type Database } from '@edrion/database';
import type { InstitutionPrincipal } from '@edrion/auth';

/**
 * Resolve the staff row linked to the current portal login.
 * Most staff have no login (institution_user_id is null) — returns null in that case.
 */
export async function resolveCurrentStaffId(
  db: Database,
  principal: InstitutionPrincipal,
): Promise<string | null> {
  const t = schema.staff;
  const [row] = await db
    .select({ id: t.id })
    .from(t)
    .where(
      and(
        eq(t.institutionId, principal.institutionId),
        eq(t.institutionUserId, principal.institutionUserId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
