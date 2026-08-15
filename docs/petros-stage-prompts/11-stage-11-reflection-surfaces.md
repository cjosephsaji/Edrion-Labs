# Execution prompt 11 of 13 — Stage 11: reflection surfaces

Use this prompt after Teach-it-back is complete. Build student-facing reflection from trustworthy
learner evidence. Do not begin institution policy configuration from Stage 12.

## Mission

Help a student answer “What should I do next?” without asking a chatbot. Implement four embedded
reflection surfaces: a syllabus knowledge map, a gentle calibration mirror, “how you learn” session
recaps, and a gap alarm that identifies prerequisite problems across clustered doubts. Every insight
must be specific, evidence-linked, uncertainty-aware, actionable, and respectful.

Do not build rankings, ability labels, infinite feeds, public comparisons, guilt notifications, or
opaque AI personality profiles.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 4, 6, 7, 9–12,
   and Stage 11.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect topic/prerequisite graphs, learner model, artifacts,
   session recaps, answer events, and student analytics surfaces.
3. Verify Stage 10 follow-up/verdict quality and learner-evidence updates.
4. Inspect syllabus/curriculum and existing analytics/navigation before adding parallel structures.
5. Preserve dirty-worktree changes and enforce student/tenant privacy.

## Surface 1: knowledge map

Create a navigable syllabus/concept map using published curriculum/topic/prerequisite relationships
and learner-model evidence. At minimum show:

- solid, shaky, untouched, and insufficient-evidence states with documented thresholds;
- uncertainty and freshness without overwhelming the student;
- prerequisite/dependent relationships;
- recent evidence and next useful action;
- exam/path relevance where already known;
- honest distinction between “not attempted” and “not mastered.”

The map must answer what to do next using a transparent ranking of high-value actions: prerequisite
gaps, fragile knowledge, exam proximity, review due, and learner goal. Starting an action should use
the Stage 8 intent/door contract.

Provide nonvisual list/table navigation, keyboard operation, zoom/pan that does not trap focus,
legends, accessible names, mobile layout, and printable/export-safe summaries where appropriate.

## Surface 2: calibration mirror

Use confidence-vs-correctness history to show calibration as a learnable skill:

- compare predictions/confidence with outcomes using sufficient sample thresholds;
- show direction/trend and uncertainty, not a permanent trait;
- use gentle language such as “the gap is narrowing”;
- avoid frequent interruptions, shame, competitive comparison, or false precision;
- link to a useful action such as a fragile-confidence review;
- allow a student to dismiss/quiet the insight without losing core functionality.

Do not invent a score from too little data. Document when the mirror should remain hidden.

## Surface 3: how-you-learn recap

At session close or history detail, generate a concise recap about the learning process, e.g. which
move helped, whether notation or concept caused delay, and what the student did to recover. Use
structured session/learner evidence. Require versioned structured output and validation if AI is used.

- Separate observed facts from tentative inference.
- Cite move/observation evidence in an expandable view.
- Notice effort and strategy, not innate ability.
- Avoid overgeneralizing one session into a durable preference.
- Let the student correct/dismiss feedback where appropriate.
- Keep any proposed recap artifact inside explicit curation rules.

## Surface 4: gap alarm

Detect clusters of doubts/errors whose shared prerequisite is likely the real blocker:

- use concept/prerequisite graph plus recent error/doubt evidence;
- require minimum independent evidence and confidence thresholds;
- distinguish a prerequisite hypothesis from a fact;
- explain which affected topics support the alarm;
- estimate a practical repair scope/time and offer a Stage 8 Repair intent;
- deduplicate/snooze/resolve alarms and avoid repeated nagging;
- monitor false positives and student dismissal/correction.

If AI performs clustering or explanation, register distinct functions, validate structured output,
route through the gateway, and meter them. Prefer deterministic graph/statistical candidates before AI.

## Data/backend/API requirements

- Derived view/version tables for map states, recommendations, calibration insights, recaps, alarms,
  evidence links, dismissal/resolution, and algorithm versions.
- Rebuildable derivations from learner events; idempotent jobs and stale-data indicators.
- Student ownership, tenant scope, permissions, audit, export/deletion/transfer behavior.
- Bounded APIs for map/list, insight detail/evidence, next-action intent, dismiss/snooze/correct, and
  recap/alarm lifecycle.
- No raw model chain-of-thought or hidden provider data.
- Monitoring for stale graph, missing syllabus links, false alarms, low evidence, job lag, and AI
  validation/fallback.

## Frontend integration

