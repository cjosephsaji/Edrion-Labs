# Tier 2 Plan — Edrion Learn

## 1. Feature summary

**Petros answers; Edrion Learn teaches.** Petros is the summonable chat assistant for quick answers. Edrion Learn is a distinct, stateful teaching product that plans and adapts a bounded lesson, collects evidence, updates mastery, and proposes durable Library/Canvas artifacts only after review. This is a clean rebuild of teaching/session code, but it deliberately reuses the deployed Learn data, Library FSRS, Graph Pipeline, ledger, AI-call, policy, and Today substrates. Independent learners ship first and are first-class: their self-declared goal drives the plan/Today obligations, and “Teach me this document” is a primary entry point.

## 2. Spec Amendments and resolved audit flags

### 2.1 Naming and product boundary

- Every hyperspec occurrence of “Petros Learn” means **Edrion Learn**. New modules, symbols, analytics, copy, and docs use `edrion-learn`/`learn`; `Petros` is reserved for chat-assistant UI and handoff.
- The old fixed teaching/session implementation is removed. Shared platform tables and cross-product services are not.
- A Petros chat answer may offer one deterministic handoff card into Edrion Learn. Petros must not silently run a multi-turn teaching sequence. Edrion Learn may open Petros for free-form chat, but their histories/surfaces remain identifiable.

### 2.2 Exact delete/rebuild list

Delete these old teaching/session implementations after the new route/API parity tests exist in the same PR; do not preserve their prompts, sequence logic, or renderer components:

**API teaching code**

- `apps/api/src/modules/student/learn/sessions.controller.ts`
- `apps/api/src/modules/student/learn/sessions.service.ts`
- `apps/api/src/modules/student/learn-ai/planner.service.ts`
- `apps/api/src/modules/student/learn-ai/block-generator.service.ts`
- `apps/api/src/modules/student/learn-ai/pedagogy-matrix.ts`
- `apps/api/src/modules/student/learn-ai/prompts/planner.prompt.ts`
- `apps/api/src/modules/student/learn-ai/prompts/blocks.prompt.ts`
- Their teaching-only specs/fixtures and provider registrations.

**Student-web teaching routes/components/state**

- `apps/student-web/src/app/(app)/learn/session/[id]/page.tsx`
- `apps/student-web/src/app/(app)/learn/session/[id]/concept/[blockId]/page.tsx`
- `apps/student-web/src/app/(app)/learn/session/[id]/practice/[blockId]/page.tsx`
- `apps/student-web/src/components/learn/BlockCard.tsx`
- `BlockContinue.tsx`, `BlockRenderer.tsx`, `CompletionOverlay.tsx`, `GraphCanvas.tsx`, `HintLadder.tsx`, `SpineRail.tsx`, `StreamingIndicator.tsx`
- `apps/student-web/src/components/learn/blocks/Checkpoint.tsx`, `ConceptCard.tsx`, `NoteCard.tsx`, `PracticeLauncher.tsx`, `VisualExplainer.tsx`, `WorkedExample.tsx`, `WrapUp.tsx`
- `apps/student-web/src/lib/hooks/useLearnSession.ts`
- `apps/student-web/src/lib/learn-navigation.ts`
- `apps/student-web/src/lib/learn-session-types.ts`

**Shared schemas replaced in place**

- Replace the teaching contracts exported by `packages/schemas/src/student/session.ts` and `packages/schemas/src/student/blocks.ts` with the new orchestrator/session/block contracts. Do not leave old and new public exports side-by-side.

`apps/student-web/src/components/learn/MathText.tsx` is a generic sanitized Markdown/KaTeX renderer and may be retained after verifying it contains no old teaching behavior.

### 2.3 Consume/retain list

These are shared or durable substrates and must not be deleted/recreated:

- Tables in `packages/database/src/schema/learn.ts`: `learn_topics`, `concept_atoms`, `learning_paths`, `learning_path_items`, `learn_sessions`, `learn_session_blocks`, `learn_attempts`, `evidence_tags`, `learn_ai_calls`, and revision state tables.
- `learn_attempts.evaluation jsonb` and existing `block_id`; do not add a duplicate `session_block_id`. New readers expose it as `blockId`.
- `evidence_tags.polarity`; quiz/Library evidence remains compatible.
- `learning_paths.goal jsonb`: formalize the self-declared goal there; do not add a goals table. Existing `{goalStatement,constraints,weeklyMinutes}` values need a compatibility parser/backfill.
- `learning_events`, `LearningEventsWriter`, and the Graph visual-memory diff algorithm; extend their transaction seam, do not fork a Learn ledger.
- `visual_canvases`/revisions and the frozen Graph contract; Learn never stores graph JSON in its own format.
- Existing Library deck/flashcard/FSRS tables and curation sheet; Learn never owns cards.
- `learn-ai/provider.ts`, OpenAI/null providers, `budgets.service.ts`, `learn-ai-call.logger.ts`, and `evaluator.service.ts`, because quizzes, Library, Mock Exams, Debate, and visuals use them.
- `learn-ai/learn-ai.module.ts` remains shared; replace old teaching providers with new orchestrator providers rather than deleting the module.
- Petros quick/chat: `learn/quick.*`, quick prompt/route, Petros conversation tables/services, and `AskPetrosDrawer.tsx`.
- `homework-policy.port.ts` and Petros ask prompt if still chat-owned.
- `path.*`, `revision.*`, `history.*`, `notes.*`, `streaks.*` retain their durable purpose and are adapted to the new start/state contract.
- Tier 1 Today `Obligation`, `user_obligations`, `feed_events`, and preferences; add a provider, not a second feed.

### 2.4 Human-decision boundary—recommendation

These files serve both products or sit on the boundary and must be split/refactored, not blindly deleted:

- `learn/ask.controller.ts`, `ask.service.ts`, and `AskPetrosDrawer.tsx`: keep Petros Q&A; replace its dependency on old `SessionsService` for “pin to lesson” with a narrow Edrion Learn artifact/handoff port.
- `learn-ai/router.service.ts`, router prompt, and `packages/schemas/src/student/intent.ts`: split deterministic chat-vs-session handoff from old lesson routing. Recommendation: Petros owns intent/handoff; Edrion Learn owns all pedagogy decisions.
- `learn/path.service.ts` and prompt: keep CRUD/storage over `learning_paths`, but rewrite goal planning and session-start integration under Edrion Learn terminology.
- `learn/revision.service.ts`: keep queue semantics; replace only old-session construction.
- `learn/history.service.ts`: keep combined user history; tag entries by product and update new session states/routes.
- `apps/student-web/src/app/(app)/learn/page.tsx`: recommendation is Edrion Learn home/goal surface. Move the quick-answer composer into the Petros assistant surface; do not present both as one product.

### 2.5 Schema and policy corrections

- Hyperspec §1.0’s `owner_kind/user_id` form does not match the repository. Use the established columns: institutional personal row = `institution_id + student_id`; independent personal row = `independent_user_id` only. Institution-shared configuration/profile rows use `institution_id XOR independent_user_id` when an independent-scoped cache is needed. Never introduce auth `user_id` as a competing owner key.
- `learn_sessions` already has a legacy `status` used by the old flow. Add `orchestrator_status` during coexistence; once old code is deleted, keep legacy status as a compatibility projection until all readers migrate. Do not reinterpret it in-place mid-rollout.
- `learn_session_blocks` is the real table name. Keep it.
- `concept_atoms` has no `updated_at`, although profile invalidation depends on it. Add/backfill `updated_at` and update all mutation paths.
- `learn_ai_calls` has `purpose`, `model`, input/output tokens, `cached`, `duration_ms`, and `error`, but not session/block/prompt/flag fields. Reuse `purpose` as call type; add nullable context/flags rather than a second log.
- `packages/copilot/src/resolve-policy.ts` does not currently have a `student_tutor` scope/capability grammar. Existing `ai_policies` resolves owner layers, modes, boolean `AiCapability`s, caps, and kill switches. Extend that engine with a policy domain and typed domain config; do not call a fictional existing scope and do not add a Learn-local engine.
- P1 still calls `resolveStudentTutorPolicy` at session start and every planning cycle. It resolves a seeded global permissive default `{curriculum_bounds:'open',answer_directness:'default',session_visibility:'none'}`. P3 adds institution configuration only.

