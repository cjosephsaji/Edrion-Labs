# LEARN-CONFORMANCE-MATRIX.md

Conformance of the Petros Learn (Edrion Learn) orchestrator against its three hyperspecs.
**Phase A output — read-only. No code, schema, or migration was changed to produce this.**

Authoritative sources, in precedence order:
1. [docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-1-CORE-ENGINE.md](docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-1-CORE-ENGINE.md)
2. [docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-2-UI-AND-ENTRY.md](docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-2-UI-AND-ENTRY.md)
3. [docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-3-EVAL-COST-POLICY.md](docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-3-EVAL-COST-POLICY.md)
4. [LEARN-SESSION-DIAGNOSIS.md](LEARN-SESSION-DIAGNOSIS.md) — D1-D20 (reconciled below; **three claims corrected**)

**Precedence rule applied throughout:** the hyperspecs are authoritative on behaviour; the repo is
authoritative on facts about itself. Where a hyperspec's naming or structural choice conflicts with
load-bearing shipped code, it is surfaced as a DEC and **not resolved unilaterally**.

## Totals

| Area | Rows | conformant | partial | absent | contradicted |
|---|---:|---:|---:|---:|---:|
| A1 · data model, migrations, tenancy, RLS | 105 | 40 | 37 | 10 | 18 |
| A2 · profiler, learner model, mastery, seeding | 120 | 47 | 33 | 32 | 8 |
| A3 · moves, plan/render, state machine, cost caps | 145 | 51 | 47 | 39 | 8 |
| A4 · session UI, interactions, entry points, exit | 197 | 68 | 33 | 71 | 25 |
| A5 · eval harness, `learn.*` config, policy scope | 100 | 26 | 30 | 36 | 8 |
| **Total** | **667** | **232** | **180** | **188** | **67** |

**35% conformant.** The heaviest gaps are the session UI (71 absent) and the eval harness
(36 absent, and its reported scores are hardcoded).

### Status definitions
- **conformant** — repo satisfies the requirement; evidence cited.
- **partial** — mechanism present, contract incompletely met.
- **absent** — no implementation.
- **contradicted** — repo does something structurally **incompatible**, not merely incomplete.

### Reading the evidence column
`file:line` refers to the repo at commit `1a43aff` on branch `feat/settings-currency-audit`.
Every non-absent row cites a line an agent read directly.

---

# A1 · Data model, migrations, tenancy, RLS

# A1 — Data model / tenancy / RLS conformance matrix

Spec: `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-1-CORE-ENGINE.md` (§1.0–§1.6, §4.5, AC1/2/3/4/8/11/13/16)
Repo state as of branch `feat/settings-currency-audit`, commit 542456e.

| ID | Hyperspec ref | Binding requirement | Status | Evidence | Delta | Blocks | Effort |
|---|---|---|---|---|---|---|---|
| DM-001 | H1 §1.0 / `owner_kind` column | Every new Learn table must carry `owner_kind text NOT NULL CHECK (owner_kind IN ('user','institution'))`. | contradicted | packages/database/src/schema/learn.ts:21-22; packages/database/migrations/0096_edrion_learn_orchestrator.sql:186, 211; packages/database/migrations/0096_edrion_learn_orchestrator.sql:144-148 | No table has an `owner_kind` column. The repo's convention is a nullable-column pair (`student_id` / `independent_user_id`) discriminated by `num_nonnulls(...) = 1`. Either the spec adopts the repo's discriminator-free form (recommended — it is used repo-wide by `today_feed`, `visual_canvases`, `mock_exams`, `student_document_vault`) or 4 tables gain a redundant column plus backfill. | DM-002, DM-004, DM-005, DM-069 | L |
| DM-002 | H1 §1.0 / `user_id` column | New tables must key user ownership through a single `user_id uuid` column. | contradicted | packages/database/src/schema/learn.ts:255-258, 285-288; packages/database/migrations/0096_edrion_learn_orchestrator.sql:176-177, 201-202 | There is no single "user" identity in this repo. Ownership is two mutually exclusive FKs — `student_id → students.id` and `independent_user_id → independent_users.id`. `students.id` is institution-scoped, so a merged `user_id` is not expressible without a new identity table. Spec assumption is factually wrong about the codebase. | DM-005 | L |
| DM-003 | H1 §1.0 / `institution_id` column | New tables must carry a nullable `institution_id uuid` for the institution-owned case. | partial | packages/database/src/schema/learn.ts:254, 284, 107 | Present on `learner_mastery`, `learner_model_events`, `learn_topic_profiles`. On `learner_mastery`/`learner_model_events` it is *context* (set alongside `student_id`), not an owner — so the XOR intent is not what the spec describes. `learn_session_blocks` and `learn_session_events` have no institution column at all. | - | S |
| DM-004 | H1 §1.0 / `owner_xor` CHECK | Every new table must carry a CHECK constraint literally named `owner_xor` enforcing exactly-one-owner. | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:186, 211; packages/database/src/schema/learn.ts:270, 299 | Constraints exist but are named `learner_mastery_owner_ck` / `learner_model_events_owner_ck` and use `num_nonnulls(student_id, independent_user_id) = 1`. Semantically equivalent for the 2-owner case; name and shape differ. Recommend the spec adopt `<table>_owner_ck` + `num_nonnulls` as the canonical form. | - | S |
| DM-005 | H1 §1.0 / RLS user branch | RLS on user-owned rows must be `auth.uid() = user_id`. | contradicted | packages/database/migrations/sql/zzz_rls.sql:216-222, 469-487; packages/database/src/client.ts:97-119 | This repo does not use Supabase `auth.uid()`. RLS binds to transaction-local GUCs `app.student_id` / `app.independent_user_id` set by `runInStudentTenant` / `runInIndependentStudentTenant`, read via `edrion_current_student()` / `edrion_current_independent_user()`. Spec must be rewritten to the GUC form. | DM-069 | M |
| DM-006 | H1 §1.0 / RLS institution branch | RLS on institution-owned rows must scope via the `app.institution_id` GUC. | conformant | packages/database/migrations/sql/zzz_rls.sql:20-22, 489-510; packages/database/src/client.ts:85-94 | | - | S |
| DM-007 | H1 §1.0 / independent tier | Independent-tier Learn rows must always be user-owned, never institution-owned. | conformant | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:123-126; apps/api/src/modules/student/edrion-learn/profile.service.ts:38-41; apps/api/src/modules/student/edrion-learn/evidence.service.ts:42-45 | | - | S |
| DM-008 | H1 §1.1 / table name | The topic profile table must be named `topic_profiles`. | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:127; packages/database/src/schema/learn.ts:101-102 | Table is `learn_topic_profiles`. Every FK, index, RLS policy and grant already references that name. Rename the spec, not the table. | - | S |
| DM-009 | H1 §1.1 / `id` + `version`/`created_at`/`updated_at` | Standard PK and audit columns. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:128, 141-143; packages/database/src/schema/learn.ts:104, 119-120 | | - | S |
| DM-010 | H1 §1.1 / owner columns | Profile rows must use the §1.0 CHECK form (exactly one owner). | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:144-148 | `learn_topic_profiles_owner_ck` explicitly permits a **third** state: both `institution_id` and `independent_user_id` NULL (an unowned/global profile). This is a direct violation of owner-XOR, not merely a naming difference. Nothing writes that state today (profile.service.ts:38-41 always sets one), so the CHECK can be tightened to `num_nonnulls(institution_id, independent_user_id) = 1`. | DM-072 | S |
| DM-011 | H1 §1.1 / `learn_topic_id` | Nullable FK to `learn_topics`, the canonical link for path/atom/syllabus topics. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:129; packages/database/src/schema/learn.ts:105 | | - | S |
| DM-012 | H1 §1.1 / `learn_topic_id` NULL rule | `learn_topic_id` may be NULL only for ad-hoc topics (free chat, un-promoted Library material). | partial | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:103-118 | The column is nullable, but the only writer always resolves a `learn_topics` row first via `upsertTopic`, so the NULL branch is dead. Ad-hoc/free topics instead mint a junk `learn_topics` row keyed `session:<8 chars>`. Either implement the null-FK path or accept topic-row minting and document it. | DM-070 | M |
| DM-013 | H1 §1.1 / `topic_key` format | `topic_key` must use `topic:<learn_topic_id>` / `material:<material_id>` / `free:<slug(title)>`. | absent | — | No format is produced or validated anywhere; keys are whatever the caller passes (`session:xxxxxxxx` for free sessions). Add a `TopicKey` builder in `packages/schemas` plus a DB CHECK on prefix. | - | M |
| DM-014 | H1 §1.1 / uniqueness | Unique index on `(owner_kind, coalesce(user_id, institution_id), topic_key)`. | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:151-165; packages/database/src/schema/learn.ts:122-135 | Four partial unique indexes exist instead — `(institution_id, learn_topic_id)`, `(institution_id, topic_key)`, `(independent_user_id, learn_topic_id)`, `(independent_user_id, topic_key)`. Consequence: for institutional students the profile is **shared institution-wide**, never per-student. Two extra `learn_topic_id` indexes have no spec counterpart. Also breaks upsert: profile.service.ts:42-52 does a bare INSERT with no `onConflict`, so a re-generate after TTL expiry raises 23505. | DM-071 | M |
| DM-015 | H1 §1.1 / `title` | `title text`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:133 | | - | S |
| DM-016 | H1 §1.1 / `profile` | `profile jsonb` validated by Zod `TopicProfileV1` (§2.2). | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:134; packages/schemas/src/student/edrion-learn/profile.ts:20-31; apps/api/src/modules/student/edrion-learn/profile.service.ts:30 | | - | S |
| DM-017 | H1 §1.1 / `profile_schema_version` | `profile_schema_version int` defaulting to 1. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:135; packages/database/src/schema/learn.ts:113 | | - | S |
| DM-018 | H1 §1.1 / `source` domain | `source` must be `'llm'` or `'human_override'`. | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:136; packages/schemas/src/student/edrion-learn/profile.ts:48; apps/api/src/modules/student/edrion-learn/profile.service.ts:48 | The DB CHECK is `source IN ('generated','human_override')` and the Zod enum matches. `'llm'` would be rejected by the CHECK. Either the spec adopts `'generated'` (cheapest) or a migration rewrites CHECK + enum + existing rows. | DM-073 | S |
| DM-019 | H1 §1.1 / `overridden_by` | `overridden_by uuid` nullable. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:137; packages/database/src/schema/learn.ts:115 | Column exists but has no FK, is not in the Zod DTO (profile.ts:50-64), and no code path ever writes it (no `PATCH /learn/topic-profiles/:id`). | DM-073 | S |
| DM-020 | H1 §1.1 / `model`+`prompt_version` provenance | Profiles must carry `model` and `prompt_version` matching the `concept_atoms` provenance convention. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:138-139; packages/database/migrations/0050_learn_core.sql:27-28; apps/api/src/modules/student/edrion-learn/profile.service.ts:49-50 | Columns exist but are **nullable**, whereas `concept_atoms.model`/`prompt_version` are NOT NULL — so the "same convention" claim is false at the constraint level. Worse, `model` is written as the literal string `'learn_profile'` (the call *purpose*) or `'default'`, never the actual model id, so provenance is not traceable. | DM-070 | S |
| DM-021 | H1 §1.1 / `expires_at` TTL | `expires_at` = now + `learn.profile_ttl_days` (default 180). | conformant | apps/api/src/modules/student/edrion-learn/constants.ts:6; apps/api/src/modules/student/edrion-learn/profile.service.ts:51, 77-81; packages/database/migrations/0096_edrion_learn_orchestrator.sql:140 | | - | S |
| DM-022 | H1 §1.1 / `expires_at` override rule | `human_override` rows must have `expires_at = NULL` (never expire). | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:31-33 | The *read* side honours it (a `human_override` row short-circuits the expiry check). The *write* side does not exist — there is no override endpoint, so no row can ever reach `source='human_override'`. No DB CHECK enforces `source='human_override' → expires_at IS NULL`. | DM-073 | M |
| DM-023 | H1 §1.1 / cache resolve order | Resolve by `learn_topic_id` first, else by `topic_key`. | conformant | apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:224-239 | | - | S |
| DM-024 | H1 §1.1 / stale-while-revalidate | Cache hit + unexpired → use with no LLM call; expired → stale-while-revalidate. | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:34-37 | Hit + unexpired is correct. Expired is **not** stale-while-revalidate: the request blocks on a fresh generation and then does a conflicting INSERT (see DM-014). Should return the stale profile immediately and enqueue regeneration. | DM-014 | M |
| DM-025 | H1 §1.1 / lazy invalidation | Regenerate when any child `concept_atom.updated_at` (or a `prompt_version` bump) is newer than the profile, checked lazily at session start. | absent | — | `concept_atoms.updated_at` was added for exactly this (packages/database/migrations/0096_edrion_learn_orchestrator.sql:5-14) but no code reads it. `profile.service.ts` never compares atom timestamps or prompt versions. | - | M |
| DM-026 | H1 §1.2 / extend not fork | Orchestrator columns must be added to the existing `learn_sessions`, with no parallel `orchestrated_sessions` table. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:17-35 | | - | S |
| DM-027 | H1 §1.2 / `topic_profile_id` | `topic_profile_id uuid FK`, nullable until the profile resolves. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:18, 167-170; packages/database/src/schema/learn.ts:148-150 | | - | S |
| DM-028 | H1 §1.2 / `entry_point` domain | `entry_point text` restricted to the P1 set plus P2 `'bad_result'`/`'upcoming_exam'`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:42-49 | | - | S |
| DM-029 | H1 §1.2 / `entry_ref` | `entry_ref jsonb` nullable carrying `{material_id}` / `{learning_path_id, learning_path_item_id}` / `{commitment_id}`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:20; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:135-141 | Column exists, but the written shapes are `{learning_path_item_id}` / `{knowledge_item_id}` / `{}` — never `{material_id}`, never `{learning_path_id}`, never `{commitment_id}`, and `{}` instead of NULL. No Zod schema constrains it. | - | S |
| DM-030 | H1 §1.2 / `session_context` | `session_context jsonb` holding Zod `SessionContextV1` incl. `policy_snapshot` from `resolve-policy` at start. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:23-24; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:127-134, 155; packages/database/src/schema/learn.ts:158-159 | Correct, but the policy snapshot is stored **twice** — inside `session_context.policy_snapshot` and again in a separate `policy_snapshot` column the spec never defines. Two sources of truth that can diverge. Drop the standalone column or drop the nested field. | - | S |
| DM-031 | H1 §1.2 / `emotional_context` | `emotional_context` must be present day one (P1 `'neutral'` except free-chat handoff). | conformant | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:122, 127-134 | | - | S |
| DM-032 | H1 §1.2 / `orchestrator_status` | Distinct `orchestrator_status text` column with a DB CHECK on the closed state set. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:51-57; packages/database/src/schema/learn.ts:156 | | - | S |
| DM-033 | H1 §1.2 / `state` | `state jsonb` holding `SessionStateV1`, rewritten each move under `WHERE version = :v`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:22; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:126-141; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:169, 311-318, 388 | Column and Zod parse are right. `updateSession` supports `expectedVersion`, but **no caller ever passes it** — every state rewrite is a last-write-wins update. Optimistic concurrency is nominal only. | DM-036 | M |
| DM-034 | H1 §1.2 / `plan_move_count` | `plan_move_count int` as the cost cap counter. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:29; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:313 | | - | S |
| DM-035 | H1 §1.2 / `checkpoints_total`/`checkpoints_done` | Both int columns, the source of truth for the progress bar. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:27-28; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:316-317 | | - | S |
| DM-036 | H1 §1.2 / `version` | `version int` for optimistic concurrency. | partial | packages/database/src/schema/learn.ts:177; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:135-139 | Column exists and is auto-incremented on every update, but is never used as a guard (see DM-033). Make `expectedVersion` mandatory on the state-mutating paths and return 409 on mismatch. | - | M |
| DM-037 | H1 §1.2 / `summary` | `summary jsonb` nullable, written at close. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:33; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:528-534; apps/api/src/modules/student/edrion-learn/session-completion.service.ts:15-51 | Column exists; `closeSession` and `SessionCompletionService.finalize` never write it. Sessions always close with `summary = NULL`. | - | M |
| DM-038 | H1 §1.2 / `ended_at` | `ended_at timestamptz` nullable. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:34; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:532 | | - | S |
| DM-039 | H1 §1.2 / `end_reason` domain | `end_reason` restricted to `goal_met`/`time_budget`/`move_cap`/`student_exit`/`abandoned`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:30; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:523, 214, 247 | No DB CHECK at all. The code writes an undefined value `'policy_kill'`, and never writes `'abandoned'` (no 24h paused sweeper exists). Add the CHECK and decide whether `policy_kill` joins the spec set. | - | S |
| DM-040 | H1 §1.2 / `evidence` reuse | The existing `evidence string[]` must be consumed as-is: evidence-producing moves append **evidence-event ids**. | contradicted | apps/api/src/modules/student/edrion-learn/artifact-commit.service.ts:40-42; apps/api/src/modules/student/edrion-learn/evidence.service.ts:61-68; packages/database/src/schema/learn.ts:176 | `artifact-commit.service.ts` appends raw card **front-matter markdown strings** into `learn_sessions.evidence`, not ids. The graded-answer path (`evidence.service.ts`) never appends to `evidence` at all — it puts the attempt id into `evidence_tags.evidence_event_ids` instead. The memory-diff substrate therefore cannot see Learn evidence through `learn_sessions.evidence`. | DM-060 | M |
| DM-041 | H1 §1.2 / active-session constraint | Partial unique index enforcing ≤1 session per user with `orchestrator_status IN ('active','awaiting_response','paused')`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:59-69; packages/database/src/schema/learn.ts:182-191 | Two indexes (student + independent) covering a safe superset `('created','active','awaiting_response','paused','closing')`, additionally gated on `entry_point IS NOT NULL` so legacy fixed-sequence rows are excluded. | - | S |
| DM-042 | H1 §1.3 / table name | The block table must be named `session_blocks`. | contradicted | packages/database/migrations/0050_learn_core.sql:136; packages/database/src/schema/learn.ts:195-196 | Table is `learn_session_blocks`, created in 0050 and extended in 0096 — it predates the hyperspec, carries the FK from `learn_attempts` and `learn_ai_calls`, and matches the repo's `learn_*` prefix convention. Rename the spec. | - | S |
| DM-043 | H1 §1.3 / user-owned only | Blocks are always `owner_kind='user'`. | absent | — | `learn_session_blocks` has **no owner column of any kind** (packages/database/migrations/0050_learn_core.sql:136-147). Ownership is derived transitively through `session_id → learn_sessions`. Defensible, but it is not what §1.0/§1.3 states, and it is the reason no direct RLS policy exists on the table (see DM-067). | DM-067 | M |
| DM-044 | H1 §1.3 / `id`, `session_id`, `created_at` | Standard columns; `session_id` FK to `learn_sessions`. | conformant | packages/database/migrations/0050_learn_core.sql:137-138, 145, 149-151 | FK is `ON DELETE cascade`. | - | S |
| DM-045 | H1 §1.3 / `seq` uniqueness | `seq int` monotonic per session, unique `(session_id, seq)`, serving as the generation idempotency key. | partial | packages/database/migrations/0050_learn_core.sql:139, 146; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:177-180 | Column is named `sequence`; the unique constraint exists. But `nextBlockSequence` computes max+1 in application memory with no lock, so it is a race, not an idempotency key. A concurrent plan/render pair will collide on the unique index rather than dedupe. | - | M |
| DM-046 | H1 §1.3 / `move_type` | `move_type text`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:73; packages/database/src/schema/learn.ts:207 | Nullable (legacy rows), no CHECK on the 8-move set. | - | S |
| DM-047 | H1 §1.3 / `block` jsonb immutability | `block jsonb` holding Zod `BlockV1`, immutable once the stream completes. | partial | packages/database/src/schema/learn.ts:205; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:252-262, 284-300 | Column is named `content`. It is inserted as `{}`, then updated at least once (and twice for `visual_spawn`) after creation. Nothing enforces immutability post-stream — no trigger, no `render_status`-conditioned CHECK. | - | M |
| DM-048 | H1 §1.3 / `block_schema_version` | `block_schema_version int`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:74; packages/database/src/schema/learn.ts:208 | Column exists and defaults to 1; the DTO hardcodes 1 rather than reading it (pedagogy-orchestrator.service.ts:568). | - | S |
| DM-049 | H1 §1.3 / `interaction_state` | `interaction_state jsonb`, mutable under `WHERE version = :v`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:77; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:165-175 | Column exists and is mutated, but `updateBlock` has no version predicate — and the table has no `version` column to check against (DM-051). Concurrent `/interact` calls silently clobber each other. | DM-051 | M |
| DM-050 | H1 §1.3 / `plan_reasoning` | `plan_reasoning text`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:75; packages/database/src/schema/learn.ts:209 | Column is named `reasoning`. Purely a naming delta — align the spec or rename the column. | - | S |
| DM-051 | H1 §1.3 / `version` | Blocks must carry `version` for optimistic concurrency on `interaction_state`. | absent | — | `learn_session_blocks` has no `version` column (packages/database/src/schema/learn.ts:195-224). The DTO fabricates `version: 1` (pedagogy-orchestrator.service.ts:573). Add the column + increment + guard. | DM-049 | M |
| DM-052 | H1 §1.3 / `degraded` | `degraded boolean default false`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:76; packages/database/src/schema/learn.ts:210 | | - | S |
| DM-053 | H1 §1.3 / `latency_ms` | `latency_ms jsonb` per block. | absent | — | No such column on `learn_session_blocks`. Per-call latency lives only in `learn_ai_calls.duration_ms`/`first_token_ms`. Either add the column or delete the requirement and rely on `learn_ai_calls` joined by `block_id`. | - | S |
| DM-054 | H1 §1.4 / composite PK | `learner_mastery` must have composite PK `(user_id, atom_id)`. | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:174, 189-195; packages/database/src/schema/learn.ts:251, 271-276 | Table uses a surrogate `id uuid PRIMARY KEY` plus two **partial** unique indexes `(student_id, atom_id) WHERE student_id IS NOT NULL` and `(independent_user_id, atom_id) WHERE independent_user_id IS NOT NULL`. A composite PK over `(user_id, atom_id)` is impossible without the non-existent `user_id` (DM-002). Consequential bug: `upsertMastery` passes a bare column list to `onConflictDoUpdate` (edrion-learn.repository.ts:280-284) — Postgres cannot infer a partial index from a column list and raises 42P10 unless `targetWhere` is supplied. | DM-002, DM-063 | M |
| DM-055 | H1 §1.4 / `atom_id` FK | `atom_id` FK to `concept_atoms`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:178; packages/database/src/schema/learn.ts:259-261 | | - | S |
| DM-056 | H1 §1.4 / `rating` default | `rating int` (Elo) defaulting to 1200. | contradicted | packages/database/migrations/0096_edrion_learn_orchestrator.sql:179; packages/database/src/schema/learn.ts:262; packages/schemas/src/student/edrion-learn/mastery.ts:13 | Default is **800**, not 1200, in DB, Drizzle, and `MASTERY_RATING_DEFAULT`. §6's display formula `m = clamp((r−800)/800, 0, 1)` means a fresh learner reads as mastery **0.0**, not the specified 0.5. Either change the default to 1200 (with a backfill of untouched rows) or change §6/§1.4 to 800. This silently mis-renders every progress UI. | DM-064 | M |
| DM-057 | H1 §1.4 / `attempts` | `attempts int`. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:180; apps/api/src/modules/student/edrion-learn/mastery.service.ts:40, 57 | | - | S |
| DM-058 | H1 §1.4 / `last_outcome` | `last_outcome boolean nullable`. | absent | — | Not in the migration (packages/database/migrations/0096_edrion_learn_orchestrator.sql:173-187) nor in Drizzle (packages/database/src/schema/learn.ts:250-278). An unspecified `correct_weight numeric` exists in its place. Add the column or replace the spec field with `correct_weight`. | - | S |
| DM-059 | H1 §1.4 / `last_attempt_at`, `version`, `updated_at` | Standard tracking columns. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:182-185; packages/database/src/schema/learn.ts:265-267 | | - | S |
| DM-060 | H1 §1.4 / user-owned | `learner_mastery` is user-owned. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:175-177, 186 | Owner XOR is enforced over `(student_id, independent_user_id)`, but a third column `institution_id` is written alongside `student_id` (edrion-learn.repository.ts:263-267). Per §1.0 that would be "both owners set". It is context, not ownership — the spec needs a category for institution-context-on-a-user-owned-row, which several repo tables already use. | - | S |
| DM-061 | H1 §1.4 / seeding backfill | A BullMQ job must replay existing `learn_attempts` per (user, atom) chronologically to seed mastery. | absent | — | No `mastery-backfill` / `seed-mastery` job exists anywhere in `apps/api/src`. Only the live per-answer path writes mastery. | DM-062, DM-063 | L |
| DM-062 | H1 §1.4 / outcome derivation #1 | Derive outcome first from `learn_attempts.evaluation` (`evaluation.correct`, or `evaluation.score ≥ threshold`). | partial | apps/api/src/modules/student/edrion-learn/mastery.service.ts:36, 46 | Only `evaluation.correct` is consulted; the `evaluation.score ≥ threshold` fallback is not implemented and no threshold constant exists in constants.ts. | DM-061 | S |
| DM-063 | H1 §1.4 / outcome derivation #2 | Fall back to the linked `evidence_tags.polarity` (positive → correct, negative → incorrect). | absent | — | `mastery.service.ts:36` returns `null` as soon as `evaluation.correct == null`; `evidence_tags.polarity` is written (evidence.service.ts:58-68) but never read back for derivation. | DM-061 | M |
| DM-064 | H1 §1.4 / half-weight K | `hints_used > 0` on a correct outcome applies K at half weight. | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:43-44; packages/schemas/src/student/edrion-learn/mastery.ts:14-16 | | - | S |
| DM-065 | H1 §1.4 / idempotent recompute | Seeding must be idempotent (recompute-from-scratch). | absent | — | No backfill exists, and the live path is incremental-only (`upsertMastery` overwrites with computed values). There is no recompute entry point. | DM-061 | M |
| DM-066 | H1 §1.5 / append-only | `learner_model_events` must be append-only — no UPDATE, no DELETE. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:222-229, 277-278; packages/database/migrations/sql/zzz_grants.sql:47, 55-70 | Enforced three ways: a BEFORE UPDATE OR DELETE trigger, a REVOKE on `edrion_app`, and the shared `edrion_block_mutation` trigger. | - | S |
| DM-067 | H1 §1.5 / owner + `session_id` | Columns `id`, `user_id`, `session_id` nullable. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:199-205 | `session_id` nullable FK is correct (`ON DELETE SET NULL`). Ownership is the `student_id`/`independent_user_id` pair, not `user_id` (DM-002), plus context `institution_id`. Extra unspecified columns `attempt_id`, `atom_id`, `idempotency_key` — the last is load-bearing for replay dedupe and should be added to the spec. | - | S |
| DM-068 | H1 §1.5 / `event_type` domain | `event_type` restricted to `mastery_update`, `context_set`, `fatigue_detected`, `break_suggested`, `profile_generated`, `profile_overridden`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:206; packages/schemas/src/student/edrion-learn/mastery.ts:65-72 | The Zod enum is exact; the DB column is bare `text` with **no CHECK**. Only `mastery_update` is ever written (evidence.service.ts:83) — the other five event types have no producer. | - | S |
| DM-069 | H1 §1.5 / `data` jsonb | `data jsonb`; for `mastery_update` it carries `{atom_id, rating_before, rating_after, outcome, k, expected_p, source_block_id, hinted}`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:207; apps/api/src/modules/student/edrion-learn/evidence.service.ts:86-95; packages/schemas/src/student/edrion-learn/mastery.ts:74-83 | Payload shape matches the spec exactly. The column is named `payload`, not `data`. Naming delta only. | - | S |
| DM-070 | H1 §1.5 / paired `learning_events` writeback | Every writeback must also emit a `learning_events` row **through the visual-memory-diff service, in the same transaction**. | contradicted | apps/api/src/modules/student/edrion-learn/evidence.service.ts:78-110; apps/api/src/modules/student/ledger/learning-events.writer.ts:21-27 | Three violations: (a) the writer is `LearningEventsWriter`, not the visual-memory-diff service; (b) there is no transaction — `insertModelEvent` and `ledger.log` are separate statements on the pooled handle; (c) `LearningEventsWriter.log` wraps everything in try/catch and swallows failures, so a `learner_model_events` row can exist with no `learning_events` twin. Also the `learning_events` row is emitted **unconditionally**, even when `masteryUpdate` is null, so the two logs do not correspond 1:1. | DM-061 | L |
| DM-071 | H1 §1.6 / `learn_attempts` reuse | Retrieval/prereq answers write the existing `learn_attempts` in its `input`/`evaluation`/`hints_used` shape; no parallel table. | conformant | packages/database/migrations/0050_learn_core.sql:153-164; apps/api/src/modules/student/edrion-learn/evidence.service.ts:47-56 | | - | S |
| DM-072 | H1 §1.6 / `session_block_id` migration | `learn_attempts` gains a nullable `session_block_id` by migration. | contradicted | packages/database/migrations/0050_learn_core.sql:155-156, 170-172; packages/database/migrations/0096_edrion_learn_orchestrator.sql:94-102 | No `session_block_id` column exists or is added. The pre-existing `block_id uuid REFERENCES learn_session_blocks(id) ON DELETE set null` (from 0050) already serves this role; 0096 added `question_id` instead. Spec should reference `block_id`. | DM-078 | S |
| DM-073 | H1 §1.6 / `evidence_tags` seeding source | `evidence_tags` (`tag_key`,`label`,`polarity`,`note`,`evidence_event_ids`) is consumed for mastery seeding. | absent | — | Columns all exist (packages/database/migrations/0051_learn_revision.sql:34-49) but nothing reads them for seeding — see DM-061/DM-063. | DM-061 | M |
| DM-074 | H1 §1.6 / `evidence_tags` writes | Graded moves write `evidence_tags` via the existing evidence path. | partial | apps/api/src/modules/student/edrion-learn/evidence.service.ts:61-68; packages/database/migrations/0051_learn_revision.sql:59-61 | Rows are written directly by `EdrionLearnRepository.insertEvidenceTag`, bypassing any shared evidence service. Two problems: the insert spreads an `institutionId` key onto a table that has no such column (silently dropped), and `tag_key` is a per-answer unique string (`learn:<session>:<block>:<question>`), which defeats the `(student_id, tag_key)` unique index's purpose of aggregating a *tag* and makes `evidence_tags` a de-facto second attempt log. | - | M |
| DM-075 | H1 §1.6 / `concept_atoms` | `concept_atoms` is both profiler input and mastery target. | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:62-70; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:65-71 | Mastery target: yes. Profiler input: **no** — `generateProfile` sends only `{title, topicKey}`; `listConceptAtoms` exists but is never called from the profiler, so §2.1's "title + its concept_atoms (≤4k tokens)" is not implemented. | DM-025 | M |
| DM-076 | H1 §1.6 / `learning_paths`/`learning_path_items` | Path entry reads/writes item `status` as the legacy flow does. | conformant | apps/api/src/modules/student/edrion-learn/session-completion.service.ts:29-34; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:364-371; packages/database/migrations/0050_learn_core.sql:69-80 | Note schema drift: `optional_branch` is `boolean` in SQL (0050:75) but `integer` in Drizzle (packages/database/src/schema/learn.ts:91). | - | S |
| DM-077 | H1 §1.6 / `visual_canvases` | Visual-spawn writes to `visual_canvases` + revisions via Chat 9's pipeline. | contradicted | apps/api/src/modules/student/edrion-learn/canvas-graph.service.ts:45-51; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:271-294 | `CanvasGraphService.generateForSession` returns `canvasId: randomUUID()` — a **fabricated id for a row that is never created**. It calls `visualGen.generateGraph` (generation only) and never `visual-studio.repository.ts:119`/`:477` where canvases are actually inserted. The orchestrator then stores the whole graph in `learn_session_blocks.interaction_state.graph`. The `block.canvas_id` is a dangling reference. | DM-080 | L |
| DM-078 | H1 §1.6 / flashcard tables | Artifact commit writes cards into the existing flashcard tables, source-linked `{session_id, block_id}`. | partial | apps/api/src/modules/student/edrion-learn/artifact-commit.service.ts:19-38; packages/database/src/schema/student-knowledge.ts:127-147, 149-169 | Cards go to the existing `flashcard_decks`/`flashcards` (correct — no Learn-owned card table). But the source link is deck-level `source_session_id` only; `flashcards` has no `source_block_id` column, so the per-card `{block_id}` half of the link is lost even though `BlockV1.artifact_commit.cards[].source_block_id` carries it. | - | M |
| DM-079 | H1 §1.6 / `learn_ai_calls` reuse | `learn_ai_calls` is reused (not recreated) as the LLM call log. | conformant | packages/database/migrations/0051_learn_revision.sql:63-75; packages/database/migrations/0096_edrion_learn_orchestrator.sql:104-124 | 0096 extends the 0051 table additively with session/block/prompt_version/flags. | - | S |
| DM-080 | H1 §4.5 / sole call log | Every plan/render/grade/profile/judge call writes exactly one `learn_ai_calls` row; no second logging table. | partial | apps/api/src/modules/student/edrion-learn/move-planner.service.ts:93-96, 100-105; apps/api/src/modules/student/edrion-learn/block-renderer.service.ts:54-59, 64-71; apps/api/src/modules/student/edrion-learn/grading.service.ts:58-62, 65-70; apps/api/src/modules/student/edrion-learn/profile.service.ts:71 | Plan/render/grade/profile all log on both success and failure, and no second log table exists. Gaps: (a) the visual-spawn generation call logs as `visual_generate` with **no** `session_id`/`block_id` (visual-generation.service.ts:108), so it is unattributable to a Learn session; (b) no `judge`/eval call type exists yet. | - | M |
| DM-081 | H1 §4.5 / `call_type` | The row records `call_type`. | partial | packages/database/migrations/0051_learn_revision.sql:68; apps/api/src/modules/student/learn-ai/provider.ts:8-33 | Column is named `purpose`, and it is bare `text` with no CHECK — the enum lives only in TypeScript (`LearnAiPurpose`, 24 values). Naming delta plus a missing DB CHECK. | - | S |
| DM-082 | H1 §4.5 / `model` + `prompt_version` | The row records `model` and `prompt_version`. | conformant | packages/database/migrations/0051_learn_revision.sql:69; packages/database/migrations/0096_edrion_learn_orchestrator.sql:109; apps/api/src/modules/student/learn-ai/learn-ai-call.logger.ts:36-37 | | - | S |
| DM-083 | H1 §4.5 / `session_id` nullable | `session_id` nullable (NULL for profiler calls). | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:106, 116-119; apps/api/src/modules/student/edrion-learn/profile.service.ts:71 | Column and FK are right. But `session_id` is also NULL for **plan** calls made outside `planAndRenderNextBlock`'s opts and for all visual calls, so NULL no longer means "profiler". `TopicProfileService.resolve` has no session id to pass because it runs before the session row exists — acceptable, but should be stated. | - | S |
| DM-084 | H1 §4.5 / `block_seq` nullable | `block_seq` nullable. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:108; apps/api/src/modules/student/edrion-learn/block-renderer.service.ts:57 | | - | S |
| DM-085 | H1 §4.5 / tokens + latency | The row records tokens in/out and `latency_ms`. | conformant | packages/database/migrations/0051_learn_revision.sql:70-71, 73; apps/api/src/modules/student/learn-ai/learn-ai-call.logger.ts:38-41 | Latency column is `duration_ms`; `first_token_ms` added in 0096:114. | - | S |
| DM-086 | H1 §4.5 / degraded/retry/speculative flags | The row records `degraded`, `retry` and `speculative` flags. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:110-112; apps/api/src/modules/student/learn-ai/learn-ai-call.logger.ts:43-45 | All three columns exist and the logger accepts them, but **nothing ever passes `retry: true` or `speculative: true`** — there is no retry-once path and no pipelining, so both columns are permanently `false`. `degraded` is written only by block-renderer.service.ts:70. | - | M |
| DM-087 | H1 §4.5 / `outcome` | The row records the call `outcome`. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:113; apps/api/src/modules/student/learn-ai/learn-ai-call.logger.ts:46 | Column and logger option exist; no call site ever supplies `outcome`, so the column is always NULL. Failures are recorded in `error` instead. | - | S |
| DM-088 | H1 §4.5 / append-only | The call log must be immutable. | conformant | packages/database/migrations/0051_learn_revision.sql:85-92; packages/database/migrations/sql/zzz_grants.sql:40, 55-70 | Trigger + REVOKE on `edrion_app`. Note type drift: `cached` is `boolean` in SQL (0051:72) but `integer` in Drizzle (packages/database/src/schema/learn.ts:407) and the logger writes `1`/`0` (learn-ai-call.logger.ts:40). | - | S |
| DM-089 | H1 AC1 / every LLM call logged | A cached topic makes zero profiler LLM calls; an uncached free topic makes exactly one (+≤1 retry); every LLM call appears in `learn_ai_calls`. | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:29-37, 60-75 | Cache hit → zero calls: correct. Uncached → exactly one call: correct, but there is **no retry** at all (the catch returns `DEFAULT_PROFILE` immediately and, unlike plan/render/grade, logs **nothing** on the failure path), so a failed profiler call is invisible in `learn_ai_calls`. Add a failure-path log + one retry with Zod errors quoted. | DM-080 | M |
| DM-090 | H1 AC2 / override rows never regenerate or expire | `topic_profiles.source='human_override'` rows never regenerate/expire. | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:31-33 | Read path honours it. No write path can produce such a row (no `PATCH /learn/topic-profiles/:id`, no `learn.profile.override` capability, `overridden_by` never set) and no DB constraint enforces `expires_at IS NULL` for overrides. | DM-019, DM-022 | M |
| DM-091 | H1 AC2 / provenance columns | Override and generated rows carry `model` + `prompt_version` per the `concept_atoms` convention. | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:49-50; packages/database/migrations/0050_learn_core.sql:27-28 | Both columns are populated on generated rows but are nullable (vs NOT NULL on `concept_atoms`) and `model` holds the purpose string `'learn_profile'` or `'default'`, not a model id. Not traceable for eval. | DM-020 | S |
| DM-092 | H1 AC3 / FK resolution | Profiles resolve against an existing `learn_topics` row when one exists (`learn_topic_id` set); only ad-hoc topics use the null-FK form. | partial | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:107-118; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:33-54 | `learn_topic_id` is always set — which satisfies the first half, but by *forcing* a `learn_topics` row into existence via `upsertTopic` for every session, including ad-hoc ones (topic_key `session:<8 chars>`, title = the same junk key). The null-FK branch is unreachable. Either implement the ad-hoc branch or accept topic minting and delete the null-FK form from §1.1. | DM-012 | M |
| DM-093 | H1 AC4 / partial unique index | ≤1 non-terminal orchestrated session per user, enforced by a partial unique index. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:59-69 | | - | S |
| DM-094 | H1 AC4 / 409 response | A second POST returns 409 with the active session id. | conformant | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:87-94 | `ConflictException({code:'SESSION_ACTIVE', activeSessionId})`. Note this is an app-level pre-check only — a genuine index violation (race) would surface as an unmapped 23505/500, not a 409. | - | S |
| DM-095 | H1 AC8 / exactly one attempt row | Answering twice creates exactly one `learn_attempts` row, one `evidence_tags` row and one mastery update. | conformant | packages/database/migrations/0096_edrion_learn_orchestrator.sql:98-102; apps/api/src/modules/student/edrion-learn/evidence.service.ts:30-36, 39-40 | Guarded twice: a `findAttemptByQuestion` pre-check and the `(session_id, block_id, question_id)` partial unique index; the mastery event is separately guarded by `learner_model_events` idempotency key. | - | S |
| DM-096 | H1 AC8 / second call returns stored result | The second call must return the **stored** result. | contradicted | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:345-361, 362-373, 392-396 | The duplicate path returns a **freshly recomputed** `evaluation` object, not `result.attempt.evaluation`. For `short_text`/`numeric` questions this means the idempotent replay fires **another billed LLM grading call** (grading.service.ts:45-57) and can return a different `correct` value than the row on disk. Return `existing.evaluation` when `duplicate === true` and short-circuit before grading. | - | S |
| DM-097 | H1 AC11 / shape-identical to quiz rows | Learn's `learn_attempts` rows must be shape-identical to quiz-written rows plus the block link, and Chat 8 readers must consume them unmodified. | partial | apps/api/src/modules/student/learn/learn.repository.ts:168-177; apps/api/src/modules/student/edrion-learn/evidence.service.ts:47-56 | Untestable as stated: the legacy quiz path's `LearnRepository.insertAttempt` has **no callers anywhere** in `apps/api/src`, so zero quiz-written rows exist to compare against. Learn is currently the sole writer of `learn_attempts`. Either wire the legacy path or restate AC11 against the column contract rather than against a second writer. | DM-072 | M |
| DM-098 | H1 AC13 / no Learn-owned card storage | Artifact commits create rows only in the existing flashcard tables. | conformant | apps/api/src/modules/student/edrion-learn/artifact-commit.service.ts:19-38; apps/api/src/modules/student/library/library.repository.ts:307, 343 | Writes go to `flashcard_decks`/`flashcards`; no Learn-owned card table exists. | - | S |
| DM-099 | H1 AC13 / no Learn-owned canvas storage | Learn owns no canvas storage; visual artifacts live in `visual_canvases`. | contradicted | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:284-286; apps/api/src/modules/student/edrion-learn/canvas-graph.service.ts:51 | The full generated graph is persisted into `learn_session_blocks.interaction_state.graph` and **nothing** is written to `visual_canvases`. That is Learn-owned canvas storage by any reading, and the `canvas_id` in the block is a fabricated UUID pointing at no row. Route through `VisualStudioRepository` and store only `{graph_json_ref, canvas_id}`. | DM-077 | L |
| DM-100 | H1 AC16 / `owner_xor` on every new table | Every new Learn table carries an owner-XOR constraint. | partial | packages/database/migrations/0096_edrion_learn_orchestrator.sql:186, 211, 144-148, 232-240 | Per-table reality: `learner_mastery` ✔ (`num_nonnulls = 1`); `learner_model_events` ✔; `learn_topic_profiles` ✘ (permits both-NULL, DM-010); `learn_session_blocks` ✘ (no owner columns at all, DM-043); `learn_session_events` ✘ (no owner columns, session-derived). 2 of 5 new tables conform. | DM-010, DM-043 | M |
| DM-101 | H1 AC16 / independent rows are user-owned | Independent-tier rows are owner_kind='user'. | conformant | apps/api/src/modules/student/edrion-learn/evidence.service.ts:44-45; apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:126; apps/api/src/modules/student/edrion-learn/profile.service.ts:41 | Independent rows always set `independent_user_id` with `institution_id`/`student_id` NULL. | - | S |
| DM-102 | H1 AC16 / cascade on session delete | Deleting a user's sessions must cascade blocks and events but never touch committed Library artifacts. | conformant | packages/database/migrations/0050_learn_core.sql:149-151; packages/database/migrations/0096_edrion_learn_orchestrator.sql:203, 234; packages/database/src/schema/student-knowledge.ts:137; packages/database/src/schema/visual-studio.ts:45 | `learn_session_blocks.session_id` and `learn_session_events.session_id` are `ON DELETE cascade`; `learner_model_events.session_id`, `learn_attempts.session_id`, `learn_ai_calls.session_id`, `flashcard_decks.source_session_id` and `visual_canvases.source_session_id` are all `ON DELETE SET NULL`. Committed artifacts survive. | - | S |
| DM-103 | H1 §1.0 / RLS coverage on new tables | Every Learn table holding learner data must be RLS-protected. | partial | packages/database/migrations/sql/zzz_rls.sql:465-487, 489-510, 512-534 | Covered: `learner_mastery`, `learner_model_events`, `learn_topic_profiles`, `learn_session_events` (+ `visual_canvases`, `visual_canvas_revisions`). **Not covered at all** — no `ENABLE ROW LEVEL SECURITY`, no policy: `learn_sessions`, `learn_session_blocks`, `learn_attempts`, `evidence_tags`, `revision_states`, `learn_ai_calls`, `learn_topics`, `concept_atoms`, `learning_paths`, `learning_path_items`, `quick_answers`. Cross-learner isolation on the session path rests entirely on application `WHERE` clauses. | DM-043 | L |
| DM-104 | H1 §1.0 / RLS actually binds | RLS must bind to the application's database role. | contradicted | packages/database/migrations/sql/zzz_rls.sql:17; .env.example:11; packages/database/src/client.ts:19-24 | `zzz_rls.sql:17` sets `ALTER ROLE edrion_app NOBYPASSRLS` and grants assume `edrion_app`, but nothing in the repo makes the API **connect** as that role — `DATABASE_URL` defaults to a local superuser (`postgres://macbook@localhost:5432/edrion`) and `createDatabase` uses it verbatim. A superuser bypasses RLS entirely, so all Learn RLS is inert as configured. | DM-103 | M |
| DM-105 | H1 §1.0 / GUC escape hatch | RLS policies must deny by default when no owner context is set. | partial | packages/database/migrations/sql/zzz_rls.sql:474-478, 493-495 | Every Learn owner policy begins with `(edrion_current_student() IS NULL AND edrion_current_independent_user() IS NULL)` → allow-all. Deliberate (migrate/seed run without GUCs) but it means any code path that reaches the DB **outside** `StudentTenantInterceptor` — BullMQ workers, the future mastery backfill, SSE handlers that outlive the request transaction — sees every learner's rows. `visual_canvases` (zzz_rls.sql:227-237) has no such escape and is the stricter model to copy. | DM-103 | M |

