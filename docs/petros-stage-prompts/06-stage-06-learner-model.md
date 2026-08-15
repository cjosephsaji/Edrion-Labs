# Execution prompt 06 of 13 — Stage 6: structured learner model

Use this prompt only after the Stage 5 quality harness has a trustworthy baseline. Complete learner
modeling and personalization; do not build Stage 7 artifact persistence or Stage 11 reflection UI.

## Mission

Implement a structured, explainable learner model containing mastery per concept, per-move outcome
statistics, pace/depth inference, error fingerprints, and confidence calibration inputs. Feed a
bounded snapshot of this model into PLAN. Two students studying the same topic must receive
measurably different sessions for reasons traceable to their histories.

Do not store “memory” as chat transcripts. Do not infer sensitive traits, diagnose mental health,
or create opaque ability labels. Personalize teaching decisions, not human worth.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 1, 2, 4.2, 6,
   9, 10, and Stage 6.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect observations, topic profiles, planning logs, and the
   quality harness.
3. Run the Stage 5 smoke baseline and confirm the harness can catch a deliberate personalization
   regression.
4. Inspect all existing Edrion answer/result/quiz/mock/session sources and identity/tenant models.
   Extend a shared learning-event model instead of creating per-feature silos.
5. Preserve worktree changes and comply with privacy, retention, audit, and permissions conventions.

## Learner-model schema

Create versioned structured records for at least:

### Mastery per concept

- canonical concept/topic ID and prerequisite graph linkage;
- estimated mastery with a documented scale and uncertainty/confidence;
- evidence count and evidence-source breakdown;
- last touched, recency/decay inputs, and next useful review window;
- separate demonstrated recall/application evidence where appropriate;
- model/algorithm version and last-update event ID.

### Move outcomes

- student + move type + topic/profile dimension aggregates;
- pre/post evidence, success/failure/skip, response time, hint use, and confidence change;
- sample size and uncertainty so one interaction cannot overpersonalize;
- recency weighting and algorithm version.

### Pace and depth

- observed skip/expand/read/response behavior;
- inferred bounded preference with uncertainty and minimum evidence thresholds;
- current-session temporary preference separate from durable history.

### Error fingerprint

- concept gap, prerequisite gap, procedural/method choice, arithmetic slip, misreading, time pressure,
  notation, or other documented categories;
- evidence references, recency, frequency, context, confidence, and evaluator version;
- never collapse all errors into “needs more practice.”

### Calibration inputs

- counts/outcomes for sure/think-so/guessing × correct/partial/wrong;
- a transparent calibration measure with uncertainty;
- no student-facing mirror yet beyond existing in-session behavior.

Keep raw events append-oriented and derived summaries rebuildable. Define retention/deletion/export
behavior and institution-transfer semantics without implementing Stage 7 artifacts.

## Ingestion and update pipeline

- Consume answers from Petros, existing quizzes, mocks/exams, and other authorized learning events
  into one normalized evidence contract.
- Make ingestion idempotent and replayable. Track source event and algorithm versions.
- Use deterministic calculations where possible. If misconception/error classification or model
  update uses AI, register a function, require structured validation, route through the gateway, and
  meter it independently.
- Never allow a failed AI classification to corrupt mastery; quarantine/retry and preserve the raw
  evidence.
- Support rebuild/backfill in bounded jobs with progress, retry, cancellation, and tenant scoping.
- Do not let evaluation/synthetic sessions update real learners.

## Feeding PLAN

Create a bounded learner snapshot service that selects only relevant facts for the current topic and
goal. Include uncertainty and evidence age. PLAN policy should use it to influence:

- prerequisite checks and detours;
- move weighting based on demonstrated outcomes;
- pace, layer depth, and check frequency;
- error-specific remedies;
- fragile-confidence rechecks;
- session length/stop recommendations based on current-session observations.

Log concise causal factors such as “diagram outcomes are stronger across 8 comparable moves” or
“method-choice errors dominate recent calculus attempts.” Do not expose hidden chain-of-thought.
Define minimum evidence/fallback behavior so new students receive sensible neutral sessions.

## Backend/API/privacy requirements

- Institution- and student-scoped entities, indexes, transactions, and rebuild jobs.
- Strict service-layer authorization; no endpoint should permit arbitrary student-ID lookup without
  a privileged, audited role.
- Student data export and deletion hooks consistent with existing account/privacy flows.
- Transfer behavior that preserves student-owned learning history only under approved identity and
  policy rules.
- Algorithm/version rollout and rollback without losing raw evidence.
- Monitoring for stale models, update lag, classifier failures, and anomalous shifts.
- Avoid sensitive demographic features, cross-student leakage, and institution-wide ranking.