### 2.6 Strategic calls resolved (Eval/Policy §4)

1. Ship “Why this?” in P1 from stored plan reasoning; accepted.
2. No Learn push notifications in P1; accepted. A real goal-derived Today signal may create at most one feed nudge/day.
3. No mastery decay in v1; accepted. FSRS handles card forgetting; revisit with measured idle-session quality.
4. Deterministic Petros→Learn handoff trigger; accepted for P1 and covered by fixtures.
5. Move cap 14/default 15 minutes; accept as configurable launch defaults, with eval/cost reports as review trigger.

## 3. Dependencies and contracts

### Hard dependency

Graph Pipeline must be merged, including `PLAN-GRAPH-JSON-CONTRACT.md`, before Edrion Learn implementation begins. `visual_spawn` calls `CanvasGraphService.generateForSession`; no fallback graph type is permitted.

### Prior-tier reads

- Today: `packages/schemas/src/obligations.ts`, `GET /student/today`, and provider merge in `TodayService`.
- Library/FSRS: existing flashcards/decks/reviews, knowledge item/chunk grounding, standard curation sheet.
- Learn durable tables and shared AI provider/log/budget services listed above.
- Feature visibility uses `student.surface.learn`; add rollout flag `learn.orchestrator` under the same Global→Plan→Institution→Campus→User resolver. Because old teaching code is deleted, kill means a calm unavailable state/Petros quick-answer option, not routing back to the old flow.
- Policy: extend `packages/copilot` and existing `ai_policies`; global kill switch remains authoritative.
- Graded evidence readers/writers retain `{input,evaluation,hints_used}` and `evidence_tags.polarity` compatibility.

### Exposes downstream

- Stable session-entry contract for Mock remediation and future Entrance Prep: `{entryPoint,topic/knowledgeItemId,goal,sessionContext}`.
- Learner mastery/profile snapshots and replayable model events.
- Owner-only Edrion Learn session API/SSE, plus P3 visibility read projections controlled by policy.
- Learn-generated canvas links and Library artifacts through their owning modules.

## 4. Implementation phases

### P1.1 — Migrations and canonical schemas (Core §1, §4.1, §4.4–§6)

**Goal:** merge all additive storage first, preserving current rows and other writers.

**Files**

- Add `packages/database/migrations/0096_edrion_learn_orchestrator.sql`; modify `packages/database/src/schema/learn.ts`, migration journal/grants/RLS.
- Add schemas under `packages/schemas/src/student/edrion-learn/`: `goal.ts`, `profile.ts`, `policy.ts`, `plan.ts`, `blocks.ts`, `state.ts`, `mastery.ts`, `api.ts`, `events.ts`; replace old exports from `student/session.ts` and `blocks.ts` once consumers migrate.

**Existing-table extensions**