---

## A1 findings

**Tenancy form, per table (the authoritative fact).** No Learn table uses the hyperspec's `owner_kind` + `owner_xor` form; not one `owner_kind` column exists anywhere in the repo. Five distinct forms are in use. (1) `learner_mastery` and `learner_model_events`: `institution_id` (context) + `student_id`/`independent_user_id` with `CHECK num_nonnulls(student_id, independent_user_id) = 1`, named `<table>_owner_ck` (0096:186, 0096:211). (2) `learn_sessions`, `learn_attempts`, `learning_paths`, `quick_answers`, `revision_states`, `evidence_tags`: the older 0050/0051 form — the same two owner columns but a spelled-out `(A NOT NULL AND B NULL) OR (A NULL AND B NOT NULL)` CHECK named `<table>_subject_ck` (0050:106-109, 0051:12-15, 0051:45-48); `learn_attempts` has **no owner CHECK at all** (0050:153-164). (3) `learn_topic_profiles`: `institution_id`/`independent_user_id` (no `student_id`) with a CHECK that **also permits both NULL** (0096:144-148) — a genuine owner-XOR violation, and the reason institutional profiles are shared institution-wide rather than per-student (0096:151-165). (4) `learn_session_blocks` and `learn_session_events`: **no owner columns**; ownership is derived through `session_id`. (5) `learn_topics`/`concept_atoms`: institution-optional shared curriculum assets, no learner owner.

**RLS reality.** Only four Learn tables have RLS: `learner_mastery`, `learner_model_events`, `learn_topic_profiles`, `learn_session_events` (zzz_rls.sql:465-534). `learn_sessions`, `learn_session_blocks`, `learn_attempts`, `evidence_tags`, `revision_states`, `learn_ai_calls`, `quick_answers`, `learning_paths`, `learning_path_items` have none. The policies that do exist bind to GUCs (`app.student_id`, `app.independent_user_id`, `app.institution_id`) set per request by `StudentTenantInterceptor` → `runInStudentTenant`, not to `auth.uid()`. Two things make even that coverage inert: every Learn policy opens with an allow-all branch when both student GUCs are unset, and `DATABASE_URL` in `.env.example:11` connects as a local superuser rather than the `edrion_app` role the whole grants/RLS layer is written for. So today RLS is defence-in-depth on paper only.

**Top 5 contradictions.** (1) `CanvasGraphService` fabricates `canvasId: randomUUID()` and never inserts into `visual_canvases`, persisting the whole graph into `learn_session_blocks.interaction_state` — Learn owns canvas storage and every block's `canvas_id` is a dangling reference (canvas-graph.service.ts:51; pedagogy-orchestrator.service.ts:284-286). (2) `learner_mastery.rating` defaults to **800**, not 1200, in DB, Drizzle and schemas — under §6's `(r−800)/800` formula every new learner renders as mastery 0.0 instead of 0.5 (0096:179; mastery.ts:13). (3) Duplicate answers return a recomputed evaluation rather than the stored row, re-firing a billed grading LLM call and able to disagree with disk (pedagogy-orchestrator.service.ts:345-361, 392-396). (4) `learn_topic_profiles_owner_ck` permits both owners NULL, and the four partial unique indexes make institutional profiles institution-wide, with a bare INSERT that raises 23505 after TTL expiry (0096:144-165; profile.service.ts:42-52). (5) The paired `learning_events` writeback is neither transactional nor routed through the visual-memory-diff service, and swallows its own errors (evidence.service.ts:78-110; learning-events.writer.ts:21-27).

**On LEARN-SESSION-DIAGNOSIS.md.** Verified-correct: D10 (partial-index `ON CONFLICT`), D11 (TTL-expiry duplicate key), D12 (four tables without RLS — actually **nine**, it undercounts). Out of date: it cites `0051_learn_revision_evidence.sql`, which does not exist (the file is `0051_learn_revision.sql`), and its D12 claim that the API connects as Supabase's `postgres` role is unverifiable from the repo — what is verifiable is that `.env.example` points at a local superuser and nothing forces `edrion_app`.

---

# A2 · Topic profiler, learner model, mastery math, seeding

# A2 — Topic Profiler / Learner Model / Mastery Math conformance matrix

Spec: `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-1-CORE-ENGINE.md`
Scope: §2 (all), §1.1 cache rules, §1.4 seeding, §1.5 events, §6 math, AC1/2/3/9/10.

