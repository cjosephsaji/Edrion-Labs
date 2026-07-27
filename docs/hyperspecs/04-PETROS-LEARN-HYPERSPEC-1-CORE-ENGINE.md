# 04 — Petros Learn Pedagogy Orchestrator — HYPERSPEC 1/3: CORE ENGINE

> Companion to `04-PETROS-LEARN-DYNAMIC-TEACHING.md` (P1 scope, §8). Where this conflicts with the original, **this document wins.** Scope: topic profiler, learner model v1, block schema v1, plan/render two-call loop, 8 core moves, session state machine, mastery math. Ships to independent tier + institution students **without** Learning Policy. Files 2/3 and 3/3 complete the spec.

## Constraints applied (from the codebase audit — code is authoritative)
1. **Mastery seeds from real columns:** `learn_attempts.evaluation` (jsonb) + `evidence_tags.polarity` (§1.4/§6). No new attempts table; retrieval writes `learn_attempts` in its existing `input`/`evaluation`/`hints_used` shape.
2. **`topic_profiles` attach to existing `learn_topics`** via FK `learn_topic_id`, not a new topic concept. Ad-hoc topics with no `learn_topic` row use the nullable-key form (§1.1).
3. **Artifacts commit into existing tables:** flashcards → existing flashcard tables (Chat 8 service); visual spawns → `visual_canvases` + revisions via Chat 9's pipeline. Learn owns no card/canvas storage.
4. **Governance extends the existing policy engine** (`packages/copilot` `resolve-policy`): add a **student-tutor scope** as config + capabilities (scope enum already carries `independent_user`). P3 Learning Policy hooks call `resolve-policy`, never a second engine (file 3 §3).
5. **Learner model READS the memory substrate, is a NEW structured store.** No global "student memory" table exists; `revision_states`/`evidence_tags`/`learning_events` are the substrate. The learner model reads them and writes its own rows; writebacks emit `learning_events` through the existing visual-memory-diff service.
6. **All new tables use the dual-owner tenancy convention with the CHECK-constraint form** (§1.0).
7. `learn_ai_calls` (exists) is the sole call log for every plan/render/grade/profile LLM call (§4.5).
8. Everything else — 8 core moves, two-call loop, block schema, session-document UI, eval harness as DoD — as originally scoped.

---

## 0. Terms & invariants

- 00-INDEX invariants apply: RLS where institution-scoped via `app.institution_id` GUC + `runInInstitutionTenant`, Zod in `packages/schemas`, UUID PKs, `timestamptz` UTC, `version` optimistic concurrency, append-only audit, feature flags Global → Plan → Institution → Campus → User, design tokens, reduced-motion.
- **Dual-owner tenancy (§1.0, binding):** every new Learn table is user-owned OR institution-owned per row, enforced by CHECK, never both. Independent-tier data is user-owned (09 §8 bridge). Institution visibility (P3) is a read projection over the same rows, never a re-key.
- Flags: `student.module.learn` gates the module; `learn.orchestrator` gates orchestrated vs. legacy fixed sequence (rollback lever).
- Copy strings default through terminology `t()`. Students see "lesson," never "move"/"checkpoint."
- "small"/"mid" tiers resolve through the existing AI provider config; concrete ids never in code. Every LLM call logs to `learn_ai_calls`.

### §1.0 The tenancy CHECK form (applied to every new table)
```sql
owner_kind text NOT NULL CHECK (owner_kind IN ('user','institution')),
user_id uuid,
institution_id uuid,
CONSTRAINT owner_xor CHECK (
  (owner_kind = 'user'        AND user_id IS NOT NULL AND institution_id IS NULL) OR
  (owner_kind = 'institution' AND institution_id IS NOT NULL AND user_id IS NULL)
)
```
RLS: `owner_kind='user'` → `auth.uid() = user_id`; `owner_kind='institution'` → `app.institution_id` GUC. Independent-tier Learn rows are always `owner_kind='user'`.

---

## §1. Data model (binding, column-level)