- `concept_atoms.updated_at timestamptz NOT NULL DEFAULT now()`; backfill from `created_at`; mutation code must touch it.
- `learn_sessions`: add `entry_point text` CHECK (`learning_path|free_chat_handoff|library_document|review_queue|goal|prep_countdown|bad_result|upcoming_exam`), `orchestrator_status` CHECK (`created|active|awaiting_response|paused|closing|closed`), `state jsonb NOT NULL DEFAULT '{}'`, `session_context jsonb NOT NULL DEFAULT '{}'`, `policy_snapshot jsonb NOT NULL DEFAULT '{}'`, `time_budget_minutes integer`, `elapsed_minutes integer DEFAULT 0`, `checkpoints_total/done integer DEFAULT 0`, `plan_move_count integer DEFAULT 0`, `end_reason text NULL`, `active_key text NULL`, `last_event_seq bigint DEFAULT 0`, and timestamps needed for the state machine. Backfill legacy rows as closed/legacy-compatible; do not replay them through the new planner.
- Enforce at most one non-terminal orchestrated session per owner with two partial unique indexes: student ID where non-terminal and independent user ID where non-terminal. Include `entry_point IS NOT NULL` so legacy rows do not block.
- `learn_session_blocks`: retain `block_id` relations; add `move_type`, `block_schema_version DEFAULT 1`, `reasoning`, `degraded boolean`, `interaction_state jsonb`, `stream_seq bigint`, `render_status`, and `updated_at`; unique `(session_id,sequence)` and `(session_id,stream_seq)`.
- `learn_attempts`: add partial unique `(session_id,block_id,(input->>'question_id'))` for new question attempts, or a concrete nullable `question_id text` with unique `(session_id,block_id,question_id)` if expression-index ergonomics are poor. Do not add duplicate session-block FK.
- `learn_ai_calls`: add nullable `session_id` FK set-null, `block_id` FK set-null, `block_seq`, `prompt_version`, `retry boolean DEFAULT false`, `speculative boolean DEFAULT false`, `degraded boolean DEFAULT false`, `outcome`, and `first_token_ms`; keep `purpose`, `duration_ms`, tokens, and grants/append-only behavior.

**New tables**

- `learn_topic_profiles`: UUID PK; `learn_topic_id` nullable FK, `topic_key`, owner scope (`institution_id XOR independent_user_id`, both null allowed only for global/system cache if explicitly approved), typed profile JSON, `source` CHECK `generated|human_override`, `model`, `prompt_version`, `expires_at`, timestamps/version. Partial unique by `(institution_id,learn_topic_id/topic_key)` and `(independent_user_id,...)`; human overrides never expire.
- `learner_mastery`: UUID PK; `student_id` XOR `independent_user_id`; `atom_id` FK; `rating integer 400..2400 DEFAULT 800`, `attempts`, `correct_weight`, `last_attempt_at`, version/timestamps. Partial unique owner+atom indexes.
- `learner_model_events`: UUID PK; owner columns, `session_id`, `attempt_id`, `atom_id`, `event_type`, `payload` containing before/after/K/difficulty/outcome, `idempotency_key`, `occurred_at`; append-only and partial unique owner+idempotency key. This is replay provenance, not an alternate event feed.
- `learn_session_events`: UUID/monotonic sequence per session, event type/payload/created_at, unique `(session_id,seq)`, used for state audit and SSE replay. Cascade with uncommitted session history; Library/Canvas artifacts remain independent.

**SelfDeclaredGoalV1**

Store in `learning_paths.goal`: `{v:1,statement,outcome?,constraints:[],weekly_minutes,target_date?,preferred_days?,default_session_minutes,source:'self_declared'|'document'|'prep',created_at,updated_at}`. Parse existing `{goalStatement,constraints,weeklyMinutes}` and backfill losslessly. It is the primary independent planning/obligation signal, not a decorative field.

**Definition of done**

- Forward/backward compatibility fixtures cover existing quiz/Library attempts, evidence tags, paths/goals, legacy sessions, and AI logs.
- Owner CHECK/RLS/partial uniqueness tests cover institutional and independent rows.
- State/block/policy/goal schemas are strict/versioned; no old/new parallel session schema exports remain.

### P1.2 — Policy domain seam and permissive default (Eval/Policy §3)

**Goal:** make every P1 decision policy-aware before institution UI exists.

**Files**

- Modify `packages/copilot/src/resolve-policy.ts`, policy types/tests, `packages/database/src/schema/ai.ts` (the actual `ai_policies` schema file), and the P1 migration if still unmerged; otherwise a consecutive migration.
- Add API governance adapter `apps/api/src/modules/student/edrion-learn/student-tutor-policy.service.ts`.

**Design**