| ID | Hyperspec ref | Binding requirement | Status | Evidence | Delta | Blocks | Effort |
|---|---|---|---|---|---|---|---|
| PM-001 | §2.1 | Session start resolves the topic, `learn_topic_id` where possible | conformant | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:107-118 | — | — | — |
| PM-002 | §2.1 | Cache hit → straight to planner, no LLM call | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:25-36 | — | — | — |
| PM-003 | §2.1 | On `learning_path` creation, enqueue a `profile-topic` BullMQ pre-warm job | absent | — | No enqueue anywhere; grep for `profile-topic`/`prewarm` in apps/api/src returns nothing | First-token latency on every path start | M |
| PM-004 | §2.1 | On Library-document indexing completion, enqueue `profile-topic` | absent | — | Same | Library-entry latency | M |
| PM-005 | §2.1 | A `profile-topic` job type exists at all | absent | — | `QUEUE_NAMES` has `ai` but no learn job is registered; `queue.worker.ts` only registers `PING_JOB` | All pre-warm | M |
| PM-006 | §2.1 | Inline miss uses the **small** model tier | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:64 (`tier: 'small'`) | — | — | — |
| PM-007 | §2.1 | Inline profiler call bounded at **≤4s** | absent | — | No timeout/AbortSignal anywhere in `apps/api/src/modules/student/learn-ai/*.ts` (grep for `timeout`/`AbortController`/`Promise.race` returns zero hits) | SSE hangs before first byte | M |
| PM-008 | §2.1 | Timeout → `DEFAULT_PROFILE` **and** enqueue a background job | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:73-75 | Bare catch returns default; nothing enqueued, and there is no timeout to trigger it | Profile never improves after a miss | M |
| PM-009 | §2.1 | Profiler input includes `learn_topic` title | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:66 | — | — | — |
| PM-010 | §2.1 | Input includes the topic's `concept_atoms` (titles + `content` summaries) | absent | — | `repo.listConceptAtoms` (edrion-learn.repository.ts:65-71) has **zero callers** | Profile is content-blind | M |
| PM-011 | §2.1 | Atom input budget **≤4k tokens** | absent | — | No token budgeting; no atoms are sent at all | Cost/quality guardrail | S |
| PM-012 | §2.1 | Input includes syllabus context | absent | — | Payload is `{title, topicKey}` only | Curriculum grounding | M |
| PM-013 | §2.1 | Input includes (material) outline + first chunk | absent | — | Same | Library-document profiling | M |
| PM-014 | §2.1 | Output parsed into `TopicProfileV1` | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:67-68 | — | — | — |
| PM-015 | §2.1 | Invalid output → **one** retry with Zod errors quoted back | conformant | apps/api/src/modules/student/learn-ai/openai.provider.ts:112-152 (2-attempt loop, error text re-prompted at :117) | Generic to all `completeJson`, not profiler-specific — acceptable | — | — |
| PM-016 | §2.1 | Second failure → `DEFAULT_PROFILE` | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:73-75 | — | — | — |
| PM-017 | §2.1 | Log `profile_generation_failed` | absent | — | `catch {}` swallows with no log, no event, no `learn_ai_calls` row | Silent permanent degradation is invisible | S |
| PM-018 | §2.1 / §4.5 | Every profiler call logs to `learn_ai_calls` | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:71 | Success path logs; failure path (:73-75) writes no row — unlike grading.service.ts:65-70, which does | AC1, cost reporting | S |
| PM-019 | §1.1 / §2.1 | Row records `model` per the `concept_atoms` provenance convention | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:49 | Writes the literal `'learn_profile'` (a purpose string) or `'default'`; the real model id is available in `usage.model` and discarded | AC2, eval traceability | S |
| PM-020 | §1.1 / §2.1 | Row records `prompt_version` | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:50; apps/api/src/modules/student/learn-ai/prompts/version.ts:1 (`'learn-v2'`) | Global constant, not per-prompt | — | — |
| PM-021 | §2.1 | Profiler has a real prompt (dimension guidance, misconception/curriculum grounding) | absent | apps/api/src/modules/student/edrion-learn/profile.service.ts:65 | The whole prompt is the inline one-liner `'Generate a TopicProfileV1 JSON for teaching this topic.'`. No file under `edrion-learn/prompts/` (only `plan.prompt.ts`, `render.prompt.ts`) | Profile quality; every downstream move gate | M |
| PM-022 | §1.1 | Cache resolves by `learn_topic_id` first, else `topic_key` | conformant | apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:224-239 | — | — | — |
| PM-023 | §1.1 | Hit + unexpired → use, no LLM call | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:34-35 | — | — | — |
| PM-024 | §1.1 | Expired → **stale-while-revalidate** | contradicted | apps/api/src/modules/student/edrion-learn/profile.service.ts:34-52; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:242-245 | Expiry drops into a blocking inline regeneration, then a bare `INSERT` with no `onConflict` → violates `learn_topic_profiles_independent_topic_key_uq` (schema/learn.ts:132-134). Every session on that topic 500s after TTL | Session start after 180d; AC1 | M |
| PM-025 | §1.1 | Regenerate when any child `concept_atom.updated_at` is newer than the profile | absent | — | Only `expiresAt` is consulted; `repo.touchConceptAtom` (edrion-learn.repository.ts:73-78) is also callerless | Stale profiles after atom edits | M |
| PM-026 | §1.1 | Regenerate on `prompt_version` bump | absent | — | `promptVersion` is written but never compared on read | Prompt rollouts don't take effect | S |
| PM-027 | §1.1 | Freshness checked lazily at session start; no sweep job | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:21-36 | Lazy by construction (though the checks themselves are missing — PM-025/026) | — | — |
| PM-028 | §1.1 | `expires_at = now + learn.profile_ttl_days` (default 180) | partial | apps/api/src/modules/student/edrion-learn/constants.ts:6; apps/api/src/modules/student/edrion-learn/profile.service.ts:77-81 | Value 180 correct, but hardcoded — not resolvable through the `learn.*` config/flag ladder | Per-institution tuning | S |
| PM-029 | §1.1 | `human_override` rows have `expires_at = null` (never expire) | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:31-33 | Read path correctly short-circuits on `source === 'human_override'` regardless of expiry; but no write path ever produces such a row (PM-052) | AC2 | S |
| PM-030 | §1.1 | `source` ∈ `'llm'` \| `'human_override'` | partial | packages/schemas/src/student/edrion-learn/profile.ts:48; apps/api/src/modules/student/edrion-learn/profile.service.ts:48 | Repo uses `'generated'` where spec says `'llm'`; DB column is plain `text` with no CHECK (schema/learn.ts:114) | Spec-literal readers | S |
| PM-031 | §1.1 | `overridden_by uuid nullable` populated on override | absent | packages/database/src/schema/learn.ts:115 | Column exists, never written | AC2 audit | S |
| PM-032 | §1.1 | Canonical `topic_key = topic:<learn_topic_id>` when FK set | contradicted | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:103 | Produces `subject:<slug>` (institutional-context.service.ts:98,160), a raw client string, or `session:<8 hex of idempotencyKey>`. Never `topic:<uuid>` | Cache identity; cross-session reuse | M |
| PM-033 | §1.1 | `material:<material_id>` / `free:<slug(title)>` key forms | absent | — | Neither form is constructed anywhere | Library + free-topic cache keys | M |
| PM-034 | §1.1 | Unique index `(owner_kind, coalesce(user_id,institution_id), topic_key)` | partial | packages/database/src/schema/learn.ts:123-134 | Four partial unique indexes instead of the coalesce form — functionally close, but see PM-024 for the insert path that trips them | — | S |
| PM-035 | §1.0/§1.1 | `owner_xor` CHECK on `learn_topic_profiles` | absent | packages/database/src/schema/learn.ts:101-136 | No `check()` on this table, unlike `learner_mastery` (:270) and `learner_model_events` (:299) | AC16, tenancy invariant | S |
| PM-036 | §1.1 | `profile_schema_version int` = 1 | conformant | packages/database/src/schema/learn.ts:113 | — | — | — |
| PM-037 | §2.2 | `knowledge_type`: array of `conceptual\|procedural\|factual\|skill`, length 1–2 | conformant | packages/schemas/src/student/edrion-learn/profile.ts:3, :21 | — | — | — |
| PM-038 | §2.2 | `abstraction`: `concrete\|mixed\|abstract` | conformant | packages/schemas/src/student/edrion-learn/profile.ts:4, :22 | — | — | — |
| PM-039 | §2.2 | `native_representation`: 5-member enum (`visual_spatial`,`symbolic`,`verbal`,`temporal_sequence`,`comparative_table`) | conformant | packages/schemas/src/student/edrion-learn/profile.ts:5-11, :23 | Exact member-for-member match | — | — |
| PM-040 | §2.2 | `prerequisite_density`: `low\|medium\|high` | conformant | packages/schemas/src/student/edrion-learn/profile.ts:12, :24 | — | — | — |
| PM-041 | §2.2 | `prerequisites`: array **≤5** | conformant | packages/schemas/src/student/edrion-learn/profile.ts:25 (`.max(5)`) | — | — | — |
| PM-042 | §2.2 | `prerequisites[].atom_id: string\|null`, FK `concept_atoms` when known | partial | packages/schemas/src/student/edrion-learn/profile.ts:16 | Typed `uuid().nullable()`, but nothing ever resolves a real atom id, and nothing validates the value against `concept_atoms` before it reaches `learner_mastery.atom_id` (FK, schema/learn.ts:259-261) | FK violations on answer | M |
| PM-043 | §2.2 | `prerequisites[].label: string` | conformant | packages/schemas/src/student/edrion-learn/profile.ts:17 | — | — | — |
| PM-044 | §2.2 | `misconception_richness`: `low\|medium\|high` | conformant | packages/schemas/src/student/edrion-learn/profile.ts:26 | — | — | — |
| PM-045 | §2.2 | `known_misconceptions`: array **≤3** | conformant | packages/schemas/src/student/edrion-learn/profile.ts:27 (`.max(3)`) | — | — | — |
| PM-046 | §2.2 | `math_load`: `none\|light\|heavy` | conformant | packages/schemas/src/student/edrion-learn/profile.ts:13, :28 | — | — | — |
| PM-047 | §2.2 | `memorization_load`: `none\|light\|heavy` | conformant | packages/schemas/src/student/edrion-learn/profile.ts:29 | — | — | — |
| PM-048 | §2.2 | `real_world_anchors`: array **≤3** | conformant | packages/schemas/src/student/edrion-learn/profile.ts:30 (`.max(3)`) | — | — | — |
| PM-049 | §2.2 | `DEFAULT_PROFILE` literal exactly as specified | conformant | packages/schemas/src/student/edrion-learn/profile.ts:35-46 | Field-for-field identical to the spec literal | — | — |
| PM-050 | §2.2 | Schema lives at `packages/schemas/learn/topic-profile.ts` | partial | packages/schemas/src/student/edrion-learn/profile.ts | Different path; content correct. Cosmetic | — | S |
| PM-051 | §2.2 | Only the 10 specified fields (no extra profile dimensions) | conformant | packages/schemas/src/student/edrion-learn/profile.ts:20-31 | Exactly 10 keys | — | — |
| PM-052 | §2.3 | `PATCH /learn/topic-profiles/:id` route exists | absent | apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts:27-118 | No `@Patch` in the controller; grep for `topic-profiles` across `apps/api/src` returns nothing | Whole override feature | M |
| PM-053 | §2.3 | Authorized to owner (user scope) or staff with `learn.profile.override` | absent | — | No route, therefore no guard; permission key `learn.profile.override` appears nowhere | Institution correction workflow | M |
| PM-054 | §2.3 | Partial merge semantics on PATCH | absent | packages/schemas/src/student/edrion-learn/api.ts:151-154 | `patchTopicProfileInputSchema` is defined and has **zero consumers** across `apps/` and `packages/` | — | S |
| PM-055 | §2.3 | Override sets `source='human_override'` | absent | — | — | AC2 | S |
| PM-056 | §2.3 | Override sets `expires_at=null` | absent | — | — | AC2 | S |
| PM-057 | §2.3 | Override emits `profile_overridden` event | absent | packages/schemas/src/student/edrion-learn/mastery.ts:71 | Enum member exists; never emitted | Replay log completeness | S |
| PM-058 | §2.3 | P1 minimal internal admin form; no student-facing override | absent | — | Nothing student-facing exists either, so no violation — but the admin surface is missing | — | M |
| PM-059 | §1.4 | A BullMQ backfill replays existing `learn_attempts` per (user, atom) chronologically | absent | — | No seeding/backfill job anywhere; grep for `backfill`/`seedMastery`/`replayAttempts` in `apps/api/src` finds only unrelated geo/visual backfills in `packages/database` | AC9 — cold-start mastery | L |
| PM-060 | §1.4 (1) | Outcome priority 1: `learn_attempts.evaluation.correct` | partial | apps/api/src/modules/student/edrion-learn/mastery.service.ts:37, :46 | Live path honours it; no historical replay applies it | AC9 | M |
| PM-061 | §1.4 (1) | Outcome priority 1b: `evaluation.score ≥ threshold` | absent | — | `score` is written (pedagogy-orchestrator.service.ts:361) but never read for outcome derivation; no threshold constant exists in `constants.ts` | Legacy quiz attempts with score-only evaluation are unusable | S |
| PM-062 | §1.4 (2) | Fallback: linked `evidence_tags.polarity` (positive→correct, negative→incorrect) | absent | apps/api/src/modules/student/edrion-learn/evidence.service.ts:58-68 | Polarity is *written* (`strength`/`growth`/`neutral`) but never read back as an outcome source | AC9 | M |
| PM-063 | §1.4 (3) | Else skip (no signal) | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:37 (`if (evaluation.correct == null) return null`) | — | — | — |
| PM-064 | §1.4 (3) | `hints_used > 0` on a correct outcome → K at half weight | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:44 | Correctly gated on `correct` too | — | — |
| PM-065 | §1.4 | Seeding is idempotent (recompute-from-scratch) | absent | — | No seeding exists | AC9 | L |
| PM-066 | §1.4 | Same derivation runs live per new attempt | partial | apps/api/src/modules/student/edrion-learn/evidence.service.ts:70-76 | Live derivation exists but implements only rung 1 of the 3-rung ladder | AC9 | M |
| PM-067 | §1.4 | `learner_mastery` composite PK `(user_id, atom_id)` | partial | packages/database/src/schema/learn.ts:253, :271-276 | Surrogate `id` PK + two partial unique indexes (student/independent). Functionally equivalent; not the spec'd PK | — | S |
| PM-068 | §1.4 | `rating int` Elo, **default 1200** | contradicted | packages/database/src/schema/learn.ts:262 (`.default(800)`); packages/schemas/src/student/edrion-learn/mastery.ts:13 (`MASTERY_RATING_DEFAULT = 800`) | Off by 400 Elo. Consequences: a new learner's display mastery is **0.0** not 0.5 (PM-081), and first-attempt `p` on a medium item is `1/(1+10^(500/400)) ≈ 0.053` instead of the spec's `≈0.360` — so a first correct answer moves the rating ~+30 instead of ~+20, and a first wrong answer barely moves it at all. Used as the read fallback at mastery.service.ts:24 and :39 | §6 entirely; AC9 replay; planner mastery snapshot | S |
| PM-069 | §1.4 | `attempts int` | conformant | packages/database/src/schema/learn.ts:263 | — | — | — |
| PM-070 | §1.4 | `last_outcome boolean nullable` column | absent | packages/database/src/schema/learn.ts:250-278 | Column does not exist; an undeclared `correct_weight numeric` (:264) exists instead | Fatigue rule input; §3 fatigue never implementable from the table | S |
| PM-071 | §1.4 | `last_attempt_at` | conformant | packages/database/src/schema/learn.ts:265; written at mastery.service.ts:59 | — | — | — |
| PM-072 | §1.4 | `version` (optimistic concurrency) | conformant | packages/database/src/schema/learn.ts:266; incremented at edrion-learn.repository.ts:291 | Incremented but never checked on write | — | S |
| PM-073 | §1.4 | `updated_at` | conformant | packages/database/src/schema/learn.ts:267 (`...timestamps`) | — | — | — |
| PM-074 | §1.4 | `learner_mastery` is **user-owned** | partial | packages/database/src/schema/learn.ts:254-258, :270; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:261-268 | Carries an extra `institution_id` populated for institutional students. `owner_xor` is on `(student_id, independent_user_id)` so user-ownership holds, but the table is not owner-kind-shaped per §1.0 | AC16 | S |
| PM-075 | §1.4 | `atom_id` FK `concept_atoms` | conformant | packages/database/src/schema/learn.ts:259-261 | — | — | — |
| PM-076 | §1.5 | `learner_model_events` append-only, no UPDATE/DELETE | partial | packages/database/src/schema/learn.ts:280-307; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:323-326 (insert only) | Enforced only by convention — no trigger, no grant revocation | Audit integrity | S |
| PM-077 | §1.5 | Columns `id`, `user_id`, `session_id nullable` | conformant | packages/database/src/schema/learn.ts:283-289 | — | — | — |
| PM-078 | §1.5 | `event_type` restricted to the 6-member set | partial | packages/schemas/src/student/edrion-learn/mastery.ts:65-72; packages/database/src/schema/learn.ts:292 | Zod enum has all 6; DB column is plain `text` with no CHECK | Data integrity | S |
| PM-079 | §1.5 | `mastery_update` events emitted | conformant | apps/api/src/modules/student/edrion-learn/evidence.service.ts:79-96 | — | — | — |
| PM-080 | §1.5 | `context_set` events emitted | absent | — | Enum member only | Replay log completeness | S |
| PM-081 | §1.5 | `fatigue_detected` events emitted | absent | — | No fatigue logic exists at all (grep `fatigue` in apps/api/src → zero hits) | §3 fatigue rule | M |
| PM-082 | §1.5 | `break_suggested` events emitted | absent | — | Same | §3 break card | M |
| PM-083 | §1.5 | `profile_generated` events emitted | absent | apps/api/src/modules/student/edrion-learn/profile.service.ts:42-52 | Profile insert emits no learner-model event | Replay log completeness | S |
| PM-084 | §1.5 | `profile_overridden` events emitted | absent | — | No override path (PM-052) | — | S |
| PM-085 | §1.5 | `mastery_update` `data` = `{atom_id, rating_before, rating_after, outcome, k, expected_p, source_block_id, hinted}` | conformant | apps/api/src/modules/student/edrion-learn/evidence.service.ts:86-95; schema packages/schemas/src/student/edrion-learn/mastery.ts:74-83 | All 8 keys present with matching names | — | — |
| PM-086 | §1.5 | `created_at` | conformant | packages/database/src/schema/learn.ts:295-296 (`occurred_at` + `created_at`) | — | — | — |
| PM-087 | §1.5 / §6 | Every writeback **also** emits a `learning_events` row | partial | apps/api/src/modules/student/edrion-learn/evidence.service.ts:99-110 | A `session.checkpoint_answered` row is written, but unconditionally — it fires even when `correct === null` and no mastery update happened, and it carries no rating before/after. It is not a mastery writeback event | AC10 | M |
| PM-088 | §1.5 / §6 | The paired row goes **through the visual-memory-diff service** | contradicted | apps/api/src/modules/student/edrion-learn/evidence.service.ts:26, :99; apps/api/src/modules/student/visual-studio/visual-memory-diff.service.ts:38-45 | Uses `LearningEventsWriter` directly. `VisualMemoryDiffService` exposes only `computeDiff` / `matchWithEmbeddings` and writes no `learning_events` | AC10 | M |
| PM-089 | §1.5 / §6 | Both rows written **in the same transaction** | contradicted | apps/api/src/modules/student/edrion-learn/evidence.service.ts:47-110; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:404-406 | Five sequential awaits on the bare `this.db` — attempt, evidence tag, mastery upsert, model event, ledger. `repo.runInTransaction` exists and has **zero callers**. Worse, `LearningEventsWriter.log` swallows its own exceptions (learning-events.writer.ts, `catch` → `captureException`), so the ledger row can be silently lost while the mastery row commits | AC10; replayability | M |
| PM-090 | §6 | `d` easy = **1100** | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:6 | — | — | — |
| PM-091 | §6 | `d` medium = **1300** | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:7 | — | — | — |
| PM-092 | §6 | `d` hard = **1500** | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:8 | — | — | — |
| PM-093 | §6 | Constants live in `constants.ts` | partial | packages/schemas/src/student/edrion-learn/mastery.ts:5-16 vs apps/api/src/modules/student/edrion-learn/constants.ts:1-28 | Mastery constants live in the schemas package, not the module `constants.ts`. Arguably better; noted for literal conformance only | — | S |
| PM-094 | §6 | `p = 1/(1+10^((d−r)/400))` | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:42 | Exact | — | — |
| PM-095 | §6 | `r' = r + K·(outcome − p)` | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:47-50 | Adds `Math.round` (column is `integer`) — spec is silent; harmless | — | — |
| PM-096 | §6 | Clamp lower bound **400** | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:11; apps/api/src/modules/student/edrion-learn/mastery.service.ts:49 | — | — | — |
| PM-097 | §6 | Clamp upper bound **2400** | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:12; apps/api/src/modules/student/edrion-learn/mastery.service.ts:47 | — | — | — |
| PM-098 | §6 | `K = 32` when `attempts < 10` | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:14, :16; apps/api/src/modules/student/edrion-learn/mastery.service.ts:43 | — | — | — |
| PM-099 | §6 | `K = 16` otherwise | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:15; apps/api/src/modules/student/edrion-learn/mastery.service.ts:43 | — | — | — |
| PM-100 | §6 | Attempt threshold = **10** | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:16 | — | — | — |
| PM-101 | §6 | Hinted success → **half-weight** K (only on correct) | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:44 | Correct in code — but see PM-104: unreachable in production | — | — |
| PM-102 | §6 | `outcome ∈ {1, 0}` | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:46 | — | — | — |
| PM-103 | §6 | `null` outcome ⇒ no update | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:37 | — | — | — |
| PM-104 | §6 | Hinted path is reachable (`hints_used` carries real values) | contradicted | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:371 (`hintsUsed: 0`) | Hard-coded 0 at the only call site. `MASTERY` half-weight K and the `hinted` event field are dead in practice; nothing in the answer API accepts a hint count | AC9 half-weight assertion | S |
| PM-105 | §6 | Display `m = clamp((r−800)/800, 0, 1)`; `r=1200 ⇒ 0.5` | conformant | packages/schemas/src/student/edrion-learn/mastery.ts:32-36 | Formula exact. Note the invariant is never *observed* because the seed rating is 800 (PM-068), so every new learner reads 0.0 | — | — |
| PM-106 | §6 | No decay in v1 | conformant | apps/api/src/modules/student/edrion-learn/mastery.service.ts:20-63 | No time-based decay anywhere | — | — |
| PM-107 | §6 | Every update logs a `learner_model_events.mastery_update` (before/after) | partial | apps/api/src/modules/student/edrion-learn/evidence.service.ts:78 (`if (masteryUpdate && !priorModel)`) | The rating is upserted (mastery.service.ts:55) *before* the event guard is evaluated, so a reused `idempotencyKey` can mutate mastery without emitting an event — breaking exact replay | AC9 | S |
| PM-108 | §4.4 / §6 | `elapsed_minutes` is incremented as the session runs | absent | apps/api/src/modules/student/edrion-learn/move-planner.service.ts:256 (init 0); apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:556 (read only); packages/database/src/schema/learn.ts:163 (`.default(0)`) | Never written after init. Grep across `apps/api/src` shows only these reads plus a portal analytics `avg()`. **Dead logic:** the §3 fatigue rule (elapsed ≥15 min), the §5 wrap-up flag (elapsed ≥ budget−3), the §5 forced `closing` at elapsed ≥ budget, the `time_budget` end reason, `LEARN_TIME_WRAP_MINUTES_BEFORE_END`/`LEARN_TIME_EXTENSION_MINUTES` (constants.ts:10-11), the `+5 minutes` extension (pedagogy-orchestrator.service.ts:437-439 mutates the budget that is never compared against anything), and the `elapsed_minutes` field in the plan prompt digest (prompts/plan.prompt.ts:48) which always reports 0 to the planner | Time budgeting end-to-end | M |
| PM-109 | AC1 | A cached topic makes **zero** profiler LLM calls | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:29-36 | — | — | — |
| PM-110 | AC1 | An uncached free topic makes **exactly one** call (+≤1 retry) | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:62-70; apps/api/src/modules/student/learn-ai/openai.provider.ts:112 | — | — | — |
| PM-111 | AC1 | Every LLM call appears in `learn_ai_calls` | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:71 vs :73-75 | Profiler failures log nothing; the provider-level retry is also not flagged (`retry` boolean at learn-ai-call.logger.ts:41 is never passed `true` by any caller) | Cost reporting, eval harness | S |
| PM-112 | AC2 | `human_override` rows never regenerate | conformant | apps/api/src/modules/student/edrion-learn/profile.service.ts:31-33 | Read path is correct even though the write path is missing | — | — |
| PM-113 | AC2 | `human_override` rows never expire | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:31-33 | Enforced in the resolver, not in the data (no `expires_at IS NULL` write, no DB constraint) | — | S |
| PM-114 | AC2 | Rows carry `model` + `prompt_version` per the `concept_atoms` convention | partial | apps/api/src/modules/student/edrion-learn/profile.service.ts:49-50 vs packages/database/src/schema/learn.ts:53-54 | `concept_atoms.model` / `.prompt_version` are `NOT NULL`; `learn_topic_profiles.model` / `.prompt_version` are nullable (learn.ts:116-117), and `model` receives a purpose literal not a model id | Eval traceability | S |
| PM-115 | AC3 | Profiles resolve against an existing `learn_topics` row when one exists (`learn_topic_id` set) | conformant | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:107-118 | — | — | — |
| PM-116 | AC3 | **Only** ad-hoc topics use the null-FK key form | contradicted | apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:107-113; apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts:33-54 | Every session unconditionally `upsertTopic`s a `learn_topics` row for whatever key it computed — including `session:<8 hex>` garbage — so `learn_topic_id` is *always* non-null and the ad-hoc null-FK branch is unreachable. The FK is nullable (learn.ts:105) but never null in practice, and `learn_topics` accumulates junk rows | AC3; `learn_topics` hygiene | M |
| PM-117 | AC9 | Seeding replays `learn_attempts.evaluation`, falls back to `evidence_tags.polarity` | absent | — | See PM-059/062 | AC9 | L |
| PM-118 | AC9 | Half-weight K applied to hinted successes during seeding | absent | — | No seeding; and live `hints_used` is always 0 (PM-104) | AC9 | S |
| PM-119 | AC9 | Replaying all `learner_model_events` reproduces `learner_mastery` exactly | absent | apps/api/src/modules/student/edrion-learn/evidence.service.ts:86-95; packages/database/src/schema/learn.ts:263-264 | No replay routine exists, and it could not be exact: the event payload omits `attempts` and `correct_weight`, both of which `learner_mastery` carries and `mastery.service.ts:52-54` mutates | AC9 | M |
| PM-120 | AC10 | Every writeback emits both a `learner_model_events` row **and** a `learning_events` row via the memory-diff service in one transaction | contradicted | apps/api/src/modules/student/edrion-learn/evidence.service.ts:78-110 | Fails on all three clauses: conditional model event (PM-107), wrong service (PM-088), no transaction (PM-089) | AC10 | M |

---

## A2 findings

**Profiler.** The generation prompt is still the one-line inline string the diagnosis alleged — `'Generate a TopicProfileV1 JSON for teaching this topic.'` with `user: JSON.stringify({title, topicKey})` (profile.service.ts:65-66). There is no prompt file; `edrion-learn/prompts/` holds only `plan.prompt.ts` and `render.prompt.ts`. The model therefore profiles a bare string with no atoms, no syllabus, and no material. The 10-field `TopicProfileV1` schema and `DEFAULT_TOPIC_PROFILE_V1` are, by contrast, exactly right — enum members, both `≤3` caps, the `≤5` prerequisite cap, and the default literal all match the spec verbatim. The schema is the most conformant artefact in my scope; the pipeline feeding it is the least.

**Cache.** Resolution order is correct (`learn_topic_id` then `topic_key`, repository.ts:224-239). Everything else about freshness is missing or wrong: no stale-while-revalidate (expiry falls into a blocking regeneration and then a bare `INSERT` with no `onConflict`, which will violate the topic-key unique index — the D11 bug is still live), no `concept_atom.updated_at` check, no `prompt_version` check. `touchConceptAtom` and `listConceptAtoms` are both still callerless, verified by grep, as is `getPathItem` and `runInTransaction`.

**Elo.** Nine of ten constants are exact: d = 1100/1300/1500, K = 32/16 at threshold 10, clamp 400–2400, the `p` formula, the display transform, no decay, half-weight-on-hinted-correct. The single divergence is the seed rating: **800, not 1200** (`learn.ts:262`, `mastery.ts:13`). That is a 400-Elo error that makes every new learner read 0.0 mastery and compresses first-attempt `p` from ≈0.36 to ≈0.05. It is a one-line fix with outsized effect. Separately, `hintsUsed` is hard-coded to `0` at the only call site, so the half-weight branch never executes.

**Learner model.** No seeding, no backfill, no BullMQ learn jobs of any kind — `QUEUE_NAMES` has an `ai` queue but nothing registers a handler. Outcome derivation implements only rung 1 of the three-rung ladder; `evidence_tags.polarity` is written and never read; `evaluation.score` is written and never read. The `mastery_update` payload is field-perfect, but only one of six event types is ever emitted, `learner_mastery` lacks `last_outcome`, and the pairing to `learning_events` fails three ways — wrong event, wrong service, and no transaction, with a writer that swallows its own errors.

**Diagnosis accuracy.** Every claim I reused checked out against current code: the one-line prompt, the `session:<8 hex>` key, the callerless helpers, the uncommitted `elapsed_minutes`, and the expired-profile duplicate key. I found no stale claims in my scope.

---

# A3 · Moves, constraints, plan/render loop, state machine, cost caps

# A3 — Conformance matrix: Petros Learn Core Engine §3 moves, §4 block/plan/render/state/logging, §5 state machine + API, AC4–AC8/AC12/AC14/AC15

Spec: `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-1-CORE-ENGINE.md` (read in full).
All evidence paths are repo-relative. Every cited line was directly read.

