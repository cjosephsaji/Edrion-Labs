# Execution prompt 03 of 13 — Stage 3: observation and adaptive struggle response

Use this prompt only after Stage 2 is genuinely complete. Complete Stage 3 and direct dependency
repairs; do not begin topic profiles or the broader move set from Stage 4.

## Mission

Teach the Petros loop to observe the student and change course. Implement answer capture,
guess-first prompting, confidence tags, the three-step struggle ladder, and free questions from the
session composer feeding back into PLAN. A wrong answer or mid-session question must visibly alter
what Petros does next.

Petros remains a self-assembling learning document, not a chatbot. The composer is an input to the
teaching loop, not a parallel chat thread.

## Required reading and entry checks

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 2, 5, 6, 10,
   and Stage 3.
2. Read `docs/PETROS-AI-ROUTING.md` and inspect the Stage 2 session state, decision log, block schemas,
   and gateway use.
3. Verify Stage 2 with two sessions on different topics, inspect PLAN/RENDER usage in Super Admin,
   and confirm “Why this?” maps to decision logs.
4. Preserve user changes and follow repository `AGENTS.md` instructions.
5. Fix only Stage 2 defects that block observation. Record other debt for the handoff.

## Observation domain model

Create a typed observation/event model with stable IDs, timestamps, session/block/move linkage,
student and institution ownership, and schema versions. Distinguish at least:

- answer submitted;
- confidence selected: `sure`, `think_so`, or `guessing`;
- question asked from the composer;
- hint requested;
- layer/depth changed;
- block completed/skipped;
- session paused/resumed/abandoned;
- response-time and inactivity signals that can be recorded now without implementing Stage 6
  inference or mood surveillance.

Answers must be immutable after submission from the student’s perspective. Store normalized
correctness/evaluation separately from the raw answer. Make duplicate submission idempotent and
record evaluator/prompt/schema versions for AI-evaluated free text.

## Required behavior

### 1. Guess first

Before Petros explains a new target idea, require a cheap attempt appropriate to the block. PLAN
must know whether a guess is required, completed, skipped for accessibility/safety, or not applicable.
The first interaction should happen quickly and should not feel like a high-stakes test.

### 2. Confidence capture

Every scored answer must capture confidence in one tap. Support these cases explicitly:

- confident + wrong: flag as a high-value misconception moment and deliberately correct it;
- unsure + right: treat as fragile and schedule an earlier recheck in the current session;
- confident + right: allow progress without unnecessary repetition;
- guessing + wrong/right: record uncertainty without shaming.

Do not implement the full cross-session calibration mirror yet; persist the ingredients Stage 6 and
Stage 11 will use.

### 3. Struggle ladder

Implement the non-negotiable sequence for equivalent attempts at a target:

1. first wrong answer → useful hint without revealing the complete answer;
2. second wrong answer → identify the specific missing step/concept;
3. third wrong answer → give the full worked solution, then immediately ask an equivalent reworded
   question so the sequence can end in an earned success.

Never end the stretch on failure. Define how equivalence is tracked so a page refresh, repeated API
request, or regenerated wording does not reset the ladder. Handle partial credit and invalid input
without falsely counting a conceptual failure. If the learner remains stuck after the reworded
success opportunity, offer a legitimate next step or pause/escalation path rather than an empty
refusal.

### 4. Composer redirects PLAN

The session composer must submit a typed observation with the student’s question. It must not create
a message bubble or side conversation. The next PLAN call must consider the question and choose
whether to answer it now, clarify it, park it, or change the current subgoal. The document should
show a detour/checkpoint block when direction changes and then return deliberately to the main goal.

### 5. Evaluation and feedback

Use deterministic evaluation for objective question types. Use the registered answer-evaluation or
step-evaluation AI Function only when needed. Require structured output containing correctness,
partial-credit evidence, misconception/error classification at the precision available in this
stage, feedback, and safe next-step hints. Validate responses and meter every attempt.

Do not reveal chain-of-thought, answer keys before commitment, provider names, or internal scores not
intended for students. Feedback must notice effort, not flatter ability.

## Backend and API requirements

- Endpoints/commands to submit answer + confidence atomically, request a hint, submit a composer
  question, and read the resulting observation-aware session state.
- Transactional protection against two simultaneous submissions advancing the ladder twice.
- Idempotency keys and optimistic/version checks for block state.
- Ownership, institution scoping, permissions, rate limits, input length/content limits, audit, and
  safe error mapping.
- PLAN state must include recent observations and summarized outcomes, not an unbounded raw chat.
- Decision logs must identify which observations changed a plan.
- Usage events must distinguish planning, answer evaluation, hint generation, and rendering.

## Student frontend requirements

- Question cards lock after submission, display chosen answer/confidence, immediate feedback, and a
  “Why?” expander.