- Extend `ai_policies` with `policy_domain text NOT NULL DEFAULT 'copilot'` and `domain_config jsonb NOT NULL DEFAULT '{}'`; update uniqueness/indexes to include domain. Existing rows remain domain `copilot` unchanged.
- Add domain `student_tutor` and `LearnPolicyV1`: curriculum bounds (`open|institution_curriculum|assigned_material_only` plus allowed/wishlist metadata), answer directness (`default|guided|never_direct_on_assignment`), session visibility (`none|aggregate|transcript`), effective kill/mode, resolved layers, and version.
- Reuse owner-layer precedence and OR kill-switch semantics. A domain adapter merges typed values; do not force string settings into the boolean `AiCapability` enum.
- Seed one global enabled permissive `student_tutor` policy. Independent users never require institution config.
- `resolveStudentTutorPolicy(principal,context)` calls the real base resolver and returns a snapshot. Session start and every plan cycle invoke it; plan-cycle resolution may hit a short TTL cache keyed by policy version but cannot reuse a stale snapshot after a kill switch.

**Definition of done**

- Spies prove start and every plan call resolve policy. Kill test blocks the next plan immediately and emits a policy notice/close without corrupting the session.
- Existing Copilot policy fixtures remain byte/behavior compatible.
- No service under Edrion Learn queries `ai_policies` directly.

### P1.3 — Profiles, learner model, and atomic evidence (Core §1.1, §1.3–§1.6, §6)

**Goal:** create cached topic understanding and replayable adaptation.

**Files**

- New module `apps/api/src/modules/student/edrion-learn/` with profile, mastery, evidence, repository, constants, and specs.
- Extend `LearningEventsWriter` strict transaction path and add the visual-memory observation adapter agreed in Graph Pipeline.
- Add BullMQ mastery backfill processor.

**Behavior**

- Profile lookup prefers `learn_topic_id`, falls back to normalized `topic_key`; valid hit causes zero profiler calls. Expired generated profiles serve stale while one idempotent refresh runs. `human_override` never expires. Refresh when `concept_atoms.updated_at` or prompt version is newer.
- Profile schema retains knowledge type, native representation, prerequisites, misconception richness, math load, and pedagogy weights. Every profile call logs purpose/model/prompt version/tokens/latency/outcome.
- Elo-lite update exactly: difficulties 1100/1300/1500; expected probability formula; K=32 for <10 attempts else 16; hinted correct uses half K; clamp rating 400..2400; display `(r-800)/800` clamped 0..1; null evaluation makes no update.
- One transaction inserts/returns the idempotent `learn_attempts` row, evidence tag, mastery update, learner model event, and strict `learning_events` entry. Duplicate answer returns stored evaluation and creates nothing.
- Backfill replays attempts chronologically, reads `evaluation` first, `polarity` fallback, and checkpoints progress. Re-run is no-op via stable event idempotency key.

**Definition of done**

- Profile cache/invalidation/override and exactly-one-call tests pass.
- Replay reproduces mastery exactly; concurrent duplicate answers yield one complete writeback set.
- Failure injection rolls back all critical writebacks; best-effort analytics behavior elsewhere is unchanged.

### P1.4 — New pedagogy orchestrator and SSE (Core §2–§5)

**Goal:** replace fixed teaching with bounded, validated move planning.

**Files**

- Add `pedagogy-orchestrator.service.ts`, `session-state.service.ts`, `move-planner.service.ts`, `block-renderer.service.ts`, `learn-stream.service.ts`, new controller/repository/prompts under `student/edrion-learn/`.
- Register in student module and shared Learn AI module; remove old providers/controller/service in the same merge-safe sequence.

**Move/block contract**

- Moves: `direct_explanation`, `worked_example`, `retrieval_check`, `prereq_pulse`, `visual_spawn`, `synthesis`, `artifact_commit`, `socratic_probe`.
- Blocks: explanation (180-word base/250 deeper), worked example 3–6 steps, 1–3 question set, Graph canvas embed, synthesis, artifact commit <=6 cards, probe, and system notice. Sanitized Markdown/KaTeX only; no raw HTML.
- Enforce: exposition before retrieval unless revision; prereq pulse only moves 1–2 and not low density; two wrong forces remediation and adds a checkpoint; probe chain max two turns; free questions max five; move 14 forces synthesis→artifact commit→close; time budget wrap flag at minus 3 minutes and close at budget, one +5 extension.
- Every `PlanV1` is strict-parsed; retry once with errors; deterministic base explanation on second failure/hard-rule violation. Renderer strict-parses streamed block, retries once, then safe degraded explanation. Speculative next-plan may start at render start, but is discarded/replanned when outcome invalidates it and logged as speculative/discarded.
- Planner receives state digest <=8KB, profile, mastery, policy, hard rules, and recent outcome—not transcript/block content. Renderer receives relevant atoms/material chunks and last three blocks within bounded context.