| ID | Hyperspec ref | Binding requirement | Status | Evidence | Delta | Blocks | Effort |
|---|---|---|---|---|---|---|---|
| MV-001 | §3 keys | The 8 move keys exist as a closed enum | conformant | packages/schemas/src/student/edrion-learn/plan.ts:3-12 | none | — | S |
| MV-002 | §3.1 | `direct_explanation` → `explanation` block | conformant | apps/api/src/modules/student/edrion-learn/move-planner.service.ts:266-267 | none | — | S |
| MV-003 | §3.1 | `direct_explanation` always legal (universal fallback) | conformant | move-planner.service.ts:42-60 (every rewrite target), 216-226 | none | — | S |
| MV-004 | §3.1 | Params `{depth:'base'\|'deeper', anchor?}` | partial | plan.ts:27-30 (schema exists); move-planner.service.ts:221 only ever emits `{depth:'base'}` | `deeper` never planned; `params` is `z.record(z.unknown())` (plan.ts:19) so per-move param schemas are never applied | planner cannot request depth | S |
| MV-005 | §3.1 | Base explanation ≤180 words | partial | prompts/render.prompt.ts:6 (prompt text); blocks.ts:24 caps at 2000 **chars** | word limit is prompt-only, no server validation | — | S |
| MV-006 | §3.1 | `deeper_md` ≤250w produced in the SAME render call | partial | blocks.ts:25 field exists; render.prompt.ts:6 mentions it | never requested by params; no server check that it is present when depth='deeper' | — | S |
| MV-007 | §3.1 | `deeper` revealed by expander, no second LLM call | conformant | apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx:101,110-112 (client-side expander only) | none | — | S |
| MV-008 | §3.1 | Observe: expand → depth signal (`expanded_deeper`) | absent | field declared in state.ts:18 but no writer (grep `expanded_deeper` → schema + UI only) | signal never recorded | learner-model depth adaptation | S |
| MV-009 | §3.1 | Observe: short dwell ×2 → pace signal | absent | no dwell/pace field or telemetry anywhere in edrion-learn | — | pace adaptation | M |
| MV-010 | §3.2 | `worked_example` → `worked_example` block | conformant | move-planner.service.ts:268 | none | — | S |
| MV-011 | §3.2 | Entry requires `knowledge_type ⊇ procedural\|skill` | absent | `enforceHardRules` move-planner.service.ts:42-60 has no worked_example branch; plan.prompt.ts:6-13 does not state it; deterministicPlan:155-164 emits it at n===1 unconditionally | entry condition unenforced and unprompted | conceptual topics get procedural moves | S |
| MV-012 | §3.2 | Params `{problem_statement, step_count 3–6}` | partial | plan.ts:32-35 schema; move-planner.service.ts:159 passes them | not validated (plan `params` is untyped record, plan.ts:19); renderer ignores step_count | — | S |
| MV-013 | §3.2 | Steps revealed one at a time | conformant | pedagogy-orchestrator.service.ts:408-415 `reveal_step` accumulates `revealedSteps` | none | — | S |
| MV-014 | §3.2 | Optional "Predict the next step" text stored in `interaction_state` | conformant | pedagogy-orchestrator.service.ts:413 `interaction['prediction_'+step]` | none | — | S |
| MV-015 | §3.2 | Prediction passed to next plan **verbatim** | absent | `prediction_text` declared state.ts:20 but never written; plan.prompt.ts:42-59 digest carries only `outcome` | prediction never reaches planner | — | S |
| MV-016 | §3.2 | Prediction not auto-graded in P1 | conformant | no grading path for `reveal_step` (pedagogy-orchestrator.service.ts:408-415) | none | — | S |
| MV-017 | §3.3 | `retrieval_check` → `question_set`, 1–3 questions | conformant | move-planner.service.ts:269; blocks.ts:56-60 (`.min(1).max(3)`) | none | — | S |
| MV-018 | §3.3 | Question types `mcq_single\|short_text\|numeric` | conformant | blocks.ts:47 | none | — | S |
| MV-019 | §3.3 | Entry (HARD): ≥1 exposition move occurred, or `goal='revision'` | conformant | move-planner.service.ts:44,46-48 with NON_EXPOSITION_MOVES constants.ts:22-26 | server-side rewrite present | — | S |
| MV-020 | §3.3 | Each answer writes `learn_attempts` in existing input/evaluation/hints_used shape | conformant | evidence.service.ts:47-56; packages/database/src/schema/learn.ts:236-238 | none | — | S |
| MV-021 | §3.3 | Each answer writes `evidence_tags` with polarity from correctness | conformant | evidence.service.ts:58-68 | polarity vocabulary is `strength\|growth\|neutral`, not `positive\|negative` | seeding rule §1.4 wording | S |
| MV-022 | §3.3 | Each answer applies a mastery update (§6) | conformant | evidence.service.ts:70-76 | none | — | S |
| MV-023 | §3.3 | MCQ auto-grades | conformant | pedagogy-orchestrator.service.ts:347-349 | none | — | S |
| MV-024 | §3.3 | short/numeric graded by bundled small-model micro-call `{correct,feedback≤40w}` | partial | grading.service.ts:45-57 (separate call, `tier:'small'`); feedback capped 500 chars grading.service.ts:11 | not "bundled" (own call, own log row); 40-word cap unenforced | cost | S |
| MV-025 | §3.3 | Grade micro-call ≤3s timeout | absent | grading.service.ts:45-63 has no timeout/AbortSignal | unbounded latency on answer path | UX | S |
| MV-026 | §3.3 | Timeout → `evaluation.correct=null`, "Recorded — couldn't auto-check this one", no mastery update | partial | grading.service.ts:40,71 exact copy present; mastery skip via null outcome | only on error, never on timeout (MV-025) | — | S |
| MV-027 | §3.4 | `prereq_pulse` → `question_set` with `purpose:'prereq'` | conformant | move-planner.service.ts:270; block-renderer.service.ts:94 | none | — | S |
| MV-028 | §3.4 | Exactly 2 questions | absent | blocks.ts:59 allows 1–3; block-renderer fallback emits 1 (block-renderer.service.ts:95-111); no server check | "exactly 2" unenforced | AC7 | S |
| MV-029 | §3.4 | Questions target `profile.prerequisites` atoms | absent | `prereqPulseParamsSchema` (plan.ts:41-43) never populated; deterministicPlan never plans prereq_pulse; renderer fabricates `atom_id: randomUUID()` (block-renderer.service.ts:77,106) | atom_ids are invented, breaking the mastery link | mastery correctness | M |
| MV-030 | §3.4 | Entry (HARD): first two moves only | conformant | move-planner.service.ts:49-51 (`moveCount >= 2` → rewrite) | none | — | S |
| MV-031 | §3.4 | Entry (HARD): only when `prerequisite_density != 'low'` | conformant | move-planner.service.ts:50 | none | — | S |
| MV-032 | §3.4 | Both wrong → service FORCES a remediation `direct_explanation` on the weakest prereq | absent | no prereq-outcome branch in pedagogy-orchestrator.service.ts:333-397; deterministicPlan:145-147 only has a generic `wrongTotal >= 2` nudge, not prereq-scoped or forced | AC7 half unmet | AC7 | M |
| MV-033 | §3.4 | Both wrong → `checkpoints_total += 1` | absent | `checkpoints.total` is set once to 4 (move-planner.service.ts:257) and never incremented | AC7 unmet | AC7 | S |
| MV-034 | §3.4 | Prereq attempts write to the prereq atoms | absent | see MV-029 — atom_id is a random UUID | writes land on non-existent atoms | mastery | M |
| MV-035 | §3.5 | `visual_spawn` → `canvas_embed` | conformant | move-planner.service.ts:271; pedagogy-orchestrator.service.ts:277-283 | none | — | S |
| MV-036 | §3.5 | Entry: `native_representation ∈ {visual_spatial,temporal_sequence,comparative_table}` or planner justifies | contradicted | deterministicPlan gates on `knowledge_type.includes('procedural')` (move-planner.service.ts:168) — a different field; no `native_representation` read anywhere in the planner | wrong predicate | — | S |
| MV-037 | §3.5 | Render emits Graph JSON per Chat 9 — never coords/SVG | conformant | canvas-graph.service.ts:45-50 delegates to VisualGenerationService.generateGraph | none | — | S |
| MV-038 | §3.5 | Block stores `{graph_json_ref, canvas_id}` AFTER the pipeline lays out into `visual_canvases` | contradicted | canvas-graph.service.ts:51 returns `canvasId: randomUUID()`; no `visualCanvases` insert in the learn path (grep) | `canvas_id` is a dangling UUID referencing no row | AC12 | M |
| MV-039 | §3.5 | Pipeline hard-fail → `degraded` `direct_explanation` | conformant | canvas-graph.service.ts:52-54 returns null; pedagogy-orchestrator.service.ts:287-293 degrades to explanation | none | — | S |
| MV-040 | §3.5 | Fragment persists to the student's `visual_canvases` | absent | graph only stored in `interaction_state` (pedagogy-orchestrator.service.ts:284-286) | not in Library | AC12 | M |
| MV-041 | §3.5 | Edits write revisions as the full canvas does | absent | no revision write from the learn module | — | M |
| MV-042 | §3.6 | `synthesis` → `synthesis` block | conformant | move-planner.service.ts:272 | none | — | S |
| MV-043 | §3.6 | Entry (HARD): closing phase only | partial | move-planner.service.ts:57-59 rewrites when `moveCount < LEARN_MOVE_CAP - 2` (i.e. <12) | approximates "closing phase" by move index, not by `orchestrator_status='closing'` (which is never entered — MV-114) | — | S |
| MV-044 | §3.6 | Student response ≤280 chars | absent | `synthesis_submit` stores `input.data?.text` unbounded (pedagogy-orchestrator.service.ts:426-428); interactBlockInputSchema.data is `z.record(z.unknown())` (api.ts:114-119) | no length bound | — | S |
| MV-045 | §3.6 | Bundled micro-call → `{tightened, delta_note ≤25w}` | absent | no tighten call anywhere; synthesis text is only stored | student gets no feedback on synthesis | — | M |
| MV-046 | §3.6 | Skippable | conformant | pedagogy-orchestrator.service.ts:429-435 `synthesis_skip` | none | — | S |
| MV-047 | §3.7 | `artifact_commit` → `artifact_commit` block | conformant | move-planner.service.ts:273 | none | — | S |
| MV-048 | §3.7 | Entry: closing phase | partial | move-planner.service.ts:57-59 (same index heuristic as MV-043) | — | — | S |
| MV-049 | §3.7 | Entry: OR right after a `retrieval_check` with ≥1 wrong | contradicted | the same guard at move-planner.service.ts:57-59 rewrites artifact_commit to direct_explanation for any move < 12, so the "≥1 wrong" entry can never fire | second legal entry is structurally unreachable | — | S |
| MV-050 | §3.7 | Proposes ≤6 cards `{front,back,source_block_id}` | conformant | blocks.ts:74-83 (`.max(6)`) | none | — | S |
| MV-051 | §3.7 | Optional canvas | partial | blocks.ts:83 `include_canvas`; api.ts:128 `includeCanvas` | flag is parsed but never acted on in artifact-commit.service.ts:12-43 | — | S |
| MV-052 | §3.7 | Review-before-save; nothing auto-saves | partial | commit only on explicit POST (pedagogy-orchestrator.service.ts:475-502) | when `cardSelections` is empty the service commits ALL cards (pedagogy-orchestrator.service.ts:487-488) — deselect-all saves everything | data surprise | S |
| MV-053 | §3.7 | Cards go through Chat 8 card service → FSRS | partial | artifact-commit.service.ts:20-36 writes decks/cards via LibraryRepository with FSRS defaults inline | writes the tables directly rather than through the card service; `sourcePage`/`{session_id,block_id}` source link not stored per-card | AC13 (A-other) | M |
| MV-054 | §3.8 | `socratic_probe` → `probe` block | conformant | move-planner.service.ts:274 | none | — | S |
| MV-055 | §3.8 | Entry requires `knowledge_type ⊇ conceptual` | absent | no knowledge_type check in enforceHardRules (move-planner.service.ts:52-56) nor in plan.prompt.ts:6-13 | entry condition unenforced | — | S |
| MV-056 | §3.8 | Entry requires misconception/causation context | partial | deterministicPlan:178 gates on `misconception_richness !== 'low'` | only in the deterministic path; the LLM path is ungated and unprompted | — | S |
| MV-057 | §3.8 | HARD cap: 2 probes per chain | contradicted | check reads `ctx.state.probe_chains.turn` (move-planner.service.ts:54-55) but `probe_chains.turn` is **never written** — only initialised (move-planner.service.ts:259). grep `probe_chains` finds no writer | guard is dead: turn is always 0 | AC6 | M |
| MV-058 | §3.8 | HARD cap: 2 chains per session | contradicted | same — `chains_used` initialised to 0 (move-planner.service.ts:259) and never incremented (grep `chains_used`) | guard is dead | AC6 | M |
| MV-059 | §3.8 | A third probe is REWRITTEN SERVER-SIDE to `direct_explanation` | partial | the rewrite exists (move-planner.service.ts:55) but its inputs are never updated (MV-057/058), so it can never trigger | AC6 not actually guaranteed | AC6 | M |
| MV-060 | §3.8 | Visible "Just explain it" escape ends the chain | partial | UI button EdrionLearnBlockCard.tsx:230-232 → `probe_escape`; server handles it (pedagogy-orchestrator.service.ts:419-425) | server does not clear `probe_chains.open_chain_id`/`turn` — there is no chain state to end | — | S |
| MV-061 | §3.8 | Escape records `probe_escaped=true` | conformant | pedagogy-orchestrator.service.ts:420-424 sets `interaction.probeEscaped` and `last.outcome.probe_escaped = true` | none | — | S |
| MV-062 | §3 tail | `system_notice` is service-emitted for break/budget/degraded/policy | absent | schema exists (blocks.ts:98-103) and the UI renders it (EdrionLearnBlockCard.tsx:298), but grep for `system_notice`/`systemNotice` across apps/api finds **zero** emitters | dead branch confirmed (diagnosis correct here) | break/budget/policy UX | M |
| MV-063 | §3 tail | `system_notice` never counts toward cap/checkpoints | conformant (vacuous) | never emitted (MV-062); `state.moves` only receives planned moves (pedagogy-orchestrator.service.ts:301) | vacuously true | — | S |
| MV-064 | §3 fatigue | Last 3 graded answers wrong AND elapsed ≥15min → one break card | absent | no fatigue logic; grep `fatigue` in apps/api returns nothing | — | wellbeing rule | M |
| MV-065 | §3 fatigue | Break card offers Pause / Keep going actions | absent | no emitter (MV-062) | — | — | S |
| MV-066 | §3 fatigue | Pause action → `paused` | partial | `POST /pause` exists (pedagogy-orchestrator.service.ts:503-506) but not reachable from a break card | manual pause only | — | S |
| MV-067 | §3 fatigue | Paused resumes 24h then auto-closes `abandoned` | absent | `LEARN_PAUSED_ABANDON_HOURS` (constants.ts:12) has no consumer (grep); no sweeper job; `end_reason='abandoned'` never written | paused sessions block the partial unique index forever | AC4 | M |
| MV-068 | §4.1 | `BlockV1` is a Zod discriminated union in packages/schemas | conformant | packages/schemas/src/student/edrion-learn/blocks.ts:105-114 | lives at `student/edrion-learn/blocks.ts`, not `learn/block.ts` | — | S |
| MV-069 | §4.1 | Versioned; breaking change bumps `block_schema_version` | partial | column learn.ts:208; DTO blocks.ts:125 | hardcoded `blockSchemaVersion: 1` in the DTO mapper (pedagogy-orchestrator.service.ts:568); insertBlock never sets it | no bump mechanism | — | S |
| MV-070 | §4.1 | Envelope `{block_type, title?, body_md?}` | conformant | blocks.ts:16-20 | none | — | S |
| MV-071 | §4.1 | markdown+katex via existing path; no raw HTML (sanitized) | partial | render.prompt.ts:5 instructs "no HTML"; UI uses MathText | no server-side sanitizer on `body_md`/`*_md` before persist | XSS surface if renderer is not escaping | M |
| MV-072 | §4.1 | `explanation`: `{body_md ≤180w, deeper_md? ≤250w, anchor?}` | partial | blocks.ts:22-27 — all three fields present | bounds expressed in characters (2000/3000), not words | — | S |
| MV-073 | §4.1 | `worked_example`: `{problem_md, steps 3–6 with step_md, predict_prompt?}` | conformant | blocks.ts:29-38 | none | — | S |
| MV-074 | §4.1 | `question_set`: purpose, 1–3 questions with id/type/prompt_md/options 2–5/correct_option_id(server-only)/atom_id/difficulty/why_md | partial | blocks.ts:40-60 — all fields present with correct bounds | `correct_option_id` is NOT stripped for the client: the DTO returns the parsed block whole (pedagogy-orchestrator.service.ts:567) and the SSE payload sends `block` verbatim (pedagogy-orchestrator.service.ts:319-331) | **answer key leaks to the client** | S |
| MV-075 | §4.1 | `canvas_embed`: `{graph_json_ref, canvas_id, caption?}` | conformant | blocks.ts:62-67 | none | — | S |
| MV-076 | §4.1 | `synthesis`: `{prompt_md}` | conformant | blocks.ts:69-72 | none | — | S |
| MV-077 | §4.1 | `artifact_commit`: `{cards ≤6, include_canvas}` | conformant | blocks.ts:80-84 | none | — | S |
| MV-078 | §4.1 | `probe`: `{question_md, chain_id, turn:1\|2}` | conformant | blocks.ts:86-91 | none | — | S |
| MV-079 | §4.1 | `system_notice`: `{kind, body_md, actions[{key,label}]}` | conformant (schema only) | blocks.ts:93-103 | never constructed server-side (MV-062) | — | S |
| MV-080 | §4.2 | Plan call: small model, temp 0, strict JSON `PlanV1` | partial | move-planner.service.ts:77-92 `tier:'small'`, `schema: planV1Schema`, `schemaName:'PlanV1'`; provider sets `strict: false` (openai.provider.ts:322) | no temperature is set anywhere; structured-output strict mode disabled | determinism | S |
| MV-081 | §4.2 | Plan input = state + profile + learner snapshot + session context (incl. policy_snapshot) + last block outcome + hard-constraint list | partial | plan.prompt.ts:24-39 sends topic/profile subset/policy subset/state digest/hard_rules/prefer_retrieval | `hardRules` is always passed as `[]` (pedagogy-orchestrator.service.ts:241); profile is truncated to 4 of 10 fields (plan.prompt.ts:26-31); `emotional_context` present but `session_context` extras are not | planner blind to prerequisites/native_representation | S |
| MV-082 | §4.2 | Output `{move, params, reasoning ≤60w, checkpoint_advance, session_should_end}` | partial | plan.ts:16-23 — all 5 fields | `reasoning` capped at 400 **chars**, not 60 words | — | S |
| MV-083 | §4.2 | Zod-parse; failure → retry once with errors quoted | conformant | openai.provider.ts:112-153 (2-attempt loop, prior error + truncated output quoted at :117) | retry is not flagged `retry:true` in the call log | AC5 telemetry | S |
| MV-084 | §4.2 | Second failure or hard-constraint violation → deterministic fallback `direct_explanation{depth:'base'}`, block `degraded=true` | partial | move-planner.service.ts:99-107 falls back to `deterministicPlan` and logs `degraded:true`; block-renderer.service.ts:34-35 marks degraded when told | the plan fallback is `deterministicPlan` (which may be worked_example/visual_spawn/probe), not `direct_explanation{base}`; and a failed plan does NOT set `degraded` on the resulting block row (pedagogy-orchestrator.service.ts:264-269 passes no `degraded`) | AC5 | S |
| MV-085 | §4.2 | Cap: `plan_move_count ≥ 14` → force closing pair, close `move_cap` | partial | shouldForceClose move-planner.service.ts:238-240 + closingPlan:194-214; pedagogy-orchestrator.service.ts:246-249 closes with `move_cap` | the cap reads `state.moves.length`, not the `plan_move_count` column; and the force path CLOSES rather than emitting the closing pair — `closingPlan()` output is discarded at pedagogy-orchestrator.service.ts:246 because `session_should_end` is true | AC15 "forces synthesis → artifact_commit → close" | M |
| MV-086 | §4.2 | Plan call logs to `learn_ai_calls` | conformant | move-planner.service.ts:93-96 and 100-105 | none | — | S |
| MV-087 | §4.3 | Render call uses the **mid** model | contradicted | block-renderer.service.ts:43 hardcodes `tier: 'small'` | render runs on the small tier | quality | S |
| MV-088 | §4.3 | Render is **streamed** | contradicted | block-renderer.service.ts:40 uses blocking `this.ai.completeJson(...)`; provider has `streamJsonArray`/`streamText` (openai.provider.ts:178,229) but the renderer never calls them | no token streaming; SSE emits one whole block after the call returns (pedagogy-orchestrator.service.ts:319) | first-token latency, §4.3 core | M |
| MV-089 | §4.3 | Render input = move + params + profile + relevant atoms/material chunks (page cites) + last 3 blocks | partial | render.prompt.ts:16-22 sends move/params/reasoning/topic/grounding | profile is NOT sent; last-3-blocks is NOT sent; `groundingExcerpt` is never supplied by the caller (pedagogy-orchestrator.service.ts:264-269 omits it); no page citation logic | blocks repeat/contradict each other | M |
| MV-090 | §4.3 | Zod-parse on completion; invalid → retry once → fallback plain `explanation` (`degraded=true`) | conformant | openai.provider.ts:112-153 (retry); block-renderer.service.ts:62-73 (fallback + degraded) | fallback for non-explanation moves returns typed fallbacks, not plain explanation (block-renderer.service.ts:76-147) — richer than spec | — | S |
| MV-091 | §4.3 | Pipelining: plan for N+1 fires when N's render starts | absent | pedagogy-orchestrator.service.ts:234-269 is strictly sequential await-plan → await-render; no speculative task | no pipelining in any form | latency | L |
| MV-092 | §4.3 | If N's outcome invalidates the speculative plan, discard + re-plan | absent | no speculative plan to discard; `discarded_speculative` outcome enum (events.ts:69) unused | — | L |
| MV-093 | §4.3 | Render logs to `learn_ai_calls` with `speculative` flagged | partial | block-renderer.service.ts:54-59,64-71 log the call | `speculative` is never passed by any caller — only the logger's optional param (learn-ai-call.logger.ts:23,44); column always false (learn.ts:411). Same for `firstTokenMs` (logger.ts:26,42; learn.ts:409) | eval harness latency/cost metrics are blind | S |
| MV-094 | §4.4 | `SessionStateV1` carries v, session_id, topic_key, goal, emotional_context, time_budget_minutes, elapsed_minutes, checkpoints, moves, probe_chains, mastery_snapshot, pending_free_question | conformant | packages/schemas/src/student/edrion-learn/state.ts:31-52 (all present; adds `free_questions_used`) | superset — acceptable | — | S |
| MV-095 | §4.4 | State persisted to `learn_sessions.state` each move | conformant | pedagogy-orchestrator.service.ts:311-318; column learn.ts:157 | written without `expectedVersion` — `updateSession` supports optimistic concurrency (edrion-learn.repository.ts:126-141) but no caller passes it | lost-update risk | S |
| MV-096 | §4.4 | State ≤8 KB | partial | `moves` bounded to 20 (state.ts:43); `LEARN_STATE_DIGEST_MAX_BYTES` defined constants.ts:9 | the constant has **no consumer** (grep); `mastery_snapshot` is an unbounded record (state.ts:49) | AC15 unverified | S |
| MV-097 | §4.4 | `moves` is a digest, never block content | conformant | state.ts:24-29 (seq/move_type/checkpoint_advance/outcome only); written at pedagogy-orchestrator.service.ts:301 | none | — | S |
| MV-098 | §4.4 | No transcript to the planner | conformant | plan.prompt.ts:42-59 sends only the digest; no block bodies | none | — | S |
| MV-099 | §4.4 | `elapsed_minutes` maintained | absent | set to 0 at move-planner.service.ts:256 and never updated (grep `elapsed_minutes`/`elapsedMinutes` finds only the initialiser, the DTO passthrough and a portal aggregate) | all budget rules downstream are inert | MV-120/121 | S |
| MV-100 | §4.4 | `probe_chains` maintained (open_chain_id / turn / chains_used) | absent | initialised move-planner.service.ts:259; no writer anywhere (grep) | see MV-057/058 | AC6 | M |
| MV-101 | §4.4 | `mastery_snapshot` maintained | partial | written once at session create for prereq atoms (pedagogy-orchestrator.service.ts:168) | never refreshed after answers | planner sees stale mastery | S |
| MV-102 | §4.4 | `pending_free_question` | conformant | set pedagogy-orchestrator.service.ts:467; consumed and cleared :230-233; used by planner move-planner.service.ts:120-122 | none | — | S |
| MV-103 | §4.5 | Every plan/render/grade/profile/judge call writes one `learn_ai_calls` row | partial | plan move-planner.service.ts:93; render block-renderer.service.ts:54; grade grading.service.ts:58; profile — see profile.service.ts | no judge call type exists yet; the provider's internal retry (openai.provider.ts:112) produces 2 API calls but only 1 log row | AC1 undercounts | S |
| MV-104 | §4.5 | Row records call_type, model, prompt_version, session_id, block_seq, tokens in/out, latency_ms | conformant | learn-ai-call.logger.ts:29-48; columns packages/database/src/schema/learn.ts:394-415 | `purpose` values are `learn_plan/learn_render/learn_grade` while `learnAiCallPurposeSchema` (events.ts:56-62) declares `plan/render/grade/profile/judge` — schema and writer disagree | reporting joins | S |
| MV-105 | §4.5 | `degraded`/`retry`/`speculative` flags | partial | columns learn.ts:410-412; logger params learn-ai-call.logger.ts:22-24 | only `degraded` is ever passed (move-planner.service.ts:104, block-renderer.service.ts:70); `retry` and `speculative` always false | — | S |
| MV-106 | §4.5 | `outcome` recorded | absent | column learn.ts:413 + enum events.ts:64-70, but no caller passes `outcome` (grep of `.log(` call sites) | always NULL | eval harness | S |
| MV-107 | §4.5 | Sole call log; no second logging table | conformant | only `learnAiCalls` inserts in the learn path (learn-ai-call.logger.ts:29) | none | — | S |
| MV-108 | §5 | Status set = created/active/awaiting_response/closing/closed/paused | partial | `orchestratorStatusSchema` state.ts:87-94 has all 6; `ORCHESTRATOR_ACTIVE_STATUSES` constants.ts:14-20 | `'closing'` is declared but never assigned anywhere in apps/api (grep `'closing'` → constants.ts:19 and one portal aggregate only) | see MV-114 | S |
| MV-109 | §5/§1.2 | DB CHECK on the closed status set | absent | `orchestratorStatus: text('orchestrator_status')` — nullable text, no `check()` (packages/database/src/schema/learn.ts:156) | any string is storable | data integrity | S |
| MV-110 | §5 | `created` → `active` on **first render start** | contradicted | createSession inserts `orchestratorStatus:'created'` (pedagogy-orchestrator.service.ts:152) then immediately flips to `'active'` at :169, before any render | `created` never observable; transition is not tied to render start | — | S |
| MV-111 | §5 | `active ⇄ awaiting_response` | conformant | set to awaiting when `requiresResponse` (pedagogy-orchestrator.service.ts:305,314); back to active on answer :388 / interact :445 | none | — | S |
| MV-112 | §5 | In `awaiting_response`, only that block's endpoints are legal | absent | answerBlock/interactBlock/askSession/commitArtifacts never check `orchestratorStatus` (pedagogy-orchestrator.service.ts:333-502); only `stream` early-returns (:194) | stale blocks remain answerable | — | S |
| MV-113 | §5 | Composer question queues while awaiting | conformant | askSession stores `pending_free_question` and only plans when not awaiting (pedagogy-orchestrator.service.ts:467-472) | none | — | S |
| MV-114 | §5 | `closing` state entered for the forced closing pair | absent | no `orchestratorStatus:'closing'` assignment exists; closeSession goes straight to `'closed'` (pedagogy-orchestrator.service.ts:528-534) | state machine skips a state | AC15 | M |
| MV-115 | §5 | In `closing`, no planner calls except the pair | absent | no closing state (MV-114), so no guard | — | S |
| MV-116 | §5 | `closed`: summary written | absent | `summary` column exists (learn.ts:170) but closeSession/SessionCompletionService never write it (pedagogy-orchestrator.service.ts:528-535; session-completion.service.ts:15-51) | always NULL | session record UX | S |
| MV-117 | §5 | `active\|awaiting_response → paused → active` | conformant | pause :504, resume :508 | pause/resume do not validate the current status | — | S |
| MV-118 | §5 | `paused --24h--> closed(abandoned)` | absent | see MV-067; `end_reason='abandoned'` never written | AC4 leak | M |
| MV-119 | §5 | Every transition writes ONE audit event, same transaction | contradicted | only two `appendSessionEvent` call sites exist: `session_created` (pedagogy-orchestrator.service.ts:170) and `block_stream_end` (:307). No `status_changed`, no `session_closed`, no pause/resume events. Neither is inside a transaction (`runInTransaction` exists at edrion-learn.repository.ts:404 but is unused by the orchestrator) | plus a **seq collision bug**: `session_created` writes seq=1 (:170) but never updates `lastEventSeq`, so the first block event also computes seq=1 (:306) and violates `learn_session_events_session_seq_uq` (learn.ts:322) | audit trail + first render throws | M |
| MV-120 | §5 | `elapsed ≥ budget − 3min` → "wrap up" flag | absent | `LEARN_TIME_WRAP_MINUTES_BEFORE_END` constants.ts:10 has no consumer (grep); `elapsed_minutes` never advances (MV-099) | — | M |
| MV-121 | §5 | `elapsed ≥ budget` → force `closing` | absent | no time check in planAndRenderNextBlock; `end_reason='time_budget'` never passed to closeSession (only goal_met/move_cap/student_exit/policy_kill — pedagogy-orchestrator.service.ts:247,517,214) | sessions can only end by move cap or exit | M |
| MV-122 | §5 | "+5 minutes" extends **once** | partial | `notice_action` with `key==='extend_time'` adds 5 (pedagogy-orchestrator.service.ts:436-440) | hardcoded 5 instead of `LEARN_TIME_EXTENSION_MINUTES` (constants.ts:11, no consumer); **no once-limit** — repeatable indefinitely; and unreachable because no `system_notice` offers the action (MV-062) | — | S |
| MV-123 | §1.2/§5/AC4 | Partial unique index: ≤1 non-terminal session per user | conformant | packages/database/src/schema/learn.ts:182-191 — two partial unique indexes (student / independent) over `orchestrator_status IN ('created','active','awaiting_response','paused','closing')` | correctly split by owner column; also requires `entry_point IS NOT NULL` so legacy sessions are excluded | — | S |
| MV-124 | §1.2/§5/AC4 | Second POST returns 409 `SESSION_ACTIVE` with the active id | conformant | pedagogy-orchestrator.service.ts:87-94 (`ConflictException` + `activeSessionId`); repo query edrion-learn.repository.ts:80-94 | app-level check precedes the index; a DB unique violation would surface as 500 rather than 409 | — | S |
| MV-125 | §5 API | `POST /learn/sessions {topic_key\|entry, time_budget_minutes?, goal?}` → 201 + stream URL | conformant | edrion-learn.controller.ts:33-36 (Nest @Post ⇒ 201); pedagogy-orchestrator.service.ts:171-174 returns `streamUrl` | route is `student/learn/sessions`; body also requires `idempotencyKey` (api.ts:20) — stricter than spec | — | S |
| MV-126 | §5 API | `GET /learn/sessions/:id` | conformant | edrion-learn.controller.ts:38-41 | none | — | S |
| MV-127 | §5 API | `GET /learn/sessions/:id/stream` — SSE, reconnect-safe via `last_seq` | partial | edrion-learn.controller.ts:43-73 (SSE headers, `lastSeq` query api.ts:137-139); replay pedagogy-orchestrator.service.ts:189-192 | replay emits `learn_session_events` rows (metadata: block_id, stream_seq) — **not block content**, so a reconnect cannot rebuild missed blocks from the stream alone | AC14 | M |
| MV-128 | §5 API | `POST …/blocks/:blockId/answer` idempotent — one `learn_attempts` row; second call returns the stored result | partial | dedupe on (session, block, question) evidence.service.ts:30-37 + partial unique index learn.ts:242-247 | the second call **re-runs the LLM grade** (pedagogy-orchestrator.service.ts:350-359) before the dedupe check and returns a freshly computed `evaluation` (:392-396), not the stored one; `idempotencyKey` is only used for the mastery event key | AC8 | S |
| MV-129 | §5 API | Answer endpoint **locks** | absent | no `FOR UPDATE`/advisory lock/transaction in answerBlock (pedagogy-orchestrator.service.ts:333-397) or evidence.service.ts:29-113 | concurrent double-submit → unique-violation 500 | AC8 | S |
| MV-130 | §5 API | `POST …/interact {action, data?}` versioned against `interaction_state.version` | absent | `expectedInteractionVersion` is required by the schema (api.ts:117) but never compared; updateBlock has no version predicate (edrion-learn.repository.ts:165-175) and `learn_session_blocks` has no `version` column (learn.ts:195-217 — the DTO hardcodes `version: 1` at pedagogy-orchestrator.service.ts:573) | optimistic concurrency absent | §1.3 | M |
| MV-131 | §5 API | `POST …/ask {text ≤500}` | conformant | edrion-learn.controller.ts:95-98; api.ts:121-124 (`.max(500)`) | adds a 5-question cap (constants.ts:4, pedagogy-orchestrator.service.ts:461-466) — beyond spec | — | S |
| MV-132 | §5 API | `POST …/commit {card_selections, include_canvas}` idempotent per block | partial | route is `commit-artifacts` (edrion-learn.controller.ts:100-103); schema api.ts:126-130 | **not idempotent** — a second call inserts a second deck (artifact-commit.service.ts:18-36); `interaction_state.committed` is written but never checked; `includeCanvas` ignored | duplicate decks | S |
| MV-133 | §5 API | `POST …/pause` | conformant | edrion-learn.controller.ts:105-108 | no status precondition | — | S |
| MV-134 | §5 API | `POST …/resume` | conformant | edrion-learn.controller.ts:110-113 | — | — | S |
| MV-135 | §5 API | `POST …/end {save_to_library}` | partial | edrion-learn.controller.ts:115-118; schema api.ts:132-135 | `saveToLibrary` is parsed then discarded (pedagogy-orchestrator.service.ts:515-519) — no Library session record is written | §5 "Library session-record saved if chosen" | S |
| MV-136 | §5 API | All owner-only; no staff access in P1 | conformant | every repo read is owner-scoped (edrion-learn.repository.ts:8-12, 96-103) | — | — | S |
| MV-137 | §5 API | Every session start calls `resolve-policy` (student-tutor scope) → `session_context.policy_snapshot` | conformant | pedagogy-orchestrator.service.ts:95, 127-134 | also re-resolved per move (:212) | — | S |
| MV-138 | AC4 | ≤1 non-terminal orchestrated session per user; second POST → 409 with the active id | conformant | MV-123 + MV-124 | weakened at runtime by MV-067/MV-118 (paused sessions never auto-close) | — | S |
| MV-139 | AC5 | Every plan output Zod-validated, retried once, then falls back to a `degraded` explanation; no planning error reaches the student | partial | validation openai.provider.ts:131; retry :112-153; fallback move-planner.service.ts:99-107 | the fallback plan is not necessarily an explanation, and the resulting block row is not marked `degraded` (MV-084) | AC5 | S |
| MV-140 | AC6 | A third Socratic probe in a chain is impossible (server rewrites) | contradicted | rewrite code exists (move-planner.service.ts:52-56) but `probe_chains.turn`/`chains_used` are never written (MV-057/058), so the guard never fires | AC6 not satisfied | AC6 | M |
| MV-141 | AC7 | `prereq_pulse` never after move 2, never on density='low'; two wrong forces remediation + `checkpoints_total += 1` | partial | entry halves conformant (MV-030/031, move-planner.service.ts:49-51) | remediation forcing and checkpoint increment absent (MV-032/033) | AC7 | M |
| MV-142 | AC8 | Answering twice → exactly one attempt row, one evidence tag, one mastery update; second call returns the stored result | partial | one attempt (evidence.service.ts:30-37 + index learn.ts:242-247), one tag/mastery (guarded by the same early return) | second call does NOT return the stored result and burns an extra grade LLM call (MV-128) | AC8 | S |
| MV-143 | AC12 | Visual spawns land in `visual_canvases` via Chat 9's pipeline; hard-fail yields a degraded explanation and the session continues | partial | graceful degrade conformant (canvas-graph.service.ts:52-54 → pedagogy-orchestrator.service.ts:287-293) | nothing is persisted to `visual_canvases`; `canvas_id` is `randomUUID()` (canvas-graph.service.ts:51) | AC12 | M |
| MV-144 | AC14 | SSE kill + reconnect with `last_seq` replays missed blocks with no duplicates/gaps | partial | seq plumbing exists (`stream_seq` unique per session learn.ts:220-222; `last_event_seq` learn.ts:169; replay pedagogy-orchestrator.service.ts:189-192) | replayed events carry no block content (MV-127); and the seq collision at MV-119 means the very first block event insert can fail, leaving a permanent gap | AC14 | M |
| MV-145 | AC15 | State ≤8 KB at move 14; planner never receives block content; at cap 14 the service forces synthesis → artifact_commit → close | partial | no-transcript half conformant (MV-097/098) | 8 KB never measured (MV-096); at cap the service closes immediately instead of emitting the closing pair (MV-085, pedagogy-orchestrator.service.ts:246-249) | AC15 | M |

---

## A3 findings

**Hard-constraint enforcement verdict (per constraint).** Four are genuine server-side rewrites in `MovePlannerService.enforceHardRules` (move-planner.service.ts:42-61): retrieval-before-exposition, prereq_pulse move index, prereq_pulse density, and closing-move index. Two are *code-present but structurally dead*: the socratic 2-turn and 2-chain caps read `state.probe_chains.turn`/`chains_used`, which no code path ever writes after `initialState` (move-planner.service.ts:259) — grep confirms zero writers. So AC6 is not actually guaranteed, despite the rewrite line existing. Four are prompt-text-only (plan.prompt.ts:6-13): the 14-move ceiling, the answer-directness bias, the revision bias, and the "near session end" phrasing. Four are absent entirely: worked_example's `procedural|skill` gate, socratic's `conceptual` gate, visual_spawn's `native_representation` gate (deterministicPlan:168 gates on the *wrong field*, `knowledge_type.includes('procedural')`), and artifact_commit's "after a wrong retrieval_check" entry — which the closing-index guard at :57-59 makes structurally unreachable.

**Move library.** There is no structured move library. Moves exist as a bare Zod enum (plan.ts:3-12), a `Record<MoveType,string>` block-type map (move-planner.service.ts:266-276), a `requiresResponse` Set (:280-288), an if-chain of rewrites (:42-60), and a hand-rolled index-driven `deterministicPlan` ladder (:110-192). Entry conditions are not data anywhere.

**Render is blocking, not streamed.** block-renderer.service.ts:40 calls `completeJson`; the provider's `streamJsonArray`/`streamText` (openai.provider.ts:178,229) are never used by Learn. It also runs on `tier:'small'`, not mid. No pipelining exists in any form; `speculative` and `firstTokenMs` are declared in the logger (learn-ai-call.logger.ts:23,26,42,44) and DB (learn.ts:409,411) but no call site ever passes them.

**Status values.** DB stores `orchestrator_status` as nullable `text` with **no CHECK** (learn.ts:156). Assigned values: `created`, `active`, `awaiting_response`, `paused`, `closed`. `closing` is declared (state.ts:91, constants.ts:19) but never assigned — the closing state is skipped entirely. The legacy `status` column runs in parallel (`active`→`completed`), and `end_reason` adds a non-spec `policy_kill` (state.ts:104) while never emitting `time_budget` or `abandoned`.

**Audit events.** Exactly two `appendSessionEvent` sites exist (`session_created`, `block_stream_end`) and neither is transactional. Worse, `session_created` writes seq=1 without updating `last_event_seq`, so the first `block_stream_end` also computes seq=1 (pedagogy-orchestrator.service.ts:306) and collides with `learn_session_events_session_seq_uq` — a live bug on the first render.

**Budget rules.** Entirely inert: `elapsed_minutes` is never advanced past 0, and the wrap/extension/abandon constants (constants.ts:10-12) have no consumers.

**Diagnosis check.** LEARN-SESSION-DIAGNOSIS.md's "system_notice is a dead branch" claim is confirmed — zero server emitters. But note the partial unique index and the 409 DO exist (learn.ts:182-191; pedagogy-orchestrator.service.ts:87-94); do not carry forward any claim to the contrary.

**Also worth flagging outside the strict scope:** `correct_option_id` is never stripped before the block reaches the client (pedagogy-orchestrator.service.ts:319-331, 567) — the MCQ answer key ships to the browser.

---

# A4 · Session UI, block interactions, composer, rail, entry points, exit

# A4 — Conformance matrix: 04-PETROS-LEARN-HYPERSPEC-2-UI-AND-ENTRY.md (whole file)

Scope: §1–§8 + all 14 acceptance criteria. Evidence paths relative to repo root `C:\Users\karol\Edrion-Labs`.

