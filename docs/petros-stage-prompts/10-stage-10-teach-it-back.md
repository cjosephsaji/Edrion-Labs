# Execution prompt 10 of 13 — Stage 10: Teach-it-back sessions

Use this prompt after Stage 9 multimodal inputs are stable. Implement the reversed teaching session
type only; do not begin Stage 11 reflection surfaces.

## Mission

Create Teach-it-back: the student explains a concept while Petros plays a genuinely confused junior,
asks natural follow-up questions, and ends with a concise verdict on the explanation—not a score.
The experience should make the student feel competent while revealing gaps, and should be enjoyable
enough that human testers voluntarily choose it again.

It remains a structured Petros session, not role-play chat bubbles. The student is generating and
Petros is probing; every move and observation remains part of the same auditable engine.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` fully, especially Parts 1–3, 5, 6, 8, 10,
   and Stage 10.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect session types, PLAN/RENDER, observation, learner model,
   voice/text input, artifacts, and quality harness.
3. Manually verify voice and five-minute modes from Stage 9.
4. Preserve worktree changes and use registered gateway functions only.

## Session contract and state machine

Add `teach_it_back` as a first-class session type with a versioned goal/state contract:

- topic/scope and intended audience level;
- student-selected text or voice mode;
- explanation segments and transcript corrections;
- coverage checklist derived from topic/syllabus/profile;
- claims/evidence/examples supplied by the student;
- gaps, ambiguities, contradictions, and misconceptions detected;
- junior-persona follow-up history and probe count;
- time/move budget and close criteria;
- final verdict components and artifact proposals.

Reverse normal move weighting: Petros should prompt, listen, identify a high-value gap, and ask a
junior-like follow-up. It must not seize control and lecture unless the student is genuinely stuck or
requests help.

## Follow-up behavior

- Register/use dedicated teaching-back analysis, follow-up generation, and verdict functions if the
  existing function contracts are not precise enough.
- Follow-ups must arise from what the student actually said: missing causal link, undefined term,
  unhandled exception, weak example, or contradiction.
- The junior can be playfully persistent but never mocking, manipulative, childish toward an older
  student, or deliberately impossible.
- Ask one clear question at a time.
- Honor the global two-Socratic-probe maximum for one stuck point; then explain/help and continue.
- Distinguish speech-recognition uncertainty from conceptual gaps.
- Allow “I don’t know,” request a hint, correct the transcript, revise an explanation, or skip safely.
- Do not reveal an answer rubric before the explanation attempt.

## Final verdict

End with a one-line human-readable verdict, not a numeric score or grade. Back it with structured,
student-visible details:

- what was explained clearly;
- the single most important gap or ambiguity;
- one suggested improvement/analogy/example;
- whether the explanation would likely help the chosen junior audience;
- optional student-edited recap/card proposal.

The verdict must be evidence-linked, respectful, effort-aware, and uncertainty-aware. Do not flatter
ability. It must not update official marks or teacher assessment.

## Learner model and artifacts

- Record structured evidence about explanation/transfer, not a permanent personality judgment.
- Update relevant mastery/calibration only with documented weighting and uncertainty.
- Track which follow-up types helped, without overfitting from one session.
- Propose a corrected explanation, misconception card, or example artifact only through the Stage 7
  curation flow; never auto-save it.
- Preserve voice transcript privacy/retention rules.

## Backend/API requirements

- Teach-it-back session creation, segment submission/transcription correction, analysis, follow-up,
  hint/help, close/verdict, resume, and artifact proposal APIs.
- Structured validation, idempotency, concurrency protection, time/move/probe caps, tenant ownership,
  permissions, rate limits, and safe errors.
- Logs connect student segment → analysis facts → follow-up decision → verdict evidence.
- Store concise evidence/rubric facts, not hidden chain-of-thought.
- Separate function usage/cost/latency/validation/fallback for analysis, follow-up, verdict, STT/TTS.

## Frontend requirements

- A clear reversed-session opening: “Explain this to Petros as if teaching a junior.”
- Text and voice explanation capture with transcript correction, pause/resume, and accessibility.
- Structured explanation/follow-up blocks, not message bubbles.
- Visible topic/audience, finite progress, and a respectful “junior is confused about…” transition.
- Students can revise, request help, or say they do not know without being trapped.
- Verdict screen is concise, evidence-linked, editable artifact proposal, and offers a forward link.
- Mobile/desktop, keyboard, screen reader, captions, reduced motion, slow/offline recovery.

## Dashboard/quality requirements

Add Teach-it-back filters/views showing privacy-safe aggregates:

- sessions started/completed/repeated voluntarily;
- text vs voice, time, follow-up count, help use, abandon point;
- common structured gap types by topic without exposing raw student speech broadly;
- verdict validation/failure/uncertainty;
- learner-model updates and artifact proposal/save rates;
- analysis/follow-up/verdict/STT/TTS cost, latency, retry, and fallback;
- two-probe policy violations (target must be zero).

Extend the Stage 5 harness with teach-it-back personas/explanations: complete and clear, superficially
fluent but causally incomplete, confidently wrong, very short, verbose/confused, and STT-corrupted.
Rubrics must assess follow-up relevance, gap detection, non-takeover, verdict evidence, tone, and fun
without using repetition as the only engagement proxy.

## Automated verification required

Test at least:

- session type/state and text/voice submission;
- follow-up is grounded in the student segment and asks one question;
- complete explanation is not pestered with invented gaps;
- causally incomplete/confidently wrong explanations get appropriate follow-up;
- STT uncertainty does not become a false misconception;
- two-probe cap, help path, and no-stuck ending;
- verdict has no numeric score, cites evidence, and respects uncertainty;
- learner-model update weighting/idempotency and no official-mark mutation;
- artifacts remain proposals until explicit edit/save;
- resume/concurrency/cost caps/fallback/provider-neutral errors;
- tenant/privacy/retention/audit;
- quality harness catches irrelevant, mocking, overly lecturing, repetitive, and unsupported verdicts;
- accessible text/audio alternatives.

Run tests, typechecks, lint, builds, and new quality cases. Report exact commands/results and live
cost if real models were used.

## Mandatory manual QA and dashboard acceptance

Recruit/use at least two human reviewers if available and provide this runbook:

1. **Strong explanation:** Explain correctly and clearly. Confirm Petros does not manufacture gaps,
   asks only useful clarification if needed, and gives a nontrivial positive verdict without flattery.
2. **Missing causal link:** Give a plausible explanation with one intentional gap. Confirm the junior
   asks exactly about that gap and the final verdict cites it.
3. **Confident misconception:** State a common wrong intuition. Confirm respectful probing,
   two-probe cap, eventual help, and learner evidence without shaming.
4. **“I don’t know” path:** Stop mid-explanation and request help. Confirm Petros helps rather than
   withholding or refusing into a vacuum.
5. **Voice flow:** Test walking/commuting conditions, interruption, transcript correction, noise,
   pause/resume, switch to text, and recording stop.
6. **Verdict inspection:** Confirm no score/grade, evidence is specific, official marks unchanged, and
   proposed recap/card requires edit/save.
7. **Repeatability/fun:** Ask testers whether they would voluntarily run another topic and record
   qualitative reasons. Do not declare the stage successful from completion metrics alone.
8. **Diagnostics dashboard:** Trace segment → analysis → follow-up → verdict and verify probe count,
   gap type, help use, model update, and artifact state.
9. **AI Routing dashboard:** Reconcile analysis/follow-up/verdict/STT/TTS routes, costs, latency,
   validation, retry, and fallback. Pause one route and confirm graceful recovery, then restore it.
10. **Quality dashboard:** Inspect all scripted explanation personas and verify rubric evidence matches
    a human reading.
11. **Privacy/accessibility:** Cross-tenant denial, privileged transcript access audit, retention,
    keyboard/screen reader/captions, mobile/desktop, reduced motion, slow/offline recovery.

For each check, include navigation, topic/script, actions, expected UI, expected backend/dashboard
records, failure criteria, human satisfaction questions, and evidence to capture.

## Definition of done

Stage 10 is complete only when Petros can listen more than it talks, ask genuinely relevant junior
questions, obey the two-probe cap, finish with an evidence-based nonnumeric verdict, preserve privacy
and artifact ownership, pass quality tests, and earn credible positive human repeat-use feedback.

## Final response contract

Return scope, state/functions/data design, clickable files, tests/quality/live costs, browser/device and
human checks, detailed dashboard QA, qualitative feedback, limitations, Stage 11 prerequisites, and
`Stage 10 complete` or `Stage 10 not complete`.