**State machine/API**

- State is `created→active⇄awaiting_response→closing→closed`, pause/resume, any nonterminal close, paused 24h abandonment. Transition + audit/session event are one transaction.
- `POST /student/learn/sessions` body discriminated by entry point and accepts `topicKey|entry`, `knowledgeItemId?`, `pathItemId?`, `goal?`, `timeBudgetMinutes?`, `sessionContext?`; required UUID idempotency. Return 201 `{session,streamUrl}`; active conflict 409 includes active ID.
- `GET /student/learn/sessions/:id`; `GET /:id/stream?lastSeq=` SSE/reconnect replay.
- `POST /:id/blocks/:blockId/answer`, `/interact`; `POST /:id/ask`, `/commit`, `/pause`, `/resume`, `/end`. Mutations require idempotency and/or expected interaction/session version as appropriate.
- Every route owner-only in P1 and authorizes institutional tenant/independent owner.
- Visual spawn imports the frozen Graph schema/service only. Hard failure/timeout produces text fallback; timeout’s canvas may still land in Lab.

**Definition of done**

- All Core Engine 1–16 acceptance cases have contract/integration tests, including no third probe, remediation segment, move cap, policy calls, SSE gap-free reconnect, one active session, atomic evidence, and graph fallback.
- Chaos tests kill the stream/worker between each state transition and recover without duplicate blocks.
- Old teaching code/prompts are gone; Petros quick/chat tests remain green.

### P1.5 — Independent entry, goals, document teaching, and Today (UI §5, §8)

**Goal:** ship a useful independent-first product without institution configuration.

**Files**

- Rebuild `/learn`, `/learn/path`, `/learn/revision`, and hooks around new contracts.
- Add goal editor/plan components and Library “Teach me this document” action.
- Extend `TodayService` with an Edrion Learn goal provider; update obligation schemas only if a new typed source field is necessary.

**Behavior**

- First-run asks what the learner wants to achieve, captures `SelfDeclaredGoalV1`, creates/updates an active learning path, proposes an editable weekly plan, and never requires institution/curriculum selection.
- Goal is the primary independent obligation source: Today synthesizes `kind='study_block'` from the active path’s next incomplete item and schedule, stable ID `self:learn-goal:{pathId}:{itemId}:{localDate}`, deep link into the goal/session, and source `learn`. Completion/path progress removes/completes it. Do not duplicate it into `user_obligations` unless user explicitly edits it as a personal task.
- “Teach me this document” from a Library item creates a `library_document` session grounded to the existing knowledge item/chunks and stores `grounding_knowledge_item_id`; citations include page numbers. Missing indexing offers retry/index status, not ungrounded invention.
- Petros handoff rule is deterministic (long answer/second follow-up/emotional regex as frozen fixture) and shows an explicit Edrion Learn card. No automatic start.
- Independent P1 uses global permissive policy and `student.surface.learn`/`learn.orchestrator`; no institution admin UI.
- No Learn push. Goal-derived Today nudge is feed-only, real-signal-only, max once/day through existing Today preference claim logic.

**Definition of done**

- Independent signup→goal→Today→session and Library document→grounded session E2E pass.
- Institutional student still enters under permissive policy but no institution config is exposed.
- Petros/Edrion Learn copy and analytics are distinct everywhere.

### P1.6 — Session document UI and artifacts (UI §1–§4, §6–§7)

**Goal:** render the new block stream as a calm, resilient teaching document.

**Files**

- Rebuild session route and new `components/edrion-learn/*`; keep generic `MathText` only after audit.
- Reuse Graph inline canvas and Library curation components via adapters.