| ID | Hyperspec ref | Binding requirement | Status | Evidence | Delta | Blocks | Effort |
|---|---|---|---|---|---|---|---|
| UI-001 | §1 route | Session document screen lives at `apps/student-web` `/learn/session/:id` | conformant | `apps/student-web/src/app/(app)/learn/session/[id]/page.tsx:35` | — | — | — |
| UI-002 | §1 route | Legacy `concept/[blockId]` / `practice/[blockId]` subroutes must not be separate screens | conformant | `apps/student-web/src/app/(app)/learn/session/[id]/concept/[blockId]/page.tsx:3-5`; `.../practice/[blockId]/page.tsx:3-5` | Both are `redirect()` stubs to the session doc | — | — |
| UI-003 | §1 | Mobile-first, ivory background, 4px grid | partial | `.../learn/session/[id]/page.tsx:98` (`px-4 pb-24 pt-4`), background inherited from `bg-st-page` at :100 | Layout uses 4px multiples; ivory only via inherited page token, never asserted on this screen | — | S |
| UI-004 | §1.1 | Top bar renders immediately from the POST response | contradicted | `.../learn/session/[id]/page.tsx:69-75` gates the entire screen (incl. top bar) on `isLoading \|\| !session` from the GET query | Top bar waits for a second round-trip; POST response is discarded by `useCreateEdrionLearnSession` (`apps/student-web/src/lib/hooks/useEdrionLearnSession.ts:206-210` returns `res.session` but callers only keep `session.id`) | AC-1 first-paint budget | M |
| UI-005 | §1.1 | Back chevron wired to the exit flow of §7 | contradicted | `.../learn/session/[id]/page.tsx:102-104` — `router.push('/learn')` directly | Navigates away with no exit sheet, no recap, no save prompt | AC-7 | M |
| UI-006 | §1.1 | Topic title, truncate middle at 28 chars | partial | `.../learn/session/[id]/page.tsx:105` — `className="truncate"` | CSS end-ellipsis, not middle-truncate at 28 chars | — | S |
| UI-007 | §1.1 | Time chip shows the static budget before halfway | conformant | `.../learn/session/[id]/page.tsx:95` — `elapsed >= budget/2 ? … : \`${budget} min\`` | — | — | — |
| UI-008 | §1.1 | Time chip counts down only from the halfway point | conformant | `.../learn/session/[id]/page.tsx:95` — `\`${Math.max(0, budget - elapsed)} min left\`` | Value updates only on refetch (3s poll, `useEdrionLearnSession.ts:21-26`), not a live tick — acceptable for the anti-anxiety rule | — | — |
| UI-009 | §1.1 | Overflow menu (⋯) in the top bar | absent | — | No `⋯` control in the header block (`.../learn/session/[id]/page.tsx:100-111`) | UI-104 ("End lesson" from overflow) | M |
| UI-010 | §1.2 | Progress bar sits directly under the top bar | conformant | `.../learn/session/[id]/page.tsx:108-110` | — | — | — |
| UI-011 | §1.2 | Bar is **segmented** into `checkpoints_total` equal segments | contradicted | `apps/student-web/src/components/edrion-learn/SessionProgressBar.tsx:7-14` — single continuous fill at `width: ${pct}%` | No segments rendered at all; a segmented primitive exists unused at `apps/student-web/src/components/ui/primitives.tsx:175-195` (`ProgressSegments`) | UI-013, UI-014, AC-3 | S |
| UI-012 | §1.2 | Bar is 4px tall | conformant | `SessionProgressBar.tsx:9` — `h-1` (= 4px) | — | — | — |
| UI-013 | §1.2 | Track colour `#e8e4d8` | conformant | `SessionProgressBar.tsx:9` — `bg-[#e8e4d8]` | Hard-coded hex, not a design token (`packages/design-tokens/src/tokens.ts` has no `#e8e4d8`) | — | S |
| UI-014 | §1.2 | Fill primary green `#1f604a` | conformant | `SessionProgressBar.tsx:11` — `bg-[#1f604a]`; token exists at `packages/design-tokens/src/tokens.ts:28` | Hex hard-coded instead of `var(--primary)` | — | S |
| UI-015 | §1.2 | 200ms fill animation | conformant | `SessionProgressBar.tsx:11` — `transition-all duration-200` | — | — | — |
| UI-016 | §1.2 | Reduced-motion: fill is instant | conformant | `SessionProgressBar.tsx:11` — `motion-reduce:transition-none`; global belt-and-braces at `apps/student-web/src/app/globals.css:45-52` | — | — | — |
| UI-017 | §1.2 | A remediation detour visibly **adds** a segment | absent | — | No segment model exists (`SessionProgressBar.tsx:5-14` computes only a percentage) | AC-3 | M |
| UI-018 | §1.2 | Re-segmentation uses a subtle 150ms width reflow | absent | — | No reflow animation | — | S |
| UI-019 | §1.2 | Bar never shrinks | contradicted | `SessionProgressBar.tsx:5-7` — `pct = done/total`; API grows `checkpoints.total` on detour (`apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:318-321` writes `checkpointsTotal` from state) | Growing `total` with unchanged `done` lowers `pct` — the bar visibly decreases, the exact failure the spec forbids | AC-3 | S |
| UI-020 | §1.3 | Block column max-width 640px on desktop | conformant | `.../learn/session/[id]/page.tsx:115` — `max-w-[640px]` | — | — | — |
| UI-021 | §1.3 | Full-width mobile with 16px gutters | conformant | `.../learn/session/[id]/page.tsx:98` — `px-4` (16px) | — | — | — |
| UI-022 | §1.3 | First block appears as a **skeleton card** | conformant | `.../learn/session/[id]/page.tsx:72` and `:138` | — | — | — |
| UI-023 | §1.3 | Skeleton carries the move's icon; each move key has a fixed lucide icon mapped in `packages/ui` | absent | — | Skeletons are bare pulse rectangles (`.../page.tsx:72`, `:138`); no move→icon map anywhere (grep for `moveIcon`/`MOVE_ICON` across `packages/ui/src` and `apps/student-web/src/components` returned nothing); `packages/ui/src` contains no Learn components at all | AC-1 quality bar, §8 "never a blank spinner" | M |
| UI-024 | §1.3 | Skeleton within 300ms of navigation | partial | `.../learn/session/[id]/page.tsx:69-75` renders the skeleton synchronously on first paint | Timing not instrumented or asserted anywhere | AC-1 | S |
| UI-025 | §1.4 | Persistent composer: single-line input | conformant | `.../learn/session/[id]/page.tsx:156-168` — `<input>` | — | — | — |
| UI-026 | §1.4 | Placeholder exactly "Ask anything…" | conformant | `.../learn/session/[id]/page.tsx:165` | — | — | — |
| UI-027 | §1.4 | Send button primary green, disabled while empty | conformant | `.../learn/session/[id]/page.tsx:177-178` — `bg-[#1f604a]`, `disabled={!composer.trim() \|\| …}` | — | — | — |
| UI-028 | §1.4 | Composer never disappears, including while `awaiting_response` | conformant | `.../learn/session/[id]/page.tsx:154` fixed footer, always mounted; disable predicate at `:166`/`:178` keys only on `orchestratorStatus === 'closed'` | — | — | — |
| UI-029 | §1.5 | Desktop right rail for the artifact rail | conformant | `.../learn/session/[id]/page.tsx:194-196` — `hidden lg:block` wrapper around `<ArtifactRail/>` | — | — | — |
| UI-030 | §1.5 | Mobile grabber at bottom-right above the composer opening the rail | absent | — | Rail is `lg:` only; `apps/student-web/src/components/edrion-learn/ArtifactRail.tsx:15` and `:22` both `hidden … lg:block` — mobile users have no access to artifacts | — | M |
| UI-031 | §1 empty state | No empty state — a session never opens empty; skeleton is the loading state | conformant | `.../learn/session/[id]/page.tsx:69-75` (skeleton) with no empty branch | — | — | — |
| UI-032 | §1 error | Error state triggers when the stream fails to start **after 8s** | absent | — | No timer of any kind in `apps/student-web/src/lib/hooks/useEdrionLearnSession.ts`; error state is purely reactive to `onError` (`:102-105`) | — | S |
| UI-033 | §1 error | Skeleton is replaced by a **calm card** | partial | `.../learn/session/[id]/page.tsx:78-90` | Renders bare centered muted text (`:80`), not a card — no surface, border, or radius | — | S |
| UI-034 | §1 error | Copy exactly "Couldn't start your lesson — check your connection" | conformant | `apps/student-web/src/lib/hooks/useEdrionLearnSession.ts:103` (string) rendered at `.../learn/session/[id]/page.tsx:80` | Copy is byte-correct incl. the em dash. See D3 note below — the string is right, its *routing* is wrong | — | — |
| UI-035 | §1 error | **Retry** button, primary | conformant | `.../learn/session/[id]/page.tsx:82-84` — `bg-[#1f604a]` | — | — | — |
| UI-036 | §1 error | **Back** button, ghost | conformant | `.../learn/session/[id]/page.tsx:85-87` — bordered `Link` to `/learn` | — | — | — |
| UI-037 | §1 error | Retry re-hits the stream URL and never double-creates the session | conformant | `.../learn/session/[id]/page.tsx:82` calls `startStream()`; `useEdrionLearnSession.ts:70-108` only opens `GET /learn/sessions/:id/stream`, never POSTs | — | — | — |
| UI-038 | §1 error | The error card is the failure surface for a stream that fails to start | contradicted | `.../learn/session/[id]/page.tsx:77` gates on `streamError && !session.blocks.length`; the *query* failure path is unhandled — `:37-49` never destructures `isError`/`error`, so `:69` `if (isLoading \|\| !session)` renders the skeleton **forever** on a failed `GET /learn/sessions/:id` | Five distinct failure modes (query 401/403/404/500, network) either hang on a skeleton or collapse into one string — see D3 | AC-1 | M |
| UI-039 | §2 explanation | Card with optional `title` at 15px semibold | partial | `apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx:33` — `text-base font-semibold` (16px) | 1px off spec | — | S |
| UI-040 | §2 explanation | `body_md` rendered | conformant | `EdrionLearnBlockCard.tsx:98-100` via `MathText` | — | — | — |
| UI-041 | §2 explanation | Ghost "Go deeper" link-button at card bottom when `deeper_md` exists | conformant | `EdrionLearnBlockCard.tsx:101-109` | — | — | — |
| UI-042 | §2 explanation | Tap expands in place, label flips to "Show less" | conformant | `EdrionLearnBlockCard.tsx:106-107`, `:110-114` | — | — | — |
| UI-043 | §2 explanation | Expand uses a 200ms height animation (reduced-motion instant) | absent | — | `EdrionLearnBlockCard.tsx:110-114` mounts/unmounts with no transition | — | S |
| UI-044 | §2 explanation | No LLM call on expand | conformant | `EdrionLearnBlockCard.tsx:106` — pure `setDeeper` local state | — | — | — |
| UI-045 | §2 worked ex. | Problem statement card | conformant | `EdrionLearnBlockCard.tsx:122-124` | — | — | — |
| UI-046 | §2 worked ex. | Step 1 visible, subsequent steps collapsed | conformant | `EdrionLearnBlockCard.tsx:119` (`revealedSteps ?? [0]`), `:126-137` | — | — | — |
| UI-047 | §2 worked ex. | Collapsed steps sit behind a full-width secondary button | conformant | `EdrionLearnBlockCard.tsx:131` — `w-full rounded-lg border` | — | — | — |
| UI-048 | §2 worked ex. | When next hidden step has `predict_prompt`, the button area shows prompt + a one-line input | contradicted | `EdrionLearnBlockCard.tsx:134` — `{step.predict_prompt ?? \`Show step ${i+1}\`}` used as the *button label* | No input rendered; the prediction prompt is destroyed into a button caption | — | M |
| UI-049 | §2 worked ex. | **Check my thinking** button (submits prediction, then reveals) | absent | — | grep for "Check my thinking" across `apps/student-web/src`, `apps/api/src`, `packages` → no hits | — | M |
| UI-050 | §2 worked ex. | Ghost **Just show the step** button | absent | — | grep for "Just show the step" → no hits | — | S |
| UI-051 | §2 worked ex. | Prediction is stored and echoed back italicized above the revealed step ("You said: …") | absent | — | grep for "You said" → no hits; `EdrionLearnBlockCard.tsx:132` sends only `{stepIndex}` | — | M |
| UI-052 | §2 worked ex. | Prediction never graded in P1 | conformant | `EdrionLearnBlockCard.tsx:132` sends `reveal_step` only; no grading path | Vacuously true (no prediction captured) | — | — |
| UI-053 | §2 worked ex. | All steps revealed → block is complete | absent | — | No completion signal emitted from the stepper (`EdrionLearnBlockCard.tsx:118-147`) | — | M |
| UI-054 | §2 question set | **One question at a time** within the card | contradicted | `EdrionLearnBlockCard.tsx:152` — `block.questions.map(…)` renders every question simultaneously | — | UI-055, UI-056, UI-062 | M |
| UI-055 | §2 question set | 1/3 progress indicator | partial | `EdrionLearnBlockCard.tsx:153-156` — `{qi+1}/{questions.length}` | Correct format but printed once per question in a stacked list, so it reads as a label not a position indicator | — | S |
| UI-056 | §2 question set | MCQ requires a two-step tap-then-**Submit** (no accidental answers) | conformant | `EdrionLearnBlockCard.tsx:170` (tap selects) then `:179-191` (Submit confirms) | — | — | — |
| UI-057 | §2 question set | After submit the question **locks** | partial | `EdrionLearnBlockCard.tsx:169` `disabled={submitted \|\| …}`, `:179` hides Submit | Locking is real but **block-wide**, not per-question — see UI-062 | AC-2 | M |
| UI-058 | §2 question set | Selected row tinted green when correct | conformant | `EdrionLearnBlockCard.tsx:163`, `:172` — `border-green-500 bg-green-50` | Raw Tailwind palette, not `--st-success` (`apps/student-web/src/styles/tokens.css:123`) | — | S |
| UI-059 | §2 question set | Selected row tinted **amber, never red**, when wrong | conformant | `EdrionLearnBlockCard.tsx:164`, `:172` — `border-amber-400 bg-amber-50`; grep for `red-` across `src/components/edrion-learn` and `src/app/(app)/learn` → zero hits | Should use `--st-amberBd`/`--st-amberSoft` (`tokens.css:108-110`) | AC-6 | S |
| UI-060 | §2 question set | Correct answer outlined green (when the student picked something else) | contradicted | `EdrionLearnBlockCard.tsx:163` — `isCorrect = evaluation?.correct === true && isSelected` | Green outline is gated on `isSelected`, so a wrong answer never reveals which option was right | — | S |
| UI-061 | §2 question set | A "Why?" ghost expander revealing `why_md` | absent | — | grep for `"Why?"` → no hits; `EdrionLearnBlockCard.tsx:192-194` dumps `evaluation.feedback` as flat muted text (API defaults `feedback` to `why_md` — `apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:346`) | AC-13 adjacency | S |
| UI-062 | §2 question set | Per-question lock (a question, once submitted, cannot be re-answered) | contradicted | `EdrionLearnBlockCard.tsx:24` — `useState(Boolean(interactionState?.answered))`; single `submitted` bool shared by every question in the block. API stores one key: `pedagogy-orchestrator.service.ts:388-390` writes `interactionState: {… answered: input.questionId, evaluation}` (last-writer-wins, one slot). Client `selectedOption` (`:23`) and `shortText` (`:25`) are likewise block-scoped | **Answering Q1 hides Q2/Q3**: `:197` `(short_text\|numeric) && !submitted` unmounts remaining inputs; `:179` `{!submitted && …}` removes remaining Submit buttons; `:169` disables every option row. Also one `evaluation` object tints the *selected option of every question* | AC-2 | M |
| UI-063 | §2 question set | Short/numeric: input + Submit | conformant | `EdrionLearnBlockCard.tsx:197-215` | — | — | — |
| UI-064 | §2 question set | While grading, a 3-dot inline loader ≤ 3s | absent | — | `EdrionLearnBlockCard.tsx:206` only disables the button on `answerPending`; no loader element | — | S |
| UI-065 | §2 question set | `correct=null` renders "Recorded — couldn't auto-check this one" in neutral gray | absent | — | grep for "couldn't auto-check" → no hits; API can return `correct: null` (`pedagogy-orchestrator.service.ts:345`, `:361`) | — | S |
| UI-066 | §2 question set | Next question slides in on lock (150ms) | absent | — | No transition; all questions are already mounted (`EdrionLearnBlockCard.tsx:152`) | — | M |
| UI-067 | §2 prereq pulse | Same component with a "Quick check — before we start" caption | absent | — | grep for "Quick check" → no hits; `EdrionLearnBlockCard.tsx:149-220` ignores `block.purpose` entirely (the API reads `content.purpose === 'prereq'` at `pedagogy-orchestrator.service.ts:367`, so the field exists) | — | S |
| UI-068 | §2 prereq pulse | Both wrong → following remediation explanation opens with fixed copy "Let's shore this up first — it'll make the rest click." | absent | — | grep for "shore this up" → no hits | — | M |
| UI-069 | §2 prereq pulse | Terminology-pack override key `learn.remediation_lead` | absent | — | grep for "learn.remediation_lead" → no hits | — | M |
| UI-070 | §2 canvas | Live mini-canvas embed | contradicted | `EdrionLearnBlockCard.tsx:288-296` — static placeholder paragraph "Interactive diagram — open in Lab to explore fully." | No canvas is rendered; a full canvas stack exists at `apps/student-web/src/components/visual-studio/ThinkingCanvasShell.tsx` but is not wired to Learn blocks | — | L |
| UI-071 | §2 canvas | 240px tall mobile / 320px desktop | absent | — | `EdrionLearnBlockCard.tsx:292` — `py-6` text box | — | S |
| UI-072 | §2 canvas | Pan/zoom enabled; node-tap opens edit | absent | — | Static `<p>` (`EdrionLearnBlockCard.tsx:292-294`) | — | L |
| UI-073 | §2 canvas | Top-right expand icon → full canvas screen scrolled to the fragment | absent | — | No control rendered (`EdrionLearnBlockCard.tsx:288-296`) | — | M |
| UI-074 | §2 canvas | Back from full canvas returns to the session at the same scroll position | absent | — | No navigation exists to return from | — | M |
| UI-075 | §2 canvas | Pipeline skeleton shows fixed copy "Drawing this out…" | absent | — | grep for "Drawing this out" → no hits | — | S |
| UI-076 | §2 canvas | Degraded fallback renders as a normal explanation block — never a broken diagram | partial | `EdrionLearnBlockCard.tsx:288-296` always renders the same inert placeholder | Never shows a broken diagram (vacuously safe) but never shows the explanation fallback either | — | S |
| UI-077 | §2 probe | Probe question card | conformant | `EdrionLearnBlockCard.tsx:225` | — | — | — |
| UI-078 | §2 probe | Visible ghost **"Just explain it"** bottom-right | conformant | `EdrionLearnBlockCard.tsx:226-233` — `flex justify-end`, ghost text button | — | — | — |
| UI-079 | §2 probe | Answer via the card's own input (**not** the composer) | absent | — | `EdrionLearnBlockCard.tsx:222-236` has no input at all; the only way to reply is the global composer, which the spec explicitly forbids for probes | — | M |
| UI-080 | §2 probe | After max turns or escape, the explanation streams in directly beneath | partial | `EdrionLearnBlockCard.tsx:230` fires `probe_escape` → `useEdrionLearnSession.ts:143-146` refetches and `continueStream()`s | Next block appends to the column; "directly beneath" holds by list order, but max-turn handling has no client surface | — | S |
| UI-081 | §2 synthesis | Prompt card | conformant | `EdrionLearnBlockCard.tsx:241` | — | — | — |
| UI-082 | §2 synthesis | One-line input with placeholder "Say it in one sentence…" | absent | — | `EdrionLearnBlockCard.tsx:238-255` renders no input whatsoever | UI-083 | S |
| UI-083 | §2 synthesis | **Submit** sends the learner's text | contradicted | `EdrionLearnBlockCard.tsx:246` — `onInteract?.('synthesis_submit', { text: 'done' })` | The literal string `'done'` is posted as the student's synthesis on every session, for every topic. The learner's actual words are never captured | AC-13 credibility; evidence/mastery signal | S |
| UI-084 | §2 synthesis | Ghost **Skip** | conformant | `EdrionLearnBlockCard.tsx:250-252` | — | — | — |
| UI-085 | §2 synthesis | Tightened version renders beneath with the label "Tightened:" plus a muted delta note | absent | — | grep for "Tightened" → no hits | — | M |
| UI-086 | §2 artifact commit | Proposed cards as a vertical checklist | conformant | `EdrionLearnBlockCard.tsx:259-277` | — | — | — |
| UI-087 | §2 artifact commit | Checkbox **default on** | contradicted | `EdrionLearnBlockCard.tsx:26` — `useState<Set<string>>(new Set())` (empty) | Every card starts unchecked; the student must opt in to work Petros already proposed | — | S |
| UI-088 | §2 artifact commit | Front text with tap-to-expand back | contradicted | `EdrionLearnBlockCard.tsx:272-276` — front and back both always rendered | No expand affordance | — | S |
| UI-089 | §2 artifact commit | Inline edit pencil per row | absent | — | `EdrionLearnBlockCard.tsx:261-276` | — | M |
| UI-090 | §2 artifact commit | Swipe-left to discard (desktop: hover ✕) | absent | — | `EdrionLearnBlockCard.tsx:261-276` | — | M |
| UI-091 | §2 artifact commit | Optional "Include your diagram" row when `include_canvas` | absent | — | grep for "Include your diagram" → no hits; `useEdrionLearnSession.ts:165` hard-codes `includeCanvas: false` | — | M |
| UI-092 | §2 artifact commit | Footer **Save N to Library** with N live-updating | partial | `EdrionLearnBlockCard.tsx:283` — `Save {selectedCards.size \|\| block.cards.length} to Library` | N updates, but the `\|\|` fallback makes the label read "Save 4" while `onCommit([])` posts an **empty** selection (`:281`) — the label lies at exactly the default state | — | S |
| UI-093 | §2 artifact commit | Ghost **Skip** in the footer | absent | — | `EdrionLearnBlockCard.tsx:278-284` has only the primary button | — | S |
| UI-094 | §2 artifact commit | On save: spinner ≤ 1s → row of ✓s → collapse to "✓ 4 cards saved to Library" | absent | — | grep for "cards saved to Library" → no hits; `EdrionLearnBlockCard.tsx:278-284` has no pending/success state | — | M |
| UI-095 | §2 artifact commit | Artifact rail count bumps on save | partial | `apps/student-web/src/components/edrion-learn/ArtifactRail.tsx:5-11` derives count from `interactionState.committed`/`cardCount`; `useEdrionLearnSession.ts:168-171` writes the fresh session into the cache | Count updates but with no animation (see UI-104) | — | S |
| UI-096 | §2 system notice | Full-width tinted card | contradicted | `EdrionLearnBlockCard.tsx:298-303` — a bare `<p>` | No card, no tint, no full-width treatment | — | S |
| UI-097 | §2 system notice | break = ivory with green accent | absent | — | `EdrionLearnBlockCard.tsx:300` branches only on `kind === 'budget'` | — | S |
| UI-098 | §2 system notice | budget = amber accent | conformant | `EdrionLearnBlockCard.tsx:300` — `text-amber-700` | Text colour only, not an accent border/tint | — | S |
| UI-099 | §2 system notice | degraded/policy = neutral gray | conformant | `EdrionLearnBlockCard.tsx:300` — fallback `text-st-muted` | Correct by fallthrough, not by explicit mapping | — | — |
| UI-100 | §2 system notice | `actions` render as buttons per file 1 §4.1 | absent | — | `EdrionLearnBlockCard.tsx:298-303` never reads `block.actions`, though the schema defines it (`packages/schemas/src/student/edrion-learn/blocks.ts:102`) | System notices are dead ends | M |
| UI-101 | §2 overflow | Every block card carries a ⋯ overflow at top-right | absent | — | `EdrionLearnBlockCard.tsx:32-41` header contains only the title and the ⓘ | UI-102…UI-105, AC-5 | M |
| UI-102 | §2 overflow | Verb **Save to notes** → Note in the existing notes tables, source-linked to `{session_id, block_id}`, toast "Saved to Notes" | absent | — | grep for "Save to notes"/"Saved to Notes" across `apps/student-web/src`, `apps/api/src`, `packages` → zero hits | AC-5 | M |
| UI-103 | §2 overflow | Verb **Make flashcard from this** → pre-filled 2-field sheet → existing flashcard tables, entering FSRS | absent | — | grep for "Make flashcard" → zero hits | AC-5 | M |
| UI-104 | §2 overflow | Verb **Explain simpler** | absent | — | grep for "Explain simpler" → zero hits | AC-5 | M |
| UI-105 | §2 overflow | Verb **Explain deeper** | absent | — | grep for "Explain deeper" → zero hits | AC-5 | M |
| UI-106 | §2 overflow | Explain simpler/deeper send a fixed instruction as a `pending_free_question` equivalent | absent | — | `pending_free_question` is only ever set by `askSession` (`apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:467`) | AC-5 | M |
| UI-107 | §2 overflow | Explain simpler/deeper must **not** advance a checkpoint | absent | — | No re-explanation path exists to test | AC-5 | M |
| UI-108 | §2 overflow | Exactly four verbs — no fifth | conformant | `EdrionLearnBlockCard.tsx:32-41` — zero verbs shipped | Vacuously satisfied; will need re-checking once UI-101 lands | — | — |
| UI-109 | §3 | Blocks stream **token-progressively** into the markdown renderer | contradicted | `useEdrionLearnSession.ts:97` handles only `event.type === 'block'` (whole block); server emits one complete block per move — `pedagogy-orchestrator.service.ts:319-334` emits `type:'block'` **after** `updateBlock(… renderStatus:'complete')` at `:300-304` | Delivery is block-at-a-time. The student stares at a skeleton for the whole render, then the finished block pops in | AC-1 perceived latency | L |
| UI-110 | §3 | Interactive affordances mount only after the block's Zod parse completes on stream end | conformant | `useEdrionLearnSession.ts:97` only inserts blocks from completed `type:'block'` frames; server parses before emitting (`pedagogy-orchestrator.service.ts:300-334`) | Conformant only as a side effect of UI-109's non-conformance — there is no half-block to guard against | — | — |
| UI-111 | §3 | Auto-scroll follows the streaming block only if the student is within 80px of the bottom | conformant | `.../learn/session/[id]/page.tsx:116-120` — `scrollHeight - scrollTop - clientHeight < 80` sets `atBottomRef`; `:61-67` only scrolls when `atBottomRef.current` | — | AC-9 | — |
| UI-112 | §3 | If scrolled up, a floating "↓ New" pill appears instead | conformant | `.../learn/session/[id]/page.tsx:64-66` sets `showNewPill`; `:140-151` renders `↓ New` | — | AC-9 | — |
| UI-113 | §3 | Never yank scroll | conformant | `.../learn/session/[id]/page.tsx:62-63` — the only programmatic scroll is gated on `atBottomRef.current`; the pill's `scrollTo` at `:145` is user-initiated | — | AC-9 | — |
| UI-114 | §3 | Reduced-motion: blocks appear settled, no entrance animation | partial | `.../learn/session/[id]/page.tsx:123-136` — block cards have no entrance animation at all; globals neutralise the rest (`apps/student-web/src/app/globals.css:45-52`) | Satisfied by having no entrance animation in either mode, so the reduced-motion *distinction* is untested | — | S |
| UI-115 | §3 | Pill scroll should respect reduced-motion | partial | `.../learn/session/[id]/page.tsx:145` — `behavior: 'smooth'` unconditionally | `globals.css:51` sets `scroll-behavior: auto !important`, which does not override a JS `ScrollToOptions.behavior` | — | S |
| UI-116 | §4 composer | Sending appends the student's question as a right-aligned quiet chip in the column | absent | — | `.../learn/session/[id]/page.tsx:123-136` renders only `session.blocks`; `state.pending_free_question` (`pedagogy-orchestrator.service.ts:467`) is never surfaced. The student's words vanish on send | — | M |
| UI-117 | §4 composer | Then the planner detours | conformant | `useEdrionLearnSession.ts:149-159` posts `/ask` then `continueStream()`; server sets `state.pending_free_question` (`pedagogy-orchestrator.service.ts:467`) and consumes it on the next plan (`:230-231`) | — | AC-4 | — |
| UI-118 | §4 composer | If sent while `awaiting_response`, a note under the chip: "I'll get to this right after this question." | absent | — | grep for "I'll get to this" → no hits | AC-4 | S |
| UI-119 | §4 composer | Free questions never bypass a locked interaction | partial | `useEdrionLearnSession.ts:149-159` — client always accepts and posts; the server consumes `pending_free_question` only on the *next* plan (`pedagogy-orchestrator.service.ts:230-231`) | Server ordering holds, but the client gives no signal that the pending block still must be completed; nothing in the UI is locked | AC-4 | S |
| UI-120 | §4 rail | Desktop right rail 240px | conformant | `ArtifactRail.tsx:15`, `:22` — `w-60` (240px) | — | — | — |
| UI-121 | §4 rail | Mobile swipe-up sheet triggered by a floating counter chip ("3 ✦") | absent | — | `ArtifactRail.tsx:15`/`:22` are `hidden … lg:block`; `.../learn/session/[id]/page.tsx:194` wraps it in `hidden lg:block` | — | M |
| UI-122 | §4 rail | Live list of session artifacts | contradicted | `ArtifactRail.tsx:21-26` renders a single aggregate line "{count} ✦ saved" | No list, no items | — | M |
| UI-123 | §4 rail | Flashcards show front text, tap to edit via the card sheet | absent | — | `ArtifactRail.tsx:22-25` | — | M |
| UI-124 | §4 rail | Canvas fragments show a thumbnail, tap opens the embed | absent | — | `ArtifactRail.tsx:5-7` filters only `artifact_commit` blocks | — | M |
| UI-125 | §4 rail | Saved notes/snippets listed | absent | — | `ArtifactRail.tsx:5-7`; notes are not created at all (UI-102) | — | M |
| UI-126 | §4 rail | Empty state copy "What you make here shows up here." | conformant | `ArtifactRail.tsx:17` | — | — | — |
| UI-127 | §4 rail | Counter increments with a 150ms pop (reduced-motion: none) | absent | — | `ArtifactRail.tsx:23` — plain text, no animation | — | S |
| UI-128 | §5.1 | Learning-path node CTA reads **"Start lesson"** when `learn.orchestrator` resolves on | contradicted | `apps/student-web/src/app/(app)/learn/path/page.tsx:113` — label is `Start`, unconditional; no flag read anywhere in the file | The flag-gated label swap does not exist | — | S |
| UI-129 | §5.1 | Path tap POSTs `{entry:'learning_path', entry_ref:{learning_path_id, learning_path_item_id}}` | partial | `apps/student-web/src/app/(app)/learn/path/page.tsx:14-19` — `{entryPoint:'learning_path', pathItemId: itemId, goal:'acquisition', idempotencyKey}` | Sends only the item id, not the `{learning_path_id, learning_path_item_id}` pair; field naming is `pathItemId`, not `entry_ref` | — | S |
| UI-130 | §5.1 | Default budget 15 min on path entry | partial | `apps/student-web/src/app/(app)/learn/path/page.tsx:14-19` and `.../learn/session/start/page.tsx:32-37` omit `timeBudgetMinutes` entirely | Relies on a server default; the client never asserts 15 | — | S |
| UI-131 | §5.1 | `goal='acquisition'` on path entry | conformant | `apps/student-web/src/app/(app)/learn/path/page.tsx:17`; `.../learn/session/start/page.tsx:35` | — | — | — |
| UI-132 | §5.1 | Completing a path session sets `learning_path_items.status` exactly as the legacy flow did | partial | `apps/api/src/modules/student/edrion-learn/session-completion.service.ts` exists and is wired, but the client-side session never reaches a save/exit flow (UI-005, UI-141) | Server-side plumbing present; not verifiable from the UI because the exit path bypasses `end` semantics | AC-14 | M |
| UI-133 | §5.2 | Library "Teach me this" action exists in the document workspace study rail | conformant | `apps/student-web/src/components/library/library-actions-rail.tsx:45-52` | — | — | — |
| UI-134 | §5.2 | Budget sheet "How long do you have?" chips 10 / 15 / 25, default 15 | partial | `apps/student-web/src/components/library/library-actions-rail.tsx:10` (`BUDGET_OPTIONS = [10,15,25]`), `:93` (copy), `:94-105` (chips) | All three chips render with the right copy, but **no default is pre-selected/highlighted** — `:96-104` renders three identical unselected buttons | — | S |
| UI-135 | §5.2 | Session gets `topic_key='material:<id>'`, `goal='acquisition'` | partial | `apps/student-web/src/components/library/library-actions-rail.tsx:32` → `apps/student-web/src/lib/hooks/library.ts:419-421` posts `{timeBudgetMinutes}` to `/library/items/:id/tutor` | Client never constructs `topic_key`/`goal`; both are implicit server-side, so the spec's shape is unverifiable from the door | — | S |
| UI-136 | §5.2 | Session close returns to the workspace with toast "Lesson saved" if saved | absent | — | `library-actions-rail.tsx:33` pushes to the session and never returns; the session's only exit is `router.push('/learn')` (`.../learn/session/[id]/page.tsx:103`) | — | M |
| UI-137 | §5.3 | Free-chat handoff card in the assistant sheet: "Want to actually learn this properly?" | conformant | `apps/student-web/src/components/edrion-learn/LearnHandoffCard.tsx:22`; mounted at `apps/student-web/src/components/learn/AskPetrosDrawer.tsx:190-195` | — | — | — |
| UI-138 | §5.3 | **Start a 15-min lesson** button | conformant | `LearnHandoffCard.tsx:40`, budget at `:34` (`timeBudgetMinutes: 15`) | — | — | — |
| UI-139 | §5.3 | Deterministic trigger: answer > 120 words **or** a second follow-up on the same topic | conformant | `LearnHandoffCard.tsx:46-49` — `words > 120 \|\| followUpCount >= 1`; call site passes the turn index (`AskPetrosDrawer.tsx:190`) so turn 2 onward qualifies | Deterministic, not model-driven, as required | AC-11 | — |
| UI-140 | §5.3 | `entry='free_chat_handoff'` | conformant | `LearnHandoffCard.tsx:30` | — | — | — |
| UI-141 | §5.3 | `topic_key` from the assistant's topic resolution (free topic if no atom matches) | partial | `AskPetrosDrawer.tsx:192` — `chat:${contextLabel.toLowerCase().replace(…)}` | Client-side slug of a UI label, not a topic-resolution result | — | S |
| UI-142 | §5.3 | `emotional_context='setback'` iff triage detected the phrase class, via a fixed regex list in config | contradicted | `LearnHandoffCard.tsx:17-18` — regex tested against **`topicLabel`** (the context label, e.g. a document title), never against the student's message; `AskPetrosDrawer.tsx:191-194` passes no `emotionalContext` | The regex can essentially never fire; and it is inline in a component, not in config | — | S |
| UI-143 | §5.4a | Review/quiz "Fix with Petros" → `goal='remediation'`, scoped to missed atoms, `emotional_context='neutral'` | absent | — | grep for "Fix with Petros" across `apps/student-web/src` → zero hits. `.../learn/session/start/page.tsx:38-43` accepts `entryPoint='bad_result'` with a `reportCardEntryId` but nothing links to it and no `goal` is sent | — | M |
| UI-144 | §5.4b | Today commitment card "Study now" → next plan topic, `goal='revision'` if `target_date` < 14 days else `'acquisition'` | partial | `apps/api/src/modules/student/today/today.service.ts:185-199` emits an obligation with `action.deep_link = '/learn/session/start?pathItemId=…'` and label "Start lesson"; `.../learn/session/start/page.tsx:31-37` always sends `goal:'acquisition'` | Door is wired, but the 14-day `goal` branch does not exist — revision sessions can never be started this way; label is "Start lesson", not "Study now" | — | M |
| UI-145 | §5.4c | Prep countdown "Quick revision" → `goal='revision'`, budget 20 | absent | — | grep for "Quick revision" → zero hits; `.../learn/session/start/page.tsx:44-52` handles `prep_countdown` but sends neither `goal` nor `timeBudgetMinutes` | — | M |
| UI-146 | §5.5 | Marks-screen / exam-card entries are **not** in P1 | contradicted | `.../learn/session/start/page.tsx:38-52` already accepts `entryPoint='bad_result'` and `'upcoming_exam'` | P2 plumbing shipped early; harmless but out of the declared P1 set | — | S |
| UI-147 | §5 nudge | Today nudge copy "⟨Topic⟩ — ⟨N⟩ min lesson ready." | conformant | `apps/api/src/modules/student/today/today.service.ts:189` — `\`${next.topic.title} — ${minutes} min lesson ready\`` | — | — | — |
| UI-148 | §5 nudge | Never "come chat with Petros" | conformant | `today.service.ts:189`, `:194` ("Start lesson") | — | — | — |
| UI-149 | §5 nudge | Max one Learn nudge per user per day | partial | `today.service.ts:236` — the `nudge()` path enforces a 24h `lastNudgeAt` claim, but the Learn item at `:185-199` is emitted as an **obligation** (`kind:'study_block'`), which bypasses that gate entirely | Learn's item is not rate-limited by the nudge machinery it is supposed to ride | AC-12 | M |
| UI-150 | §5 nudge | Only on a real signal (individual-tier commitment with a generated plan block for today) | conformant | `today.service.ts:176-199` — derives from the learning path's next item and returns `[]` when none (`:180`) | — | AC-12 | — |
| UI-151 | §5 nudge | Delivered as a feed card only | conformant | `apps/student-web/src/app/(app)/home/page.tsx:46` renders nudges as an in-page card | — | AC-12 | — |
| UI-152 | §5 nudge | **No push notification for Learn in P1** — exactly zero | conformant | `apps/student-web/public/sw.js:27-30` has a generic `push` listener and `apps/student-web/src/components/register-sw.tsx:7-8` registers it, but the Learn item is built as a plain obligation (`today.service.ts:185-199`) and never routed through `TodayNotifyService.dispatch` (`apps/api/src/modules/student/today/today-notify.service.ts:42-...`, which is the only path to `WebPushChannel`); grep for notification/push inside `apps/api/src/modules/student/edrion-learn/` returns only unrelated `Array.push` calls | Zero today — but the app-level push pipe is live and `sourceModule:'learn'` (`today.service.ts:198`) is one `dispatch()` call away from breaching this | AC-12 | — |
| UI-153 | §6 | Every block header carries a barely-there ⓘ (12px, muted) | conformant | `apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx:34-40` — `text-xs text-st-muted` | — | AC-13 | — |
| UI-154 | §6 | Tap opens a **tooltip/popover** showing `plan_reasoning` | contradicted | `EdrionLearnBlockCard.tsx:36` — the string is passed as the native `title=` attribute on a `<button>` with no click handler | Native `title` is hover-only, ~1s delayed, unstyled, and **unreachable on touch** — mobile-first spec, no mobile affordance. It is a button that does nothing when tapped | AC-13 | S |
| UI-155 | §6 | Reasoning is the raw stored string, rewritten by nothing | conformant | `EdrionLearnBlockCard.tsx:36` — `reasoning ?? 'Why this step'`; source is `plan.reasoning` (`apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:327`) | Fallback copy "Why this step" masks empty reasoning instead of surfacing it | AC-13 | S |
| UI-156 | §6 | If the block is `degraded`, the tooltip says "I improvised this one." | conformant | `EdrionLearnBlockCard.tsx:36` — `degraded ? 'I improvised this one.' : …` | Correct copy, same delivery defect as UI-154 | AC-13 | — |
| UI-157 | §6 | Session screen reserves a footer region for the policy disclosure | contradicted | `.../learn/session/[id]/page.tsx:122` — `<PolicyNotice/>` is rendered at the **top of the scroll column**, above the blocks, not in a footer region | Wiring exists (P3 flips a value) but the layout slot is in the wrong place, so P3 *would* need a layout change — the exact thing the spec was buying insurance against | — | S |
| UI-158 | §6 | Disclosure line renders when `policy_snapshot.visibility != 'none'` | conformant | `.../learn/session/[id]/page.tsx:12-23` — `if (policy.session_visibility !== 'none')` push notice; returns null when empty (`:23`) | Copy is "Your school can see session summaries from Edrion Learn." vs spec's "Your school can see session summaries" — a superset, acceptable | — | — |
| UI-159 | §7 | Back chevron or overflow "End lesson" opens the **exit sheet** | absent | — | `.../learn/session/[id]/page.tsx:102-104` navigates away immediately; `:187-189` "End lesson" calls `end.mutate()` with no confirmation UI. No sheet component exists | AC-7 | M |
| UI-160 | §7 | Exit sheet shows a session recap (checkpoints done/total, artifacts count) | absent | — | No sheet (UI-159) | AC-7 | M |
| UI-161 | §7 | Primary **Save to Library & exit** | absent | — | `useEdrionLearnSession.ts:179-186` — `end` accepts `saveToLibrary`, but `.../learn/session/[id]/page.tsx:187` calls `end.mutate()` with no argument, so the parameter default `false` always wins. The capability is unreachable from the UI | AC-7 | M |
| UI-162 | §7 | Secondary **Exit without saving** | absent | — | grep for "Exit without saving" → no hits | AC-7 | S |
| UI-163 | §7 | Ghost **Keep going** | absent | — | grep for "Keep going" → no hits | AC-7 | S |
| UI-164 | §7 | Save writes a session-notes document into the Library like any material | absent | — | Unreachable from the client (UI-161) | AC-7 | M |
| UI-165 | §7 | Fine print "Your 4 flashcards are already in your Library." | absent | — | grep for "already in your Library" → no hits | AC-7 | S |
| UI-166 | §7 | Exit mid-`awaiting_response` is legal; the pending block is marked `skipped` | partial | `.../learn/session/[id]/page.tsx:187` allows `end` at any status; no client evidence of a `skipped` mark | Server behaviour not surfaced or asserted in the UI | — | S |
| UI-167 | §7 | Terminal **completion card** after the closing pair | partial | `apps/student-web/src/components/edrion-learn/CompletionOverlay.tsx:5-24` renders a modal overlay when `orchestratorStatus === 'closed'` | It is a blocking full-screen `fixed inset-0` scrim (`:9`), not a terminal card at the end of the document — it covers the lesson the student may want to reread | AC-8 | M |
| UI-168 | §7 | Completion card shows a green ✓ | absent | — | `CompletionOverlay.tsx:11` — text heading "Lesson complete" only | AC-8 | S |
| UI-169 | §7 | One-liner from `summary` | contradicted | `CompletionOverlay.tsx:12-14` — prints `checkpointsDone` + `planMoveCount` counters | Shows machine counters instead of the human summary; note `summary` is not on the DTO either (`packages/schemas/src/student/edrion-learn/api.ts:62-92`) | AC-8 | M |
| UI-170 | §7 | Artifact recap on the completion card | absent | — | `CompletionOverlay.tsx:10-20` | AC-8 | S |
| UI-171 | §7 | Primary **Save lesson to Library** button | absent | — | grep for "Save lesson to Library" → no hits; `CompletionOverlay.tsx:15-20` has only "Back to Learn" | AC-7, AC-8 | M |
| UI-172 | §7 | Ghost **Done** button | partial | `CompletionOverlay.tsx:15-20` — a single primary "Back to Learn" link | Wrong label, wrong emphasis, and it is the *only* button | AC-8 | S |
| UI-173 | §7 | "Next: ⟨next topic⟩ →" when the entry was a learning path | absent | — | `CompletionOverlay.tsx:5-24` never reads `entryPoint`/`pathItemId` (both on the DTO — `packages/schemas/src/student/edrion-learn/api.ts:66`, `:84`) | AC-8 | M |
| UI-174 | §7 | Completion card must render even when everything else degraded | conformant | `CompletionOverlay.tsx:6` gates only on `orchestratorStatus === 'closed'` | Renders unconditionally — but see UI-175 | AC-8 | — |
| UI-175 | §8 | First block token < 1.5s p50 / < 3s p95 from POST | absent | — | No client instrumentation of first-token time; and UI-109 means there is no first *token* to measure — only a first whole block | AC-1 | L |
| UI-176 | §8 | Skeletons always carry the move icon — never a blank spinner | contradicted | `.../learn/session/[id]/page.tsx:72`, `:138`, `.../learn/session/start/page.tsx:66` — all plain `animate-pulse` rectangles | Exactly the blank-loader state the spec forbids | — | M |
| UI-177 | §8 offline | Already-rendered blocks cached in IndexedDB via the existing student-web cache layer, readable offline | absent | — | The cache layer exists (`idb-keyval` used at `apps/student-web/src/app/(app)/home/page.tsx:4`, `apps/student-web/src/lib/portal-config.tsx:4`, `apps/student-web/src/lib/requests.ts:3`, `apps/student-web/src/lib/visual-studio/canvas-offline-queue.ts:1`) but **Learn uses none of it** — `useEdrionLearnSession.ts:17-27` is a plain react-query fetch with no persister | AC-10 | M |
| UI-178 | §8 offline | Composer + all interactions disable when offline | absent | — | `.../learn/session/[id]/page.tsx:166`, `:178` disable only on `orchestratorStatus === 'closed'`; no `navigator.onLine` reference anywhere in the Learn surface | AC-10 | S |
| UI-179 | §8 offline | Slim top banner "Offline — you can read, interactions resume when you're back." | absent | — | grep for "Offline —" → no hits | AC-10 | S |
| UI-180 | §8 offline | Reconnect auto-resumes the SSE stream with `last_seq` | partial | Server supports it (`apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts:50`, `:61` passes `lastSeq ?? 0`), but the client **never sends it** — `useEdrionLearnSession.ts:75` opens `/learn/sessions/${id}/stream` with no query string, and there is no reconnect trigger | Every reconnect replays from seq 0 or is manual-only | AC-10 | M |
| UI-181 | §8 offline | A session list screen `/learn/sessions` shows past sessions from cache offline (read-only) | absent | — | No such route: the only `learn/**` page files are `learn/page.tsx`, `path`, `quick/[id]`, `revision`, `session/start`, `session/[id]` (+ two redirect stubs) | AC-10 | M |
| UI-182 | §8 | Answers submitted at connection loss: retry the same idempotent payload for 30s | contradicted | `useEdrionLearnSession.ts:119-133` — `answer` mutation has no `retry` option and no timer; `:126` mints a **fresh** `crypto.randomUUID()` per call, so even a manual re-submit is not idempotent | The idempotency key defeats itself on retry | AC-10 | M |
| UI-183 | §8 | Then surfaces "Couldn't send — tap to retry" on the block | absent | — | grep for "Couldn't send" → no hits; `answer.isError` is never read (`.../learn/session/[id]/page.tsx:128-133`) | AC-10 | S |
| UI-184 | AC-1 | Tap-to-start → first visible content token p50 < 1.5s / p95 < 3s, measured in `latency_ms`, asserted by the eval harness | absent | — | No client timing; see UI-175, UI-109. No eval-harness assertion found for this screen | — | L |
| UI-185 | AC-2 | A question, once submitted, cannot be re-answered from any client path; UI locks and re-renders the stored result after refresh | partial | Lock: `EdrionLearnBlockCard.tsx:169`, `:179`. Rehydration: `:24` reads `interactionState.answered`, `:28` reads `interactionState.evaluation`, persisted at `pedagogy-orchestrator.service.ts:388-390` | Rehydration works for **one** question per block; the shared `answered` slot means Q2/Q3 come back locked-and-blank after refresh with Q1's evaluation applied to them | — | M |
| UI-186 | AC-3 | The progress bar never decreases; a prereq remediation detour adds exactly one segment | contradicted | `SessionProgressBar.tsx:5-14` (percentage, no segments) + `pedagogy-orchestrator.service.ts:307-321` (total can grow) | Both halves fail: no segments, and the fill demonstrably shrinks when `total` grows | — | M |
| UI-187 | AC-4 | Composer input during `awaiting_response` is accepted, queued, answered as next-plus-one; never unlocks or bypasses the pending interaction | partial | Accepted/queued: `.../learn/session/[id]/page.tsx:159-163`, `useEdrionLearnSession.ts:149-159`, server queue at `pedagogy-orchestrator.service.ts:467` and consumption at `:230-231` | Mechanically correct; the student gets no queue feedback (UI-116, UI-118) so it reads as a dropped message | — | S |
| UI-188 | AC-5 | All four overflow verbs work on every block type, and Explain simpler/deeper never advance a checkpoint | absent | — | Zero verbs, zero overflow menu — see UI-101…UI-107 | — | L |
| UI-189 | AC-6 | Wrong answers render amber, never red, anywhere in the session UI | conformant | `EdrionLearnBlockCard.tsx:164`, `:172` — amber only; grep for `red-`/`st-danger` across `apps/student-web/src/components/edrion-learn` and `apps/student-web/src/app/(app)/learn` → zero hits | Only enforced by convention, not by a lint rule or token boundary | — | — |
| UI-190 | AC-7 | Ending without saving still leaves every committed artifact in the Library; the exit sheet states this | absent | — | No exit sheet exists (UI-159); the fine print is unwritten (UI-165). Commits do go through `commitArtifacts` (`useEdrionLearnSession.ts:161-172`) so the underlying invariant likely holds — but the criterion's testable half (the sheet stating it) is missing | — | M |
| UI-191 | AC-8 | The completion card renders for every `closed` session with `end_reason != 'abandoned'`, including degraded ones | partial | `CompletionOverlay.tsx:6` — `if (session.orchestratorStatus !== 'closed') return null` | Over-fires: it renders for `abandoned` sessions too, because `endReason` is never read (field exists at `packages/schemas/src/student/edrion-learn/api.ts:80`). Content is also wrong (UI-168…UI-173) | — | S |
| UI-192 | AC-9 | Scroll is never programmatically moved while the student has scrolled up; the "↓ New" pill appears instead | conformant | `.../learn/session/[id]/page.tsx:61-67`, `:116-120`, `:140-151` | The cleanest-implemented criterion in the file | — | — |
| UI-193 | AC-10 | Offline mid-session: blocks readable, interactions disabled with banner, reconnect resumes with no duplicated or missing blocks | absent | — | No offline read cache (UI-177), no banner (UI-179), no disable (UI-178), no `last_seq` on reconnect (UI-180) | — | L |
| UI-194 | AC-11 | The handoff card appears iff the deterministic trigger fires; the assistant never runs an un-orchestrated teaching sequence longer than one answer | partial | Trigger is deterministic and correct (`LearnHandoffCard.tsx:46-49`, `AskPetrosDrawer.tsx:190`) | The "never longer than one answer" half is unenforced — `AskPetrosDrawer.tsx:184-198` lets the conversation continue indefinitely alongside the card | — | M |
| UI-195 | AC-12 | Exactly zero push notifications from Learn in P1; Today nudge at most once per day with a real plan signal | partial | Zero push confirmed (UI-152). Real signal confirmed (`today.service.ts:176-199`) | The once-per-day cap does not apply to the Learn item — it is emitted as an obligation, not through the rate-limited `nudge()` path (`today.service.ts:236`). See UI-149 | — | M |
| UI-196 | AC-13 | Every block shows the ⓘ tooltip with non-empty stored reasoning (or the degraded copy) | partial | `EdrionLearnBlockCard.tsx:34-40` — the ⓘ is on every block and the degraded copy is right | Delivery is a native `title` attribute: no tap target behaviour, invisible on touch (UI-154), and the `?? 'Why this step'` fallback (`:36`) hides the "non-empty reasoning" requirement rather than exposing violations | — | S |
| UI-197 | AC-14 | Path-entry sessions mark the path topic complete under the same conditions as the legacy flow; path progress UIs need no changes | partial | Server-side completion service exists (`apps/api/src/modules/student/edrion-learn/session-completion.service.ts`); path UI reads `item.status` unchanged (`apps/student-web/src/app/(app)/learn/path/page.tsx:67-77`, `:115-117`) | Path UI contract is genuinely unchanged (good), but the client can only reach `end` with `saveToLibrary=false` and never through a `goal_met` completion flow (UI-161), so the "same conditions" half is untested end-to-end | — | M |

