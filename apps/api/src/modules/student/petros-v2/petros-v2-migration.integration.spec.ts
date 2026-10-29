import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import {
  startPhase2TestDatabase,
  type Phase2TestDatabase,
} from '../../integrations/petros-phase2-test-database';
const migrations = resolve(__dirname, '../../../../../../packages/database/migrations');
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 additive migration over historical V1 rows',
  () => {
    let f: Phase2TestDatabase,
      institutionId: string,
      studentId: string,
      sessionId: string,
      original: string;
    beforeAll(async () => {
      f = await startPhase2TestDatabase({ deferM4: true, temporaryRoot: '/tmp' });
      institutionId = randomUUID();
      studentId = randomUUID();
      sessionId = randomUUID();
      const user = randomUUID();
      await f.adminSql`insert into institutions(id,public_id,legal_name,display_name,type,country,primary_contact) values(${institutionId},${randomUUID()},'Synthetic V1','Synthetic V1','school','IN','{}')`;
      await f.adminSql`insert into institution_users(id,institution_id,full_name,email,status) values(${user},${institutionId},'Synthetic V1',${user + '@example.test'},'active')`;
      await f.adminSql`insert into students(id,institution_id,institution_user_id,admission_no,first_name,last_name) values(${studentId},${institutionId},${user},${randomUUID()},'V1','Fixture')`;
      await f.adminSql`insert into petros_learning_sessions(id,institution_id,student_id,client_request_id,state_version,session_type,status,topic,current_goal,time_budget_seconds,max_moves,checkpoints,current_checkpoint_id,prompt_version,output_schema_version)
      values(${sessionId},${institutionId},${studentId},${randomUUID()},'v1','repair','paused','Historical session','Original goal',600,4,'[]','original','v1','v1')`;
      original = (
        await f.adminSql`select md5(to_jsonb(s)::text) hash from petros_learning_sessions s where id=${sessionId}`
      )[0]!.hash;
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    it('injected migration failure rolls all additive DDL back', async () => {
      await expect(
        f.adminSql.begin(async (tx) => {
          await tx.unsafe(
            readFileSync(resolve(migrations, '0237_petros_v2_session_assessment.sql'), 'utf8'),
          );
          await tx`select 1/0`;
        }),
      ).rejects.toThrow();
      expect((await f.adminSql`select to_regclass('petros_v2_tasks') as name`)[0]!.name).toBeNull();
    });
    it('registered migration and replay preserve historical V1 bytes and numeric constraints', async () => {
      await migrate(drizzle(f.adminSql), { migrationsFolder: migrations });
      const after = (
        await f.adminSql`select md5((to_jsonb(s)-'engine_version'-'v2_state')::text) hash,engine_version,v2_state from petros_learning_sessions s where id=${sessionId}`
      )[0]!;
      expect(after.hash).toBe(original);
      expect(after.engine_version).toBe('v1');
      expect(after.v2_state).toBeNull();
      const ledger =
        await f.adminSql`select md5(jsonb_agg(to_jsonb(m) order by id)::text) hash from drizzle.__drizzle_migrations m`;
      await migrate(drizzle(f.adminSql), { migrationsFolder: migrations });
      expect(
        await f.adminSql`select md5(jsonb_agg(to_jsonb(m) order by id)::text) hash from drizzle.__drizzle_migrations m`,
      ).toEqual(ledger);
      const constraints =
        await f.adminSql`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='petros_answer_evaluations'::regclass`;
      expect(JSON.stringify(constraints)).toContain('credit_basis_points');
    });
    it('standalone ACL replay retains restricted App/evaluator separation and immutable work', async () => {
      for (const name of readdirSync(resolve(migrations, 'sql'))
        .filter((n) => n.endsWith('.sql') && !n.startsWith('._'))
        .sort())
        await f.adminSql.unsafe(readFileSync(resolve(migrations, 'sql', name), 'utf8'));
      const [r] =
        await f.appSql`select current_user as actor,has_function_privilege(current_user,'m4_private_instrument(uuid)','EXECUTE') private_reader,has_table_privilege(current_user,'petros_v2_responses','UPDATE') mutable`;
      expect(r).toEqual({ actor: 'edrion_app', private_reader: false, mutable: false });
    });
  },
);