### 1.1 `topic_profiles` — attaches to existing `learn_topics`
Tenancy: dual-owner (§1.0).
| column | type | rules |
|---|---|---|
| `id` | uuid PK | |
| `owner_kind`/`user_id`/`institution_id` | | §1.0 CHECK form |
| `learn_topic_id` | uuid nullable FK `learn_topics` | canonical link for path/atom/syllabus topics. NULL only for ad-hoc topics (free chat, a raw Library material not yet promoted to a `learn_topic`). |
| `topic_key` | text | disambiguation/fallback key: `topic:<learn_topic_id>` (canonical when FK set), `material:<material_id>`, `free:<slug(title)>`. Unique index `(owner_kind, coalesce(user_id,institution_id), topic_key)`. |
| `title` | text | |
| `profile` | jsonb | Zod `TopicProfileV1` (§2.2) |
| `profile_schema_version` | int | 1 |
| `source` | text | `'llm'` \| `'human_override'` |
| `overridden_by` | uuid nullable | |
| `model` / `prompt_version` | text | **matches the `concept_atoms` provenance convention** (that table already carries `model`,`prompt_version`) — same columns for eval traceability |
| `expires_at` | timestamptz nullable | now + `learn.profile_ttl_days` (default 180); `human_override` rows null (never expire) |
| `version`/`created_at`/`updated_at` | | standard |

Cache rule: resolve by `learn_topic_id` first, else `topic_key`. Hit + unexpired → use, no LLM call. Expired → stale-while-revalidate. Regenerate if any child `concept_atom.updated_at` (or `prompt_version` bump) is newer than the profile — checked lazily at session start, no sweep job.

### 1.2 `learn_sessions` — **the existing table; EXTEND, don't fork**
Audit confirms `learn_sessions` exists with `evidence string[]`. Add orchestrator columns by migration (no parallel `orchestrated_sessions`):
| added column | type | rules |
|---|---|---|
| `topic_profile_id` | uuid FK | nullable until profile resolves |
| `entry_point` | text | `'learning_path'`\|`'free_chat_handoff'`\|`'library_document'`\|`'review_queue'`\|`'goal'`\|`'prep_countdown'` (P1); P2 adds `'bad_result'`,`'upcoming_exam'` |
| `entry_ref` | jsonb nullable | `{material_id}` / `{learning_path_id, learning_path_item_id}` / `{commitment_id}` |
| `session_context` | jsonb | Zod `SessionContextV1`: `{time_budget_minutes, goal, emotional_context, policy_snapshot: LearnPolicyV1}`. `emotional_context` present day one (P1 `'neutral'` except free-chat handoff). `policy_snapshot` from `resolve-policy` at start. |
| `orchestrator_status` | text | state machine §5, DB CHECK on closed set. (Reuse the table's legacy `status` if the fixed-sequence flow doesn't use it; else this distinct column.) |
| `state` | jsonb | `SessionStateV1` (§4.4), rewritten each move `WHERE version=:v` |
| `plan_move_count` | int | cost cap |
| `checkpoints_total`/`checkpoints_done` | int | progress bar truth |
| `summary` | jsonb nullable | at close |
| `ended_at` | timestamptz nullable | |
| `end_reason` | text nullable | `'goal_met'`\|`'time_budget'`\|`'move_cap'`\|`'student_exit'`\|`'abandoned'` |
| `version` | int | optimistic concurrency |

The existing `evidence string[]` is **consumed as-is**: each evidence-producing move appends evidence-event ids (the ids `evidence_tags.evidence_event_ids` references), so the learner model and memory-diff service see Learn evidence through the substrate they already read. No new evidence column.

Constraint: ≤1 session per user with `orchestrator_status IN ('active','awaiting_response','paused')` — partial unique index. Second start → 409 `SESSION_ACTIVE`.

### 1.3 `session_blocks` (new, append-only content; state mutable) — user-owned only
Always `owner_kind='user'`. Columns: `id`, `session_id FK learn_sessions`, `seq int` (monotonic per session, unique `(session_id,seq)` — generation idempotency key), `move_type text`, `block jsonb` (Zod `BlockV1` §4.1, immutable post-stream), `block_schema_version int`, `interaction_state jsonb` (mutable, `WHERE version=:v`), `plan_reasoning text`, `degraded boolean default false`, `latency_ms jsonb`, `version`, `created_at`.