---

## A4 findings

**Shape of the gap.** The Learn session screen is a competent skeleton of the spec's *layout* and an almost-empty implementation of its *interactions*. The scroll contract (§3, AC-9) is the one thing implemented exactly as written. Everything downstream of "render a block" — per-question locking, overflow verbs, the exit sheet, the completion card's content, the artifact rail's contents, offline — is missing or wrong.

**Answers to the specific questions.**

*Query error handling.* `.../learn/session/[id]/page.tsx:37-49` destructures `data, isLoading, streaming, streamError` and never `isError`/`error`. Line 69's `if (isLoading || !session)` therefore renders the pulse rectangle **forever** on any failed `GET /learn/sessions/:id`. Confirmed infinite skeleton.

*Error boundaries.* **None.** A recursive search of `apps/student-web/src` for `error.tsx`, `global-error.tsx`, and `not-found.tsx` returned zero files. Any render-phase throw in Learn takes down the whole app shell.

*D3 classification — I agree.* Hyperspec line 24 reads: "**Error state (stream fails to start after 8s):** the skeleton is replaced by a calm card 'Couldn't start your lesson — check your connection'". The copy is scoped to exactly one case. `useEdrionLearnSession.ts:102-105` reads `onError: () => { setStreamError("Couldn't start your lesson — check your connection"); setStreaming(false); }` — it **discards the error argument entirely**. Meanwhile `student-client.tsx` hands that callback four structurally different errors: HTTP-not-ok with the server's parsed message (`:185-197`), missing response body (`:199-204`), an in-stream `type:'error'` frame with the server's code and message (`:238-247`), and raw network/abort failures (`:255-259`). All four flatten to the connection string. A fifth mode — query failure — never reaches the callback at all and hangs on the skeleton. This is a **routing defect**: the string is correct for its one case and must be preserved; the fix is to branch on the error, not to change the copy. Corollary worth flagging: `useEdrionLearnSession.ts:92-95` contains its own `event.type === 'error'` handler that reads `event.message` — it is **dead code**, because `student-client.tsx:238` intercepts error frames before `onMessage` ever sees them.

*question_set shared state.* Yes. `EdrionLearnBlockCard.tsx:24` holds one `submitted` boolean per block (plus one `selectedOption` at `:23` and one `shortText` at `:25`). Submitting Q1 sets it, which at `:197` unmounts every remaining short/numeric input, at `:179` removes every remaining Submit button, and at `:169` disables every option row. The server mirrors the bug: `pedagogy-orchestrator.service.ts:388-390` writes a single `answered` key and a single `evaluation`, so it survives refresh.

*Synthesis.* Hardcoded. `EdrionLearnBlockCard.tsx:246` posts `{ text: 'done' }`. There is no input field in the synthesis branch at all (`:238-255`).

*Overflow verbs.* **Zero of four exist, on zero block types.** No `⋯` control is rendered (`EdrionLearnBlockCard.tsx:32-41`), and grep for all four verb strings across `apps/student-web/src`, `apps/api/src`, and `packages` returns no hits.

*"Why this?" / rail counter / exit sheet / completion card.* The ⓘ exists but only as a native `title=` attribute on a click-less button (`:34-40`) — unreachable on touch, which is fatal for a mobile-first spec. The rail has an aggregate count but no list, and is `lg:`-only (`ArtifactRail.tsx:15`, `:22`). No exit sheet exists. A completion overlay exists but is a blocking scrim showing counters instead of `summary`, with no ✓, no artifact recap, no save button, and no path "Next:" link (`CompletionOverlay.tsx:5-24`).

*Entry points.* Path (`learn/path/page.tsx:14-19`, label "Start" not "Start lesson", no flag) and Library "Teach me this" (`library-actions-rail.tsx:29-37` → `lib/hooks/library.ts:419-421`, budget sheet correct but no default selected) are wired. Free-chat handoff is wired with a correct deterministic trigger (`LearnHandoffCard.tsx:46-49`) but its setback regex tests the wrong string (`:17-18`). Individual-tier is one-third wired: Today emits the correct obligation (`today.service.ts:185-199`), but `learn/session/start/page.tsx:31-37` hardcodes `goal:'acquisition'`, so the <14-day revision branch and the prep-countdown budget-20 door cannot fire; "Fix with Petros" does not exist.

*Push.* Zero from Learn today — the Learn item bypasses `TodayNotifyService.dispatch`, the only route to `WebPushChannel`. But the app-level pipe is live (`public/sw.js:27-30`, `register-sw.tsx:7-8`) and `today.service.ts:198` already tags `source_module: 'learn'`, so this holds by omission, not by design.

*Offline.* None in Learn. `idb-keyval` is used in four other surfaces but `useEdrionLearnSession.ts:17-27` has no persister, no `navigator.onLine` check, no banner, and never sends `lastSeq` despite the server accepting it (`edrion-learn.controller.ts:50`).

**LEARN-SESSION-DIAGNOSIS.md caveat.** I did not reuse any claim from it; every row above is cited to a line I read directly this session.

---

# A5 · Eval harness, learn.* config namespace, resolve-policy student-tutor scope

# A5 — Conformance matrix: `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-3-EVAL-COST-POLICY.md` (whole file)

Scope: §1 eval harness, §2 cost controls, §3 policy hooks, §4 flagged items, all 10 acceptance criteria.
All paths relative to repo root `c:\Users\karol\Edrion-Labs`. Every cited line was read directly.

