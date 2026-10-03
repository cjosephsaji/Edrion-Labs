import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTenantAwareDatabase, runInStudentTenant, schema } from '@edrion/database';
import { PetrosOperationsService } from '../petros-quality/petros-operations.service';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

/** Opt-in real PostgreSQL validation. The helper creates a private cluster and app-role connection. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 5 operations aggregates / disposable PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });

  it('aggregates provider attempts and all-age holds across owners without exposing content or IDs', async () => {
    const admin = database.adminSql;
    const functionId = randomUUID();
    const providerId = randomUUID();
    const modelId = randomUUID();
    const owners = [
      { institutionId: randomUUID(), studentId: randomUUID() },
      { institutionId: randomUUID(), studentId: randomUUID() },
    ];
    const adminDb = drizzle(admin, { schema, casing: 'snake_case' });
    for (const [index, owner] of owners.entries()) {
      const institutionUserId = randomUUID();
      await adminDb.insert(schema.institutions).values({
        id: owner.institutionId, publicId: `PHASE5-OPS-${index}-${randomUUID()}`,
        legalName: 'Synthetic operations institution', displayName: 'Synthetic operations institution',
        type: 'school', country: 'IN', primaryContact: { name: 'Synthetic', email: 'only@example.test' },
      });
      await adminDb.insert(schema.institutionUsers).values({ id: institutionUserId, institutionId: owner.institutionId,
        email: `${institutionUserId}@example.test`, fullName: 'Synthetic learner', status: 'active' });
      await adminDb.insert(schema.students).values({ id: owner.studentId, institutionId: owner.institutionId,
        institutionUserId, admissionNo: randomUUID(), firstName: 'Synthetic', lastName: 'Learner' });
    }
    const now = new Date();
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const secretText = 'PRIVATE_SYNTHETIC_DOCUMENT_AND_PROVIDER_MESSAGE';

    await admin`
      insert into petros_ai_providers (id, key, display_name, adapter_type)
      values (${providerId}, ${`phase5-ops-${providerId}`}, 'Synthetic provider', 'test')
    `;
    await admin`
      insert into petros_ai_models (id, provider_id, model_key, display_name)
      values (${modelId}, ${providerId}, ${`phase5-ops-${modelId}`}, 'Synthetic model')
    `;
    await admin`
      insert into petros_ai_functions (id, key, display_name, description, category, settings)
      values (${functionId}, ${`phase5-ops-${functionId}`}, 'Synthetic function', 'fixture only', 'test',
        '{"maxInputTokens":100,"maxOutputTokens":100,"temperature":0,"timeoutMs":1000,"maxRetries":3,"streaming":false,"caching":true}'::jsonb)
    `;

    const usage = async (owner: number, values: {
      status: string; cacheStatus?: string; retryCount?: number; responseTimeMs: number;
      errorCode?: string | null; estimated: number; actual?: number | null; createdAt?: Date;
    }) => admin`
      insert into petros_ai_usage_events
        (request_id, student_id, institution_id, function_id, provider_id, model_id,
         estimated_cost_micros, actual_cost_micros, response_time_ms, status, error_code,
         retry_count, cache_status, metadata, created_at)
      values
        (${randomUUID()}, ${owners[owner]!.studentId}, ${owners[owner]!.institutionId}, ${functionId}, ${providerId}, ${modelId},
         ${values.estimated}, ${values.actual ?? null}, ${values.responseTimeMs}, ${values.status}, ${values.errorCode ?? null},
         ${values.retryCount ?? 0}, ${values.cacheStatus ?? 'miss'}, ${JSON.stringify({ private: secretText })}::jsonb, ${(values.createdAt ?? now).toISOString()})
    `;

    // Two successes, two provider failures, plus cached/rejected rows that must not count as attempts.
    await usage(0, { status: 'success', responseTimeMs: 30, estimated: 100, actual: 90 });
    // One retry event row with ordinal 3 still contributes one retry, not three.
    await usage(1, { status: 'success', responseTimeMs: 50, retryCount: 3, estimated: 200, actual: null });
    await usage(0, { status: 'failure', responseTimeMs: 70, errorCode: 'PROVIDER_TIMEOUT', estimated: 400 });
    // Unknown provider outcome is conservatively accounted but has no usable duration sample.
    await usage(1, { status: 'failure', responseTimeMs: 0, errorCode: 'PROVIDER_OUTCOME_UNKNOWN', estimated: 700 });
    await usage(0, { status: 'cached', cacheStatus: 'hit', responseTimeMs: 3, estimated: 900 });
    await usage(1, { status: 'rejected', errorCode: secretText, responseTimeMs: 4, estimated: 800 });
    await usage(1, { status: 'failure', responseTimeMs: 99, errorCode: 'PROVIDER_TIMEOUT', estimated: 500, createdAt: old });

    const reservation = async (owner: number, state: 'reserved' | 'settled' | 'ambiguous', createdAt: Date, settledAt?: Date, amount = 0) => admin`
      insert into petros_ai_attempt_reservations
        (command_id, session_id, execution_fence, attempt_key, request_id, institution_id, student_id,
         function_id, provider_id, model_id, reserved_micros, state, settled_micros, created_at, settled_at)
      values (${randomUUID()}, ${randomUUID()}, 1, ${`phase5-ops-${randomUUID()}`}, ${randomUUID()},
        ${owners[owner]!.institutionId}, ${owners[owner]!.studentId}, ${functionId}, ${providerId}, ${modelId},
        ${amount}, ${state}, ${state === 'reserved' ? null : amount}, ${createdAt.toISOString()}, ${settledAt?.toISOString() ?? null})
    `;
    // Old reserved holds remain outstanding; settled/ambiguous window follows settled_at.
    await reservation(0, 'reserved', old, undefined, 1100);
    await reservation(1, 'reserved', now, undefined, 200);
    await reservation(0, 'settled', old, now, 300);
    await reservation(1, 'ambiguous', now, now, 400);
    await reservation(1, 'settled', old, old, 500);

    const jobs = { enabled: false, counts: async () => [] };
    // Use the helper's restricted app role on a local non-prepared connection. postgres-js
    // prepared parameter metadata mishandles Date values under the Node runtime used in CI.
    const appSql = postgres({ host: database.directory, username: 'edrion_app', database: 'postgres', max: 2, prepare: false,
      connection: { statement_timeout: 4_000, lock_timeout: 3_000 }, onnotice: () => {} });
    try {
      const appDb = createTenantAwareDatabase(drizzle(appSql, { schema, casing: 'snake_case' }));
      // Drizzle sets timestamp serializers to transparent mode; restore the raw driver's timestamp
      // encoder so Date comparison parameters reach PostgreSQL as ISO text.
      appSql.options.serializers[1184] = value => (value instanceof Date ? value : new Date(value)).toISOString();
      const service = new PetrosOperationsService(appDb, jobs as never);
      const result = await service.snapshot();
      expect(result.queue.status).toBe('disabled');
      expect(result.last24Hours).toMatchObject({
        attempts: 4,
        retries: 1,
        failures: 2,
        costs: { estimatedMicros: 1400, actualMicros: 90, accountedMicros: 1390, currentlyReservedAllTimeMicros: 1300 },
        reservations: { createdLast24Hours: 2, outstandingAllTime: 2, settledLast24Hours: 1, ambiguousLast24Hours: 1 },
        latencyMs: { p50: 50, p95: 68, sampleSize: 3 },
        failuresByCategory: { timeout: 1 },
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(secretText);
      for (const owner of owners) {
        expect(serialized).not.toContain(owner.institutionId);
        expect(serialized).not.toContain(owner.studentId);
      }
      // The narrowly scoped aggregate function permits only an unscoped platform snapshot.
      await expect(runInStudentTenant(appDb, owners[0]!, () =>
        appDb.execute(sql`select edrion_petros_operations()`),
      )).rejects.toThrow();

      // Grant replay must keep both SECURITY DEFINER functions private to edrion_app.
      const grantsSql = readFileSync(join(__dirname, '../../../../../packages/database/migrations/sql/zzz_grants.sql'), 'utf8');
      await admin.unsafe(grantsSql);
      const publicGrants = await admin`
        select p.proname, coalesce(bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE'), false) as public_execute
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
        where n.nspname = 'public' and p.oid in (
          to_regprocedure('edrion_petros_operations()'),
          to_regprocedure('edrion_petros_runtime_release(uuid,uuid)')
        )
        group by p.proname
      `;
      expect(publicGrants).toHaveLength(2);
      expect(publicGrants.every(row => row.public_execute === false)).toBe(true);

      // A non-BYPASSRLS function owner fails closed with an explicit migration-owner diagnostic.
      try {
        await admin.unsafe('ALTER FUNCTION edrion_petros_operations() OWNER TO edrion_app');
        await admin.unsafe('ALTER FUNCTION edrion_petros_runtime_release(uuid,uuid) OWNER TO edrion_app');
        await expect(appDb.execute(sql`select edrion_petros_operations()`))
          .rejects.toThrow('Operational aggregate owner requires BYPASSRLS');
        await expect(appDb.execute(sql`select * from edrion_petros_runtime_release(${randomUUID()}, ${randomUUID()})`))
          .rejects.toThrow('Release projection owner requires BYPASSRLS');
      } finally {
        await admin.unsafe('ALTER FUNCTION edrion_petros_operations() OWNER TO petros_test');
        await admin.unsafe('ALTER FUNCTION edrion_petros_runtime_release(uuid,uuid) OWNER TO petros_test');
      }
    } finally { await appSql.end({ timeout: 5 }); }
  }, 120_000);
});
