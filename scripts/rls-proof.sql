-- Phase 10c RLS proof. Run as a superuser:  psql "$DATABASE_URL" -f scripts/rls-proof.sql
-- Switches to the least-privilege app role (subject to RLS), sets an institution scope, and
-- shows that cross-tenant rows are blocked at the storage layer — independent of the API guard.
\set ON_ERROR_STOP on

SELECT id AS inst_a FROM institutions ORDER BY created_at LIMIT 1 \gset
SELECT id AS inst_b FROM institutions WHERE id <> :'inst_a' ORDER BY created_at LIMIT 1 \gset

SET ROLE edrion_app;

\echo '--- platform-wide (no scope): sees all institutions ---'
SELECT count(*) AS all_institutions FROM institutions;

\echo '--- scoped to institution A ---'
SELECT set_config('app.institution_id', :'inst_a', false);
SELECT count(*) AS visible_when_scoped_to_A FROM institutions;             -- expect 1
SELECT count(*) AS other_inst_rows_blocked FROM institutions WHERE id = :'inst_b'; -- expect 0
SELECT count(*) AS campuses_of_A_only FROM campuses;                       -- only A's campuses

\echo '--- scoped to institution B: A is now invisible ---'
SELECT set_config('app.institution_id', :'inst_b', false);
SELECT count(*) AS A_rows_blocked_when_scoped_to_B FROM institutions WHERE id = :'inst_a'; -- expect 0

RESET ROLE;
SELECT set_config('app.institution_id', '', false);