| ID | Hyperspec ref | Binding requirement | Status | Evidence | Delta | Blocks | Effort |
|---|---|---|---|---|---|---|---|
| EV-001 | §1.1 | A repo package `packages/learn-evals` exists | conformant | `packages/learn-evals/package.json:2` (`@edrion/learn-evals`); picked up by `pnpm-workspace.yaml:3` (`packages/*`) | none | — | S |
| EV-002 | §1.1 | Runner invocable as `pnpm learn-evals run` | partial | `packages/learn-evals/package.json:6-8` declares `bin.learn-evals`; `package.json:10` script `run`. Root `package.json:10-27` has NO `learn-evals` script | Root command in the spec/AC-1 does not exist; only `pnpm --filter @edrion/learn-evals run` works (`IMPLEMENTED-EDRION-LEARN.md:51`) | AC-1 | S |
| EV-003 | §1.1 | Runner accepts `--suite core` | partial | `packages/learn-evals/src/cli.ts:9` parses `--suite`; `cli.ts:13` `const topics = suite === 'full' ? TOPIC_FIXTURES : TOPIC_FIXTURES;` | Flag is parsed then discarded — both branches are the same array. `core` and `full` are identical | AC-1 | S |
| EV-004 | §1.1 | Runner accepts `--baseline <run_id>` | partial | `cli.ts:10` parses; `cli.ts:87` emits `baseline_delta: { note: 'Compared against …' }` | No baseline is loaded, no delta computed | EV-059, AC-4 | M |
| EV-005 | §1.1 | Runner executable in CI | absent | No `.github/` directory exists in the repo (verified `ls`); no workflow files anywhere | Entire CI leg missing | AC-4 | M |
| EV-006 | §1.1 | CI runs nightly + on any change to plan/render prompts, block schemas, move constraints, or model-tier config — enforced by a CI path filter | absent | No `.github/workflows`. `IMPLEMENTED-EDRION-LEARN.md:61` lists "CI workflow path filter for learn-evals" as remaining work | No path filter, no nightly schedule | AC-4 | M |
| EV-007 | §1.1 | Runner drives the real `PedagogyOrchestratorService` through its public API | partial | `cli.ts:35-48` HTTP-POSTs `${apiBase}/learn/sessions` against a live server; `cli.ts:11` default `http://localhost:3001/v1/student` | Not the service's public API — an out-of-process HTTP call to a manually-started API. Only `createSession` is called: no stream, no answer, no interact, no commit, no plan cycles. `cli.ts:53-55` reads only `session.id` and `planMoveCount` | EV-034..EV-050, AC-1 | L |
| EV-008 | §1.1 | Runs against a seeded test DB | absent | `cli.ts:11,29-32` — the only inputs are `LEARN_EVAL_API_BASE` and a `LEARN_EVAL_AUTH_TOKEN` cookie; no DB setup/teardown/seed anywhere in the package | Depends on whatever DB the dev's API points at; not reproducible | AC-1 | M |
| EV-009 | §1.1 | No mocked orchestrator | partial | `cli.ts:29-32`: with no `LEARN_EVAL_AUTH_TOKEN` every session short-circuits to `error: 'LEARN_EVAL_AUTH_TOKEN not set — structural dry run only'` | Nothing is mocked, but nothing is exercised either in the default path. Vacuously satisfied | — | S |
| EV-010 | §1.1 | Chat 8 card service and Chat 9 pipeline run against test doubles that validate contract shape | absent | No test doubles, stubs, or contract assertions in `packages/learn-evals/src/**` (full package listing: `cli.ts`, `cli.spec.ts`, `personas.ts`, `fixtures/topics.ts`, `fixtures/p2-entry-points.ts`) | Live runs would hit the real `ArtifactCommitService`/canvas path with no shape validation | — | M |
| EV-011 | §1.2 | 30 topics, fixed and versioned in the package | partial | `packages/learn-evals/src/fixtures/topics.ts:2-7` — exactly 4 topics. Header comment `topics.ts:1` says "30 topics target; core subset here" | 4/30. `IMPLEMENTED-EDRION-LEARN.md:60` admits "Expand eval topic fixtures from 4 → 30" | EV-012..EV-016, AC-1 | M |
| EV-012 | §1.2 | Every `knowledge_type` ≥ 6 topics | contradicted | `topics.ts:3-6` — only `procedural` (×2) and `conceptual` (×2). `factual` and `skill` (enum at `packages/schemas/src/student/edrion-learn/profile.ts:3`) have 0 topics | 2/6 for two types, 0/6 for two types | AC-1 | M |
| EV-013 | §1.2 | Every `native_representation` ≥ 4 topics | absent | `topics.ts:2-7` fixture objects carry only `key`, `title`, `knowledge_type`; `native_representation` (enum `profile.ts:5-11`) is not a fixture field | Dimension not modelled in fixtures at all | AC-1 | M |
| EV-014 | §1.2 | ≥ 8 topics with high `prerequisite_density` | absent | `topics.ts:2-7` — no `prerequisite_density` field on any fixture | Dimension not modelled | AC-1 | M |
| EV-015 | §1.2 | ≥ 6 topics with high `misconception_richness` | absent | `topics.ts:2-7` — no `misconception_richness` field | Dimension not modelled | AC-1 | M |
| EV-016 | §1.2 | ≥ 5 topics with heavy `math_load` | absent | `topics.ts:2-7` — no `math_load` field | Dimension not modelled | AC-1 | M |
| EV-017 | §1.2 | Canonical four (integration by parts, photosynthesis, French Revolution causes, Python for-loops) are in the set | conformant | `topics.ts:3-6` — all four present, exactly | none | — | S |
| EV-018 | §1.2 | Canonical four carry expected-shape assertions from the worked-contrast table | absent | No assertions anywhere; `cli.spec.ts:3-8` is the package's only test and asserts `4*6===24`, `30*6===180` | No expected-shape data, no comparison | AC-3 | M |
| EV-019 | §1.2 | Each topic ships a frozen `topic_profile` fixture; evals never exercise the profiler's LLM call | contradicted | `topics.ts:2-7` has no `profile` field. `cli.ts:41-47` posts only `topicKey/goal/timeBudget`, so `createSession` runs the real profiler: `apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts:114-118` → `profile.service.ts:37,62-70` (`tier:'small'`, live `completeJson`) | Live runs DO hit the profiler LLM on cache miss — the exact thing the rule forbids | EV-020, AC-1 | M |
| EV-020 | §1.2 | Dedicated profiler suite of 10 topics scored separately for profile plausibility | absent | No profiler suite in `packages/learn-evals/src/**` | — | — | M |
| EV-021 | §1.3 | 6 scripted personas exist | conformant | `packages/learn-evals/src/fixtures/topics.ts:9-16` lists all six names; `packages/learn-evals/src/personas.ts:12-19` gives each a policy record | Names and count match exactly | — | S |
| EV-022 | §1.3 | `strong_fast`: 90% correct, always taps "show step", never expands deeper | partial | `personas.ts:13` `correctProbability: 0.9, expandDeeper: false` | 0.9 and no-expand encoded as data; "always taps show step" has no field and no behaviour. No field is ever consumed — `cli.ts:26` reads only `policy.goal` and `policy.timeBudgetMinutes` | EV-028 | M |
| EV-023 | §1.3 | `struggling`: 30% correct, fails prereq pulses, expands "simpler" once per session | partial | `personas.ts:14` `correctProbability: 0.3` | Only the probability exists; "fails prereq pulses" and "expands simpler once" are unmodelled and unused | — | M |
| EV-024 | §1.3 | `average_curious`: 60% correct, expands deeper 50%, asks 1 free question mid-session | partial | `personas.ts:15` `correctProbability: 0.6, expandDeeper: true` | `expandDeeper` is a boolean, not a 50% rate; no free-question behaviour. Unused by the runner | — | M |
| EV-025 | §1.3 | `probe_escaper`: 60% correct, always taps "Just explain it" on probes | partial | `personas.ts:16` `correctProbability: 0.6, probeEscape: true` | Flag declared, never read by `cli.ts` | — | M |
| EV-026 | §1.3 | `time_poor`: 70% correct, 10-min budget, skips synthesis | partial | `personas.ts:17` `correctProbability: 0.7, timeBudgetMinutes: 10, skipSynthesis: true` | All three encoded; only `timeBudgetMinutes` reaches the API (`cli.ts:45`). `skipSynthesis` never acted on | — | M |
| EV-027 | §1.3 | `revision_mode`: 75% correct, `goal='revision'`, 20-min budget | partial | `personas.ts:18` `correctProbability: 0.75, goal: 'revision', timeBudgetMinutes: 20` | Data exact; `goal` and budget do reach the API (`cli.ts:44-45`); correctness probability unused | — | S |
| EV-028 | §1.3 | Answer correctness drawn from a seeded RNG (fixed seed per run) so runs are reproducible | partial | `personas.ts:22-28` `seededRandom(seed)` LCG exists and is deterministic. It is imported nowhere — `cli.ts:5` imports only `PERSONA_POLICIES`. `cli.ts:76` writes `seed: 42` into the report as a literal | Seeded RNG is dead code; no answers are ever produced, so "reproducible sessions" is unproven. Report also contains `run_id: learn-eval-${Date.now()}` (`cli.ts:72`), which is non-deterministic | AC-1 | M |
| EV-029 | §1.3 | Free-text answers come from per-topic canned pools (right/wrong variants) | absent | No answer pools in `packages/learn-evals/src/fixtures/**` (only `topics.ts`, `p2-entry-points.ts`) | — | — | M |
| EV-030 | §1.3 | Personas are deterministic response policies, not LLMs | conformant | `personas.ts:3-19` — plain records, no AI dependency; `package.json:13-15` has one dependency (`@edrion/schemas`) | none | — | S |
| EV-031 | §1.4 | 6 rubric dimensions scored per transcript | contradicted | `cli.ts:79-86` emits all six dimension keys with hardcoded literal values (`mean: 0.72`, `mean: 4.1`, `mean: 4.3`, `mean: 4.0`, `p95_first_token_ms: 2100`) and `pass: true` constants | The report *looks* scored but nothing is measured. Values are invented and independent of any session | AC-1, AC-9, AC-10 | L |
| EV-032 | §1.4 | Structural dimensions computed deterministically from the transcript | absent | No transcript is ever fetched — `cli.ts:53-55` reads only `session.id`/`planMoveCount`; `cli.ts:22` `constraintViolations` is initialised to 0 (`cli.ts:27`) and never incremented | — | AC-2 | L |
| EV-033 | §1.4 | Content dimensions scored by an LLM judge (mid model, temperature 0, rubric prompt versioned in the package) | absent | No judge, no prompt file, no AI client in `packages/learn-evals/**` (deps at `package.json:13-21` are `@edrion/schemas`, tsx, typescript, vitest) | Entire judge leg missing | EV-067, AC-10 | L |
| EV-034 | §1.4 | Move diversity = distinct move types used / applicable move types for the profile | absent | `cli.ts:80` `move_diversity: { mean: 0.72, pass: failures.length === 0 }` — a constant | `pass` is keyed off HTTP failures, not diversity | — | M |
| EV-035 | §1.4 | Move diversity ≥ 0.6 per session | absent | `cli.ts:80` — no `0.6` comparison exists anywhere in the package | Threshold not encoded | — | S |
| EV-036 | §1.4 | Canonical-four move sequences pairwise distinct | absent | No sequence capture or comparison in `cli.ts`; `cli.spec.ts:3-8` asserts arithmetic only | — | AC-3 | M |
| EV-037 | §1.4 | Constraint compliance: deterministic zero hard-constraint violations (probe cap, prereq placement, move cap, closing pair, retrieval-after-exposition) | partial | Enforcement exists server-side: `move-planner.service.ts:42-61` (`enforceHardRules` covers retrieval-after-exposition :46-48, prereq placement :49-51, probe cap :52-56, closing pair :57-59) and `move-planner.service.ts:239` move cap. The harness never checks: `cli.ts:27` sets `constraintViolations: 0` and `cli.ts:81` reports `constraint_compliance: { value: 1, pass: true }` unconditionally | The engine enforces; the eval asserts nothing. AC-2 is fabricated, not proven | AC-2 | M |
| EV-038 | §1.4 | Constraint compliance threshold 100% — any violation fails the run | absent | `cli.ts:81,88` — `gate` is `failures.length === 0`, i.e. HTTP errors only | A real violation could not fail the gate | AC-2 | M |
| EV-039 | §1.4 | Pedagogical fit scored by LLM judge (profile + persona match, remediation, revision bias) | absent | `cli.ts:82` `pedagogical_fit: { mean: 4.1, pass: true }` — constant | — | — | L |
| EV-040 | §1.4 | Pedagogical fit mean ≥ 4.0, no session < 3 | absent | No per-session scores exist (`EvalSessionResult`, `cli.ts:16-23`, has no score fields); no 4.0/3 comparison in the package | Threshold not encoded | — | M |
| EV-041 | §1.4 | Content correctness scored by LLM judge (facts/math in explanations, questions, answer keys, `why_md`) | absent | `cli.ts:83` `content_correctness: { mean: 4.3, pass: true }` — constant | — | — | L |
| EV-042 | §1.4 | Content correctness mean ≥ 4.2, no session < 3 | absent | No comparison in the package | Threshold not encoded | — | M |
| EV-043 | §1.4 | Any answer-key error caps the session at 2 | absent | No per-session capping logic | — | — | M |
| EV-044 | §1.4 | Artifact quality: LLM judge on committed cards (atomic? front asks, back answers? source-linked?) | absent | `cli.ts:84` `artifact_quality: { mean: 4.0, pass: true }` — constant; the runner never calls `commit-artifacts` | — | — | L |
| EV-045 | §1.4 | Artifact quality deterministic: ≥ 1 commit offered per session | absent | Never checked. Engine does guarantee an offer (`move-planner.service.ts:124-133` forces `artifact_commit` at `LEARN_MOVE_CAP - 1`), but the harness does not observe it | Enforced but unverified | — | M |
| EV-046 | §1.4 | Artifact quality mean ≥ 4.0 | absent | No comparison in the package | Threshold not encoded | — | S |
| EV-047 | §1.4 | Latency & robustness computed from `latency_ms` + degraded-block count + speculative-plan discard rate | absent | `cli.ts:85` — all three values are literals. `learn_ai_calls` is never read by anything (grep `learnAiCalls`: only `packages/database/src/schema/learn.ts:394` definition and `learn-ai-call.logger.ts:29` insert) | Source data exists but is write-only | AC-9 | L |
| EV-048 | §1.4 | p95 render first-token < 3s | contradicted | `cli.ts:85` reports `p95_first_token_ms: 2100` as a literal. `firstTokenMs` is an optional logger field (`learn-ai-call.logger.ts:26,42`) never set by any caller — `block-renderer.service.ts:54-59` and `:64-70` omit it, and render uses non-streaming `completeJson` (`block-renderer.service.ts:40-52`) | The reported number is fiction; there is no first-token event to measure | AC-9 | L |
| EV-049 | §1.4 | Degraded blocks ≤ 2% of blocks | absent | `cli.ts:85` `degraded_rate: 0.01` literal. Real degraded flags are written (`pedagogy-orchestrator.service.ts:299`, `block-renderer.service.ts:70`) but never aggregated | Measurable but unmeasured | AC-9 | M |
| EV-050 | §1.4 | Speculative-plan discard rate < 30% | absent | `cli.ts:85` `discard_rate: 0.12` literal. `speculative` exists only as a logger field (`learn-ai-call.logger.ts:23,44`); grep for `speculative` under `apps/api/src/modules/student` returns only those two lines | No speculative planning exists, so there is nothing to discard — see EV-071 | AC-9 | M |
| EV-051 | §1.5 | Full suite = 30 topics × 6 personas = 180 sessions per run | partial | `cli.ts:14` `sessionCount = topics.length * PERSONAS.length` = 4×6 = 24; `cli.ts:64-68` loops those | Shape is right, cardinality is 24 not 180. `cli.spec.ts:6` asserts `30*6===180` as arithmetic only | AC-1 | M |
| EV-052 | §1.5 | `--suite core` = canonical four × all personas = 24 sessions for fast pre-merge checks | partial | `cli.ts:9` defaults suite to `'core'`; `cli.ts:13` makes core and full identical; the 4 fixtures happen to be the canonical four (`topics.ts:3-6`) | Numerically correct by accident: core == full == 24. No distinction to make a "fast" check meaningful | — | S |
| EV-053 | §1.5 | Output: a run report in JSON + markdown | conformant (shape) | `cli.ts:96-102` writes `${run_id}.json` and `${run_id}.md` | Both files are produced; contents are not real (see EV-054) | — | S |
| EV-054 | §1.5 | Report contains per-dimension scores | contradicted | `cli.ts:79-86` — six dimensions with hardcoded values | A green report proves nothing | AC-1, AC-9 | L |
| EV-055 | §1.5 | Report contains deltas vs. `--baseline` | absent | `cli.ts:87` emits only a string note | No baseline artifact, no delta arithmetic | EV-059 | M |
| EV-056 | §1.5 | The 5 worst transcripts inlined for human reading | absent | `cli.ts:71-92` report object has no transcript field; `cli.ts:99-102` markdown is 5 lines of header text | No transcripts are ever fetched | — | M |
| EV-057 | §1.5 | Reports stored in the repo's eval-runs artifact store | partial | `cli.ts:94-97` `mkdirSync(join(process.cwd(), 'eval-runs'))` | Writes to the CWD of whoever runs it; no repo-level store, no `eval-runs` directory tracked in git, no retention/pinning | EV-060 | M |
| EV-058 | §1.5 | Regression gate (binding): CI fails if any pass threshold is missed | absent | `cli.ts:88` `gate: failures.length === 0 ? 'pass' : 'fail'`; `cli.ts:104` `process.exit(1)` on fail — but `failures` (`cli.ts:70`) counts only sessions with an HTTP/network `error`. No CI to run it (EV-005) | Exit code exists; thresholds do not feed it | AC-2 | M |
| EV-059 | §1.5 | CI fails if any dimension mean drops > 0.3 vs. the pinned baseline | absent | No `0.3` anywhere in the package; `cli.ts:87` is the only baseline handling | Core regression rule entirely unimplemented | AC-4 | M |
| EV-060 | §1.5 | Prompts/models cannot merge without a green full run and a re-pinned baseline | absent | No `.github/` directory; no baseline pin file | Nothing prevents a prompt change from merging | AC-4 | M |
| EV-061 | §2 | All knobs live in a runtime config namespace `learn.*` | contradicted | `apps/api/src/modules/student/edrion-learn/constants.ts:1` comment claims "runtime defaults (namespace learn.*)" but `:2-12` are `export const` TS literals. `packages/config/src/index.ts` (whole file read, 239 lines) declares no `LEARN_*` / `learn.*` entry | The namespace does not exist. The comment is aspirational and misleading | AC-5 | M |
| EV-062 | §2 | `move_cap` default 14 planned moves/session | partial | `constants.ts:2` `LEARN_MOVE_CAP = 14`. Consumed at `move-planner.service.ts:57,124,134,239` and `pedagogy-orchestrator.service.ts:247` | Value correct; compile-time constant. Changing it **requires a code change and redeploy** — directly contradicts AC-5 | AC-5 | M |
| EV-063 | §2 | `profile_ttl_days` 180; overrides never expire | conformant | `constants.ts:6` `LEARN_PROFILE_TTL_DAYS = 180`; applied at `profile.service.ts:77-81`; `profile.service.ts:31-33` returns `human_override` profiles from cache before any expiry check | Value and override semantics both correct. Not runtime-configurable (see EV-061) | AC-5 | S |
| EV-064 | §2 | `plan_model_tier` = `small`, temperature 0, max_tokens 400 | partial | `move-planner.service.ts:79` `tier: 'small'`; `:91` `maxOutputTokens: 400` | Tier and token cap exact. No `temperature` parameter exists anywhere under `apps/api/src/modules/student/edrion-learn/**` (grep) — the provider opts expose `reasoningEffort`/`verbosity` instead (`router.service.ts:48-49`), so determinism is unpinned | EV-028, AC-5 | M |
| EV-065 | §2 | `render_model_tier` = `mid`, streamed, max_tokens 1600 | contradicted | `block-renderer.service.ts:43` `tier: 'small'`; `:51` `maxOutputTokens: 1600`; the call is `completeJson` (`:40`), not a stream | Two violations: tier is `small` not mid (`LearnAiTier` at `apps/api/src/modules/student/learn-ai/provider.ts:3` is `nano\|small\|large\|vision`; `openai.provider.ts:19-24,46-50` maps `small`→`OPENAI_SMALL_MODEL`, i.e. nano-class), and rendering is not streamed. Token cap is correct | EV-048, AC-5 | M |
| EV-066 | §2 | `grade_model_tier` = `small`, max_tokens 120 | conformant | `apps/api/src/modules/student/edrion-learn/grading.service.ts:47` `tier: 'small'`; `:56` `maxOutputTokens: 120` | Exact. Not runtime-configurable | AC-5 | S |
| EV-067 | §2 | `judge_model_tier` (evals) = `mid` | absent | No judge exists (EV-033); `packages/learn-evals/package.json:13-15` has no AI dependency | — | AC-10 | M |
| EV-068 | §2 | `profiler_model_tier` = `small`, max_tokens 600 | conformant | `profile.service.ts:64` `tier: 'small'`; `:69` `maxOutputTokens: 600` | Exact. Not runtime-configurable | AC-5 | S |
| EV-069 | §2 | `max_free_questions_per_session` = 5; 6th gets fixed copy "Let's finish this lesson — then ask me anything in chat." | conformant | `constants.ts:4` `LEARN_MAX_FREE_QUESTIONS = 5`; `pedagogy-orchestrator.service.ts:461-466` throws `FREE_QUESTION_CAP` with that exact copy | Copy matches verbatim (mojibake on the em dash in the source file). Returns 409 (`ConflictException`) — spec does not pin a status here | — | S |
| EV-070 | §2 | `daily_session_cap_per_user` = 12; 13th → 429 with calm copy | conformant | `constants.ts:5` `LEARN_DAILY_SESSION_CAP = 12`; `pedagogy-orchestrator.service.ts:80-86` — `daily >= 12` → `HttpStatus.TOO_MANY_REQUESTS` with `code: 'DAILY_SESSION_CAP'` and calm body | Matches AC-8 exactly (cap check runs before session creation, so prior 12 are untouched) | — | S |
| EV-071 | §2 | Speculative planning on, discardable | absent | Grep `speculative` under `apps/api/src/modules/student` returns only `learn-ai-call.logger.ts:23` (opt type) and `:44` (always `?? false`). Plan and render are strictly sequential (`pedagogy-orchestrator.service.ts:234-245` then `:264`) | No speculative planning implemented; the `speculative` column will always be false | EV-050, AC-9 | L |
| EV-072 | §2 | Worst-case bound: ≤15 plan + 14 render + ≤9 micro-grades + 0–1 profile; no unbounded context | partial | Bounded by construction: `LEARN_STATE_DIGEST_MAX_BYTES = 8*1024` (`constants.ts:9`), move cap 14 (`constants.ts:2`), one plan + one render per block (`pedagogy-orchestrator.service.ts:234,264`), one profile per session (`:114-118`), grade only on short_text/numeric (`:350-357`) | Design honours the bound but nothing asserts it. AC-6 requires the assertion be made **from `learn_ai_calls` row counts** — no such query exists | AC-6 | M |
| EV-073 | §2 | Cost/latency reporting reads `learn_ai_calls`; no separate cost ledger | partial | Table defined `packages/database/src/schema/learn.ts:394`; written by `learn-ai-call.logger.ts:29-48` with call_type/model/tokens/latency/flags. Grep for `learnAiCalls` finds **no read anywhere** in the repo | Correct on the "no parallel ledger" half (nothing else logs cost). Fails the "reporting reads it" half — there is no rollup, endpoint, or query | AC-6, AC-9 | M |
| EV-074 | §3.1 | Every session start AND every plan cycle calls `resolve-policy({scope:'student_tutor', userId, institutionId?})` | conformant | Session start: `pedagogy-orchestrator.service.ts:95` `await this.policy.resolve(principal)`. Plan cycle: `:212` same call at the top of `planAndRenderNextBlock`. Context built from principal at `student-tutor-policy.service.ts:20-24` (institutionId / independentUserId / institutionUserId) | Both call sites present and unconditional. Note a 30 s in-process memo cache (`student-tutor-policy.service.ts:14,27-30`) that is bypassed whenever the kill switch is set (`:29,46-50`) | — | S |
| EV-075 | §3.1 | P1 registers the student-tutor scope with a permissive default → `{curriculum_bounds:'open', directness:'default', visibility:'none'}` for every user | conformant | `packages/database/migrations/0097_student_tutor_policy_domain.sql:17-27` seeds a global `student_tutor` row with exactly that `domain_config`; fallbacks in `resolve-student-tutor-policy.ts:52,58,64` return the same defaults when no row matches; `packages/schemas/src/student/edrion-learn/policy.ts:29-36` `DEFAULT_LEARN_POLICY_V1` matches | Applies to institution students and independent users alike (global scope always matches — `resolve-policy.ts:102-103`) | — | S |
| EV-076 | §3.1 | The result is stored in `session_context.policy_snapshot` | conformant | `pedagogy-orchestrator.service.ts:127-134` builds `sessionContext` with `policy_snapshot: policySnapshot`, validated by `sessionContextV1Schema` (`packages/schemas/src/student/edrion-learn/state.ts:58-70`, `policy_snapshot` required at `:63`). Also denormalised to a column (`:155`, `packages/database/src/schema/learn.ts:159`) | Written day one, on the create path | — | S |
| EV-077 | §3.2 | Capabilities (`curriculum_bounds`, `answer_directness`, `session_visibility`) declared in the same capability grammar the admin-Copilot scopes use | partial | The three capabilities exist with the spec's exact names and value sets: `packages/copilot/src/resolve-student-tutor-policy.ts:5-7,26-36`; `packages/schemas/src/student/edrion-learn/policy.ts:3-15`. But they ride a new `domain_config jsonb` column (`0097_…sql:4-5`) resolved by a bespoke `pickDomainConfig` (`resolve-student-tutor-policy.ts:38-47`), NOT the engine's `capabilities: Partial<Record<AiCapability, boolean>>` merge (`resolve-policy.ts:52-55`) | Different grammar: booleans keyed by `AiCapability` vs. free-form jsonb enums. P3 config wiring works, but "same capability grammar" is not literally met | AC-7 | M |
| EV-078 | §3.2 | The scope's kill switch instantly disables orchestrated tutoring using the engine's existing mechanism — no Learn-specific kill code | conformant | Kill switch is OR'd by the base engine (`resolve-policy.ts:62-63,75`), surfaced unchanged at `resolve-student-tutor-policy.ts:98,108-109`, and consumed at `pedagogy-orchestrator.service.ts:96-101` (session start → 403 `POLICY_DISABLED`) and `:213-216` (plan cycle → `closeSession(..., 'policy_kill')`). Cache is skipped on kill (`student-tutor-policy.service.ts:29,46-50`). Test at `resolve-student-tutor-policy.spec.ts:29-46` | No Learn-specific kill mechanism was invented | — | S |
| EV-079 | §3 preamble / §3.2 | Petros Learn adds NO second policy engine — it extends the existing `resolve-policy` engine with a student-tutor scope | conformant | `resolve-student-tutor-policy.ts:76` `const base = resolveAiPolicy(tutorRows, context);` — it delegates mode, kill switch, kill-switch scope and specificity to the real engine (`resolve-policy.ts:29-81`), then layers three domain fields on top. Both exported from one package: `packages/copilot/src/index.ts:2-3`. The API service calls only the wrapper (`student-tutor-policy.service.ts:4-7,45`) | Not a second engine — a scope adapter. Caveat: the layer walk is duplicated (`resolve-student-tutor-policy.ts:78-92` re-implements the specificity order of `resolve-policy.ts:9-17`) and, unlike the base, it does **not** apply `scopeMatchesContext` (`resolve-policy.ts:96-119`) — so a scoped row for a *different* institution can supply `domainConfig`. That is a correctness bug, not a second engine | AC-7 | M |
| EV-080 | §3.3 | `session_context.policy_snapshot` written day one | conformant | Column since `0096` (`packages/database/src/schema/learn.ts:159`); written at `pedagogy-orchestrator.service.ts:131,155`; required by schema `state.ts:63` | none | — | S |
| EV-081 | §3.3 | `system_notice` block carries `kind:'policy'` | conformant | `packages/schemas/src/student/edrion-learn/blocks.ts:99-100` — `block_type: 'system_notice'`, `kind: z.enum(['break','budget','degraded','policy'])` | Reservation placed. (Per `LEARN-SESSION-DIAGNOSIS.md:133`, no `system_notice` is ever emitted — acceptable for a P1 reservation) | — | S |
| EV-082 | §3.3 | Session-screen footer disclosure region reads `policy_snapshot.visibility`, empty while `'none'` | conformant | `apps/student-web/src/app/(app)/learn/session/[id]/page.tsx:12-23` — `PolicyNotice` reads `policy.session_visibility !== 'none'` and returns `null` when there are no notices; rendered at `:122` with `session.policySnapshot` | Wiring exists; empty under the P1 default | — | S |
| EV-083 | §3.4 | Visibility is a read projection; P1 endpoints stay owner-only; the P3 aggregate/transcript view is a new read model gated by `session_visibility` | conformant | Separate read model: `apps/api/src/modules/portal/learn-policy/portal-learn-visibility.service.ts:28-31` (403 when `session_visibility === 'none'` or killed), `:83-86` (transcript requires `'transcript'`), `:148-149`. Student endpoints unchanged — all repo reads are principal-scoped (`pedagogy-orchestrator.service.ts:177,187,335-336`) | No write-path permission change | — | S |
| EV-084 | §3.5 | `SessionContextV1` tolerates an optional `active_assignment_overlap: boolean` (Zod passthrough); P1 always omits it | partial | Field declared optional at `packages/schemas/src/student/edrion-learn/state.ts:65` | Two deltas: (a) the object is a plain `z.object` (`state.ts:58`), not `.passthrough()`, so unknown P3 keys are stripped; (b) P1 does not "always omit" — it is already consumed as a plan bias at `pedagogy-orchestrator.service.ts:227`, and `institutionalCtx.sessionContextExtras` (`:133`) can set it. P2 entry work landed early | — | S |
| EV-085 | §3.6 | `answer_directness` lands as a plan-input move-weight bias, never a refusal | conformant | `pedagogy-orchestrator.service.ts:226-229` maps `guided` / `never_direct_on_assignment` to `preferRetrieval`, passed as a plan hint at `:242`; consumed as a weight in `move-planner.service.ts:150-151` (deterministic path) and passed to the prompt at `:87`. No refusal branch | Exactly the "weights, not new plumbing" shape the spec asks for | — | S |
| EV-086 | §4.1 | "Why this?" tooltip pulled into P1 (product decision — decided-by-spec) | conformant | `apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx:36` `title={degraded ? 'I improvised this one.' : reasoning ?? 'Why this step'}`; `reasoning` persisted at `pedagogy-orchestrator.service.ts:260` and returned at `:327` | decided-by-spec — shipped, though as a native `title` attribute rather than a popover | — | S |
| EV-087 | §4.2 | No push notifications for Learn in P1; Today nudge is feed-only (product decision — decided-by-spec) | conformant | No push/notification integration in `apps/api/src/modules/student/edrion-learn/**` (full directory listing: 17 files, none notification-related) | decided-by-spec — absence is the intended state | — | S |
| EV-088 | §4.3 | Mastery has no decay term (product decision — decided-by-spec) | conformant | `apps/api/src/modules/student/edrion-learn/mastery.service.ts` is 2.3 KB with no staleness/decay logic; corroborated by `LEARN-SESSION-DIAGNOSIS.md:116` (Elo only) | decided-by-spec — absence is deliberate | — | S |
| EV-089 | §4.4 | Free-chat handoff trigger is a crude deterministic rule (120 words / second follow-up + regex emotional detection) (product decision — decided-by-spec) | conformant | `apps/student-web/src/components/edrion-learn/LearnHandoffCard.tsx:47-48` `const words = answer.trim().split(/\s+/)…; return words > 120 \|\| followUpCount >= 1;` and `:18` `setbackPattern.test(topicLabel)` | decided-by-spec — implemented exactly as described, deliberately dumb | — | S |
| EV-090 | §4.5 | Move cap 14 / budget default 15 min are cost-driven guesses; the eval harness's latency+cost report is the retuning instrument (product decision — decided-by-spec) | partial | Values present: `constants.ts:2` (14), `constants.ts:3` `LEARN_DEFAULT_SESSION_MINUTES = 15`, applied at `pedagogy-orchestrator.service.ts:120` | decided-by-spec on the values. But the named retuning instrument does not exist (EV-047, EV-073), so the review trigger is unarmed — and the values are not runtime-tunable (EV-061) | AC-5 | M |
| EV-091 | AC-1 | `pnpm learn-evals run` completes 180 reproducible sessions (fixed seed) against the real orchestrator service and emits the run report | partial | Report emitted (`cli.ts:96-102`); sessions = 24 (`cli.ts:14`, `topics.ts:2-7`); no root script (`package.json:10-27`); seeded RNG unused (`personas.ts:22-28` imported nowhere); default path is a dry run (`cli.ts:29-32`) | Only the report artifact half is met | — | L |
| EV-092 | AC-2 | Constraint compliance is 100% across all runs; a single hard-constraint violation fails CI | absent | `cli.ts:81` reports `value: 1, pass: true` unconditionally; `cli.ts:88` gates on HTTP failures only; no CI exists | Reported as passing while being unmeasured — the worst failure mode for this AC | — | M |
| EV-093 | AC-3 | The canonical four produce pairwise-distinct move sequences under `average_curious` | absent | No sequence capture (`cli.ts:53-55` reads `id`/`planMoveCount` only) and no persona-scoped comparison | Cannot even be evaluated today | — | M |
| EV-094 | AC-4 | Changing a plan/render prompt or model tier without a green full eval run cannot merge (CI path filter proven by a test commit) | absent | No `.github/` directory; `IMPLEMENTED-EDRION-LEARN.md:61` lists it as outstanding. Prompt version lives at `apps/api/src/modules/student/learn-ai/prompts/version.ts` (imported at `move-planner.service.ts:95`, `block-renderer.service.ts:12`) but nothing gates on it | Zero enforcement | — | M |
| EV-095 | AC-5 | All `learn.*` knobs resolve through config at runtime; changing `move_cap` requires no deploy of new code paths | contradicted | `constants.ts:2-12` are compile-time `export const`s; `packages/config/src/index.ts` has no learn entries; consumers import the literal (`move-planner.service.ts:17`, `pedagogy-orchestrator.service.ts:18-21`) | Changing `move_cap` requires editing TS and redeploying. This AC is flatly false today | — | M |
| EV-096 | AC-6 | Worst-case per-session LLM calls ≤ 15 plan + 14 render + 9 grade + 1 profile, asserted from `learn_ai_calls` row counts, not a separate counter | absent | No query reads `learn_ai_calls` (grep `learnAiCalls`: definition `packages/database/src/schema/learn.ts:394` + insert `learn-ai-call.logger.ts:29` only); no such assertion in `packages/learn-evals/src/**` | The bound holds by construction (EV-072) but is never asserted | — | M |
| EV-097 | AC-7 | `resolve-policy` (student-tutor scope) invoked on every session start and every plan cycle in P1, verified by test spies, returning the permissive default; no second policy engine in the Learn module | partial | Call sites conformant (`pedagogy-orchestrator.service.ts:95,212`); no second engine (`resolve-student-tutor-policy.ts:76` delegates to `resolveAiPolicy`); permissive default seeded (`0097_…sql:17-27`). But no test spies exist — the only policy tests are pure-function unit tests (`packages/copilot/src/resolve-student-tutor-policy.spec.ts:6-46`); no orchestrator spec asserts the two call sites | Behaviour correct, verification missing | — | M |
| EV-098 | AC-8 | A 13th session in one day returns 429 with the calm-copy body; the 12 prior sessions are unaffected | conformant | `pedagogy-orchestrator.service.ts:80-86` — `countSessionsToday` ≥ 12 → `TOO_MANY_REQUESTS`, thrown before any write, so prior sessions are untouched | Not covered by an automated test that I found | — | S |
| EV-099 | AC-9 | The eval report includes degraded-block rate and speculative-discard rate, and both are under thresholds on the pinned baseline | contradicted | `cli.ts:85` includes both keys with literal values `0.01` and `0.12` and `pass: true`; no pinned baseline exists; speculative planning does not exist at all (EV-071) | Keys present, values fabricated — a report that will always claim to pass | — | L |
| EV-100 | AC-10 | Removing the judge model (simulated outage) fails the eval run loudly rather than silently passing structural checks only | contradicted | No judge exists (EV-033). `cli.ts:29-32` + `:88-91`: with no auth token every session errors, the gate goes `fail`, but with a token and a judge outage there is nothing to fail — `cli.ts:82-84` returns `pass: true` regardless | The harness's current default behaviour is precisely the silent-pass the AC forbids | — | L |

---

## A5 findings

**`packages/learn-evals` is a skeleton, not a harness.** Five source files, 190 lines total. It contains 4 topics (`fixtures/topics.ts:2-7`, target 30), 6 personas (`personas.ts:12-19`, target 6 — the only fully-met §1 requirement), and zero implemented rubric dimensions. `cli.ts:79-86` emits all six dimension names with **hardcoded literal scores** (`0.72`, `4.1`, `4.3`, `4.0`, `2100 ms`, `0.01`, `0.12`) and `pass: true` constants that no measurement can move. The only real gate is `failures.length === 0` (`cli.ts:88`), where `failures` counts HTTP errors. Its sole unit test asserts `4*6===24` and `30*6===180` (`cli.spec.ts:3-8`). It is best described as **a report-shaped stub with a fixture set** — the JSON it writes has the right keys and none of the right values, which is more dangerous than an empty package because it looks green.

**It does not drive the orchestrator's public API.** `cli.ts:35-48` HTTP-POSTs `POST /learn/sessions` to a separately-running server, reads back `id` and `planMoveCount` (`:53-55`), and stops. No stream, no answers, no interactions, no commits, no plan cycles, no transcripts. Nothing is mocked — but nothing is exercised either. Without `LEARN_EVAL_AUTH_TOKEN` every session short-circuits (`cli.ts:29-32`). Two secondary violations: `--suite core` and `--suite full` are the same array (`cli.ts:13`), and the seeded RNG at `personas.ts:22-28` is **imported nowhere**, so "reproducible" is unproven (the report's `seed: 42` at `cli.ts:76` is decorative, while `run_id` uses `Date.now()`).

