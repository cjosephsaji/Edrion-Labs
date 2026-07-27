# 04 — Petros Learn Pedagogy Orchestrator — HYPERSPEC 3/3: EVAL HARNESS, COST, CONFIG & POLICY HOOKS

> Companion to `04-PETROS-LEARN-DYNAMIC-TEACHING.md` §6, §8. Where this conflicts with the original, **this wins.** Depends on files 1–2. The eval harness is part of P1's definition of done — a session engine without it is not shippable.

## Constraints applied (from the codebase audit)
- Governance is the **existing `packages/copilot` `resolve-policy` engine** extended with a **student-tutor scope** (config + capabilities); the scope enum already carries `independent_user`. No second engine (§3).
- Cost/latency reports read `learn_ai_calls` (confirmed built) — the single call log; the harness adds no parallel logging (§1, §2).
- P3 Learning Policy hooks call `resolve-policy` with the student-tutor scope, reusing its per-scope mode, financial/user-impact caps, `twoPersonThreshold`, and per-scope kill switch (§3).

---

## §1. THE EVAL HARNESS (non-negotiable)

### 1.1 Shape
A repo package `packages/learn-evals` + a runner (`pnpm learn-evals run [--suite core] [--baseline <run_id>]`) executable locally and in CI (nightly + on any change to plan/render prompts, block schemas, move constraints, or model-tier config — enforced by a CI path filter). The runner drives the real `PedagogyOrchestratorService` through its public API against a seeded test DB — no mocked orchestrator; only external side effects (Chat 8 card service, Chat 9 pipeline) run against test doubles that validate contract shape.

### 1.2 Topic set — 30 topics across the profile grid (fixed, versioned in the package)
Coverage rule: every `knowledge_type` ≥ 6 topics; every `native_representation` ≥ 4; ≥ 8 high-`prerequisite_density`; ≥ 6 high-`misconception_richness`; ≥ 5 heavy-`math_load`. The canonical four (integration by parts, photosynthesis, French Revolution causes, Python for-loops) are in the set with their expected-shape assertions from the original's worked-contrast table. Each topic ships a **frozen `topic_profile` fixture** (evals never exercise the profiler's LLM call except in the dedicated profiler suite of 10 topics scored separately for profile plausibility).

### 1.3 Personas — 6 scripted students (deterministic response policies, not LLMs)
| persona | policy |
|---|---|
| `strong_fast` | 90% correct, always taps "show step", never expands deeper |
| `struggling` | 30% correct, fails prereq pulses, expands "simpler" once per session |
| `average_curious` | 60% correct, expands deeper 50%, asks 1 free question mid-session |
| `probe_escaper` | 60% correct, always taps "Just explain it" on probes |
| `time_poor` | 70% correct, 10-min budget, skips synthesis |
| `revision_mode` | 75% correct, `goal='revision'`, 20-min budget |
Answer correctness is drawn from a **seeded** RNG (fixed seed per run) so runs are reproducible; free-text answers come from per-topic canned pools (right/wrong variants).

### 1.4 Rubric — 6 dimensions, scored per transcript (decision 6 resolved)
Structural dimensions are computed deterministically from the transcript; content dimensions are scored by an LLM judge (mid model, temperature 0, rubric prompt versioned in the package) on 1–5.

| dimension | how scored | pass threshold |
|---|---|---|
| **Move diversity** | deterministic: distinct move types used / applicable move types for the profile; plus the four canonical topics must NOT share the same move sequence | ≥ 0.6 per session; canonical-four sequences pairwise distinct |
| **Constraint compliance** | deterministic: zero hard-constraint violations (probe cap, prereq placement, move cap, closing pair, retrieval-after-exposition) | 100% — any violation fails the run |
| **Pedagogical fit** | LLM judge: do moves match profile + persona (worked examples for procedural, remediation after failed prereqs, revision bias under `goal='revision'`)? | mean ≥ 4.0, no session < 3 |
| **Content correctness** | LLM judge: factual/mathematical correctness of explanations, questions, answer keys, `why_md` | mean ≥ 4.2, no session < 3; any answer-key error caps the session at 2 |
| **Artifact quality** | LLM judge on committed cards (atomic? front asks, back answers? source-linked?) + deterministic: ≥ 1 commit offered per session | mean ≥ 4.0 |
| **Latency & robustness** | deterministic from `latency_ms` + degraded-block count + speculative-plan discard rate | p95 render-first-token < 3s; degraded blocks ≤ 2% of blocks; discard rate < 30% |

