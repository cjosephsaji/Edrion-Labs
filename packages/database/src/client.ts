import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Database = PostgresJsDatabase<typeof schema>;

let singleton: Database | undefined;
let sqlClient: ReturnType<typeof postgres> | undefined;

export interface CreateDbOptions {
  url?: string;
  /** Max pool connections. Keep modest; the API is the only writer. */
  max?: number;
}

/** Create a Drizzle database bound to the connection pool. */
export function createDatabase(opts: CreateDbOptions = {}): Database {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  sqlClient = postgres(url, { max: opts.max ?? 10, prepare: false });
  return drizzle(sqlClient, { schema, casing: 'snake_case' });
}

export type ReadinessScope = {
  institutionId?: string;
  studentId?: string;
  independentUserId?: string;
  institutionUserId?: string;
  preparationId?: string;
  lessonId?: string;
  sessionId?: string;
  courseId?: string;
  sourceItemId?: string;
  assignmentId?: string;
  reviewRequestId?: string;
};

const readinessScopeSettings: Record<keyof ReadinessScope, string> = {
  institutionId: 'app.institution_id',
  studentId: 'app.student_id',
  independentUserId: 'app.independent_user_id',
  institutionUserId: 'app.institution_user_id',
  preparationId: 'app.preparation_id',
  lessonId: 'app.lesson_id',
  sessionId: 'app.session_id',
  courseId: 'app.course_id',
  sourceItemId: 'app.source_item_id',
  assignmentId: 'app.assignment_id',
  reviewRequestId: 'app.review_request_id',
};

/** Startup must fail before ordinary repositories can use an unsafe connection. */
export async function assertRestrictedApplicationDatabase(db: Database): Promise<void> {
  return assertRestrictedDatabaseRole(db, 'edrion_app');
}

export async function assertRestrictedDatabaseRole(
  db: Database,
  expectedRole: 'edrion_app' | 'edrion_petros_document_worker' | 'edrion_petros_document_evaluator' | 'edrion_petros_v2_evaluator',
): Promise<void> {
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
    role.current_role !== expectedRole ||
    role.session_role !== expectedRole
  )
    throw new Error('PETROS_APPLICATION_DATABASE_ROLE_UNSAFE');
}

/** Every entry replaces all identity/job GUCs, including nested or reused connections. */
export async function bindReadinessScope(
  db: Pick<Database, 'execute'>,
  scope: ReadinessScope,
): Promise<void> {
  for (const [key, setting] of Object.entries(readinessScopeSettings))
    await db.execute(sql`SELECT set_config(${setting},${scope[key as keyof ReadinessScope] ?? ''},true)`);
}

/** An explicit handle is used for isolated worker/evaluator pools, never ambient ALS. */
export async function runInReadinessScope<T>(
  db: Database, scope: ReadinessScope, fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // RELEASE SAVEPOINT retains SET LOCAL values. Explicit pools have no ALS
    // parent, so capture the actual connection's scope before replacing it.
    const [previous] = await tx.execute<ReadinessScope>(sql`SELECT ${sql.join(
      Object.entries(readinessScopeSettings).map(([key, setting]) =>
        sql`nullif(current_setting(${setting},true),'') AS ${sql.identifier(key)}`), sql`, `,
    )}`);
    await bindReadinessScope(tx as unknown as Database, scope);
    const result = await fn(tx as unknown as Database);
    await bindReadinessScope(tx as unknown as Database, previous!);
    // On failure PostgreSQL rolls back the savepoint and restores its GUCs.
    return result;
  });
}

