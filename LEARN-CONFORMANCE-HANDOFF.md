# PETROS LEARN — CONFORMANCE PROGRAM HANDOFF (Phases E–H)

**Status:** Phases A–D complete and committed. Phases E, F, G, H remain.
**Audience:** the agent/developer continuing this work (Cursor).
**Written:** 2026-07-27. Branch `feat/settings-currency-audit`. Last commit `81f23db`.

Read this file end to end before touching anything. Section 6 onward is the actual work.

---

## 1. What this program is

Bringing the Petros Learn (Edrion Learn) pedagogy orchestrator into conformance with its three
hyperspecs. A 667-row conformance audit was produced first (`LEARN-CONFORMANCE-MATRIX.md`), then
phases execute against it.

### Source documents — authoritative, in this precedence order

1. `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-1-CORE-ENGINE.md` — data model, profiler, learner
   model, 8 moves, plan/render loop, state machine, mastery math. 16 acceptance criteria.
2. `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-2-UI-AND-ENTRY.md` — session screen, block
   interactions, entry points, exit/save, latency. 14 acceptance criteria.
3. `docs/hyperspecs/04-PETROS-LEARN-HYPERSPEC-3-EVAL-COST-POLICY.md` — eval harness, cost config,
   policy hooks. 10 acceptance criteria.
4. `LEARN-CONFORMANCE-MATRIX.md` — the 667-row matrix. **Every row has an ID** (`DM-###` data model,
   `PM-###` profiler/learner model, `MV-###` moves/plan/render/state, `UI-###` session UI,
   `EV-###` eval/config/policy). Cite these IDs when you close work.
5. `LEARN-SESSION-DIAGNOSIS.md` — the original 20-defect static analysis (D1–D20). **Partly stale.**
   See §5 for the corrections already proven. Do not trust it over the matrix or the repo.

### The precedence rule (binding, applies to every phase)

> The hyperspecs are authoritative on **behavior**. The repo is authoritative on **facts about
> itself**. Where a hyperspec's naming or structural choice conflicts with something already
> load-bearing in shipped code, that is a decision for the **repo owner**, not something the agent
> resolves. Surface it; do not assume the hyperspec wins.

Sixteen such conflicts were found and are recorded as DEC-1…DEC-16 in the matrix. The owner's
resolutions are in §4 below — **they are settled, implement them, do not relitigate.** If you find a
*seventeenth* conflict, STOP and surface it rather than picking a side.

---

## 2. System invariants — apply to every phase, never violate

- NestJS modular monolith in `apps/api`; student surfaces in `apps/student-web` (Next.js, **:3005**);
  API on **:3001**.
- Drizzle ORM, Supabase Postgres. RLS via `app.institution_id` GUC where institution-scoped;
  `runInInstitutionTenant` / `runInIndependentStudentTenant`.
- Zod schemas live in `packages/schemas`, shared between API and frontend. UUID PKs, `timestamptz`
  UTC, `version` column for optimistic concurrency, append-only audit.
- Feature flags resolve **Global → Plan → Institution → Campus → User**. `student.module.learn` gates
  the module; `learn.orchestrator` gates the orchestrator.
- Design tokens from `packages/design-tokens`; components from `packages/ui`; honor
  `prefers-reduced-motion`.
- **Learn owns no card or canvas storage.** Flashcards go to the existing flashcard tables, visual
  spawns to `visual_canvases`, both via the existing services.
- **`learn_ai_calls` is the sole LLM call log.** Never create a parallel logging table.
- **Governance extends the existing `packages/copilot` `resolve-policy` engine** with a student-tutor
  scope. Never build a second policy engine.

### Hard prohibitions (the repo owner verifies manually)

- **NEVER write or run smoke tests, API tests, integration tests, unit tests, or any test file.**
  The single exception is Phase H's eval harness, which is a specified *product deliverable*, not a
  test suite — and even while building it, no other kind of test may be written.
- **NEVER start a dev server.** One is already running.
- **Never execute migrations against a database.** Write the `.sql` and the journal entry only.
- Reserve migration numbers before writing them; report the numbers used at the end of each phase.

---

## 3. What is already done (Phases A–D)

| Phase | Commit | What landed |
|---|---|---|
| — | `1a43aff` | Committed the three hyperspecs to `docs/hyperspecs/` |
| A | `778825e` (doc) | `LEARN-CONFORMANCE-MATRIX.md` — 667 rows, DEC-1…16, architecture collision, defect reconciliation, phase plan |
| B | `778825e` | Unblocked sessions; made failures legible |
| C | `50d76ea` | Architecture + tenancy reconciliation |
| D | `81f23db` | Move contracts, hard constraints, state machine, `learn.*` config |

### Migrations used so far

| # | Journal idx | Tag | Contents |
|---|---|---|---|
| 0102 | 95 | `learn_session_repair` | `last_block_seq` counter; deleted never-renderable blocks; backfilled both counters |
| 0103 | 96 | `learn_tenancy_reconcile` | Uniform owner XOR across 14 Learn tables; rating default 800→1200; spine/session_plan/spine_step nullable; RLS on 9 Learn tables |
| 0104 | 97 | `learn_config` | `learn_config` table + seeded global defaults |
| 0105 | 98 | `learn_status_check_and_config_rls` | `orchestrator_status` CHECK; `learn_config` RLS |