- Embed the knowledge map in an appropriate Learning/Progress area, not as a Petros chat page.
- Surface next-step cards contextually on Home/Today or learning-path areas without an infinite feed.
- Show calibration sparingly and explain why it appears.
- Put recaps in session close/history and gap alarms near affected topics.
- Every recommendation has “Why this?”, evidence age, and a legitimate action/dismiss path.
- No fake urgency, streak repair, ability praise, or public comparison.
- Polished loading/empty/insufficient-evidence/stale/error states and mobile/accessibility behavior.

## Dashboard/observability requirements

Create authorized privacy-safe monitoring for:

- map coverage by syllabus and stale/missing concept links;
- recommendation reasons and completion/outcome, not engagement pressure;
- calibration insight eligibility/dismissal with no individual comparison leaderboard;
- recap generation/validation/correction/dismissal;
- gap alarm candidates, confidence, acceptance/dismissal/false-positive reports, repair outcome;
- algorithm/prompt/schema versions and rebuild status;
- cost/latency/retry/fallback for recap/gap functions;
- privileged individual evidence access only through audited roles.

Super Admin Petros AI Routing must expose every new AI function independently.

## Automated verification required

Test at least:

- map state thresholds, insufficient evidence, freshness/decay, prerequisite relationships, and
  next-action ranking;
- visual and nonvisual map parity/accessibility;
- calibration eligibility minimums, math, trend, uncertainty, dismissal/quiet behavior;
- recap facts match session evidence and tentative inferences are labeled;
- one session cannot create an unsupported durable learning claim;
- gap clustering, minimum independent evidence, prerequisite explanation, dedup/snooze/resolve;
- known false-positive fixtures remain suppressed or uncertainty-labeled;
- actions create correctly scoped Stage 8 intents;
- derivation rebuild/version/idempotency/staleness;
- cross-student/institution privacy, export/deletion/transfer;
- registered functions, structured validation, budgets, fallbacks, provider-neutral errors;
- Stage 5 quality cases for honesty, explanation specificity, and no-dark-pattern rules.

Run tests, typechecks, lint, builds, E2E/accessibility checks, and relevant quality cases. Report exact
commands/results.

## Mandatory manual QA and dashboard acceptance

Use synthetic learners with documented evidence and verify:

1. **Knowledge map:** Inspect solid/shaky/untouched/insufficient topics, prerequisite links, evidence
   age, legend, and next action. A human should answer “what should I do next and why?” within seconds.
2. **Map action:** Start a recommended session and verify the intent scope/reason, then complete it and
   confirm map/recommendation updates after the documented processing delay.
3. **No-data learner:** Confirm honest empty/untouched states and no invented weakness.
4. **Calibration:** Use overconfident, underconfident, well-calibrated, and low-sample fixtures. Verify
   correct eligibility, gentle language, trend/uncertainty, action, and dismiss/quiet behavior.
5. **Recap:** Complete sessions with clear diagram benefit, notation delay, and recovery effort.
   Confirm recaps match evidence, label inference, avoid ability praise, and can be corrected/dismissed.
6. **Gap alarm:** Seed clustered Thermodynamics-like doubts caused by a shared prerequisite. Confirm
   supporting topics, uncertainty, repair estimate, one alarm, correct session intent, snooze/resolve.
7. **False alarm:** Seed unrelated doubts and confirm no confident prerequisite claim.
8. **Reflection dashboard:** Reconcile map coverage, eligibility, recap evidence, alarm confidence,
   dismissals, repairs, versions, and rebuild status with fixture IDs.
9. **AI Routing dashboard:** Reconcile recap/gap calls, cost, latency, validation, retries/fallback;
   pause a route and verify safe degradation, then restore it.
10. **Privacy/no-dark-pattern:** Cross-tenant denial, audit privileged evidence view, inspect copy for
    shame/urgency/comparison, and confirm no feed/follower/leaderboard behavior.
11. **Accessibility/responsiveness:** Mobile/desktop, keyboard-only map/list, screen reader, zoom,
    color-independent states, reduced motion, print/export, slow network, stale data, and error recovery.

For every step include exact navigation, fixture/setup, actions, expected UI, expected backend and
dashboard evidence, failure criteria, satisfaction questions, and screenshots/IDs to capture.

## Definition of done

Stage 11 is complete only when a student can quickly and honestly answer what to do next from the
knowledge map; calibration, recaps, and gap alarms are evidence-based and respectful; actions are
correctly scoped; privacy/accessibility hold; and human/dashboard review confirms usefulness rather
than merely technical rendering.

## Final response contract

Return scope, derivation/data design, migrations/jobs, clickable files, exact test/quality results,
browser/human checks, detailed reflection/dashboard QA, evidence, limitations, Stage 12 prerequisites,
and `Stage 11 complete` or `Stage 11 not complete`.