/** Only call after the pack service has resolved current course authority. */
export async function runInAuthorizedCourseSource<T>(
  db: Database, institutionId: string, courseId: string, sourceItemId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Database;
    const [actor] = await tx.execute<{ student: string | null; user: string | null }>(sql`
      SELECT nullif(current_setting('app.student_id',true),'') AS student,
        nullif(current_setting('app.institution_user_id',true),'') AS "user"`);
    // Student admission remains inside its existing owner scope.
    if (actor?.student) return fn();
    if (!actor?.user) throw new Error('PETROS_PACK_AUTHENTICATED_SCOPE_REQUIRED');
    const parentScope = tenantStore.getStore()?.scope ?? { institutionId, institutionUserId: actor.user };
    const scope = { institutionId, institutionUserId: actor.user, courseId, sourceItemId };
    await bindReadinessScope(tx, scope);
    const result = await tenantStore.run({ db: tx, scope }, fn);
    await bindReadinessScope(tx, parentScope);
    return result;
  });
}

/** Call only after current class/subject publication authority has been checked. */
export async function runInAuthorizedAssignmentParticipation<T>(
  db: Database, institutionId: string, assignmentId: string, fn: () => Promise<T>,
): Promise<T> {
  const parent = tenantStore.getStore()?.scope;
  if (!parent?.institutionUserId || parent.institutionId !== institutionId || parent.studentId)
    throw new Error('PETROS_ASSIGNMENT_AUTHENTICATED_SCOPE_REQUIRED');
  return db.transaction(async raw => {
    const tx = raw as unknown as Database;
    const scope = { ...parent, assignmentId };
    await bindReadinessScope(tx, scope);
    const result = await tenantStore.run({ db: tx, scope }, fn);
    await bindReadinessScope(tx, parent);
    return result;
  });
}


/** Select one explicitly shared review record after checking current staff permission. */
export async function runInAuthorizedSharedReview<T>(db: Database, institutionId: string,
  reviewRequestId: string, fn: () => Promise<T>): Promise<T> {
  const parent = tenantStore.getStore()?.scope;
  if (!parent?.institutionUserId || parent.institutionId !== institutionId || parent.studentId)
    throw new Error('PETROS_REVIEW_AUTHENTICATED_SCOPE_REQUIRED');
  return db.transaction(async raw => {
    const tx = raw as unknown as Database, scope = { ...parent, reviewRequestId };
    await bindReadinessScope(tx, scope);
    const result = await tenantStore.run({ db: tx, scope }, fn);
    await bindReadinessScope(tx, parent);
    return result;
  });
}

/** Process-wide singleton for the API. */
export function getDatabase(): Database {
  if (!singleton) singleton = createDatabase();
  return singleton;
}

/**
 * Run `fn` inside a transaction scoped to one institution via the `app.institution_id` GUC, so
 * Postgres Row-Level Security (migrations/sql/zzz_rls.sql) restricts every read/write in `fn` to
 * that institution at the storage layer. Used for support-access-session work — defence-in-depth
 * under the API permission guard, which remains authoritative. `set_config(..., true)` is
 * transaction-local, so the scope never leaks back to the pooled connection.
 */
export async function withInstitutionScope<T>(
  db: Database,
  institutionId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return runInReadinessScope(db, { institutionId }, fn);
}

/**
 * Per-async-context override of the active database handle. When a tenant-scoped transaction is
 * open (see {@link runInInstitutionTenant}), every query issued through a tenant-aware database
 * (see {@link createTenantAwareDatabase}) is routed to that transaction — so the `app.institution_id`
 * GUC the transaction set actually binds the RLS policies, without threading a `tx` argument
 * through every repository. Outside a tenant context the store is empty and queries use the pool.
 */
const tenantStore = new AsyncLocalStorage<{ db: Database; scope?: ReadinessScope }>();

/** Provider work must never inherit a request/domain database transaction. */
export function hasActiveTenantTransaction(): boolean { return tenantStore.getStore() !== undefined; }

/** Scoped domain jobs using injected repositories must share the same transaction via ALS. */
export async function runInScopedTenant<T>(db: Database, scope: ReadinessScope, fn: () => Promise<T>): Promise<T> {
  return runInReadinessScope(db, scope, tx => tenantStore.run({ db: tx, scope }, fn));
}