**UX details**

- Immediate top bar, static-then-halfway countdown, 4px segmented checkpoint progress that can add but never lose segments, max-width 640px stream, persistent “Ask anything…” composer, artifact rail.
- First skeleton within 300ms, first token target <1.5s. At 8s stream-start failure show exact calm Retry/Back card; retry reuses the existing session.
- Implement each block exactly: deeper expand without LLM; worked-step prediction; locked two-step MCQ and neutral null grade; amber-not-red wrong states; remediation lead copy; live 240/320px Graph embed; two-turn probe with “Just explain it”; synthesis/skip; review-before-save cards/canvas; policy/budget/break/degraded notices.
- Store “Why this?” reasoning and show an info popover on every block, with fixed degraded explanation when needed.
- Respect user scroll: if scrolled up, never force-scroll; show “↓ New”. Offline keeps blocks readable, disables writes, queues safe answer mutations, and reconnects from last sequence.
- Exit/end sheet clearly states committed Library/Canvas artifacts persist. Completion appears for every non-abandoned close, including degraded sessions.

**Definition of done**

- UI §1–§4 and acceptance 1–14 covered across mobile/desktop/keyboard/screen reader/reduced motion/offline.
- No old renderer component is imported. Flashcards/canvases save only through owner APIs after explicit review.

### P1.7 — Required 180-session eval/cost gate (Eval §1–§2; P1 release blocker)

**Goal:** make adaptive quality measurable before P1 ships.

**Files**

- Add workspace `packages/learn-evals` with CLI, 30 frozen topic/profile fixtures, six scripted personas, seeded response engine, transcript adapters, rubric/judge prompts, report writer, baseline, and specs.
- Add `pnpm learn-evals run`, `--suite core`, `--baseline`, CI workflow/path filter, and artifact upload.

**Required suite**

- Full = 30 topics × 6 deterministic personas = 180 real-orchestrator sessions. Core = canonical four × six = 24.
- Coverage: every knowledge type >=6; native representation >=4; >=8 high prerequisite density; >=6 high misconception richness; >=5 math-heavy. Canonical integration-by-parts/photosynthesis/French-Revolution/Python-loop profiles and expected shape are frozen.
- Personas and probabilities exactly match spec: strong_fast 90%, struggling 30%, average_curious 60%, probe_escaper 60%, time_poor 70%/10min, revision_mode 75%/revision; seeded RNG/canned free text.
- Six dimensions: deterministic move diversity and 100% constraint compliance; judged pedagogical fit mean >=4/no session <3, correctness mean >=4.2/no session <3 with answer-key cap 2, artifact mean >=4; latency first-token p95 <3s, degraded blocks <=2%, speculative discard <30%.
- Emit JSON + Markdown, deltas vs pinned baseline, five worst transcripts. Judge outage fails loudly. Full gate fails any threshold or mean regression >0.3.
- Prompt/model changes require a green full run and intentional baseline repin. Call-count assertion reads `learn_ai_calls`: <=15 plan, 14 render, 9 grade, 1 profile.

**Definition of done**

- All Eval acceptance 1–10 pass; CI path-filter proof is checked in.
- P1 does not ship without a pinned full 180-session green baseline. This is part of P1, not post-launch work.

### P2 — Institutional context signals and result/exam entries (Core entry-point additions; UI §5)

**Goal:** add context without changing the P1 engine/storage.

**Migration first:** if new indexed references are required, add the next migration before API. Prefer `session_context` versioned optional IDs and existing marks/exam/assignment tables; do not duplicate them.

**Work**

- Add deterministic entries for bad released result, upcoming exam, prep countdown, and review queue. Read Tier 1 `mark_release_batches`/published grade entries, timetable/exam schedule, and Library due cards through their owning services.
- Add optional `active_assignment_overlap` context and move-weight bias. It never changes ownership or permits staff writes.
- Path/revision/history UI points into new sessions; path-item completion parity remains.
- Extend eval topics/personas/fixtures for P2 contexts before rollout.

**Definition of done**

