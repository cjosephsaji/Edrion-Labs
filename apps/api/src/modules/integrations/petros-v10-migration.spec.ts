import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = join(__dirname, '../../../../..');
const migration = readFileSync(
  join(repositoryRoot, 'packages/database/migrations/0216_v10_rls_immutability.sql'),
  'utf8',
);
const grants = readFileSync(
  join(repositoryRoot, 'packages/database/migrations/sql/zzz_grants.sql'),
  'utf8',
);
const journal = JSON.parse(readFileSync(
  join(repositoryRoot, 'packages/database/migrations/meta/_journal.json'),
  'utf8',
)) as { entries: Array<{ idx: number; tag: string }> };

describe('V10 federation RLS and roster-history migration', () => {
  it('journals the additive repair after the compatibility contracts', () => {
    const entry = journal.entries.find((candidate) => candidate.tag === '0216_v10_rls_immutability');
    expect(entry).toEqual(expect.objectContaining({
      idx: journal.entries.findIndex((candidate) => candidate.tag === '0216_v10_rls_immutability'),
      tag: '0216_v10_rls_immutability',
    }));
    expect(journal.entries.findIndex((candidate) => candidate.tag === '0216_v10_rls_immutability'))
      .toBe(journal.entries.findIndex((candidate) => candidate.tag === '0215_petros_compatibility_contracts') + 1);
  });

  it('forces tenant RLS on identity-provider secrets and denies student/independent contexts', () => {
    expect(migration).toContain('ALTER TABLE institution_identity_providers ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE institution_identity_providers FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('institution_id::text = edrion_current_institution()');
    expect(migration).toContain('edrion_current_student() IS NULL');
    expect(migration).toContain('edrion_current_independent_user() IS NULL');
  });

  it('blocks roster-history deletion in both trigger and final grant reapplication', () => {
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON roster_sync_jobs');
    expect(migration).toContain("IF TG_OP IN ('DELETE', 'TRUNCATE')");
    expect(migration).toContain('BEFORE TRUNCATE ON roster_sync_jobs');
    expect(migration).toContain('REVOKE DELETE, TRUNCATE ON roster_sync_jobs FROM edrion_app');
    expect(grants).toContain('REVOKE DELETE, TRUNCATE ON roster_sync_jobs FROM edrion_app');
  });
});