**Config knobs: 8 of 9 exist as values; 0 are runtime-configurable.** `constants.ts:2-12` gets `move_cap`=14, `profile_ttl_days`=180, `max_free_questions`=5, `daily_session_cap`=12 exactly right, and the four model tiers/token caps match at `move-planner.service.ts:79,91`, `grading.service.ts:47,56`, `profile.service.ts:64,69`. Two real deviations: **render is `tier:'small'` and non-streaming** (`block-renderer.service.ts:43,40,51`) where the spec says mid + streamed, and `judge_model_tier` has nothing to configure. `constants.ts:1` *claims* the namespace `learn.*`; `packages/config/src/index.ts` (239 lines, read in full) contains no learn entry. **AC-5 is false: changing `move_cap` requires a code edit and a redeploy.**

**Policy: this is one engine, correctly.** `resolve-student-tutor-policy.ts:76` calls `resolveAiPolicy(tutorRows, context)` and inherits mode, kill switch and kill-switch scope from it; it adds only three jsonb-sourced fields. Not a second engine. Two caveats: capabilities ride a new `domain_config jsonb` (`0097:4-5`) rather than the engine's `AiCapability` boolean map (`resolve-policy.ts:52-55`), and the wrapper's layer walk (`:78-92`) omits `scopeMatchesContext`, so a *different* institution's row can leak `domainConfig` — a real bug worth a follow-up.

**Call sites are correct.** `resolve` runs at session start (`pedagogy-orchestrator.service.ts:95`) and at every plan cycle (`:212`), and the result is written to `session_context.policy_snapshot` (`:131`) plus a denormalised column (`:155`). §3's six obligations are the strongest area of the file: 4 conformant, 2 partial. **No CI exists at all** — the repo has no `.github/` directory, so EV-005/006/058/059/060 and AC-4 are unenforceable.

**`LEARN-SESSION-DIAGNOSIS.md` staleness (my area):** its line 161 speculates the eval gate "either never ran live or does not exercise the stream path" — the second half is confirmed (`cli.ts` never opens the stream), but the file predates the current fixtures and understates the problem: the harness would report `gate: pass` on a live run regardless of quality. Its line 119 (speculative/`firstTokenMs` columns exist but nothing sets them) and line 121 (every orchestrator call uses `tier:'small'`) **remain accurate** and I independently confirm both. It says nothing about the student-tutor policy work, which is the more complete half of this spec — treat its silence there as staleness, not a finding.

**Overall:** §3 is largely built, §2 is built-as-constants, §1 is a stub, and 8 of 10 acceptance criteria fail.

---

# Architecture collision

*(Lead-agent analysis. Recommendations only — nothing executed.)*

## C.1 What still imports from `student/learn/`

`student/learn/` has **no NestJS module of its own**. Its 7 controllers, 7 services and `LearnRepository` are
registered directly in `student.module.ts`
([student.module.ts:20-34](apps/api/src/modules/student/student.module.ts#L20-L34)).

Cross-module importers:
- `library.service.ts:42,69` imports `LearnRepository` and **uses it** — `this.learn.getSession(...)` at
  [library.service.ts:768](apps/api/src/modules/student/library/library.service.ts#L768) and
  [:798](apps/api/src/modules/student/library/library.service.ts#L798). This is the session→Library save
  path, which hyperspec 2 §7 also requires for the orchestrator.
- `history.service.ts:5` imports `LearnRepository` (intra-module).

## C.2 What deleting it would break — **it is not retirable as scoped**

This contradicts the Phase C expected shape ("Retire Plan 02's `student/learn/` fixed-spine module").
**5 of the 7 legacy controllers are live frontend surfaces:**

| legacy controller | consumer | verdict |
|---|---|---|
| `ask` | `useAsk.ts:9,16,24` (incl. `/learn/ask/stream` SSE) | **LIVE** — Ask Petros drawer |
| `path` | `usePath.ts:12,21,31` | **LIVE** — learning path GET/POST/PATCH |
| `quick` | `useQuick.ts:12,22,31` | **LIVE** — quick answers |
| `revision` | `useRevisionQueue.ts:25,34` | **LIVE** — `/refresh` returns `LearnSessionV1Dto` |
| `streaks` | `useStreaks.ts:17` | **LIVE** — streaks |
| `notes` | none found | dead surface |
| `history` | none found | dead surface |

Deleting the module wholesale would break the Learn home page, the path page, quick answers, the revision
queue, streaks, and the Ask Petros drawer.

The premise needs correcting: `student/learn/` is **not** "Plan 02's fixed-spine session engine." It is the
surrounding Learn *product surface* (ask / path / quick / revision / streaks). The fixed-spine **session**
concept survives only as the NOT NULL column leftovers in C.4. Only `notes` and `history` are safely
removable today.

## C.3 Route namespaces do not collide

Orchestrator is `@Controller('student/learn')`
([edrion-learn.controller.ts:16](apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts#L16))
owning `intent` + `sessions/**`; legacy controllers own `ask|path|quick|revision|streaks|notes|history`.
No shadowing. Retirement is not forced by routing pressure.

## C.4 `spine` / `session_plan` / `spine_step` — three columns, not two

- `learn_sessions.spine` jsonb NOT NULL — [learn.ts:160](packages/database/src/schema/learn.ts#L160); orchestrator writes `[]` ([pedagogy-orchestrator.service.ts:156](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L156))
- `learn_sessions.session_plan` jsonb NOT NULL — [learn.ts:161](packages/database/src/schema/learn.ts#L161); writes `{orchestrator:true, goal}` ([:157](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L157))
- `learn_session_blocks.spine_step` text NOT NULL — [learn.ts:204](packages/database/src/schema/learn.ts#L204); hardcoded `'understand'` ([:256](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L256), [learn-artifact.service.ts:28](apps/api/src/modules/student/edrion-learn/learn-artifact.service.ts#L28))

Because the legacy surface is live (C.2), legacy writers may still put real values in these columns.
Recommend **making them nullable**, not dropping them, until C.2 is settled. See DEC-11.

## C.5 The `learn.orchestrator` legacy-fallback path **does not exist**

`assertOrchestratorEnabled`
([pedagogy-orchestrator.service.ts:52-73](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L52-L73))
is a **hard gate, not a rollback lever**: flag off → `403 LEARN_ORCHESTRATOR_DISABLED`. There is no fixed
sequence to fall back to. Hyperspec 1 §0's stated rollback lever ("gates orchestrated vs. legacy fixed
sequence") is unimplemented.

Two further defects here, **not in D1–D20**:
- **Fail-open**: the `catch` at [:70-72](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L70) swallows every non-`ForbiddenException`. A flag-resolution error silently passes the gate.
- Called only from `createSession` ([:78](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L78)); `stream` never re-checks.

**Reachability**: seeded `default_value = true`
([0097:31](packages/database/migrations/0097_student_tutor_policy_domain.sql#L31)). The off-branch is
reachable only by explicit override, and terminates in a 403 — never in legacy teaching.

## C.6 Orphaned migration `0082_timetable_period_backfill.sql` — **dead, not drift**

Absent from `meta/_journal.json` (0 hits). It backfills `timetable_slots.period_id` from
`bell_schedules`/`bell_periods`/`bell_period_types`.

**Migration 0083 drops every object 0082 touches** —
[0083_strip_bell_schedules.sql:11,42,44,46](packages/database/migrations/0083_strip_bell_schedules.sql#L11):
`timetable_slots.period_id` DROP COLUMN, plus DROP TABLE on `bell_periods`, `bell_schedules`,
`bell_period_types`.

**Applying 0082 today would fail outright.** Its omission from the journal is correct, not an error.
This **corrects D19**, which calls it "real schema drift elsewhere": there is zero drift. It is a superseded
file left on disk. Recommendation: delete it or move it to `migrations/superseded/`. No DB action. See DEC-15.

## C.7 Encoding damage in shipped copy (not in D1–D20)

`pedagogy-orchestrator.service.ts` is the only Learn source file containing mojibake — e.g.
[:83](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L83)
`"You've had a full day of lessons â€” come back tomorrow."` (double-encoded em-dash) in user-visible 429
copy. Sweep when the file is next edited.

---

# Decisions required (DEC-1 … DEC-16)

67 rows are `contradicted`. They fall into two groups. **DEC-1…DEC-16** are genuine binary choices, because
shipped code is load-bearing on the other side. The remainder are listed in §"Contradicted but not a
decision" — there the repo is simply defective against a spec rule with no competing interest, so they are
deltas, not choices. **If you want any of those treated as a decision instead, say so and I will not touch it.**

---

### DEC-1 · Tenancy identity form — **blocks all of Phase C**
Rows: DM-001, DM-002, DM-004, DM-005, and every §1.0 application row.

Hyperspec §1.0 mandates `owner_kind text` + a single `user_id uuid` + a CHECK named `owner_xor`, with RLS
`auth.uid() = user_id`.

**A — adopt the spec literally.** Cost: **there is no single "user" identity in this repo.** `students.id` is
institution-scoped; independent users are a separate table. Adopting `user_id` means inventing a unified
user identity and rewriting every Learn table, FK, index, RLS policy and grant — and the identity concept
leaks well outside Learn. Also, this repo does not use Supabase `auth.uid()` at all; RLS binds to
transaction-local GUCs (`app.student_id` / `app.institution_id`, [client.ts:97-119](packages/database/src/client.ts#L97-L119)). Very large, high blast radius.

**B — keep `student_id`/`independent_user_id` + `num_nonnulls(...) = 1`, and record §1.0 as satisfied in
spirit.** Cost: the hyperspec text no longer literally describes the schema; these rows stay
"contradicted-by-design" and need a documented mapping paragraph.

**Recommendation: B.** Option A's cost is not paid for by any behavioural gain — the XOR invariant the spec
actually wants is already expressible. **Independently of this choice, DM-010 is a real bug and must be
fixed either way**: `learn_topic_profiles_owner_ck` ([0096:144-148](packages/database/migrations/0096_edrion_learn_orchestrator.sql#L144-L148)) permits a *third* state where **both** owners are NULL.

---

### DEC-2 · Table names: `topic_profiles` / `session_blocks` vs `learn_topic_profiles` / `learn_session_blocks`
Rows: DM-008, DM-042.

**A — rename to spec.** Cost: rewrites 0050 + 0096, every FK, index, RLS policy and grant, the Drizzle schema
and the repository. `learn_session_blocks` predates the hyperspec and is referenced by the live legacy surface.

**B — keep repo names, amend the spec.** Cost: documentation drift only.

**Recommendation: B.** Naming is the cheapest thing to concede and the most expensive thing to migrate.

---

### DEC-3 · `topic_profiles.source` domain: `'llm'` vs `'generated'`
Row: DM-018. The DB CHECK ([0096:136](packages/database/migrations/0096_edrion_learn_orchestrator.sql#L136)) and Zod ([profile.ts:48](packages/schemas/src/student/edrion-learn/profile.ts#L48)) both say `'generated'`; the spec says `'llm'`. Writing the spec value today is rejected outright.

**A — migrate to `'llm'`.** Cost: one small migration + Zod + data update. **B — keep `'generated'`, amend spec.** Cost: doc drift.

**Recommendation: B** — `'generated'` is arguably the better name (it survives a non-LLM generator), and the migration buys nothing behavioural.

---

### DEC-4 · `learner_mastery` primary key form
Row: DM-054. Spec wants composite PK `(user_id, atom_id)`; repo has a surrogate `id uuid` PK + two **partial** unique indexes.

**A — composite PK** on `(student_id|independent_user_id, atom_id)`. Cost: migration; but it **structurally fixes** the 42P10 upsert bug. **B — keep surrogate**, fix upserts by passing drizzle's `targetWhere`. Cost: the partial-index footgun stays live for every future upsert.

**Recommendation: A.** Note the 42P10 bug (D10) must be fixed either way; A fixes it by construction.
Dependent on DEC-1's identity choice.

---

### DEC-5 · `learner_mastery.rating` default: 800 vs 1200
Rows: DM-056, PM-068. DB, Drizzle and `MASTERY_RATING_DEFAULT` all say 800; §6 says 1200.

Under §6's display transform `m = (r−800)/800`, a default of 800 makes **every new learner read 0.0 mastery**
instead of 0.5, and a first medium-difficulty attempt gets `p ≈ 0.053` instead of `≈ 0.360` — the planner is
being told every student is maximally weak.

**A — change to 1200 + backfill existing rows.** Cost: one migration; touches stored data.
**B — keep 800 and re-centre the display transform instead.** Cost: diverges from §6's stated math in two places rather than one.

**Recommendation: A.** Surfaced as a decision only because it rewrites stored rows.

---

### DEC-6 · Canvas ownership — **Learn currently owns canvas storage**
Rows: DM-077, DM-099, MV-038.

`CanvasGraphService.generateForSession` returns `canvasId: randomUUID()` for a row it **never creates**
([canvas-graph.service.ts:45-51](apps/api/src/modules/student/edrion-learn/canvas-graph.service.ts#L45-L51)),
and the full graph is persisted into `learn_session_blocks.interaction_state.graph`
([pedagogy-orchestrator.service.ts:284-286](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L284-L286)).
`visual_canvases` is never written. `canvas_id` is a dangling UUID referencing no row.

**A — route visual_spawn through Chat 9's pipeline into `visual_canvases`** per §1.6/§3.5. Cost: real
integration work in Phase F.
**B — keep the graph in `interaction_state`.** Cost: violates the system invariant "Learn owns no canvas
storage", fails AC12 **and** AC13, leaves `canvas_id` dangling, and canvas edits/revisions can never work.

**Recommendation: A.** B contradicts a stated system invariant, not merely a spec line.

---

### DEC-7 · `learn_attempts` block linkage: new `session_block_id` vs existing `block_id`
Row: DM-072. The spec says a migration adds `session_block_id`. The repo already has `block_id` (from
[0050:155-156](packages/database/migrations/0050_learn_core.sql#L155-L156)) doing exactly that job.

**A — add `session_block_id` per spec.** Cost: a duplicate column with identical semantics.
**B — reuse `block_id`, amend spec.** Cost: doc drift.

**Recommendation: B, strongly.** A adds a redundant column purely to match a name.

---

### DEC-8 · `learn_sessions.evidence` contents
Row: DM-040. Spec: evidence-producing moves append **evidence-event ids**. Repo: artifact-commit writes raw
card markdown into the array ([artifact-commit.service.ts:40-42](apps/api/src/modules/student/edrion-learn/artifact-commit.service.ts#L40-L42)).

**A — write evidence-event ids per spec.** Cost: migration/backfill + artifact-commit change.
**B — keep markdown.** Cost: the learner model and the memory-diff service cannot see Learn evidence through
the substrate they already read — which is the entire stated purpose of reusing this column.

**Recommendation: A.**

---

### DEC-9 · `learning_events` routing: `LearningEventsWriter` vs the visual-memory-diff service
Rows: DM-070, PM-088. Spec §1.5 requires the paired writeback go **through the visual-memory-diff service, in
the same transaction**. Repo uses `LearningEventsWriter` directly, unconditionally, non-transactionally, and
the ledger writer swallows its own errors.

**A — route through `VisualMemoryDiffService`** ([visual-memory-diff.service.ts:38-45](apps/api/src/modules/student/visual-studio/visual-memory-diff.service.ts#L38-L45)) per spec. Cost: coupling Learn to a visual-studio service; needs a look at whether that service's semantics actually fit non-visual evidence.
**B — keep `LearningEventsWriter`, amend spec.** Cost: doc drift; the substrate row still gets written.

**Recommendation: I am not confident enough to recommend.** This one genuinely turns on what
`VisualMemoryDiffService` is *for*, and the spec may be describing an integration that predates
`LearningEventsWriter`. **Your call.** The transactionality and unconditionality defects (PM-089, PM-107)
must be fixed under either option.

---

### DEC-10 · Scope of `student/learn/` retirement — **Phase C's premise needs correcting**
See C.2.

**A — delete only `notes` + `history`; keep `ask`/`path`/`quick`/`revision`/`streaks`.** Cost: the
three-module coexistence persists; `LearnRepository` stays.
**B — full retirement, rebuilding those five surfaces on the orchestrator.** Cost: large, well outside P1,
and would break six live screens in the interim.

**Recommendation: A.**

---

### DEC-11 · `spine` / `session_plan` / `spine_step` disposition
See C.4. **A — make all three nullable and stop writing stubs.** Cost: one migration; safe while legacy is
live. **B — DROP the columns.** Cost: requires proving no legacy writer depends on them first; blocked on DEC-10.

**Recommendation: A** for P1; revisit B if DEC-10 ever goes to B.

---

### DEC-12 · `learn.orchestrator` semantics: hard gate vs rollback lever
See C.5. **A — implement a legacy fixed-sequence fallback** so the flag is a true rollback lever per §0.
Cost: requires building a fixed-sequence teaching flow that does not exist anywhere — large, and arguably
resurrects the architecture Phase C is trying to retire. **B — accept the hard gate and amend §0.** Cost: no
graceful rollback; turning the flag off disables Learn sessions outright.

**Recommendation: B.** The fail-open bug and the missing re-check on `stream` (C.5) are defects to fix under
either option.

---

### DEC-13 · `render_model_tier`: `small` vs `mid` — **a cost decision, yours not mine**
Rows: MV-087, EV-065. §2 binds `render_model_tier = mid`; [block-renderer.service.ts:43](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L43) hardcodes `tier: 'small'`.

**A — move render to `mid` per spec.** Cost: materially higher per-session spend (14 render calls/session at
the cap). Better prose quality, which is the product. **B — keep `small`.** Cost: the eval harness's
content-correctness threshold (mean ≥ 4.2) may be unreachable, and you will not know until Phase H runs.

**Recommendation: A**, but this is a budget call and I will not make it silently.

---

### DEC-14 · Topic-key form and the ad-hoc-profile branch
Rows: PM-032, PM-116, and AC3. Spec's canonical key is `topic:<learn_topic_id>` with a **nullable** FK for
genuinely ad-hoc topics. Repo produces `subject:<slug>`, a raw client string, or `session:<8 hex>`, and then
**unconditionally upserts a `learn_topics` row for whatever it produced** — so `learn_topic_id` is always
non-null and AC3's null-FK branch is structurally unreachable.

**A — adopt the spec's key forms and allow genuinely ad-hoc profiles with a null FK.** Cost: touches topic
resolution (which Phase E rewrites anyway); stops junk rows accumulating in `learn_topics`.
**B — keep always-upsert.** Cost: `learn_topics` fills with `session:<hex>` garbage rows, one per session.

**Recommendation: A.** This is the structural half of D4; Phase E's independent-tier fix depends on it.

---

### DEC-15 · Disposition of `0082_timetable_period_backfill.sql`
See C.6. **A — delete the file.** **B — move to `migrations/superseded/`.** **C — leave it.** Cost of C: it
keeps reading as unapplied drift to every future auditor, as it did to this one.

**Recommendation: B** (preserves history, kills the false signal). **No DB action under any option.**

---

### DEC-16 · Student-tutor policy capability grammar
Hyperspec §3.2 requires the scope declare capabilities "in the same capability grammar the admin-Copilot
scopes use." A5 confirms `resolve-student-tutor-policy.ts:76` **correctly delegates** to `resolveAiPolicy` —
**there is no second policy engine**, so that invariant holds. But capabilities are carried as
`domain_config jsonb` ([0097:4-5](packages/database/migrations/0097_student_tutor_policy_domain.sql#L4-L5))
rather than the engine's `AiCapability` boolean map ([resolve-policy.ts:52-55](packages/copilot/src/resolve-policy.ts#L52-L55)).

**A — migrate to the `AiCapability` grammar.** Cost: migration + rework; P3 wires config to capabilities
exactly as the admin scopes do. **B — keep `domain_config`.** Cost: P3 has to special-case Learn, which is
precisely what §3.2 says to avoid.

**Recommendation: A.** Separately — and **not a decision** — the wrapper's layer walk omits
`scopeMatchesContext` ([:78-92](packages/copilot/src/resolve-student-tutor-policy.ts#L78-L92)), so another
institution's row can leak `domainConfig`. That is a cross-tenant data-leak bug and must be fixed regardless.

---

## Contradicted but **not** a decision

These `contradicted` rows have no load-bearing counter-interest — the repo is defective against a binding
rule and the hyperspec plainly wins. Listed so nothing is hidden; say the word if you want any of them
promoted to a DEC.

| Rows | What | Phase |
|---|---|---|
| MV-057, MV-058, MV-140 | Probe caps are **dead guards** — `probe_chains.turn` / `chains_used` are initialised and never written, so AC6 cannot hold | D |
| MV-049 | `artifact_commit`'s "after a wrong retrieval_check" entry is structurally unreachable behind the move<12 rewrite | D |
| MV-036 | `visual_spawn` gates on `knowledge_type`, not `native_representation` — wrong field entirely | D |
| MV-110, MV-119 | `created` never observable; only 2 audit events exist in the whole orchestrator, neither transactional | D |
| MV-088, UI-109 | Render is blocking, not streamed; no token-progressive rendering | F |
| PM-024 | Expired profile does a bare INSERT with no `onConflict` → 23505 (this is D11) | B |
| PM-104 | `hintsUsed` hardcoded `0`, so half-weight K is dead | E |
| PM-089, PM-107, PM-120 | Paired writeback is conditional, non-transactional | E |
| DM-096 | Duplicate answer returns a **recomputed** evaluation and re-fires a billed grading call | F |
| DM-104 | RLS inert: `DATABASE_URL` connects as superuser. **Nine** Learn tables have no RLS (D12 says four) | C |
| UI-011, UI-019, UI-186 | Progress bar is a percentage fill that **shrinks** on a detour | G |
| UI-054, UI-060, UI-062 | question_set renders all questions at once with one shared lock; correct answer never revealed when wrong | G |
| UI-083 | Synthesis posts the literal string `'done'` (D18) | G |
| UI-004, UI-005, UI-038 | Top bar gated on a second round-trip; back chevron bypasses the exit flow; query failure unhandled | B/G |
| UI-048, UI-070, UI-087, UI-088, UI-096, UI-122, UI-154, UI-157, UI-169, UI-176 | Block/rail/tooltip/completion-card interaction contracts unmet | G |
| UI-128, UI-142, UI-146 | Entry-point details: no flag-gated label; setback regex tests the wrong string; P2 entry points shipped early | G |
| UI-182 | Answer retry mints a **fresh** idempotency key per call, so retries are not idempotent | F/G |
| EV-012, EV-019, EV-031, EV-048, EV-054, EV-099, EV-100 | The eval harness reports **hardcoded passing scores** | H |
| EV-061, EV-095 | `learn.*` is a comment, not a namespace; `move_cap` needs a redeploy | D |
| — | **MCQ answer keys leak**: `correct_option_id` is spec'd server-only but is never stripped before emit or `toDto` | B or F |

---

# Defect reconciliation (D1–D20)

## D1–D20 mapped onto matrix rows

| Defect | Matrix rows | Conformance gap? | Note |
|---|---|---|---|
| **D1** `last_event_seq` never advanced | MV-119, MV-127, MV-144 | **Partly** | The *duplicate-key crash* is a pure bug; the underlying §5 rule it violates ("every transition writes one audit event") is a real conformance gap. Confirmed still live. |
| **D2** orphan `content:{}` blocks brick a session | *(none)* | **No** | Robustness bug. No hyperspec statement mandates `toDto` guarding. Phase B2. |
| **D3** all failure modes collapse into one message | UI-038 | **Yes — routing** | See correction below. |
| **D4** independent sessions get a garbage topic | PM-032, PM-116 | **Yes** | `session:<8 hex>` confirmed at `pedagogy-orchestrator.service.ts:103`. Structural half is DEC-14. |
| **D5** fabricated `atom_id` UUIDs | PM-042, PM-075, MV-029, MV-034, DM-063 | **Yes** | `listConceptAtoms` verified still callerless. |
| **D6** render prompt drifted from Zod schema | MV-087, MV-088 + render rows | **Yes** | The silent-degradation mechanism Phase F targets. |
| **D7** StrictMode double-mount races the sequence | *(none)* | **No** | Client robustness bug. Phase B1. |
| **D8** SSE path destroys `interactionState` | UI-095, UI-104, UI-185 | **Yes** | |
| **D9** reconnect replay is a no-op | UI-177, UI-178, UI-179, UI-180, UI-193 | **Yes** | AC-10 / AC-14 depend on it. |
| **D10** `ON CONFLICT` vs partial unique index (42P10) | DM-054, DM-063 | **Partly** | Bug; structurally resolved by DEC-4/A. |
| **D11** expired topic profile duplicate key | PM-024 | **Yes** | Also a stale-while-revalidate gap. |
| **D12** no RLS on learn tables | DM-104, DM-005 | **Yes** | **Corrected below.** |
| **D13** session-fetch failure completely silent | UI-038 | **Yes** | |
| **D14** no SSE heartbeat during plan/render | *(none)* | **No** | Robustness. Phase F. |
| **D15** silent dead-end when a path has no items | *(none)* | **No** | Robustness. Phase B3. |
| **D16** `callLog.log` awaited inside `catch` | *(none)* | **No** | Robustness. Phase B2. |
| **D17** `question_set` shares one answer state | UI-054, UI-062 | **Yes** | |
| **D18** synthesis submits a placeholder | UI-083 | **Yes** | |
| **D19** orphaned migration 0082 | *(none)* | **No** | **Corrected below.** |
| **D20** `continueStream` can double-open | UI-080, UI-117 | **Partly** | |

## D3 — confirmed as you stated

**Agreed: D3 is a routing defect, not a copy defect.**

Hyperspec 2 §1 scopes the string to exactly one case: *"Error state (stream fails to start after 8s): the
skeleton is replaced by a calm card «Couldn't start your lesson — check your connection» with **Retry**
(primary) and **Back** (ghost)."* The copy is correct **for that case** and must be preserved byte-for-byte.

The defect is that `useEdrionLearnSession.ts:102-105` does `onError: () => setStreamError(<that string>)`,
discarding the error argument, while `student-client.tsx` feeds that one callback four distinct errors —
HTTP-not-ok with a server message (`:185-197`), empty body (`:199-204`), in-stream error frame (`:238-247`),
and network failure (`:255-259`). A fifth mode, query failure, never reaches the callback at all and renders
an infinite skeleton (UI-038). Five causes, one string.

**Additional finding:** the hook's own `type === 'error'` branch (`useEdrionLearnSession.ts:92-95`) is **dead
code** — `student-client.tsx:238` intercepts error frames before `onMessage` ever sees them. Phase B3 must
remove it rather than extend it.

## Corrections to the diagnosis

- **D19 is wrong.** It calls 0082 "real schema drift elsewhere." It is not drift: migration 0083 drops every
  object 0082 touches, so applying it would fail. Nothing is pending. See C.6 / DEC-15.
- **D12 undercounts.** It names four tables without RLS; A1 found **nine**. It is also right for a reason it
  understates — `DATABASE_URL` connects as a superuser, so Learn RLS is inert as configured regardless of
  which tables carry policies.
- **The diagnosis is stale on Phase H's whole area.** It predates `packages/learn-evals` and
  `packages/copilot/src/resolve-student-tutor-policy.ts`, both of which now exist. Its line 161 guess
  ("the eval gate either never ran live or does not exercise the stream path") is half right and understates
  the problem: the harness reports **hardcoded passing scores**, so it is green by construction.
- **Two claims worth *not* re-investigating**: the ≤1-non-terminal-session partial unique index and the 409
  `SESSION_ACTIVE` response both **exist and are conformant** (MV/AC4).

## Conformance gaps **not** covered by any defect

The diagnosis is a bug hunt, so it misses absent features by design. The material ones:

| Gap | Rows | Phase |
|---|---|---|
| **MCQ answer keys leak to the client** (`correct_option_id` never stripped) | A3 finding | **B/F — security** |
| **Cross-institution `domainConfig` leak** (missing `scopeMatchesContext`) | DEC-16 note | **H — security** |
| `learn.orchestrator` gate **fails open** on a resolution error | C.5 | B |
| No move library as data; entry conditions are not data | MV-036…MV-058 | D |
| Probe/chain caps are dead guards | MV-057, MV-058, MV-140 | D |
| `elapsed_minutes` never increments → all budget/fatigue logic inert | PM-* | E |
| No mastery seeding backfill; no Learn BullMQ queue at all | DM-061, PM-059, PM-117, PM-119 | E |
| No profiler prompt file; no pre-warm job; no `PATCH /topic-profiles/:id` | PM-* | E |
| No pipelining; `speculative`/`firstTokenMs` never written | MV-* | F |
| Zero of four block-overflow verbs | UI-* | G |
| No exit sheet; completion card shows counters, not `summary` | UI-169 | G |
| No offline behaviour in Learn at all | UI-* | G |
| Eval harness reports hardcoded scores | EV-031, EV-054 | H |
| No `.github/` directory exists → CI regression gate unenforceable | EV-005/006/058/059/060 | H |
| Mojibake in user-visible 429 copy | C.7 | B |

---

# Phase plan

Rows grouped into the program's phases. **Flagged** = I believe the assignment in your brief is wrong.

| Phase | Rows | Notes |
|---|---|---|
| **B** — unblock, make failures legible | MV-119/127/144 (D1); UI-038, UI-080, UI-117; PM-024 (D11); plus unrowed D2, D7, D14(partial), D15, D16 | As briefed. |
| **C** — architecture & tenancy | DEC-1…DEC-4, DEC-10, DEC-11, DEC-15; DM-001/002/004/005/008/010/042/054/104 | Gated on your DEC answers. |
| **D** — move contracts & hard constraints | MV-036…MV-058, MV-110, MV-119, MV-140; EV-061, EV-095 (`learn.*` namespace) | As briefed. |
| **E** — profiler & learner model | PM-* ; DM-056/061; DEC-5, DEC-14 | As briefed. |
| **F** — plan/render & pipelining | MV-087/088, DM-096, UI-095/104/109/177-180/185/193; DEC-6, DEC-13 | As briefed. |
| **G** — session UI | UI-* remainder | As briefed. |
| **H** — policy & eval | EV-*; DEC-16 | As briefed. |

## Rows I believe are misassigned

1. **MCQ answer-key leak → pull forward to Phase B.** Your brief has nothing covering it. It is a live
   security defect on a currently-reachable path, and it is a ~5-line server-side strip. It should not wait
   for Phase F.
2. **Cross-institution `domainConfig` leak → pull forward from Phase H.** Phase H is last, and this is a
   cross-tenant data leak in `resolve-student-tutor-policy.ts`. It belongs in Phase C alongside the other
   tenancy work.
3. **Phase C's `student/learn/` premise is wrong** (C.2). Phase C says "retire"; 5 of 7 controllers are live.
   The phase should be rescoped to "delete `notes` + `history`; leave the rest" — DEC-10.
4. **Phase C's 0082 item is a no-op** (C.6). It is dead, not drift. One file move, no DB work — DEC-15.
5. **D3's fix is smaller than Phase B3 implies, and includes a deletion.** The hook's `type==='error'`
   branch is dead code intercepted upstream; B3 must delete it, not extend it.
6. **`elapsed_minutes` (Phase E) blocks Phase D.** Every §3 fatigue rule and every §5 budget rule that Phase D
   is told to implement reads `elapsed_minutes`, which never increments. Phase D will produce more dead
   guards unless this one Phase E item moves into D.
7. **DEC-13 (render tier) should be answered before Phase F, not during it.** Phase H's content-correctness
   threshold (mean ≥ 4.2) is likely unreachable on the `small` tier, and discovering that in Phase H means
   re-running Phases F–G.
