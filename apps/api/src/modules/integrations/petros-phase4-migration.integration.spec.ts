import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase4 migration rollback/reapplication and grant replay / private PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });
  it('reapplies both Phase4 migrations and preserves FORCE RLS and immutable app-role grants', async () => {
    const inspect = () => database.adminSql`select relname, relrowsecurity as rls, relforcerowsecurity as force_rls,
      has_table_privilege('edrion_app',oid,'select') as can_select,
      has_table_privilege('edrion_app',oid,'insert') as can_insert,
      has_table_privilege('edrion_app',oid,'update') as can_update,
      has_table_privilege('edrion_app',oid,'delete') as can_delete,
      has_table_privilege('edrion_app',oid,'truncate') as can_truncate from pg_class
      where relname in ('petros_journeys','petros_journey_sessions','petros_memory_records','petros_continuity_receipts',
        'petros_material_corrections','petros_institutional_interventions') order by relname`;
    const before = await inspect(); expect(before).toHaveLength(6);
    for (const row of before) expect(row).toMatchObject({ rls:true,force_rls:true,can_select:true,can_insert:true,can_delete:false,can_truncate:false });
    for (const row of before.filter(row => ['petros_journey_sessions','petros_continuity_receipts'].includes(row.relname))) expect(row.can_update).toBe(false);
    // Preserve later additive owners while rehearsing only these historical tables.
    // Never use CASCADE: restore the exact downstream constraint after parent replay.
    const downstream = await database.adminSql`select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint where conrelid='petros_pilot_events'::regclass
      and confrelid='petros_journeys'::regclass`;
    expect(downstream).toHaveLength(1);
    await database.adminSql.begin(async tx => {
      for (const constraint of downstream) await tx.unsafe(`alter table petros_pilot_events drop constraint "${String(constraint.conname).replaceAll('"','""')}"`);
      await tx.unsafe(`drop function edrion_petros_assignment_active(uuid);
        drop table petros_material_corrections,petros_institutional_interventions;
        alter table class_materials drop constraint petros_phase4_material_tenant_uq;
        alter table classes drop constraint petros_phase4_class_tenant_uq;
        alter table subjects drop constraint petros_phase4_subject_tenant_uq;
        alter table storage_objects drop constraint petros_phase4_object_tenant_uq;
        alter table petros_class_struggle_signals drop column eligible_count,drop column evidence_covered_count,
          drop column independent_attempt_count,drop column exclusion_counts,drop column membership_as_of,
          drop column window_start,drop column window_end,drop column evidence_versions,
          drop column affected_learner_count,drop column successful_attempt_count;
        drop table petros_memory_records,petros_journey_sessions,petros_continuity_receipts,petros_journeys;
        drop function petros_memory_guard();
        alter table petros_student_companion_preferences drop column optional_memory_enabled,drop column memory_revision,drop column memory_cutoff_seq;`);
    });
    expect(await inspect()).toEqual([]);
    for (const filename of ['0228_petros_continuity.sql','0229_petros_phase4_institutional.sql']) {
      const migration = readFileSync(join(process.cwd(),'../../packages/database/migrations',filename),'utf8');
      for (const statement of migration.split('--> statement-breakpoint').map(part=>part.trim()).filter(Boolean)) await database.adminSql.unsafe(statement);
    }
    for (const constraint of downstream) await database.adminSql.unsafe(`alter table petros_pilot_events add constraint "${String(constraint.conname).replaceAll('"','""')}" ${constraint.definition}`);
    // Replay the same broad grants/immutability repair SQL as a normal migrated app startup.
    for (const filename of ['zzz_grants.sql']) {
      const sql = readFileSync(join(process.cwd(),'../../packages/database/migrations/sql',filename),'utf8');
      await database.adminSql.unsafe(sql);
    }
    expect(await inspect()).toEqual(before);
    const triggers = await database.adminSql`select tgname from pg_trigger where not tgisinternal
      and tgname in ('petros_memory_revision','petros_continuity_receipt_immutable','petros_journey_session_immutable')`;
    expect(triggers).toHaveLength(3);
    const functions = await database.adminSql`select has_function_privilege('edrion_app','edrion_petros_assignment_active(uuid)','execute') as app_execute`;
    expect(functions[0]!.app_execute).toBe(true);
  });
});
