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

/** Close the pool (tests, graceful shutdown). */
export async function closeDatabase(): Promise<void> {
  await sqlClient?.end({ timeout: 5 });
  singleton = undefined;
  sqlClient = undefined;
}

export { schema };