> **NEXT MIGRATION NUMBER IS `0106`, JOURNAL IDX `99`.** The journal currently has 99 entries ending
> at idx 98. Use `when` values continuing the sequence (0105 used `1787700000000`).
> **`packages/database/migrations/superseded/0082_timetable_period_backfill.sql`** was moved out of
> the migrations directory — it is dead, not drift (see §5). Do not restore or apply it.

### Phase B — what it fixed

The root cause of "no Learn session has ever rendered a block": `learn_sessions.last_event_seq` was
never advanced at creation, so `session_created` wrote seq=1 and the first `block_stream_end`
recomputed seq=1 and violated `learn_session_events_session_seq_uq`. The block was rendered and
persisted but never emitted.

- `nextEventSeq` / `nextBlockSequence` are now atomic single-statement `UPDATE … RETURNING`.
- `appendSessionEvent(sessionId, eventType, payload, tx?)` allocates its own seq — **the `seq`
  parameter is gone, so no caller can pass a stale value. Use this signature.**
- `nextStreamSeq` was **deleted**; block and stream sequencing share one atomic counter
  (`last_block_seq`).
- `insertTopicProfile` upserts with drizzle's `targetWhere` matching the partial-index predicates.
  **Bare column lists fail with Postgres 42P10 against partial unique indexes — this trap recurs
  throughout this codebase, watch for it.**
- `toDto` uses `safeParse` and skips unparseable rows instead of 500ing the GET.
- `callLog.log` failures are non-fatal; `LearnAiCallLogger.log` itself can no longer throw.
- Five SSE failure modes now route to distinct client states (`StudentSseError.source` discriminant).
- `error.tsx` + `global-error.tsx` added (there were none anywhere in student-web).
- Stream is single-flighted; StrictMode double-mount cannot open two streams.
- **Security:** `correct_option_id` is stripped at the SSE emit and `toDto` boundaries. MCQ answer
  keys were readable from the network payload.

### Phase C — what it settled

- Tenancy form settled as the repo's `student_id`/`independent_user_id` + `num_nonnulls(...) = 1`,
  applied uniformly to all 14 Learn tables. `learn_attempts` had no owner constraint at all.
  `learn_ai_calls` is a deliberate exception (`<= 1`): append-only cost ledger with
  `ON DELETE SET NULL` owner FKs, so ownerless rows are legitimate.
- `learner_mastery.rating` default 800 → 1200.
- `spine` / `session_plan` / `spine_step` made **nullable** (not dropped); orchestrator stopped
  writing stubs.
- `learn.orchestrator` no longer **fails open**; `stream` re-checks it.
- **Security:** `resolve-student-tutor-policy` selected rows on scope *kind* alone, ignoring
  `scopeId`, so another tenant's row could leak its `domainConfig`. Now applies `scopeMatchesContext`.
- Only `learn/notes` was deleted. **`learn/history` is LIVE** — see §5.

### Phase D — what it built

- **`move-library.ts`** — each of the 8 moves is now DATA: `block_type` mapping, entry conditions as
  structured predicates, param bounds, response/checkpoint semantics.
  `evaluateMove(entry, ctx) -> {legal:true} | {legal:false, rewrite_to, code, reason, clause}`.
  Plain data + pure functions, **no NestJS DI in this file**.
- Hard constraints are **server-side rewrites**. Critically, probe-chain counters are now **derived**
  from `state.moves` by `deriveProbeChains(state)` rather than maintained as separate fields — the
  previous implementation shipped two caps that could never fire because nothing wrote
  `probe_chains.turn` / `chains_used`. **Follow this pattern: derive from data that is already
  written, rather than adding a field someone must remember to update.**
- State machine per §5, including the `closing` state (previously declared but never assigned).
  Every transition goes through `repo.transitionSessionStatus`, which is **one transaction** doing a
  compare-and-swap on the source status plus exactly one audit event.
- **`elapsed_minutes` now actually increments**, excluding paused time. Until this, the fatigue rule,
  wrap-up flag, forced close at budget, and `time_budget` end reason were all dead code.
- Budget rules: wrap-up at `budget-3min`, forced closing at `budget`, "+5 minutes" extends **exactly
  once** (`state.budget_extended`), paused 24h auto-closes as `abandoned`.
- Fatigue rule emits the **first `system_notice` in the codebase** — the block type existed and the
  UI could render it, but the server had zero emitters.
- **`learn.*` config namespace** — see §7, you will use this constantly.

---

## 4. DEC decisions — SETTLED. Implement, do not relitigate.