### 1.5 Run mechanics
- Suite = 30 topics × 6 personas = 180 sessions per full run; `--suite core` = the canonical four × all personas (24 sessions) for fast pre-merge checks.
- Output: a run report (JSON + markdown) with per-dimension scores, deltas vs. `--baseline`, and the 5 worst transcripts inlined for human reading. Stored in the repo's eval-runs artifact store.
- **Regression gate (binding):** CI fails if any pass threshold is missed or any dimension mean drops > 0.3 vs. the pinned baseline. Prompts/models cannot merge without a green full run and a re-pinned baseline.

## §2. Cost controls (decision 5 resolved — binding defaults, all in config namespace `learn.*`)

| knob | default | note |
|---|---|---|
| `move_cap` | 14 planned moves/session | file 1 §4.2 |
| `profile_ttl_days` | 180 | overrides never expire |
| `plan_model_tier` | `small` | temperature 0, max_tokens 400 |
| `render_model_tier` | `mid` | streamed, max_tokens 1600 |
| `grade_model_tier` | `small` | short-text grading micro-call, max_tokens 120 |
| `judge_model_tier` (evals) | `mid` | |
| `profiler_model_tier` | `small` | max_tokens 600 |
| `max_free_questions_per_session` | 5 | 6th gets fixed copy: "Let's finish this lesson — then ask me anything in chat." |
| `daily_session_cap_per_user` | 12 | anti-abuse; 13th → 429 with calm copy |
| speculative planning | on | discardable; see file 1 §4.3 |
Per-call token inputs are bounded by construction (state ≤ 8 KB, last-3-blocks context, 4 KB atom context) — worst-case session ≈ 15 plan calls (small) + 14 render calls (mid) + ≤ 9 micro-grades (small) + 0–1 profile. No unbounded context anywhere. **Cost/latency reporting reads `learn_ai_calls`** (confirmed built): per-session and per-day token/latency rollups come from that table's rows (call_type, model, tokens, latency, flags) — no separate cost ledger.

## §3. Institution Learning Policy — hook points only (spec now, build P3), on the existing `resolve-policy` engine

The audit confirms `packages/copilot`'s `resolve-policy` already implements per-scope mode, financial/user-impact caps, `twoPersonThreshold`, and per-scope kill switches, and the scope enum already carries `independent_user`. Petros Learn does **not** add a policy engine — it adds a **student-tutor scope** (config + capabilities) and calls `resolve-policy` for it. Binding P1 obligations so P3 needs no refactor:

