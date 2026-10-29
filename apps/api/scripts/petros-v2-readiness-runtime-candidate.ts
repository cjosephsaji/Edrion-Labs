/** Uninstalled Phase-A proposal. Copied verbatim into client.ts by proposed-production.diff. */
import { sql } from 'drizzle-orm';
import type { Database } from '@edrion/database';

export type ReadinessScope = {
  institutionId?: string;
  studentId?: string;
  independentUserId?: string;
  institutionUserId?: string;
  preparationId?: string;
};

/** Startup must fail before ordinary repositories can use an unsafe connection. */
export async function assertRestrictedApplicationDatabase(db: Database): Promise<void> {
  const [role] = await db.execute<{
    current_role: string;
    session_role: string;
    unsafe: boolean;
  }>(sql`
    SELECT current_user AS current_role, session_user AS session_role,
      (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
       OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid)
       OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND pg_has_role(r.oid,c.relowner,'MEMBER'))
       OR has_schema_privilege(current_user,'public','CREATE')) AS unsafe
    FROM pg_roles r WHERE r.rolname=current_user`);
  if (
    !role ||
    role.unsafe ||
    role.current_role !== 'edrion_app' ||
    role.session_role !== 'edrion_app'
  )
    throw new Error('PETROS_APPLICATION_DATABASE_ROLE_UNSAFE');
}

/** Every entry replaces all identity/job GUCs, including nested or reused connections. */
export async function bindReadinessScope(
  db: Pick<Database, 'execute'>,
  scope: ReadinessScope,
): Promise<void> {
  const entries = {
    'app.institution_id': scope.institutionId ?? '',
    'app.student_id': scope.studentId ?? '',
    'app.independent_user_id': scope.independentUserId ?? '',
    'app.institution_user_id': scope.institutionUserId ?? '',
    'app.preparation_id': scope.preparationId ?? '',
  };
  for (const [key, value] of Object.entries(entries))
    await db.execute(sql`SELECT set_config(${key},${value},true)`);
}

/** Method metadata overrides class metadata; both are server-authored. */
export function resolveOwnedTransactions(
  marker: symbol,
  handler: object,
  controller: object,
): boolean {
  return (Reflect.getMetadata(marker, handler) ?? Reflect.getMetadata(marker, controller)) === true;
}
