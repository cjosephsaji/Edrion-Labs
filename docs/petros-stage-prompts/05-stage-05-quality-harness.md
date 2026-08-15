# Execution prompt 05 of 13 — Stage 5: teaching-quality evaluation harness

Use this prompt after Stage 4 passes the four-topic variety test. Build the quality harness before
adding the learner model. Do not implement Stage 6 personalization.

## Mission

Create a repeatable, versioned evaluation system that detects whether a prompt, model, routing rule,
topic-profile change, or code change improves or harms Petros’s teaching. It must run a fixed corpus
of roughly thirty diverse topics against scripted learner personas and score the resulting session
transcripts for move variety, correctness, pacing, stuck recovery, explainability, and artifact
quality. A developer must be able to change a prompt and immediately compare results against a
baseline.

This harness evaluates a teaching engine, not chatbot eloquence. A fluent answer with a repetitive
or pedagogically wrong session shape must score poorly.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 1–6, 10–12, and
   Stage 5.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect existing test/eval packages before creating a duplicate
   runner.
3. Verify Stage 4 profiles, cache behavior, full move set, and four-topic variety manually.
4. Inspect current CI, Vitest, fixture, seed, reporting, and package conventions.
5. Preserve unrelated worktree changes. Never place real student data, production credentials, or
   copyrighted source material without permission into the evaluation corpus.

## Evaluation corpus

Create a versioned manifest of approximately thirty topics spanning:

- conceptual, procedural, factual/memorisation, and skill-performance knowledge;
- concrete through highly abstract material;
- visual, symbolic, verbal, sequential, and comparative representations;
- low and high prerequisite density;
- low and high misconception richness;
- mathematical and nonmathematical subjects;
- strong and weak real-world anchors;
- multiple grades/academic levels and at least one mixed-language case;
- Learn, Revise, Repair, and short Doubt contexts where supported at this stage.

Each case needs a stable ID, goal, profile or expected profile dimensions, syllabus-safe grounding,
time budget, expected/forbidden move tendencies, critical facts/rubric anchors, and deterministic
seed. Store licensing/provenance for fixture content.

## Scripted learner personas

Implement deterministic persona drivers at minimum for:

- fast and confident;
- slow and careful;
- confidently wrong;
- disengaged/skipping;
- weak prerequisites;
- asks relevant detour questions;
- unsure but correct;
- repeated-struggle learner.

A persona is an interaction policy, not a personality stereotype. Define response accuracy,
confidence behavior, latency/skip behavior, question behavior, and recovery behavior. Ensure runs are
replayable and do not leak persona assumptions into production learner data.

## Runner architecture

Build a CLI/package/job that:

- creates isolated synthetic sessions through production-like PLAN/RENDER/OBSERVE interfaces;
- supports deterministic fixture mode and explicitly opt-in live-model mode;
- records prompt/schema/profile/model/routing/code version identifiers;
- applies stable random seeds where possible;
- caps tokens, cost, duration, and concurrency;
- can select cases/personas/functions and resume interrupted runs;
- stores run, case, turn/move, rubric, error, latency, usage, and artifact records;
- distinguishes product failures from evaluator/judge failures;
- redacts credentials and prevents synthetic data from polluting real learner models/analytics;
- produces machine-readable JSON and a human-readable comparison report;
- supports a baseline, candidate, and configurable regression thresholds;
- never silently updates the accepted baseline.

Live-model runs must use the Petros gateway and AI Routing configuration. Evaluator/judge calls must
also be registered AI Functions with independent routes, budgets, prompt/schema versions, and usage
metering. Where possible, use deterministic code-based metrics before an AI judge.

## Rubrics and metrics

Score and explain at least:

- factual/technical correctness and syllabus grounding;
- structural variety across topics and move-distribution diversity;
- appropriateness of move choice for profile, goal, time, and observations;
- prerequisite handling;
- guess-first and confidence mechanics;
- struggle-ladder correctness and success ending;
- Socratic two-probe cap;
- pacing, move count, first-content latency, and stop behavior;
- “Why this?” specificity and truthfulness;
- composer detour handling and return to goal;
- repetition and template-rhyme detection;
- artifact proposal quality and student-ownership compliance;
- safety/institution-boundary behavior;
- language/register quality without rewarding verbosity;
- cost, total latency, retries, fallbacks, validation failures, and cache effectiveness.

Each score must include evidence references to move/block IDs. Do not ask a judge for unexplained
single numbers. Calibrate judge prompts with clear anchors and include judge disagreement or
uncertainty. Version every rubric.

## Comparison and regression rules

- Compare candidate against an immutable selected baseline by total, dimension, topic, persona,
  function, provider/model, and failure type.
