# LEARN-SESSION-DIAGNOSIS.md

Static-analysis diagnosis of the broken Petros Learn session route.
Symptom: `/learn/session/c796132a-5457-46b4-a867-b0cfa731d56e` on `apps/student-web` (:3005) as an independent-tier user shows "Building your path…" then "Couldn't start your lesson — check your connection".

Method: read-only tracing across five layers (frontend route, API surface, orchestrator, data layer, block schema). No tests run, no server started, no DB queried.

> **Note on the reference spec.** `04-PETROS-LEARN-DYNAMIC-TEACHING.md` does not exist anywhere in this repo. The closest in-repo specs are `plans/02-learn-engine.md` (a *different* architecture — see Divergences) and `IMPLEMENTED-EDRION-LEARN.md` (a status record). The spec summary in the task prompt was used as the reference contract.

---

## Verdict

**`learn_sessions.last_event_seq` is never advanced when the session is created, so the first `block_stream_end` event re-inserts sequence `1` and violates a unique constraint. The insert throws after the block has been rendered but before it is emitted to the client, so the stream dies with zero blocks — deterministically, permanently, on every session.**

The four-line proof:

| Step | Location | What happens |
|---|---|---|
| 1 | [pedagogy-orchestrator.service.ts:169](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L169) | `updateSession(session.id, { state, orchestratorStatus: 'active' })` — **`lastEventSeq` is omitted** |
| 2 | [pedagogy-orchestrator.service.ts:170](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L170) | `appendSessionEvent(session.id, 1, 'session_created', …)` — inserts **`seq = 1`**, committed |
| 3 | [pedagogy-orchestrator.service.ts:306](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L306) | `const eventSeq = Number(session.lastEventSeq ?? 0) + 1;` → column is still at its default `0`, so this is **`1`** |
| 4 | [pedagogy-orchestrator.service.ts:307](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L307) | `appendSessionEvent(sessionId, 1, 'block_stream_end', …)` → **Postgres 23505 unique_violation** |

Supporting evidence:

- The constraint is real and present in the applied migration: `CONSTRAINT learn_session_events_session_seq_uq UNIQUE (session_id, seq)` — [0096_edrion_learn_orchestrator.sql:239](packages/database/migrations/0096_edrion_learn_orchestrator.sql#L239), mirrored at [learn.ts:322](packages/database/src/schema/learn.ts#L322).
- The column defaults to `0`: `lastEventSeq: bigint('last_event_seq', { mode: 'number' }).notNull().default(0)` — [learn.ts:169](packages/database/src/schema/learn.ts#L169), [0096_edrion_learn_orchestrator.sql:32](packages/database/migrations/0096_edrion_learn_orchestrator.sql#L32).
- `lastEventSeq` is written in **exactly one place** — [pedagogy-orchestrator.service.ts:315](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L315) — which sits *after* the throwing insert and is therefore never reached. A repo-wide grep returns only lines 306 and 315.
- `appendSessionEvent` is a bare insert with no `onConflict` and no atomic allocation — [edrion-learn.repository.ts:194-198](apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts#L194-L198).

**Why the symptom looks exactly like this:**

- `emit({ type: 'block', … })` is at [:319](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L319), *after* the throw — so the block is rendered and persisted but **never sent**. `session.blocks.length === 0`, which is precisely the condition guarding the error card at [page.tsx:77](apps/student-web/src/app/(app)/learn/session/[id]/page.tsx#L77).
- The controller already flushed `200` before the orchestrator ran ([edrion-learn.controller.ts:51-56](apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts#L51-L56)), so the failure can only arrive as an SSE `{type:'error'}` data frame ([:62-68](apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts#L62-L68)) — never as a non-2xx.
- The whole request runs inside one Postgres transaction (`runInIndependentStudentTenant` → `db.transaction`, [client.ts:110-119](packages/database/src/client.ts#L110-L119)), so the 23505 aborts and rolls back the block insert too.
- `session_created` was committed in the *earlier* `POST /sessions` transaction, so `seq = 1` persists while `last_event_seq` stays `0`. **Retry recomputes `1` and collides again, forever.**

**This is tier-agnostic.** It breaks institutional students identically. The independent tier is not implicated — see Cleared Hypotheses.

**Smallest correct fix:** set `lastEventSeq: 1` in the `updateSession` at [:169](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L169). The robust fix is an atomic `nextEventSeq(sessionId)` helper mirroring the existing `nextBlockSequence` ([edrion-learn.repository.ts:177-180](apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts#L177-L180)). Existing broken sessions — including `c796132a-…` — carry orphaned `content: {}` block rows and need cleanup regardless (see D2).

---

## Ranked defects

Ordered by severity × confidence. The verdict above is D1.

### D1 · Orchestrator · [pedagogy-orchestrator.service.ts:169,306](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L169) — `last_event_seq` never advanced
Duplicate-key violation on the first block of every session. **Breaks:** all Learn sessions, all tiers, permanently and unrecoverably. Also makes `POST …/answer|interact|ask|commit-artifacts|resume` return a raw 500, since they call `planAndRenderNextBlock` with no try/catch ([:390](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L390), [:451](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L451), [:471](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L471), [:500](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L500), [:511](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L511)) — after evidence and mastery have already been written. **Confidence: very high** (verified independently by three agents plus direct source and migration reading).

### D2 · Orchestrator · [pedagogy-orchestrator.service.ts:252-262,567](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L252-L262) — orphan `content: {}` blocks permanently brick a session
Blocks are inserted with `content: {}` and `renderStatus: 'streaming'`, filled in later at [:295](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L295). Any failure in between leaves an unparseable row, and `toDto` does an unguarded `blockV1Schema.parse(b.content)` at [:567](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L567). There is no ZodError exception filter in the API, so `GET /sessions/:id` 500s forever. **Breaks:** the session page renders a silent infinite skeleton (`!session` at [page.tsx:69](apps/student-web/src/app/(app)/learn/session/[id]/page.tsx#L69)) with no error shown at all. Unrecoverable without a DB fix. The gap includes `canvas.generateForSession` at [:272](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L272), which is not wrapped in try/catch. **Confidence: high.**

### D3 · Frontend · [useEdrionLearnSession.ts:102-105](apps/student-web/src/lib/hooks/useEdrionLearnSession.ts#L102-L105) — every failure mode collapses into one false message
`onError` ignores its `err` argument and hardcodes the string. Five distinct upstream causes are indistinguishable: non-2xx, 2xx with no body, in-stream `{type:'error'}` frame, network/TCP failure, CORS rejection. The backend builds a real `code` and `message` ([edrion-learn.controller.ts:64-68](apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts#L64-L68)), transports it, and the client parses it — then throws it away at [student-client.tsx:238-247](apps/student-web/src/lib/student-client.tsx#L238-L247). Nothing is logged to console. **Breaks:** diagnosability — a DB constraint violation is reported to the user as a connectivity problem. This is why the bug was hard to locate. **Confidence: certain** (this is the bug you flagged in the prompt; confirmed).

### D4 · Orchestrator · [pedagogy-orchestrator.service.ts:103-105](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L103-L105) — independent sessions get a synthetic garbage topic
Independent users create sessions with `entryPoint: 'learning_path'` + `pathItemId` and **no `topicKey`** ([learn/page.tsx:190-201](apps/student-web/src/app/(app)/learn/page.tsx#L190-L201)). `InstitutionalContextService.resolve` returns `{}` for non-institutional principals ([institutional-context.service.ts:42-45](apps/api/src/modules/student/edrion-learn/institutional-context.service.ts#L42-L45)), so the topic key falls through to the literal `session:<8 hex>`. `repo.getPathItem` exists ([edrion-learn.repository.ts:355-362](apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts#L355-L362)) but **has zero callers** — there is no independent counterpart to `InstitutionalContextService`. **Breaks:** even with D1 fixed, independent users get a lesson about the string `session:a1b2c3d4` — that garbage is what gets profiled, what the plan prompt receives, and what appears verbatim in fallback copy ("Let's work through **session:a1b2c3d4** step by step", [block-renderer.service.ts:145](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L145)). **Confidence: high.** This is the one genuinely independent-tier-specific defect found.

### D5 · Orchestrator · [block-renderer.service.ts:77,106](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L77) — fallback blocks mint fake `atom_id` UUIDs
`randomUUID()` is used as `atom_id`. `learner_mastery.atom_id` is NOT NULL with an FK to `concept_atoms.id` ([learn.ts:259-261](packages/database/src/schema/learn.ts#L259-L261)). Answering such a question drives `mastery.applyUpdate` → `upsertMastery` → FK violation 23503, uncaught. The same applies to any `atom_id` the LLM invents — nothing validates them, and `repo.listConceptAtoms` ([:65-71](apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts#L65-L71)) has zero callers. **Breaks:** `POST …/answer` 500s. **Confidence: high.**

### D6 · Orchestrator · [prompts/render.prompt.ts:4-8](apps/api/src/modules/student/edrion-learn/prompts/render.prompt.ts#L4-L8) — render prompt has drifted from the Zod schema
The prompt never states the valid `block_type` values and never gives the move → block_type mapping (that mapping lives only server-side at [move-planner.service.ts:266-275](apps/api/src/modules/student/edrion-learn/move-planner.service.ts#L266-L275)). Three of the eight move names are not valid block types, so a model told `move: "direct_explanation"` will plausibly emit `block_type: "direct_explanation"` and fail the discriminated union. Required UUID fields (`chain_id`, `source_block_id`, `canvas_id`) and required enums (`purpose`, `difficulty`, `type`, `kind`) are unmentioned. Combined with `strict: false` ([openai.provider.ts:322](apps/api/src/modules/student/learn-ai/openai.provider.ts#L322)), validation failures surface post-hoc and are swallowed into `fallbackBlock` ([block-renderer.service.ts:62-73](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L62-L73)). **Breaks:** silent permanent degradation — sessions serve six canned filler blocks with `degraded: true` instead of generated content. Not an error; invisible. **Confidence: high that it occurs, low that it contributes to this symptom.**

### D7 · Frontend · [page.tsx:55-59](apps/student-web/src/app/(app)/learn/session/[id]/page.tsx#L55-L59) — StrictMode double-mount races the block sequence
The stream effect has no cleanup and `reactStrictMode: true`, so `startStream()` fires twice. The second aborts the first *client-side* fetch only; the server keeps running handler #1. Both reach `shouldPlan === true` and both call `nextBlockSequence` ([edrion-learn.repository.ts:177-180](apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts#L177-L180)), a read-then-max with no locking. **Breaks:** duplicate-key violation on `learn_session_blocks_session_sequence_uq`, and orphaned blocks. An independent second path to the same symptom; masked today by D1, which fires first on every request. **Confidence: medium-high.**

### D8 · Frontend · [useEdrionLearnSession.ts:55](apps/student-web/src/lib/hooks/useEdrionLearnSession.ts#L55) — SSE path destroys `interactionState`
Hardcodes `interactionState: {}` when mapping a `block` event. **Breaks:** `worked_example` reveal state, `canvas_embed` graph payload, and `question_set` prior answers are only correct after a full refetch, never from the stream. **Confidence: high.**

### D9 · Frontend · [useEdrionLearnSession.ts:97](apps/student-web/src/lib/hooks/useEdrionLearnSession.ts#L97) — reconnect replay is a no-op
The server emits `{type:'replay'}` ([:191](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L191)) and `{type:'block_start'}` ([:263](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L263)); `onMessage` only acts on `type === 'block'`. `lastSeq` is never sent even though the server supports it. Also note `stream()` replays *events*, not *blocks* — so a persisted-but-unemitted block is unrecoverable by design. **Breaks:** reconnection recovers nothing. **Confidence: high.**

### D10 · Data · [edrion-learn.repository.ts:280-284,390-395](apps/api/src/modules/student/edrion-learn/edrion-learn.repository.ts#L280-L284) — `ON CONFLICT` cannot infer a partial unique index
Both upserts target column lists backed only by partial indexes (`… WHERE independent_user_id IS NOT NULL`, [0096:193-195](packages/database/migrations/0096_edrion_learn_orchestrator.sql#L193-L195), [0051:32](packages/database/migrations/0051_learn_revision_evidence.sql#L32)) without passing drizzle's `targetWhere`. Postgres rejects with 42P10. **Breaks:** the answer path for independent users, once it is reachable. **Confidence: high.**

### D11 · Data · [profile.service.ts:29-52](apps/api/src/modules/student/edrion-learn/profile.service.ts#L29-L52) — expired topic profile causes a duplicate key
If a cached profile exists but `expiresAt` has passed, the code falls through to a plain insert with no `onConflict`, violating `learn_topic_profiles_independent_topic_key_uq`. **Breaks:** every session on that topic fails after TTL expiry. **Confidence: high.**

### D12 · Data · [zzz_rls.sql](packages/database/migrations/sql/zzz_rls.sql) — no RLS on four learn tables
`learn_sessions`, `learn_session_blocks`, `learn_attempts`, and `evidence_tags` have no RLS enabled at all. Cross-learner isolation rests entirely on app-layer `WHERE` clauses. Moot today because the API connects as Supabase's `postgres` role (`BYPASSRLS`) — which is itself the finding. **Breaks:** defense in depth; a single missing `WHERE` becomes a cross-tenant data leak. **Confidence: high.** Security posture, not this bug.

### D13 · Frontend · [page.tsx:69-75](apps/student-web/src/app/(app)/learn/session/[id]/page.tsx#L69-L75) — session-fetch failure is completely silent
`query.isError` / `query.error` are returned by the hook ([:189](apps/student-web/src/lib/hooks/useEdrionLearnSession.ts#L189)) but never read by the page. On error, `!session` is true → an infinite pulsing skeleton with no message and no retry. There are **no error boundaries anywhere** in student-web (no `error.tsx` / `global-error.tsx`). **Breaks:** D2 and any 500 on the GET present as a hung page. **Confidence: high.**

### D14 · Orchestrator · [edrion-learn.controller.ts:56](apps/api/src/modules/student/edrion-learn/edrion-learn.controller.ts#L56) — no SSE heartbeat during plan/render
Nothing is written between `flushHeaders()` and the first `emit`. That gap spans a policy DB call, a profile resolve (possibly an LLM call), and the full blocking PLAN call. No per-call timeout exists (`completeJson` has no `AbortSignal`, [openai.provider.ts:104-176](apps/api/src/modules/student/learn-ai/openai.provider.ts#L104-L176)); worst case is four API round-trips per call. **Breaks:** any proxy with an idle-response timeout drops the connection and reproduces the identical client message. **Confidence: medium.**

### D15 · Frontend · [learn/page.tsx:194](apps/student-web/src/app/(app)/learn/page.tsx#L194) — silent dead-end if a path has no items
`if (!firstItem) return;` leaves `routingStatus` reading "Building your path…" with no navigation and no error. `routingStatus` is also never cleared on failure. **Breaks:** a genuinely stuck "Building your path…" state, distinct from the reported error card. **Confidence: high.**

### D16 · Orchestrator · [pedagogy-orchestrator.service.ts:100-105](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L100-L105) — `callLog.log` awaited inside `catch` blocks
Also at [block-renderer.service.ts:63-71](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L63-L71). If the logging insert fails, the error escapes the handler that was supposed to contain it. **Breaks:** the degradation-instead-of-crash guarantee. **Confidence: medium.**

### D17 · Frontend · [EdrionLearnBlockCard.tsx:23-25](apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx#L23-L25) — `question_set` shares one answer state across all questions
Answering Q1 sets `submitted = true`, hiding Q2/Q3's inputs. **Breaks:** multi-question blocks (schema allows 1–3) render half-dead. **Confidence: high.**

### D18 · Frontend · [EdrionLearnBlockCard.tsx:246](apps/student-web/src/components/edrion-learn/EdrionLearnBlockCard.tsx#L246) — synthesis submits a hardcoded placeholder
`onInteract?.('synthesis_submit', { text: 'done' })` — the learner's actual synthesis text is never captured. **Breaks:** the synthesis move produces no real evidence. **Confidence: high.**

### D19 · Data · `0082_timetable_period_backfill.sql` — orphaned migration
Present on disk but absent from `meta/_journal.json` (contiguous `idx 0..94`, skipping only this tag). Drizzle drives off the journal, so it will never be applied. **Breaks:** nothing in Learn; real schema drift elsewhere. **Confidence: high.**

### D20 · Frontend · [useEdrionLearnSession.ts:110-115](apps/student-web/src/lib/hooks/useEdrionLearnSession.ts#L110-L115) — `continueStream` can double-open
Calls `startStream()` immediately while the `[DONE]` handler schedules another 100 ms later. **Breaks:** two overlapping stream connections after any answer/interact/ask/commit, feeding D7. **Confidence: medium.**

---

## Orchestrator components: implemented / stubbed / absent

| Spec component | Status | Evidence |
|---|---|---|
| **Topic Profiler** | **Partially stubbed** | Cache table, TTL, and resolve loop are real ([profile.service.ts:21-54](apps/api/src/modules/student/edrion-learn/profile.service.ts#L21-L54), table `learn_topic_profiles` at [learn.ts:101](packages/database/src/schema/learn.ts#L101)). The 8-dimension schema exists ([profile.ts:20-31](packages/schemas/src/student/edrion-learn/profile.ts#L20-L31)). **But the generation prompt is one line** — `'Generate a TopicProfileV1 JSON for teaching this topic.'` with `user: JSON.stringify({title, topicKey})` ([profile.service.ts:65-66](apps/api/src/modules/student/edrion-learn/profile.service.ts#L65-L66)). No prompt file, no misconception guidance, no curriculum grounding. Failures silently return `DEFAULT_TOPIC_PROFILE_V1`. |
| **Learner Model** | **Partially stubbed** | Elo mastery is real ([mastery.service.ts:29-63](apps/api/src/modules/student/edrion-learn/mastery.service.ts#L29-L63)); evidence tags, attempts, and model events are real ([evidence.service.ts:29-113](apps/api/src/modules/student/edrion-learn/evidence.service.ts#L29-L113)). **Missing:** pace preference (absent entirely); per-move-type outcome statistics (outcomes live only in the ephemeral in-session `state.moves[]` digest and are never aggregated across sessions); mastery is never seeded from `learn_attempts` history. `elapsed_minutes` is never incremented, so all time-budget logic is dead. |
| **Teaching Moves Library** | **Stubbed — 8 of ~18, and not a library** | `moveTypeSchema` ([plan.ts:3-12](packages/schemas/src/student/edrion-learn/plan.ts#L3-L12)): `direct_explanation`, `worked_example`, `retrieval_check`, `prereq_pulse`, `visual_spawn`, `synthesis`, `artifact_commit`, `socratic_probe`. **There is no library structure** — no entry conditions, no per-move renderer contract objects, no generation templates. Moves are a bare enum plus a `switch` ([block-renderer.service.ts:78-147](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L78-L147)) and a `Record` map ([move-planner.service.ts:266-277](apps/api/src/modules/student/edrion-learn/move-planner.service.ts#L266-L277)). **Absent moves:** `hook`, `misconception_confrontation`, `predict_then_reveal` (survives only as an optional `predict_prompt` string on a worked-example step), plus the remaining unnamed moves. |
| **Two-call PLAN/RENDER loop** | **Implemented** | Genuinely two separate calls: [move-planner.service.ts:77-92](apps/api/src/modules/student/edrion-learn/move-planner.service.ts#L77-L92) (`learn_plan`) and [block-renderer.service.ts:40-52](apps/api/src/modules/student/edrion-learn/block-renderer.service.ts#L40-L52) (`learn_render`). Plan is separately auditable via `learn_ai_calls`. Stateless — the full digest travels each call. **Zod reject-and-retry exists and works**: `opts.schema.parse` at [openai.provider.ts:131](apps/api/src/modules/student/learn-ai/openai.provider.ts#L131) inside a 2-attempt loop at [:112](apps/api/src/modules/student/learn-ai/openai.provider.ts#L112) that re-prompts with the error text; after the second failure it rethrows into a deterministic fallback. **An invalid LLM response never throws uncaught** — it degrades silently, which is its own problem (D6). |
| **Pipelining / <1.5s first block** | **Absent** | Strictly sequential: plan awaited at [:238](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L238), render awaited at [:264](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L264). Both are **non-streaming** `completeJson` calls; only whole blocks are emitted, never tokens. `speculative` and `firstTokenMs` columns exist in the logger ([learn-ai-call.logger.ts:23,26](apps/api/src/modules/student/learn-ai/learn-ai-call.logger.ts#L23)) but nothing ever sets them. The target is structurally unreachable in the current design. |

**LLM client:** OpenAI Responses API, wired via a `LEARN_AI_PROVIDER` token that selects `OpenAiLearnProvider` or `NullLearnAiProvider` on key presence ([learn-ai.module.ts:22-27](apps/api/src/modules/student/learn-ai/learn-ai.module.ts#L22-L27)). **Credentials are present in this environment** (`OPENAI_API_KEY` at `.env:109`). Every orchestrator call uses `tier: 'small'` → `OPENAI_SMALL_MODEL`, default `gpt-5-nano-2025-08-07`. Missing credentials would degrade silently rather than error, so the LLM layer is **not** implicated in this symptom.

---

## Cleared hypotheses

Ruled out with evidence — worth recording so they aren't re-investigated.

- **Independent tier / missing `institution_id` is NOT the cause.** The failure is tier-agnostic. `StudentTenantInterceptor` branches correctly ([student-tenant.interceptor.ts:32-47](apps/api/src/modules/student/core/student-tenant.interceptor.ts#L32-L47)) and `runInIndependentStudentTenant` simply skips `app.institution_id` rather than setting `''` or throwing. RLS reads it via `NULLIF(current_setting('app.institution_id', true), '')` with `missing_ok = true`. No guard, wrapper, or policy in this path assumes institution binding. (D4 is the one real independent-specific defect, and it degrades content quality, not availability.)
- **The dual-owner XOR pattern is correctly implemented on every table in the path.** `learn_sessions_subject_ck` ([0050:106](packages/database/migrations/0050_learn_core.sql#L106)); newer tables use `num_nonnulls(...) = 1`. Not a single table has a NOT NULL `student_id` or `institution_id` that an independent user could not satisfy.
- **RLS is bypassed entirely on the API path.** The API connects with `DATABASE_URL` as Supabase's `postgres` role, which carries `BYPASSRLS`; `FORCE ROW LEVEL SECURITY` does not override it, and the `NOBYPASSRLS` `edrion_app` role is `NOLOGIN` and never used to connect. RLS cannot be the cause. (This is D12.)
- **Every table the repository touches exists in migrations.** All 16 verified; no missing table, no table created twice.
- **The block-type contract is intact.** All 8 discriminator values match verbatim between backend and frontend through one shared package (`@edrion/schemas`); no casing drift, no duplicated schema copies, no envelope mismatch, no client-side Zod rejection, and the frontend's `default` case returns `null` rather than throwing. A successful API call would render. Only asymmetry: `system_notice` is renderable but never emitted (dead branch).
- **Routes, mounting, CORS, and ports are all correct.** `EdrionLearnModule` is mounted ([student.module.ts:19,77](apps/api/src/modules/student/student.module.ts#L19)); `plans/fix/02-mount-student-controllers.md` was applied (all 9 controllers registered). `:3005` is in `API_CORS_ORIGINS`; the frontend's `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001` matches `API_PORT`.
- **All guards pass for an independent user.** The controller is `@Public()` + `@SkipRateLimit()`; `StudentPermissionsGuard` hardcodes the `student` role and `student.learn.use` is in the base catalogue. No tier guard, subscription check, or feature-flag guard exists on these routes. The `learn.orchestrator` flag is seeded `default_value = true` with `independent_user` in scope, and is only consulted in `createSession`, not `stream`.
- **No global `ValidationPipe`** — so no `whitelist`/`forbidNonWhitelisted` 400s. Validation is manual Zod inside handlers.
- **"Building your path…" is not on the session route at all.** It is [learn/page.tsx:191](apps/student-web/src/app/(app)/learn/page.tsx#L191) and [:222](apps/student-web/src/app/(app)/learn/page.tsx#L222), set just before `router.push`, and it persists visually across the navigation. The two strings in the symptom come from two different routes.

---

## Spec-vs-repo divergences

Design/architecture differences, **not bugs**. Listed for reconciliation, not repair. The repo is authoritative.

1. **The reference spec file does not exist.** `04-PETROS-LEARN-DYNAMIC-TEACHING.md` is absent from the repo. Nothing under `docs/` or `plans/` carries that name or that content.

2. **Two incompatible Learn architectures are specified, and both are implemented side by side.** `plans/02-learn-engine.md` describes a *fixed* pedagogy: a six-step "spine", exactly seven block types, an intent router, and a `concept_atoms` cache — explicitly not a move library. The Pedagogy Orchestrator spec describes ~18 discrete moves with entry conditions and no fixed template. The API carries **three** coexisting modules: [student/learn/](apps/api/src/modules/student/learn/) (Plan 02), [student/learn-ai/](apps/api/src/modules/student/learn-ai/) (Plan 02's provider layer, still used by the orchestrator), and [student/edrion-learn/](apps/api/src/modules/student/edrion-learn/) (the orchestrator). `learn_sessions.spine` and `session_plan` are NOT NULL leftovers of Plan 02 that the orchestrator writes as `[]` and a stub object ([:156-157](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L156-L157)).

3. **Moves library is a flat enum, not a library.** Spec: each move = renderer contract + generation template + entry conditions. Repo: a bare `z.enum` plus two hardcoded `switch`/`Record` maps. Entry conditions do not exist as data; move selection is entirely LLM-driven with a deterministic fallback.

4. **8 moves vs ~18.** Named in spec but absent: `hook`, `misconception_confrontation`, `predict_then_reveal` (partially survives as a `predict_prompt` field). Present in repo but not named in spec: `prereq_pulse` (≈ "prereq pulse-check"), `visual_spawn`, `artifact_commit` — these do map to spec moves.

5. **Topic Profiler produces the spec's 8 dimensions as a schema but not as a prompt.** The type exists; the instruction to fill it does not.

6. **Learner Model omits two of the spec's inputs entirely** — pace preference and per-move-type outcome statistics. Session context (time available, goal, emotional context) *is* captured, but `elapsed_minutes` is never incremented, so the time dimension is inert.

7. **Perf model differs fundamentally.** Spec: pipeline render of move 1 against plan of move 2, first block token < 1.5s. Repo: two sequential blocking JSON completions with no token streaming — only whole blocks cross the SSE boundary. The logger reserves `speculative` and `firstTokenMs` columns for the spec's design; nothing writes them.

8. **UI matches the spec's shape.** The session document is a vertical column of typed blocks with a progress bar, persistent composer, and artifact rail — not chat. This part conforms.

9. **`IMPLEMENTED-EDRION-LEARN.md` overstates completion.** It marks P1.4 "Orchestrator + SSE" and P1.6 "Session UI" as *Shipped*, and lists an eval harness (`packages/learn-evals`) gated on `LEARN_EVAL_AUTH_TOKEN`. The orchestrator's first block has never successfully reached a browser, given D1's determinism — which suggests the eval gate either never ran live or does not exercise the stream path.

---

## Suggested fix order

Not applied — reporting only, per instructions.

1. **D3 first**, even though it is not the root cause. One line at [useEdrionLearnSession.ts:102-105](apps/student-web/src/lib/hooks/useEdrionLearnSession.ts#L102-L105) to surface the real error code and message. Everything below is easier to confirm once failures are legible.
2. **D1** — the verdict. Set `lastEventSeq: 1` at [:169](apps/api/src/modules/student/edrion-learn/pedagogy-orchestrator.service.ts#L169), or add an atomic `nextEventSeq` helper.
3. **D2** — guard `blockV1Schema.safeParse` in `toDto` and skip/repair blocks stuck at `renderStatus: 'streaming'`. Existing poisoned rows (including this session's) need cleanup.
4. **D7** — add effect cleanup so StrictMode double-mount cannot race the sequence.
5. **D4** — wire `pathItemId` → topic resolution for independent users; `repo.getPathItem` already exists and is uncalled.
6. **D5, D10, D11** — the answer-path failures, which only become reachable once 1–3 land.
