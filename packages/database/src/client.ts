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
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${institutionId}, true)`);
    return fn(tx as unknown as Database);
  });
}

/**
 * Per-async-context override of the active database handle. When a tenant-scoped transaction is
 * open (see {@link runInInstitutionTenant}), every query issued through a tenant-aware database
 * (see {@link createTenantAwareDatabase}) is routed to that transaction — so the `app.institution_id`
 * GUC the transaction set actually binds the RLS policies, without threading a `tx` argument
 * through every repository. Outside a tenant context the store is empty and queries use the pool.
 */
const tenantStore = new AsyncLocalStorage<{ db: Database }>();

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
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${institutionId}, true)`);
    return tenantStore.run({ db: tx as unknown as Database }, fn);
  });
}

/** Run fn inside a transaction scoped to an institutional student (institution + student GUCs). */
export async function runInStudentTenant<T>(
  db: Database,
  input: { institutionId: string; studentId: string },
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.institution_id', ${input.institutionId}, true)`);
    await tx.execute(sql`select set_config('app.student_id', ${input.studentId}, true)`);
    return tenantStore.run({ db: tx as unknown as Database }, fn);
  });
}

/** Run fn inside a transaction scoped to an independent learner. */
export async function runInIndependentStudentTenant<T>(
  db: Database,
  independentUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.independent_user_id', ${independentUserId}, true)`);
    return tenantStore.run({ db: tx as unknown as Database }, fn);
  });
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