- Confidence controls are accessible, fast, and cannot silently default.
- Hint/missing-step/solution/reworded-attempt states are visually distinct but remain part of the
  learning document.
- The composer remains available without obscuring progress; submitted questions become structured
  detour blocks rather than chat bubbles.
- A visible indicator explains when a question changed the route and how Petros will return.
- All state survives scroll, rerender, refresh, resume, slow requests, and retry.
- Prevent double-submit, stale feedback, focus loss, layout jumps, and accidental answer reveal.
- Mobile keyboard behavior, touch targets, screen-reader announcements, and reduced motion must work.

## Admin/diagnostic requirements

Extend authorized diagnostics so an operator can inspect, without broad exposure of student text:

- observation type and timestamp;
- answer correctness/confidence matrix;
- struggle-ladder level and transitions;
- PLAN decision before and after an observation;
- detours triggered by composer questions;
- answer-evaluation/hint function cost, latency, validation failure, retry, and fallback;
- stuck/abandonment counts and sequences that failed to reach a success.

Add useful filters by institution, function, session type, date, and anonymized session identifier.
Audit every privileged view of identifiable learner detail.

## Automated verification required

Cover at least:

- answer and confidence submitted atomically and idempotently;
- all four correctness/confidence combinations produce the correct observation flags;
- first, second, and third wrong attempts produce hint, missing-step, and worked-solution behavior;
- the reworded attempt is equivalent, linked, and does not expose the original answer prematurely;
- a successful reworded attempt closes the stretch on success;
- page refresh cannot reset or skip the ladder;
- partial credit and malformed answers do not corrupt attempt counts;
- composer question changes the next PLAN input and can create/close a detour;
- decision logs identify the causal observation;
- objective evaluation avoids unnecessary AI cost;
- structured evaluator failure retries/falls back safely;
- concurrent submissions, cross-student access, and cross-institution access are denied safely;
- accessibility semantics and locked question-card state;
- no provider/model details appear in student responses or rendered errors.

Run focused tests, affected package typechecks, lint where available, production builds, and relevant
integration/E2E tests. Report exact commands and results.

## Mandatory manual QA and dashboard acceptance

Perform browser smoke tests where possible and provide a human-run checklist with exact fixtures:

1. **Wrong-once path:** Start a session, answer incorrectly with `think so`, and confirm only a useful
   hint appears and PLAN changes appropriately.
2. **Three-wrong path:** Deliberately answer equivalent questions wrong three times. Confirm the
   ladder progresses exactly once per attempt, shows the missing step on attempt two, gives a full
   worked solution on attempt three, and follows with a reworded chance to succeed.
3. **Earned-success ending:** Answer the reworded question correctly. Confirm the UI marks recovery,
   progress continues, and the sequence does not end on the earlier failure.
4. **Confidently wrong:** Choose `sure` on a wrong answer. Confirm the correction receives a deliberate
   moment and the diagnostic observation is marked accordingly without shaming copy.
5. **Unsure but right:** Choose `guessing` or `think so` on a correct answer. Confirm the session treats
   it as fragile and rechecks sooner.
6. **Composer redirect:** Ask a relevant mid-session question. Confirm no chat bubble appears, a
   detour block explains the change, subsequent PLAN uses it, and the main goal resumes.
7. **Refresh/race:** Refresh at every ladder level and rapidly double-click submit. Confirm no state
   loss, duplicate attempt, duplicate block, or incorrect progress.
8. **Mobile/accessibility:** Test mobile virtual keyboard, long answers, keyboard-only confidence and
   hint controls, screen-reader feedback announcements, visible focus, and reduced motion.
9. **Diagnostics dashboard:** In the authorized Petros decision/observation view, trace one session’s
   answer, confidence, ladder transitions, changed PLAN decision, and correlation IDs.
10. **AI Routing dashboard:** Filter answer evaluation and hint generation. Confirm objective checks
    did not call AI, subjective checks did, and cost/latency/retry/fallback numbers match the run.
11. **Privacy/tenant check:** Use another student/institution to request the observation or session.
    Confirm a safe denial and an appropriate audit event.

For each check, provide route/navigation, setup data, actions, expected UI, expected API/database or
dashboard evidence, failure criteria, and the screenshot/ID to capture.

## Definition of done

Stage 3 is complete only when a wrong answer changes the next teaching action, the struggle ladder
cannot leave the student stuck, confidence affects the plan, a composer question visibly redirects
and rejoins the session, and all behavior is traceable in authorized diagnostics and AI usage data.

## Final response contract

Return: delivered scope; architecture and migrations; clickable file links; automated commands and
results; browser checks actually performed; a dashboard-by-dashboard manual QA runbook; captured
evidence/IDs; limitations; Stage 4 prerequisites; and an explicit `Stage 3 complete` or
`Stage 3 not complete` verdict.