1. **Policy resolution seam is the real engine.** In P1, every session start and every plan cycle calls `resolve-policy({ scope: 'student_tutor', userId, institutionId? })`, which returns a `LearnPolicyV1` derived from the scope's config. P1 registers the student-tutor scope with a permissive default capability set → `{curriculum_bounds:'open', directness:'default', visibility:'none'}` for every user (independent tier and institution students alike, since Learning Policy config is P3). The result is stored in `session_context.policy_snapshot`. P3 is purely: populate the scope's per-institution config in the AI Control Center — the call site, schema, and snapshot already exist.
2. **Capabilities, not a fork.** The student-tutor scope declares capabilities like `curriculum_bounds`, `answer_directness`, `session_visibility` in the same capability grammar the admin-Copilot scopes use. P3 wires institution config to these capabilities; the kill switch on the scope instantly disables orchestrated tutoring for a tenant using the engine's existing mechanism — no Learn-specific kill code.
3. **Schema reservations already placed:** `session_context.policy_snapshot` is written day one (file 1 §1.2); the `system_notice` block already has `kind:'policy'` (file 1 §4.1) for the future "your institution limits Petros to your syllabus" card + wishlist queue; the session-screen footer disclosure region already reads `policy_snapshot.visibility` (file 2 §6), empty while it is `'none'`.
4. **Visibility is a read projection, never a write-path permission change:** all P1 endpoints stay owner-only; the P3 aggregate/transcript view is a new read model over `learn_sessions`/`session_blocks` gated by the scope's `session_visibility` capability.
5. **Assignment-overlap detection** (P3): `SessionContextV1` tolerates an optional `active_assignment_overlap: boolean` (Zod passthrough) — P1 always omits it; P3's move-weight preset (assessment-adjacent → retrieval/probe-weighted) reads it. The ERP overlap query itself is P3 work.
6. **`answer_directness` as move-weight, not refusal:** when P3 sets a "never solve homework directly" policy, it lands as a plan-input bias (probe/retrieval weighted during assignment windows), consistent with the original §6 — the planner already accepts weight hints, so P3 supplies values, not new plumbing.

## §4. Flagged for your review (genuinely strategic — everything else in these three files is decided)

*Audit note: the substrate is now bound to confirmed names (learn_attempts.evaluation, evidence_tags.polarity, learn_topics, visual_canvases, existing flashcard tables, resolve-policy + student-tutor scope, learn_ai_calls). None of that changed the flagged calls below — they remain product decisions, not plumbing ones.*

1. **"Why this?" tooltip pulled into P1** (file 2 §6). Original deferred it to P2; I ship it in P1 because the string is stored anyway and it's the cheapest differentiation on the demo path. Revert = hide one popover.
2. **No push notifications at all for Learn in P1** (file 2 §5) — even the Today nudge is feed-only. Aggressive quietness; consistent with the obligation contract, but if independent-tier activation lags, the first lever to reconsider is a push for the commitment nudge.
3. **Mastery has no decay term** (file 1 §6). FSRS owns forgetting for cards; mastery is a planner heuristic. If revision sessions feel mis-planned for long-idle topics, P2 adds a staleness penalty — flagging so its absence is a choice, not an oversight.
4. **Free-chat handoff trigger is a crude deterministic rule** (120 words / second follow-up + regex emotional detection). Deliberately dumb for P1 testability; the eval harness can't score a vibes-based trigger. P2 may model it.
5. **Move cap 14 / budget default 15 min** — cost-driven guesses. The eval harness's latency+cost report per run is the instrument to retune them; treat the first month's numbers as the review trigger.

## Acceptance criteria — Eval, Cost & Policy
1. `pnpm learn-evals run` completes 180 reproducible sessions (fixed seed) against the real orchestrator service and emits the run report.
2. Constraint compliance is 100% across all runs; a single hard-constraint violation fails CI.
3. The canonical four topics produce pairwise-distinct move sequences under the `average_curious` persona.
4. Changing a plan/render prompt or model tier without a green full eval run cannot merge (CI path filter proven by a test commit).
5. All `learn.*` knobs resolve through config at runtime; changing `move_cap` requires no deploy of new code paths.
6. Worst-case per-session LLM calls: ≤ 15 plan + 14 render + 9 grade + 1 profile; asserted from `learn_ai_calls` row counts, not a separate counter.
7. `resolve-policy` (student-tutor scope) is invoked on every session start and every plan cycle in P1 (verified by test spies), returning the permissive default policy; no second policy engine exists in the Learn module.
8. A 13th session in one day returns 429 with the calm-copy body; the 12 prior sessions are unaffected.
9. The eval report includes degraded-block rate and speculative-discard rate, and both are under thresholds on the pinned baseline.
10. Removing the judge model (simulated outage) fails the eval run loudly rather than silently passing structural checks only.