### 1.4 `learner_mastery` (new structured store — READS substrate, writes own rows) — user-owned
Composite PK `(user_id, atom_id)`, `atom_id` FK `concept_atoms`. Columns: `rating int` (Elo, default 1200), `attempts int`, `last_outcome boolean nullable`, `last_attempt_at`, `version`, `updated_at`.

**Seeding (binding) reads the confirmed columns.** A BullMQ backfill replays, per (user, atom) chronologically, existing `learn_attempts` through §6. Outcome derivation, in priority:
1. `learn_attempts.evaluation` jsonb — if it carries correctness (`evaluation.correct`, or `evaluation.score ≥ threshold`), use it.
2. Else the linked `evidence_tags.polarity` (via the attempt's evidence event id in `evidence_tags.evidence_event_ids`): positive → correct, negative → incorrect.
3. Else skip (no signal). `hints_used > 0` on a correct outcome applies K at half weight.
Idempotent (recompute-from-scratch). Same derivation runs live per new attempt.

### 1.5 `learner_model_events` (new, append-only; no UPDATE/DELETE) — user-owned
`id`, `user_id`, `session_id nullable`, `event_type` (`mastery_update`,`context_set`,`fatigue_detected`,`break_suggested`,`profile_generated`,`profile_overridden`), `data jsonb` (mastery_update: `{atom_id, rating_before, rating_after, outcome, k, expected_p, source_block_id, hinted}`), `created_at`. **Every writeback also emits a `learning_events` row through the visual-memory-diff service** (same transaction) — `learning_events` stays the substrate-level inspection surface; this table is the Learn-local replay log.

### 1.6 Reused, not created (confirmed built)
- `learn_attempts` (`input`,`evaluation`,`hints_used`): retrieval/prereq answers write here + a nullable `session_block_id` (migration). No parallel table.
- `evidence_tags` (`tag_key`,`label`,`polarity`,`note`,`evidence_event_ids`): consumed for seeding; written by graded moves via the existing evidence path.
- `concept_atoms` (under `learn_topics`; `atom_kind`,`variant_key`,`content`,`model`,`prompt_version`): profiler input + mastery target.
- `learning_paths` + `learning_path_items` (`sequence`,`optional_branch`,`status`): path entry reads/writes item `status` as the legacy flow does.
- `visual_canvases` + revisions: visual-spawn writes here via Chat 9's pipeline.
- Flashcard tables (Chat 8): artifact commit writes cards, source-linked `{session_id,block_id}`.
- `learn_ai_calls`: every LLM call logs here (§4.5).

---

## §2. Topic Profiler

### 2.1 Trigger & flow
Session start resolves the topic (`learn_topic_id` where possible). Cache hit → planner. Miss/expired → **pre-warm:** on `learning_path` creation and Library-document indexing completion, enqueue a `profile-topic` BullMQ job, so the common path finds it ready (first-token latency unaffected). Inline miss (free topic): small model, ≤4s; timeout → `DEFAULT_PROFILE` + enqueue. Input: `learn_topic` title + its `concept_atoms` (titles + `content` summaries, ≤4k tokens) + syllabus context + (material) outline + first chunk. Output → `TopicProfileV1`; invalid → one retry with Zod errors quoted → `DEFAULT_PROFILE`, log `profile_generation_failed`. Logs to `learn_ai_calls`; row records `model`/`prompt_version` per the `concept_atoms` convention.

### 2.2 `TopicProfileV1` (`packages/schemas/learn/topic-profile.ts`)
```ts
{ knowledge_type: array<enum['conceptual','procedural','factual','skill']> (1–2),
  abstraction: enum['concrete','mixed','abstract'],
  native_representation: enum['visual_spatial','symbolic','verbal','temporal_sequence','comparative_table'],
  prerequisite_density: enum['low','medium','high'],
  prerequisites: array<{atom_id: string|null, label: string}> (≤5),   // atom_id FK concept_atoms when known
  misconception_richness: enum['low','medium','high'],
  known_misconceptions: array<string> (≤3),
  math_load: enum['none','light','heavy'],
  memorization_load: enum['none','light','heavy'],
  real_world_anchors: array<string> (≤3) }
```
`DEFAULT_PROFILE`: `{knowledge_type:['conceptual'], abstraction:'mixed', native_representation:'verbal', prerequisite_density:'low', prerequisites:[], misconception_richness:'low', known_misconceptions:[], math_load:'light', memorization_load:'light', real_world_anchors:[]}`.

### 2.3 Human override
`PATCH /learn/topic-profiles/:id` — owner (user scope) or staff with `learn.profile.override` (institution scope). Partial merge, `source='human_override'`, `expires_at=null`, event `profile_overridden`. P1 ships API + minimal internal admin form; no student-facing override.

---

## §3. The 8 core moves — binding contracts

Keys: `direct_explanation`, `worked_example`, `retrieval_check`, `prereq_pulse`, `visual_spawn`, `synthesis`, `artifact_commit`, `socratic_probe`.

1. **`direct_explanation`** → `explanation`. Always legal (fallback). `{depth:'base'|'deeper', anchor?}`. Base ≤180w; `deeper` (≤250w) in the same render call, revealed by expander (no second call). Observe: expand → depth signal; short dwell ×2 → pace signal.
2. **`worked_example`** → `worked_example`. Entry: `knowledge_type` ⊇ `procedural`|`skill`. `{problem_statement, step_count 3–6}`. Steps one at a time; optional "Predict the next step" free-text stored in `interaction_state`, passed to next plan verbatim; not auto-graded in P1.
3. **`retrieval_check`** → `question_set` (1–3, `mcq_single`|`short_text`|`numeric`). Entry: ≥1 exposition move occurred (hard), or `goal='revision'`. Each answer writes `learn_attempts` (existing shape: `input`=response, `evaluation`=`{correct,score,feedback}`, `hints_used`) + `evidence_tags` (polarity from correctness) + mastery update (§6). MCQ auto-grades; short/numeric via a bundled small-model micro-call (`{correct,feedback≤40w}`, ≤3s; timeout → `evaluation.correct=null`, "Recorded — couldn't auto-check this one", no mastery update).
4. **`prereq_pulse`** → `question_set` `purpose:'prereq'`, exactly 2 targeting `profile.prerequisites` atoms. Entry: first two moves only, only when `prerequisite_density != 'low'` (hard). Both wrong → service **forces** a remediation `direct_explanation` on the weakest prereq + appends one checkpoint. Attempts write to prereq atoms.
5. **`visual_spawn`** → `canvas_embed`. Entry: `native_representation ∈ {visual_spatial,temporal_sequence,comparative_table}` or planner justifies. Render emits **Graph JSON per Chat 9 (06 §2.1)** — never coords/SVG; block stores `{graph_json_ref, canvas_id}` after the pipeline validates/repairs/lays out into `visual_canvases`. Pipeline hard-fail → `degraded` `direct_explanation`. Fragment persists to the student's `visual_canvases`; edits write revisions as the full canvas does.
6. **`synthesis`** → `synthesis`. Entry: closing phase only (hard). Student ≤280 chars; bundled micro-call → `{tightened, delta_note≤25w}`. Skippable.
7. **`artifact_commit`** → `artifact_commit`. Entry: closing phase, or right after a `retrieval_check` with ≥1 wrong. Proposes ≤6 cards `{front,back,source_block_id}` (+ optional canvas). Review-before-save → Chat 8 card service → FSRS. Nothing auto-saves.
8. **`socratic_probe`** → `probe`. Entry: `knowledge_type` ⊇ `conceptual`, misconception/causation. **Hard cap: 2 probes/chain, 2 chains/session** — a third is rewritten server-side to `direct_explanation`. Visible "Just explain it" escape → ends chain, records `probe_escaped=true`.

`system_notice` (service-emitted): break/budget/degraded/policy; never counts toward cap/checkpoints.

**Fatigue rule:** last 3 graded answers wrong AND elapsed ≥15 min → one `system_notice` break card (Pause/Keep going). Pause → `paused`; resumes 24h then auto-closes `abandoned`.

---

## §4. Block schema, plan/render, state, logging

### 4.1 `BlockV1` (Zod union, `packages/schemas/learn/block.ts`) — versioned; breaking change bumps `block_schema_version`.
Envelope `{block_type, title?, body_md?}`; markdown+katex via existing path; no raw HTML (sanitized).
- `explanation`: `{body_md ≤180w, deeper_md? ≤250w, anchor?}`
- `worked_example`: `{problem_md, steps:[{step_md, predict_prompt?}] 3–6}`
- `question_set`: `{purpose:'retrieval'|'prereq', questions:[{id,type,prompt_md,options?:[{id,label_md}] 2–5,correct_option_id?(server-only),atom_id,difficulty,why_md}] 1–3}`
- `canvas_embed`: `{graph_json_ref, canvas_id, caption?}`
- `synthesis`: `{prompt_md}`
- `artifact_commit`: `{cards:[{front_md,back_md,source_block_id}] ≤6, include_canvas}`
- `probe`: `{question_md, chain_id, turn:1|2}`
- `system_notice`: `{kind:'break'|'budget'|'degraded'|'policy', body_md, actions:[{key,label}]}`

### 4.2 Plan call (small model, temp 0, strict JSON `PlanV1`)
Input: `SessionStateV1` + profile + learner snapshot (topic/prereq mastery → 0–1 via §6) + session context (incl. `policy_snapshot`) + last block outcome + hard-constraint list. Output `{move, params, reasoning ≤60w, checkpoint_advance, session_should_end}`. Zod-parse; failure → retry once (errors quoted); second failure or hard-constraint violation → deterministic fallback `direct_explanation{depth:'base'}`, block `degraded=true`. Cap: `plan_move_count ≥ learn.move_cap` (14) → force closing pair, close `move_cap`. Logs to `learn_ai_calls`.

### 4.3 Render call (mid model, streamed)
Input: move + params + profile + relevant atoms/material chunks (material topics cite pages `(p. 7)`) + last 3 blocks. Streamed `BlockV1`; Zod-parse on completion; invalid → retry once → fallback plain `explanation` (`degraded=true`). **Pipelining:** plan for N+1 fires when N's render starts; if N's outcome invalidates it, discard + re-plan. Logs to `learn_ai_calls` (speculative flagged).

### 4.4 `SessionStateV1` (decision 4)
```ts
{ v:1, session_id, topic_key, goal, emotional_context, time_budget_minutes,
  elapsed_minutes, checkpoints:{total,done},
  moves:[{seq, move_type, checkpoint_advance, outcome:{answered?:{correct,wrong,null},
          probe_escaped?, expanded_deeper?, skipped?, prediction_text?, free_question?}}],
  probe_chains:{open_chain_id?, turn?, chains_used},
  mastery_snapshot:{[atom_id]:number}, pending_free_question? }
```
Persisted to `learn_sessions.state` each move; ≤8 KB; `moves` is a digest, never block content; no transcript to the planner.

### 4.5 Call logging (`learn_ai_calls`, confirmed built)
Every plan/render/grade/profile/judge call writes one row: call_type, model, prompt_version, session_id (nullable for profiler), block_seq (nullable), tokens in/out, latency_ms, degraded/retry/speculative flags, outcome. The single call log; the eval harness and cost reports read it. No second logging table.

---

## §5. Session state machine (binding)

`created → active ⇄ awaiting_response → active → closing → closed`; `active|awaiting_response → paused → active`; any non-terminal `→ closed`; `paused --24h--> closed(abandoned)`.
- `created`: profile resolved → `active` on first render start.
- `active`: streaming or planning.
- `awaiting_response`: block needs input; only that block's endpoints legal; composer question queues.
- `closing`: forced closing pair; no planner calls except the pair.
- `closed`: summary written; mastery writebacks already applied per-answer; Library session-record saved if chosen.
Every transition writes one audit event, same transaction. Budget: `elapsed ≥ budget−3min` → "wrap up" flag; `≥ budget` → force `closing`. "+5 minutes" extends once.

### API surface (`PedagogyOrchestratorService`, `learn/sessions`)
- `POST /learn/sessions {topic_key|entry, time_budget_minutes?, goal?}` → 201 + stream URL; 409 `SESSION_ACTIVE`.
- `GET /learn/sessions/:id`; `GET /learn/sessions/:id/stream` (SSE, reconnect-safe via `last_seq`).
- `POST …/blocks/:blockId/answer {question_id, response}` — idempotent (one `learn_attempts` row; second call returns stored result), locks.
- `POST …/blocks/:blockId/interact {action, data?}` — versioned against `interaction_state.version`.
- `POST …/ask {text ≤500}`; `POST …/commit {card_selections, include_canvas}` (idempotent per block); `POST …/pause|/resume|/end {save_to_library}`.
All owner-only; no staff access in P1. Every session start calls `resolve-policy` (student-tutor scope) → `session_context.policy_snapshot`.

---

## §6. Mastery update math (decision 3)

Elo-lite per `(user, atom)` on every graded answer (`null` = no update):
- `d`: easy=1100, medium=1300, hard=1500 (`constants.ts`).
- `p = 1/(1+10^((d−r)/400))`.
- `r' = clamp(r + K·(outcome − p), 400, 2400)`, `K=32` if `attempts<10` else `16`. **Hinted success** (`hints_used>0`, correct) → half-weight K.
- Display: `m = clamp((r−800)/800, 0, 1)` → r=1200 ⇒ 0.5.
- No decay in v1 (FSRS owns forgetting). Every update logs `learner_model_events.mastery_update` (before/after) + a `learning_events` row via the memory-diff service — replayable.

---

## Acceptance criteria — Core Engine
1. A cached topic makes zero profiler LLM calls; an uncached free topic makes exactly one (+≤1 retry). Every LLM call appears in `learn_ai_calls`.
2. `topic_profiles.source='human_override'` rows never regenerate/expire; rows carry `model`+`prompt_version` per the `concept_atoms` convention.
3. Profiles resolve against an existing `learn_topics` row when one exists (`learn_topic_id` set); only ad-hoc topics use the null-FK key form.
4. ≤1 non-terminal orchestrated session per user; a second POST returns 409 with the active id.
5. Every plan output is Zod-validated, retried once, then falls back to a `degraded` explanation; no planning error ever reaches the student.
6. A third Socratic probe in a chain is impossible (server rewrites to explanation).
7. `prereq_pulse` never after move 2, never on `prerequisite_density='low'`; two wrong forces a remediation explanation + increments `checkpoints_total` by 1.
8. Answering twice creates exactly one `learn_attempts` row (existing `input`/`evaluation`/`hints_used` shape), one `evidence_tags` row, one mastery update; the second call returns the stored result.
9. Seeding replays `learn_attempts.evaluation`, falls back to `evidence_tags.polarity`, applies half-weight K to hinted successes; replaying all `learner_model_events` reproduces `learner_mastery` exactly.
10. Every writeback emits both a `learner_model_events` row and a `learning_events` row via the memory-diff service in one transaction.
11. Learn's `learn_attempts` rows are shape-identical to quiz-written rows plus `session_block_id`; Chat 8 readers consume them unmodified.
12. Visual spawns land in `visual_canvases` via Chat 9's pipeline; a hard-fail yields a `degraded` explanation and the session continues.
13. Artifact commits create rows only in existing flashcard tables and `visual_canvases`; Learn owns no card/canvas storage.
14. SSE kill + reconnect with `last_seq` replays missed blocks with no duplicates/gaps.
15. State ≤8 KB at move 14; planner never receives block content or transcript; at cap 14 the service forces synthesis → artifact_commit → close.
16. Every new Learn table carries `owner_xor`; independent-tier rows are `owner_kind='user'`; deleting a user's sessions cascades blocks/events but never touches committed Library artifacts.