- Unreleased marks never become session context. Context-source authorization and tenant tests pass.
- P1 independent flows and policy seam remain unchanged; P2 is gated independently.

### P3 — Institution Learning Policy and visibility (Eval/Policy §3)

**Goal:** populate the already-used policy domain and add controlled read projections.

**Migration first:** add only indexes/audit/read-model storage proven necessary; no second policy/session table.

**Files/surfaces**

- Extend the existing AI Control Center in institution web/API to edit `student_tutor` domain config with versioning, permission, recent-auth for kill switch, audit, and effective-policy preview.
- Curriculum bounds, directness, visibility, assignment overlap, and wishlist behavior render through policy notices/disclosure already reserved in P1.
- Add aggregate/transcript read APIs only for policy visibility `aggregate|transcript`, permission-gated and audited. They are projections over owner session data; institution never mutates session/artifacts.

**Definition of done**

- Policy precedence, kill immediacy, independent no-institution behavior, tenant isolation, aggregate privacy thresholds, transcript access audit, and “directness is weighting not refusal” tests pass.
- No P1 call site changes are required to activate P3 config.

### Closeout phase

- Remove compatibility route/status projections only after all consumers migrate and telemetry shows no use.
- Write `IMPLEMENTED-EDRION-LEARN.md` (or a named root section under the active convention) with P1/P2/P3 built status, clean-delete proof, retained shared substrates, policy-domain design, goal/Today contract, Graph/Library contracts, eval baseline/run command, deviations, flags, migrations, and Tier 3 entry payload.

## 5. Risks and landmines

| Risk | Guard |
|---|---|
| Shared Petros/quiz/Library code deleted | Exact delete/consume lists, boundary split, pre-delete import graph and cross-product test suite. |
| Edrion Learn invents graph JSON | Hard dependency and direct import of frozen Graph schema/service. |
| Unbounded Socratic/free-question loops | Server hard constraints: 2-turn probe, 5 free questions, 14 moves, time budget. |
| Plan/render cost explosion | Bounded contexts/tokens, cached profiles, config caps, call log, 12 sessions/day, eval gate. |
| Policy seam is fictional/forked | Extend existing domain resolver; adapter tests at every plan; global kill test. |
| Half-written evidence/mastery | One DB transaction with strict ledger writer and idempotent attempt key. |
| Profile cache never invalidates | Add atom `updated_at`, prompt version, stale-while-revalidate lock. |
| Independent user treated as tenant student | Repository owner-XOR convention and first-class independent E2E. |
| Goal is stored but not operational | Today provider/path plan consumes the exact versioned goal; obligation E2E. |
| “Teach document” hallucinates | Require indexed Library grounding, bounded chunks/page citations, fail calmly if unavailable. |
| Speculative plans leak after state change | Generation token/version, discard outcome flag, never persist/render stale block. |
| SSE duplicates/gaps | Monotonic session events, Last-Event-ID/lastSeq replay, idempotent block IDs. |
| Old session fallback contradicts clean rebuild | Rollout kill shows unavailable/Petros option; never route to deleted engine. |
| Staff visibility expands silently | P1 owner-only; P3 typed policy projection, permission, privacy, audit. |

## 6. Acceptance and closeout checklist

- Map Core acceptance 1–16, UI acceptance 1–14, and Eval/Cost/Policy acceptance 1–10 to tests/manual QA with evidence in the closeout record.
- Confirm exact old teaching files removed and every consume/boundary file accounted for.
- Confirm P1 independent goal and Library document flows, permissive real-policy resolution, zero Learn push, Today max-one nudge, and 180-session green baseline.
- Confirm every LLM call is in `learn_ai_calls`, every plan is validated/retried/fallback-safe, every graded answer is atomic/idempotent/replayable, and no transcript enters planner context.
- Confirm Graph and Library artifacts use owning services and survive session deletion/end.
- Confirm terminology and analytics distinguish Petros chat from Edrion Learn teaching.
- Closeout documents downstream remediation entry payload, learner model read contract, policy visibility behavior, migrations/rollbacks, budgets/dashboards, and all accepted strategic decisions/deviations.
