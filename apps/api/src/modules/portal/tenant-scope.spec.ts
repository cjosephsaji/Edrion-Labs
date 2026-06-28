import { describe, expect, it } from 'vitest';
import { createTenantAwareDatabase, runInInstitutionTenant, type Database } from '@edrion/database';

/**
 * Unit-proves the RLS mechanism the portal request path relies on (PortalTenantInterceptor):
 * `createTenantAwareDatabase` routes queries to the active institution-scoped transaction when one
 * is open and back to the pool otherwise, and `runInInstitutionTenant` sets the `app.institution_id`
 * GUC for the duration. No real Postgres — a fake database records the calls.
 */

interface Recorded {
  executions: Array<{ on: string; text: string }>;
}

function fakeDatabase(rec: Recorded, tag: string) {
  const db: Record<string, unknown> = {
    __tag: tag,
    marker() {
      // `this` must be the active target (base or tx) — proves the proxy binds correctly.
      return (this as { __tag: string }).__tag;
    },
    async execute(query: unknown) {
      rec.executions.push({ on: tag, text: String((query as { queryChunks?: unknown })?.queryChunks ?? query) });
      return [{}];
    },
    async transaction(cb: (tx: unknown) => Promise<unknown>) {
      return cb(fakeDatabase(rec, 'tx'));
    },
  };
  return db as unknown as Database;
}

describe('tenant-aware database', () => {
  it('routes to the base pool when no tenant transaction is active', async () => {
    const rec: Recorded = { executions: [] };
    const base = fakeDatabase(rec, 'base');
    const db = createTenantAwareDatabase(base);
    expect((db as unknown as { marker(): string }).marker()).toBe('base');
  });

  it('routes queries to the institution transaction inside runInInstitutionTenant', async () => {
    const rec: Recorded = { executions: [] };
    const base = fakeDatabase(rec, 'base');
    const db = createTenantAwareDatabase(base);

    let insideTag = '';
    const result = await runInInstitutionTenant(db, 'inst-123', async () => {
      insideTag = (db as unknown as { marker(): string }).marker();
      return 'ok';
    });

    expect(result).toBe('ok');
    // Inside the scope the proxy resolves to the transaction, not the pool.
    expect(insideTag).toBe('tx');
    // The GUC was set on the transaction (a set_config execute ran on the tx).
    expect(rec.executions.some((e) => e.on === 'tx')).toBe(true);
    // After the scope closes, the proxy falls back to the pool again.
    expect((db as unknown as { marker(): string }).marker()).toBe('base');
  });

  it('keeps concurrent tenant scopes isolated from each other', async () => {
    const rec: Recorded = { executions: [] };
    const db = createTenantAwareDatabase(fakeDatabase(rec, 'base'));
    const seen: string[] = [];
    await Promise.all([
      runInInstitutionTenant(db, 'a', async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push((db as unknown as { marker(): string }).marker());
      }),
      runInInstitutionTenant(db, 'b', async () => {
        seen.push((db as unknown as { marker(): string }).marker());
      }),
    ]);
    // Both scopes saw their own transaction handle, never the pool.
    expect(seen).toEqual(['tx', 'tx']);
  });
});