## Frontend and diagnostic requirements

### Student session

- Personalization appears through teaching choices, not labels like “weak student.”
- “Why this?” may reference specific learning evidence in respectful language.
- Allow current-session controls such as explain simpler/deeper to override inferred preference.
- Show a neutral new-learner experience when evidence is insufficient.

### Authorized learner-model diagnostics

Create an internal/authorized diagnostic surface—not the Stage 11 knowledge map—with:

- concept mastery, uncertainty, evidence sources, recency, and model version;
- per-move outcomes and sample size;
- pace/depth observations vs inference;
- error fingerprint distribution and evidence drill-down;
- confidence-calibration inputs;
- last update, queue/rebuild status, and stale/error indicators;
- the exact bounded snapshot and causal factors supplied to a selected PLAN decision;
- rebuild/recompute controls with confirmation, permission, and audit.

Default to aggregation/redaction. Identifiable detail access must be permissioned and audited.

## Automated verification required

Cover at least:

- normalized ingestion from each supported source and duplicate-event idempotency;
- mastery update, recency/decay, uncertainty, and rebuild reproducibility;
- minimum evidence prevents overfitting;
- per-move statistics update correctly and distinguish topic/profile context;
- error categories cause different remedies;
- calibration inputs handle all confidence/correctness combinations;
- synthetic/evaluation data cannot contaminate production learners;
- failed AI classification is quarantined and does not corrupt summaries;
- new learner receives neutral snapshot;
- two seeded learners with different histories get different PLAN weights/sequences;
- “Why this?” and decision logs cite actual bounded snapshot facts;
- student/session override beats inferred pace/depth;
- cross-student/cross-institution access denial;
- export, deletion, rebuild, version rollback, and job retry behavior;
- no sensitive traits/provider details appear in learner-facing output.

Run Stage 5 comparisons to ensure personalization does not regress correctness, stuck recovery, or
variety. Run package tests, typechecks, lint, builds, and migration checks. Report exact commands and
results.

## Mandatory manual QA and dashboard acceptance

Seed two clearly documented synthetic students at the same grade/topic:

- Student A: stronger visual outcomes, fragile confidence, recent prerequisite gap.
- Student B: stronger worked-example outcomes, reliable confidence, procedural method errors.

Then manually verify:

1. **Same-topic comparison:** Start the same topic/goal/time for both. Record move sequence, depth,
   checks, and “Why this?” reasons. Differences must match seeded evidence rather than random prose.
2. **Diagnostic reconciliation:** In the learner-model diagnostic dashboard, inspect each bounded
   snapshot and trace every major PLAN difference to evidence counts, recency, and uncertainty.
3. **New learner:** Start the topic with no history. Confirm a neutral, profile-driven session and no
   invented preference.
4. **Current-session override:** Click explain deeper/simpler or change pace. Confirm the session
   obeys immediately and records the override without corrupting long-term preference from one use.
5. **Cross-source update:** Complete an existing quiz/mock answer, run the ingestion job, and confirm
   the learner model updates once with correct source linkage.
6. **Error remedy:** Seed/produce an arithmetic slip and a conceptual gap. Confirm the next teaching
   actions differ appropriately.
7. **Rebuild/version:** Recompute one synthetic learner, compare before/after, confirm raw evidence is
   unchanged, result is reproducible, and audit/job status is visible.
8. **Failure path:** Force classifier malformed output/provider failure. Confirm quarantine/retry,
   model integrity, generic student behavior, and usage/failure events in Petros AI Routing.
9. **Privacy:** Try another student/institution and an underprivileged role. Confirm denial, redaction,
   and audit. Test export/deletion in a disposable fixture.
10. **Quality dashboard:** Run relevant Stage 5 cases/personas. Confirm no critical regression and
    that personalization dimensions improve or remain explainable.
11. **Responsive/accessibility:** Inspect learner-facing personalized blocks at mobile/desktop sizes,
    keyboard, screen reader, reduced motion, slow network, and stale-model fallback.

For each check, provide exact navigation/commands, fixtures, expected frontend behavior, expected
backend/database/dashboard records, failure criteria, and evidence to capture.

## Definition of done

Stage 6 is complete only when two learners with different histories receive measurably different and
explainable sessions on the same topic; the model is structured, versioned, replayable, private, and
uncertainty-aware; current-session choice remains sovereign; and quality/manual dashboard checks pass.

## Final response contract

Return delivered scope, data/algorithm design, migrations and jobs, clickable files, exact automated
and quality-harness results, browser checks performed, detailed human QA/dashboard runbook, privacy
checks, evidence IDs, limitations, Stage 7 prerequisites, and `Stage 6 complete` or
`Stage 6 not complete`.