- Highlight statistically noisy/low-sample results rather than presenting false certainty.
- Define blocking regressions for correctness, stuck recovery, safety, provider leakage, tenant
  isolation, and schema validity.
- Define warning thresholds for variety, pacing, artifacts, cost, latency, and satisfaction proxies.
- Preserve raw evidence needed to reproduce a result.
- Provide a deliberate review/approve workflow for promoting a candidate to baseline with an audit
  record.

## Dashboard/reporting requirements

Add an authorized Petros Quality surface in the appropriate internal/Super Admin application:

- runs list with status, corpus/rubric/prompt/schema versions and spend;
- baseline-vs-candidate summary and regressions/improvements;
- topic × persona matrix;
- drill-down session transcript as typed moves/observations, not chat bubbles;
- score evidence and judge rationale summaries without hidden chain-of-thought;
- correctness, variety, pacing, artifact, stuck-recovery, cost, and latency charts;
- filters by function/provider/model/topic/persona/version;
- failed/incomplete run diagnostics and safe rerun controls;
- baseline promotion with permission, confirmation, and audit;
- exportable JSON/CSV report for engineering review.

Do not expose this synthetic harness to students. Do not mix its usage with production learner usage
without a clear `evaluation` environment/source dimension.

## Automated verification required

Test at least:

- corpus manifest/schema and coverage assertions;
- deterministic persona behavior and replay;
- synthetic isolation from production student data;
- metric calculations and evidence linkage;
- judge schema validation, retry/fallback, disagreement, and failure classification;
- budget/concurrency/time/token caps;
- interrupted run resume and idempotency;
- baseline immutability and authorized audited promotion;
- comparison math and blocking/warning thresholds;
- deliberate correctness, repetition, Socratic-cap, stuck-ladder, and provider-leak regressions are
  detected;
- dashboards respect permissions and tenant/privacy constraints;
- machine-readable and human-readable report generation;
- live-model usage is separately metered by evaluator and Petros functions.

Run a small smoke corpus in normal verification. Do not spend on all topic/persona combinations
without confirming the configured budget. Provide a dry-run cost estimate before a full live run.
Run package tests, typechecks, lint, and builds and report exact commands/results.

## Mandatory manual QA and dashboard acceptance

Automated rubric scores are not enough. Perform available browser checks and give a human reviewer:

1. **Smoke run:** Launch a small fixture-mode run from CLI/dashboard. Confirm progress, resume,
   completion, report generation, and zero contamination of production learner data.
2. **Live cost preview:** Select a small live-model subset. Confirm estimated maximum cost before
   start, budget enforcement during the run, and exact evaluation-source usage in Petros AI Routing.
3. **Baseline comparison:** Compare a candidate to baseline. Verify totals, topic/persona cells, and
   move-level evidence manually for at least one improvement and one regression.
4. **Deliberate bad prompt:** In a safe test version, introduce repetitive move behavior or a known
   factual defect. Run the subset and confirm the harness flags it. Restore the prompt afterward.
5. **Variety review:** Open four structurally different topics and visually inspect the typed move
   sequences. Confirm the diversity score reflects what a human sees.
6. **Stuck review:** Inspect the repeated-struggle persona. Verify hint → missing step → solution →
   reworded success and that the rubric links to those exact moves.
7. **Judge review:** Open several rubric judgments. Confirm evidence is specific, scores follow the
   published anchors, uncertainty is shown, and no hidden chain-of-thought or credential is exposed.
8. **Failure/retry:** Pause the judge’s primary provider or return malformed structured output.
   Confirm retries/fallbacks, clear run diagnostics, and no false product regression.
9. **Quality dashboard:** Check filters, matrix drill-down, versions, costs, latency, validation
   failures, export, and baseline-promotion permissions/audit.
10. **AI Routing dashboard:** Reconcile evaluator and teaching-function calls/costs with the quality
    run totals and correlation IDs.
11. **Access control:** Verify ordinary students/institution users cannot access synthetic transcripts
    or baseline controls.

Each manual step must name navigation/command, fixture, expected frontend, expected backend/report
records, failure criteria, and evidence to save.

## Definition of done

Stage 5 is complete only when a prompt/model/profile change can be compared immediately and
reproducibly against a protected baseline; critical regressions are reliably caught; evidence is
human-reviewable; costs are bounded and reconcilable; and the quality dashboard has been manually
validated.

## Final response contract

Return delivered scope, corpus/persona coverage, architecture/migrations, clickable files, exact
verification results, smoke-run report link/path, browser checks performed, a detailed human QA
runbook for CLI and dashboards, cost consumed/estimated, known limitations, Stage 6 prerequisites,
and `Stage 5 complete` or `Stage 5 not complete`.