| DEC | Decision taken | Status |
|---|---|---|
| DEC-1 | Tenancy: **keep** `student_id`/`independent_user_id` + `num_nonnulls(...)=1`. The hyperspec's `owner_kind`+`user_id`+`owner_xor` form is NOT adopted — this repo has no unified user identity (`students.id` is itself institution-scoped) and RLS binds to GUCs, not `auth.uid()`. | DONE (C) |
| DEC-2 | Table names: **keep** `learn_topic_profiles` / `learn_session_blocks`. Amend the spec, not the tables. | DONE (C) |
| DEC-3 | `source` domain: **keep** `'generated'` (not the spec's `'llm'`). | DONE (no-op) |
| DEC-4 | `learner_mastery`: **keep surrogate PK**. A composite PK needs NOT NULL columns; the dual-owner pair is nullable, so the spec's composite `(user_id, atom_id)` is not expressible under DEC-1. Fix upserts with `targetWhere` instead. | DONE (C) |
| DEC-5 | `rating` default **1200** (was 800). | DONE (C) |
| DEC-6 | Canvas: **route visual_spawn through Chat 9's pipeline into `visual_canvases`** per spec. Learn must own no canvas storage. | **PENDING — Phase F** |
| DEC-7 | `learn_attempts` block link: **reuse the existing `block_id`**, do not add `session_block_id`. | DONE (no-op) |
| DEC-8 | `learn_sessions.evidence`: **write evidence-event ids**, not raw card markdown. | **PENDING — Phase E** |
| DEC-9 | `learning_events` routing: **keep `LearningEventsWriter`** (not the visual-memory-diff service); amend spec. But **fix** the transactionality and unconditionality defects. | **PENDING — Phase E** |
| DEC-10 | Retire **only** `learn/notes`. `learn/history` is LIVE. | DONE (C) |
| DEC-11 | spine/session_plan/spine_step → **nullable**, not dropped. | DONE (C) |
| DEC-12 | `learn.orchestrator` stays a **hard gate**; amend spec's "rollback lever" language. Fix fail-open. | DONE (C) |
| DEC-13 | `render_model_tier` → **`mid`** per spec. Config default already says `mid`. | **PENDING — Phase F** (renderer still hardcodes `small`) |
| DEC-14 | Topic keys: **adopt the spec's forms**, allow genuinely ad-hoc profiles with a null FK. Stop unconditionally upserting a `learn_topics` row for every session. | **PENDING — Phase E** |
| DEC-15 | `0082` → moved to `migrations/superseded/`. Dead, not drift. | DONE |
| DEC-16 | Student-tutor scope: **migrate to the `AiCapability` grammar** (from `domain_config jsonb`). | **PENDING — Phase H** |

---

## 5. Corrections to the diagnosis — do not re-investigate these

These were proven wrong or stale during Phases A–D. Trust this list over `LEARN-SESSION-DIAGNOSIS.md`.

1. **D19 is wrong.** `0082_timetable_period_backfill.sql` is **dead, not drift**. Migration `0083`
   drops every object it touches (`timetable_slots.period_id`, `bell_periods`, `bell_schedules`,
   `bell_period_types`). Applying it would fail outright. Its absence from the journal is correct.
   Already archived to `migrations/superseded/`. **No DB action.**
2. **D12 undercounts.** Nine Learn tables lacked RLS, not four. Also, `DATABASE_URL` connects as a
   superuser (BYPASSRLS), so Learn RLS is inert as configured regardless of policies. The RLS added
   in 0103/0105 is defence in depth and **cannot break the running app today**.
3. **`learn/history` is LIVE, not dead.** It mounts at **`/student/history`** via
   `@Controller('student')` + `@Get('history')` — NOT `/learn/history`, which is why grepping the
   latter finds nothing. It backs `apps/student-web/src/app/(app)/history/page.tsx`, `lib/nav.ts:51`
   (primary nav), and three deep links. **Do not delete it.**
4. **`student/learn/` is not retirable.** It is not "Plan 02's fixed-spine session engine" — it is the
   surrounding Learn product surface. Five of its seven controllers are live frontend surfaces:
   `ask`→`useAsk`, `path`→`usePath`, `quick`→`useQuick`, `revision`→`useRevisionQueue`,
   `streaks`→`useStreaks`. `library.service.ts:768,798` also uses `LearnRepository.getSession`.
5. **`packages/learn-evals` and `packages/copilot/src/resolve-student-tutor-policy.ts` already
   exist.** The diagnosis predates both. See §10 for what the harness actually does.
6. **These already exist and are conformant — do not "add" them:** the partial unique index enforcing
   ≤1 non-terminal session per user, and the `409 SESSION_ACTIVE` response with the active id.
7. **D3 is a routing defect, not a copy defect.** Hyperspec 2 §1 scopes the string
   `"Couldn't start your lesson — check your connection"` to the **8-second stream-start-failure case
   only**. That copy is correct for that case and **must be preserved byte-for-byte**, em-dash
   included. Already fixed in Phase B.
8. **D2, D7, D14, D15, D16 are NOT conformance gaps** — they are robustness bugs with no binding
   hyperspec statement behind them. They were fixed in Phase B anyway, but they move no matrix rows.

---

## 6. Facts about the current code you will need

### Key files

| Path | Role |
|---|---|
| `apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts` | The orchestrator. ~1100 lines. Session lifecycle, SSE, state machine, budget/fatigue. |
| `.../edrion-learn/move-library.ts` | **NEW (D).** The 8 moves as data + predicates. |
| `.../edrion-learn/move-planner.service.ts` | Plan call + server-side constraint rewrites. |
| `.../edrion-learn/block-renderer.service.ts` | Render call. **Still blocking + `tier:'small'`.** |
| `.../edrion-learn/learn-config.service.ts` | **NEW (D).** Runtime `learn.*` knobs. |
| `.../edrion-learn/profile.service.ts` | Topic profiler. **Prompt is still a one-liner.** |
| `.../edrion-learn/mastery.service.ts` | Elo math. |
| `.../edrion-learn/evidence.service.ts` | Attempts, evidence tags, model events. |
| `.../edrion-learn/canvas-graph.service.ts` | **Fakes `canvasId`; writes no `visual_canvases` row.** |
| `.../edrion-learn/edrion-learn.repository.ts` | All DB access. Atomic seq helpers live here. |
| `apps/student-web/src/lib/hooks/useEdrionLearnSession.ts` | Session hook + SSE consumption. |
| `apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx` | Renders every block type. Most UI gaps are here. |
| `packages/schemas/src/student/edrion-learn/` | `blocks.ts`, `plan.ts`, `state.ts`, `events.ts`, `api.ts`, `profile.ts`, `mastery.ts`, `policy.ts` |

### Using the config service (Phase D output — use it, don't hardcode knobs)

```ts
import { LearnConfigService, type LearnConfigContext } from './learn-config.service';

export interface LearnConfig {
  move_cap: number;                        // 14
  profile_ttl_days: number;                // 180
  plan_model_tier: 'small' | 'mid';        // 'small'
  render_model_tier: 'small' | 'mid';      // 'mid'
  grade_model_tier: 'small' | 'mid';       // 'small'
  judge_model_tier: 'small' | 'mid';       // 'mid'
  profiler_model_tier: 'small' | 'mid';    // 'small'
  max_free_questions_per_session: number;  // 5
  daily_session_cap_per_user: number;      // 12
  speculative_planning: boolean;           // true
  default_session_minutes: number;         // 15
}
// const cfg = await this.config.getAll(this.configCtx(principal));
```
Resolution: global → institution → independent_user, 30s cache. An empty `learn_config` table
reproduces the compile-time defaults exactly. Never re-hardcode one of these 9 knobs.

### Typecheck baseline

`npx tsc --noEmit -p apps/api/tsconfig.json` → **exactly 12 errors**, all pre-existing, all in
`portal/` mock-exams, `exam-engine/`, and `packages/schemas` `exam-blueprint`. **Zero in Learn.**
If you see 13+, or any error in a Learn file, you broke something. There is no lint/test gate to
lean on — this typecheck is your only automated signal.

---

## 7. PHASE E — Profiler and learner model

**Goal:** make the profiler real and the learner model complete. Matrix rows: `PM-*`, plus `DM-056`,
`DM-061`, `DM-070`, `DM-040`.

### E1 — Real topic profiler

Current state: `profile.service.ts:65-66` is literally
`system: 'Generate a TopicProfileV1 JSON for teaching this topic.'` with
`user: JSON.stringify({ title, topicKey })`. There is no prompt file. `edrion-learn/prompts/` contains
only `plan.prompt.ts` and `render.prompt.ts`.

Build per hyperspec 1 §2.1/§2.2:
- A real prompt file (`prompts/profile.prompt.ts`), versioned like its siblings.
- Input: `learn_topic` title + its `concept_atoms` (titles + `content` summaries, **≤4k tokens**) +
  syllabus context + (for material topics) outline + first chunk.
- Output `TopicProfileV1` per §2.2 — validate with the existing Zod schema in
  `packages/schemas/src/student/edrion-learn/profile.ts`.
- **One retry with the Zod errors quoted back**, then `DEFAULT_PROFILE` + a `profile_generation_failed`
  log. (The provider already implements a 2-attempt reject-and-retry loop —
  `learn-ai/openai.provider.ts:112,131` — reuse it, don't rebuild it.)
- Inline miss uses `profiler_model_tier` from config, ≤4s timeout.

### E2 — Cache semantics

- Resolve by `learn_topic_id` **first**, then `topic_key`. (This order is already correct at
  `edrion-learn.repository.ts:224-239` — verify, don't rewrite.)
- **Stale-while-revalidate on expiry.** Currently expiry does a *blocking* inline regeneration.
- **Regenerate when a child `concept_atom.updated_at` or `prompt_version` is newer** than the profile.
  Nothing does this today; only `expiresAt` is consulted. `repo.touchConceptAtom` and
  `repo.listConceptAtoms` exist and have **zero callers**.
- `source='human_override'` rows **never expire and never regenerate**.

### E3 — Pre-warm job

Enqueue a `profile-topic` BullMQ job on learning-path creation and on Library-document indexing
completion, so the common path finds the profile ready. **There is no Learn BullMQ queue at all
today** — you are creating the first one. Follow the queue conventions already used elsewhere in
`apps/api` (grep `BullModule`).

### E4 — `PATCH /learn/topic-profiles/:id`

Does not exist. `patchTopicProfileInputSchema` exists at
`packages/schemas/src/student/edrion-learn/api.ts:151-154` with **zero consumers**. Implement per
§2.3: owner (user scope) or staff with `learn.profile.override` (institution scope); partial merge;
`source='human_override'`; `expires_at=null`; emit a `profile_overridden` event.

### E5 — Learner model completion

- **Elo math is already correct on 9 of 10 constants** (d=1100/1300/1500, K=32/16 at threshold 10,
  clamp 400–2400, p formula, display transform, no decay). The seed rating was the 10th and is fixed
  (DEC-5). **Do not "fix" the math.**
- **`hintsUsed` is hardcoded `0`** at `pedagogy-orchestrator.service.ts:779` — the only call site.
  Half-weight K on hinted success is therefore dead. Wire real hint counts through.
- **Missing model inputs** the spec requires: *pace preference* (absent entirely) and *per-move-type
  outcome statistics aggregated across sessions* (outcomes live only in the ephemeral in-session
  `state.moves[]` digest and are never aggregated). Add both.

### E6 — Mastery seeding backfill

None exists. Build the BullMQ backfill per §1.4: replay `learn_attempts` per (user, atom)
chronologically, deriving the outcome in this priority order:
1. `learn_attempts.evaluation` jsonb if it carries correctness (`evaluation.correct`, or
   `evaluation.score >= threshold`);
2. else the linked `evidence_tags.polarity` via the attempt's evidence event id;
3. else skip.
`hints_used > 0` on a correct outcome applies K at half weight. Must be **idempotent
(recompute-from-scratch)**. Acceptance: replaying all `learner_model_events` reproduces
`learner_mastery` exactly (AC9).

### E7 — DEC-9 writeback defects

Keep `LearningEventsWriter` (that is the settled decision), but fix all three defects:
the model event is written **conditionally** (`evidence.service.ts:78`), the pair is **not
transactional** (five sequential awaits on the bare `this.db`), and the ledger writer **swallows its
own errors**. `repo.runInTransaction` exists — Phase D gave it its first caller, follow that pattern.

### E8 — DEC-8 evidence contents

`learn_sessions.evidence` currently receives raw card markdown from
`artifact-commit.service.ts:40-42`. Change to **evidence-event ids** so the learner model and the
memory-diff service can consume Learn evidence through the substrate they already read.

### E9 — DEC-14 topic resolution (fixes D4)

`pedagogy-orchestrator.service.ts:260`:
```ts
const topicKey = institutionalCtx.topicKey ?? input.topicKey ?? `session:${input.idempotencyKey.slice(0, 8)}`;
```
For independent-tier users this yields the literal string `session:a1b2c3d4`, which is then profiled,
sent to the plan prompt, and printed verbatim in fallback copy. Worse, **every session
unconditionally upserts a `learn_topics` row for whatever it produced**, so `learn_topic_id` is always
non-null and the spec's ad-hoc null-FK branch (AC3) is structurally unreachable, while `learn_topics`
fills with `session:<hex>` garbage.

- `repo.getPathItem` exists at `edrion-learn.repository.ts:355-362` and has **zero callers**. There is
  no independent counterpart to `InstitutionalContextService` — build one.
- Adopt the spec's key forms: `topic:<learn_topic_id>` (canonical), `material:<material_id>`,
  `free:<slug(title)>`. Stop upserting `learn_topics` rows for ad-hoc topics.

### E10 — Atom validation (fixes D5)

`block-renderer.service.ts:77,106` uses `randomUUID()` as `atom_id` in fallback blocks.
`learner_mastery.atom_id` is NOT NULL with an FK to `concept_atoms.id`, so answering such a question
is an FK violation (23503, uncaught). The same applies to any `atom_id` the LLM invents — nothing
validates them. `repo.listConceptAtoms` (`edrion-learn.repository.ts:65-71`) exists with **zero
callers**. Validate every `atom_id` the LLM emits against real atoms, and never mint one.

---

## 8. PHASE F — Plan/render correctness and pipelining

**Goal:** make the two-call loop actually produce dynamic teaching. Matrix rows: `MV-087`, `MV-088`,
`DM-096`, `UI-095/104/109/177-180/185/193`.

### F1 — Render prompt drift (D6) — **the highest-value fix in this phase**

`prompts/render.prompt.ts:4-8` **never states the valid `block_type` values** and **never gives the
move → block_type mapping** (which lives only server-side). **Three of the eight move names are not
valid block types**, so a model told `move: "direct_explanation"` will plausibly emit
`block_type: "direct_explanation"`, fail the discriminated union, and silently degrade into canned
filler. Required UUID fields (`chain_id`, `source_block_id`, `canvas_id`) and required enums
(`purpose`, `difficulty`, `type`, `kind`) are unmentioned. Combined with `strict: false`
(`learn-ai/openai.provider.ts:322`), failures surface post-hoc and are swallowed into `fallbackBlock`.

**This is currently invisible: sessions serve six canned blocks with `degraded: true` and look like
they worked.** Phase D's `move-library.ts` now holds the authoritative move→block_type mapping — feed
it into the prompt rather than duplicating it.

### F2 — Streamed render (DEC-13)

`block-renderer.service.ts:40` uses blocking `completeJson`, and `:42` hardcodes `tier: 'small'`.
- Switch the tier to **`render_model_tier` from config** (already defaults to `'mid'`).
- Make render a **streamed** call per §4.3. The provider already has `streamJsonArray` / `streamText`
  (`openai.provider.ts:178,229`) which Learn never calls.
- Blocks must stream token-progressively into the markdown renderer, with interactive affordances
  mounting only **after** the block's Zod parse completes on stream end.

### F3 — Pipelining

Plan for N+1 fires when N's render **starts**; discard and re-plan if N's outcome invalidates it.
Gate on `speculative_planning` from config. Log speculative calls flagged, and **populate the
`speculative` and `firstTokenMs` columns that exist in the logger
(`learn-ai/learn-ai-call.logger.ts:23,26,42,44`) and schema (`learn.ts:409,411`) and are never
written.** `outcome` is also always NULL — populate it.

### F4 — Preserve `interactionState` on the SSE path (D8)

`useEdrionLearnSession.ts:55` hardcodes `interactionState: {}` when mapping a `block` event, so
worked-example reveal state, canvas payload, and prior answers are only correct after a full refetch.

### F5 — Reconnect (D9)

Honor `replay` and `block_start` events client-side, send `last_seq`, and make replay recover blocks
with **no duplicates or gaps**. The server already emits both event types and already accepts
`last_seq` (`edrion-learn.controller.ts:50`); the client ignores all three. Note `stream()` replays
*events*, not *blocks* — a persisted-but-unemitted block is currently unrecoverable by design; fix
that.

### F6 — SSE heartbeat and timeouts (D14)

Nothing is written between `flushHeaders()` and the first emit — a gap spanning a policy call, a
profile resolve, and a full blocking plan call. Any proxy with an idle-response timeout drops the
connection. Add a heartbeat during the plan/render gap and a per-call `AbortSignal` timeout
(`completeJson` has none).

### F7 — `ON CONFLICT` against partial unique indexes (D10)

`edrion-learn.repository.ts:280-284,390-395` target column lists backed only by partial indexes
without passing drizzle's `targetWhere`. Postgres rejects with **42P10**. Phase B fixed this for
`insertTopicProfile` — copy that pattern. This breaks the independent-user answer path.

### F8 — Answer idempotency (DM-096, AC8)

The duplicate path returns a **freshly recomputed** `evaluation` and **re-fires a billed grading LLM
call**, which can disagree with the stored row. Per §5 the second call must return the **stored**
result: one `learn_attempts` row, one `evidence_tags` row, one mastery update.

### F9 — DEC-6 canvas ownership

`canvas-graph.service.ts:51` returns `canvasId: randomUUID()` for a row it **never creates**, and the
graph is persisted into `learn_session_blocks.interaction_state.graph`. `visual_canvases` is never
written; `canvas_id` is a dangling UUID. Route visual_spawn through Chat 9's pipeline into
`visual_canvases` + revisions, per §1.6/§3.5 and the "Learn owns no canvas storage" invariant. A
pipeline hard-fail must still yield a `degraded` explanation and continue the session.

---

## 9. PHASE G — Session UI conformance

**Goal:** hyperspec 2 §1–§8 tap by tap. This is the **largest gap area — 197 matrix rows, 71 absent,
25 contradicted.** Matrix rows: `UI-*`.

Read hyperspec 2 in full; it specifies exact colors, sizes, and timings. Non-exhaustive known gaps:

### G1 — Progress bar (`UI-011`, `UI-019`, `UI-186`; AC-3)
`SessionProgressBar.tsx:7-14` is a **percentage fill, not segmented**, so when a remediation detour
increments `checkpointsTotal` the bar visibly **decreases**. Both halves of AC-3 fail. Spec: N equal
segments, 4px tall, track `#e8e4d8`, fill `#1f604a`, 200ms fill (instant under reduced-motion), a
detour **adds** a segment with a 150ms width reflow, and the bar **never shrinks**. A segmented
primitive already exists unused in `apps/student-web/src/components/`.

### G2 — Block interactions (`EdrionLearnBlockCard.tsx` — most gaps live here)
- **`question_set` shares one answer state across all questions** (`:23-25`) — answering Q1 hides
  Q2/Q3. Spec is **one question at a time** with a per-question lock (`:152` renders all at once).
- **Correct answer never revealed when wrong**: `:163` gates the green outline on `isSelected`.
- **Synthesis submits the hardcoded placeholder `{ text: 'done' }`** (`:246`) — there is no input
  field in that branch at all (`:238-255`). Capture the learner's real text.
- Worked example: `predict_prompt` is destroyed into a button label (`:134`) instead of rendering a
  prompt + one-line input + "Check my thinking" / "Just show the step".
- Canvas embed is a static placeholder paragraph (`:288-296`), not a live mini-canvas. A full canvas
  stack exists at `components/visual-studio/ThinkingCanvasShell.tsx`.
- Artifact commit: checkboxes default **off** (spec: on), back text always rendered (spec:
  tap-to-expand).
- `system_notice` renders as a bare `<p>` (`:298-303`), not a full-width tinted card.
- **Wrong answers must be amber, never red** (AC-6).

### G3 — The four overflow verbs (AC-5)
**Zero of four exist on zero block types.** No `⋯` is rendered (`:32-41`). Spec requires exactly four
on **every** block: *Save to notes*, *Make flashcard from this*, *Explain simpler*, *Explain deeper*.
"Explain simpler/deeper" must **never advance a checkpoint**. Notes and flashcards go to the existing
Chat 8 services — Learn owns no storage.

### G4 — "Why this?" (AC-13)
`:36` passes `plan_reasoning` as a native `title=` attribute on a **click-less button** — hover-only,
delayed, unstyled, **unreachable on touch** in a mobile-first spec. Build a real tooltip/popover. When
the block is `degraded`, the copy is "I improvised this one."

### G5 — Artifact rail, exit sheet, completion card
- Rail renders a single aggregate line (`ArtifactRail.tsx:21-26`), `lg:`-only — spec wants a live
  **list** plus a mobile swipe-up sheet and a counter that pops.
- **Exit sheet does not exist**; the back chevron does `router.push('/learn')` (`page.tsx:102-104`).
- Completion card shows machine counters instead of `summary` (`CompletionOverlay.tsx:12-14`), and
  **`summary` is not even on the DTO** (`api.ts:62-92`). It must render for every closed session with
  `end_reason != 'abandoned'`, including sessions full of degraded blocks (AC-8).

### G6 — Composer, scroll, offline
- Composer must queue during `awaiting_response` and **never bypass a locked interaction** (AC-4).
- Never yank scroll: if the student has scrolled up (>80px), show a "↓ New" pill instead (AC-9).
- **No offline behaviour exists in Learn at all.** Spec §8: rendered blocks readable offline via the
  existing IndexedDB layer (`idb-keyval` is already used in four other surfaces), interactions
  disabled with a slim banner, SSE auto-resume with `last_seq`, and a **30s idempotent answer retry**.
  Note `useEdrionLearnSession.ts:126` mints a **fresh** `crypto.randomUUID()` per call, so even a
  manual re-submit is not idempotent — fix that first or the retry is meaningless.
- Skeletons must carry the move's icon — never a blank spinner (currently plain `animate-pulse`).

### G7 — Policy footer
`<PolicyNotice/>` is rendered at the **top** of the scroll column (`page.tsx:122`), not in a reserved
**footer** region. The wiring is right (P3 flips a value); the layout slot is wrong.

### G8 — Entry points (§5)
- **Learning path**: label is `Start`, unconditional — spec wants **"Start lesson"** gated on
  `learn.orchestrator` (`learn/path/page.tsx:113`).
- **Library "Teach me this"**: wired; budget chips correct but no default selected.
- **Free-chat handoff**: the deterministic 120-word / second-follow-up trigger is correctly
  implemented (`LearnHandoffCard.tsx:46-49`), but the setback regex tests **`topicLabel`** (a document
  title) instead of the student's message (`:17-18`).
- **Individual tier**: only one of three doors is wired. `session/start/page.tsx:31-37` hardcodes
  `goal:'acquisition'`, killing the `<14-day` revision branch and the budget-20 prep door.
  "Fix with Petros" does not exist.
- **AC-12: exactly zero push notifications may originate from Learn in P1.** This currently holds
  only *by omission* — the Today item bypasses `TodayNotifyService.dispatch`. But `public/sw.js:27-30`
  and `register-sw.tsx:7-8` are live and `today.service.ts:198` already tags
  `source_module:'learn'`. Make the zero-push property **explicit and enforced**, not accidental.

---

## 10. PHASE H — Policy scope and eval harness

### H1 — Student-tutor scope (DEC-16)

**Good news, already true:** `resolve-student-tutor-policy.ts:76` correctly **delegates** to
`resolveAiPolicy` for mode/kill-switch/scope. **There is no second policy engine** — that invariant
holds. It is already called at session start (`pedagogy-orchestrator.service.ts:95`) and at every
plan cycle (`:212`), and the snapshot is written to `session_context.policy_snapshot` (`:131`).
The cross-tenant `scopeMatchesContext` leak was fixed in Phase C.

**Remaining work:** capabilities are carried as `domain_config jsonb`
(`0097_student_tutor_policy_domain.sql:4-5`) rather than the engine's `AiCapability` boolean map
(`resolve-policy.ts:52-55`). Hyperspec 3 §3.2 requires the same capability grammar the admin-Copilot
scopes use, so P3 wires config to capabilities rather than special-casing Learn. Migrate it.
Keep the P1 defaults permissive: `{curriculum_bounds:'open', directness:'default', visibility:'none'}`.

### H2 — The eval harness — **read this carefully, it is worse than "incomplete"**

`packages/learn-evals` exists but is **a report-shaped skeleton that is green by construction**,
~190 lines across 5 files:
- `cli.ts:79-86` emits all six rubric dimension names with **hardcoded literal values**
  (`mean: 0.72`, `4.1`, `4.3`, `4.0`, `p95_first_token_ms: 2100`, `0.01`, `0.12`) and `pass: true`
  **constants**. Nothing is measured.
- The only real gate is `failures.length === 0` (`cli.ts:88`), i.e. HTTP errors.
- `cli.ts:35-48` HTTP-POSTs `/learn/sessions` to a separately-running API, reads back `id` and
  `planMoveCount`, and **stops**. No stream, no answers, no interacts, no commits, no plan cycles, no
  transcripts.
- 4 topics (`fixtures/topics.ts:2-7`), target is **30**. `factual` and `skill` knowledge types have
  **zero** topics.
- 6 personas exist (`personas.ts:12-19`) — the one fully-met §1 item.
- The seeded RNG (`personas.ts:22-28`) is **imported nowhere**, so reproducibility is unproven.
- `--suite core` and `full` are the same array (`cli.ts:13`).
- The sole "test" asserts `4*6===24` (`cli.spec.ts:3-8`).

**Rebuild it per hyperspec 3 §1**, honestly:
- 30 topics across the profile grid with the §1.2 coverage rules (every `knowledge_type` ≥ 6, every
  `native_representation` ≥ 4, ≥ 8 high-`prerequisite_density`, ≥ 6 high-`misconception_richness`,
  ≥ 5 heavy-`math_load`), each shipping a **frozen `topic_profile` fixture** so evals don't exercise
  the profiler's LLM call.
- 6 scripted deterministic personas driven by the **seeded** RNG (fixed seed per run).
- The **six rubric dimensions with their exact thresholds**: move diversity ≥ 0.6 and the canonical
  four pairwise-distinct; constraint compliance **100%**; pedagogical fit mean ≥ 4.0 no session < 3;
  content correctness mean ≥ 4.2 no session < 3, any answer-key error caps at 2; artifact quality
  mean ≥ 4.0; latency p95 first token < 3s, degraded ≤ 2%, discard rate < 30%. Structural dimensions
  are computed deterministically from the transcript; content dimensions use an LLM judge
  (`judge_model_tier`, temperature 0, versioned rubric prompt).
- `--suite core` = canonical four × all personas (24 sessions); full = 30 × 6 = **180 sessions**.
- Run report (JSON + markdown) with per-dimension scores, deltas vs. `--baseline`, and the **5 worst
  transcripts inlined**.
- **It must drive the real `PedagogyOrchestratorService` through its public API against a seeded test
  DB. No mocked orchestrator.** Only Chat 8 (cards) and Chat 9 (canvas) may be test doubles, and only
  to validate contract shape.
- **CI regression gate** with a path filter on prompts / block schemas / move constraints / model-tier
  config. **NOTE: no `.github/` directory exists in this repo at all** — you are creating CI from
  scratch, so confirm with the repo owner that GitHub Actions is the intended CI before building it.

> **This is the phase that determines whether Phases D–G produced dynamic teaching or better-labelled
> canned blocks.** Do not treat it as optional; the hyperspec makes it P1 definition-of-done for
> exactly that reason. The eval harness is the **one permitted exception** to the no-tests rule — and
> it is a product deliverable, not a test suite. Writing any other kind of test remains forbidden.

### H3 — Then run it

Run the harness and **report the results honestly against every acceptance criterion in all three
hyperspecs** (16 + 14 + 10 = 40). Expect failures; report them as failures. A green run that was
green by construction is exactly the failure mode this phase exists to eliminate.

---

## 11. Reporting rules — every phase

1. **Before writing code, confirm the repo state matches what the matrix recorded.** Where it does
   not, report the discrepancy and **stop** rather than guessing. (Phases B–D each found at least one
   matrix inaccuracy; expect more.)
2. **Never resolve a hyperspec-vs-repo contradiction on your own initiative.** Surface it and stop.
   DEC-1…16 are settled; a *new* conflict is not yours to settle.
3. At each phase gate report: **what changed (file list)**, **what migrations were added and their
   numbers**, **which matrix rows moved to conformant**, **which acceptance criteria are now
   satisfiable**, and **what you deliberately did not do and why**.
4. If a phase's work reveals that a later phase's plan is wrong, **say so at the gate** rather than
   silently re-planning. This has already happened three times (see §12).
5. **Do not write a guard that can never fire.** Two such dead caps already shipped
   (`probe_chains.turn`, `chains_used`). If a rule cannot be enforced because the required state does
   not exist, say so explicitly instead of writing code that looks like enforcement.

---

## 12. Plan corrections already made — and open risks

Three times the original phase plan was wrong and was corrected:
1. Phase C's "retire `student/learn/`" premise — 5 of 7 controllers are live (§5.4).
2. `learn/history` assumed dead — it is live at `/student/history` (§5.3).
3. `elapsed_minutes` was listed under Phase E but **blocks Phase D** — every fatigue and budget rule
   D implements reads it. It was moved into D and is done.

### Open risks for E–H

- **DEC-13 cost.** Moving render to `mid` raises per-session spend (up to 14 render calls at the move
  cap). The config default already says `mid` but the renderer still hardcodes `small`, so the change
  is one line — and reversible via `learn_config` with no redeploy. Watch the first cost report.
- **Phase H may invalidate Phase F.** If content correctness can't reach ≥ 4.2, the likely levers are
  the render prompt (F1) and the model tier (F2) — i.e. re-running F. Get F1 right the first time.
- **`learn_config` has no admin UI.** Knobs are runtime-resolvable but only editable via SQL today.
- **RLS is inert.** `DATABASE_URL` connects as a superuser, so every policy added in 0103/0105 is
  dormant. Making it live requires switching the app to the `NOBYPASSRLS` `edrion_app` role, which is
  currently `NOLOGIN` — a separate piece of work, out of this program's scope, but worth scheduling.
- **`system_notice` has exactly one emitter** (the fatigue rule, added in D). Phase F/G will want the
  `budget`, `degraded`, and `policy` kinds too — the schema already supports all four.

---

## 13. Quick start for the next session

```bash
cd c:/Users/karol/Edrion-Labs
git log --oneline -5          # expect 81f23db at HEAD
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | grep -c "error TS"   # expect exactly 12
```
Then read, in order: this file → `LEARN-CONFORMANCE-MATRIX.md` (§Decisions + your phase's rows) →
the relevant hyperspec section. Start with **Phase E**, §7 above.

**Next migration number: `0106`, journal idx `99`.**