/** Atomic domain effect + injected AuditWriter. Preserve any existing RLS scope. */
export async function runInDatabaseTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  const scope = tenantStore.getStore()?.scope;
  return db.transaction(tx => tenantStore.run({ db: tx as unknown as Database, scope }, fn));
}

/**
 * Wrap a base database in a Proxy that, on every access, routes to the active tenant transaction
 * (when one is open in this async context) or falls back to the base pool. Functions are bound to
 * whichever target is active so `this` stays correct inside Drizzle's query builder. The returned
 * handle is a drop-in `Database`: repositories inject it once and never learn about tenancy.
 */
export function createTenantAwareDatabase(base: Database): Database {
  return new Proxy(base, {
    get(_target, prop, receiver) {
      const active = tenantStore.getStore()?.db ?? base;
      const value = Reflect.get(active as object, prop, receiver);
      return typeof value === 'function' ? value.bind(active) : value;
    },
  }) as Database;
}

/**
 * Run `fn` inside a transaction scoped to one institution via the `app.institution_id` GUC, with
 * the transaction registered as the active tenant handle for the duration. Any query a
 * tenant-aware database (or the audit writer built on it) issues inside `fn` runs in this
 * transaction, so Postgres Row-Level Security (migrations/sql/zzz_rls.sql) confines it to that
 * institution at the storage layer — defence-in-depth under the API permission guard, which
 * remains authoritative. `set_config(..., true)` is transaction-local, so the scope never leaks
 * back to the pooled connection. This is the mechanism the portal request path uses on every
 * authenticated request.
 */
export async function runInInstitutionTenant<T>(
  db: Database,
  institutionId: string,
  fn: () => Promise<T>,
  institutionUserId?: string,
): Promise<T> {
  const parentScope = tenantStore.getStore()?.scope;
  return db.transaction(async (tx) => {
    const scope = { institutionId, institutionUserId };
    await bindReadinessScope(tx as unknown as Database, scope);
    const result = await tenantStore.run({ db: tx as unknown as Database, scope }, fn);
    if (parentScope) await bindReadinessScope(tx as unknown as Database, parentScope);
    return result;
  });
}

/** Run fn inside a transaction scoped to an institutional student (institution + student GUCs). */
export async function runInStudentTenant<T>(
  db: Database,
  input: { institutionId: string; studentId: string; institutionUserId?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const parentScope = tenantStore.getStore()?.scope;
  return db.transaction(async (tx) => {
    await bindReadinessScope(tx as unknown as Database, input);
    const result = await tenantStore.run({ db: tx as unknown as Database, scope: input }, fn);
    if (parentScope) await bindReadinessScope(tx as unknown as Database, parentScope);
    return result;
  });
}

/** Run fn inside a transaction scoped to an independent learner. */
export async function runInIndependentStudentTenant<T>(
  db: Database,
  independentUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const parentScope = tenantStore.getStore()?.scope;
  return db.transaction(async (tx) => {
    const scope = { independentUserId };
    await bindReadinessScope(tx as unknown as Database, scope);
    const result = await tenantStore.run({ db: tx as unknown as Database, scope }, fn);
    if (parentScope) await bindReadinessScope(tx as unknown as Database, parentScope);
    return result;
  });
}

/**
 * Detach durable/in-process background work from a request tenant transaction.
 * The work must perform its own explicit institution/owner checks.
 */
export function runOutsideTenant<T>(fn: () => T): T {
  return tenantStore.exit(fn);
}

/** The institution id the active tenant transaction is bound to, if any (for diagnostics/tests). */
export async function currentTenantInstitutionId(db: Database): Promise<string | null> {
  const [row] = await db.execute<{ v: string | null }>(
    sql`select nullif(current_setting('app.institution_id', true), '') as v`,
  );
  return row?.v ?? null;
}

/** Close the pool (tests, graceful shutdown). */
export async function closeDatabase(): Promise<void> {
  await sqlClient?.end({ timeout: 5 });
  singleton = undefined;
  sqlClient = undefined;
}

export { schema };
