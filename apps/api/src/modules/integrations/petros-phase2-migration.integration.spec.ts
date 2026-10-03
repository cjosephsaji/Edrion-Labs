import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eq, runInInstitutionTenant, schema } from '@edrion/database';
import { startPhase2TestDatabase } from './petros-phase2-test-database';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 2 disposable Postgres migration smoke', () => {
  it('applies the checked-in migration journal and enforces tenant scope through edrion_app', async () => {
    const fixture = await startPhase2TestDatabase();
    try {
      const institutions = [randomUUID(), randomUUID()];
      for (const [index, id] of institutions.entries()) {
        await fixture.adminSql`
          INSERT INTO institutions (id, public_id, legal_name, display_name, type, country, primary_contact)
          VALUES (${id}, ${`phase2-synthetic-${index}-${id.slice(0, 8)}`}, 'Synthetic test', 'Synthetic test', 'school', 'IN', '{"name":"Test","email":"test@example.test"}'::jsonb)
        `;
      }

      const role = await fixture.appSql`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'edrion_app'`;
      expect(role[0]?.rolbypassrls).toBe(false);
      const listening = await fixture.adminSql`SELECT inet_server_addr() AS address`;
      expect(listening[0]?.address).toBeNull();

      const visible = await runInInstitutionTenant(fixture.db, institutions[0]!, () =>
        fixture.db.select({ id: schema.institutions.id }).from(schema.institutions)
          .where(eq(schema.institutions.id, institutions[0]!)));
      expect(visible.map((row) => row.id)).toEqual([institutions[0]]);
      const hidden = await runInInstitutionTenant(fixture.db, institutions[0]!, () =>
        fixture.db.select({ id: schema.institutions.id }).from(schema.institutions)
          .where(eq(schema.institutions.id, institutions[1]!)));
      expect(hidden).toEqual([]);

      const migrationCount = await fixture.adminSql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
      expect(Number(migrationCount[0]?.count)).toBeGreaterThan(0);
    } finally {
      await fixture.close();
    }
  });
});
