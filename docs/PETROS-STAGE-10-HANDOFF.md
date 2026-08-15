# Petros Stage 10 handoff — Teach-it-back sessions

Date: 2026-08-13  
Stage prompt: `docs/petros-stage-prompts/10-stage-10-teach-it-back.md`  
Status: **Stage 10 not complete**

The Stage 10 state contract, persistence, API/state machine, registered AI functions, student and
aggregate-admin experiences, Stage 7 artifact handoff, conservative learner evidence, six-persona quality
harness, focused automation, migration, and builds are implemented. Stage 10 is not declared complete:

- the user explicitly deferred Stage 9 physical microphone/device QA, so voice remains optional and its
  production gate remains closed everywhere;
- this run had no callable in-app browser-control runtime, so no new signed-in visual/mobile/screen-reader
  acceptance evidence was captured;
- the Definition of Done requires at least two credible human reviewers and positive voluntary repeat-use
  feedback, which cannot be substituted with completion or click metrics.

No Stage 11 reflection surface was started.

## Product scope and interaction contract

`teach_it_back` is a first-class, finite Petros session rather than a chat skin. The learner chooses a topic,
scope, audience, and text or optional voice. The opening is exactly “Explain this to Petros as if teaching a
junior.” The learner generates explanation segments while Petros listens, updates an explicit coverage list,
selects at most one high-value evidence-linked gap, and asks exactly one junior-like question.

The interaction supports transcript correction, explanation revision, pause/resume, hint/help, “I don’t
know,” and safe skip. A stable gap can receive no more than two Socratic probes; the second probe carries a
plain-language bridge, and further struggle resolves to help rather than a refusal vacuum. Speech-recognition
uncertainty produces no conceptual gap or follow-up. Finite close occurs by learner choice, move budget, or
time budget.

The verdict is a strict structured contract with:

- one human-readable line and no score, grade, marks, rating, percentage, or fraction;
- evidence-linked clear points and at most one most-important gap;
- one suggested improvement and audience-fit reason;
- uncertainty disclosure when required;
- optional editable note/flashcard proposal;
- `officialAssessmentChanged=false` as a literal contract.

The UI is a document of explanation/follow-up pairs, not chat bubbles. It shows topic, junior audience,
coverage, move/time budget, probe count, evidence excerpts, lifecycle controls, transcript confirmation,
the verdict, Stage 7 curation, and separate “teach this topic again” versus “teach another topic” choices.
The voluntary repeat choice persists `repeatedFromSessionId` for aggregate measurement.

## Versioned state and registered functions

Contracts in `packages/schemas/src/petros-teach-back.ts` define:

- `petros.teach-back.state.v1` — topic/scope/audience/mode/language, coverage, segments, corrections,
  follow-ups, progress/caps, verdict, proposal linkage, repeat lineage, and the closed voice release gate;
- `petros.teach-back.analysis.v1` — coverage, student claims/examples, one primary grounded gap, completion,
  and STT uncertainty kept separate from conceptual analysis;
- `petros.teach-back.follow-up.v1` — one question, evidence link, gap type, probe 1–2, transition/tone, and
  mandatory immediate help at probe two;
- `petros.teach-back.verdict.v1` — nonnumeric evidence-linked verdict, audience fit, uncertainty, proposal,
  and immutable official-assessment boundary.

The provider-independent registry adds three dedicated functions:

| Function                         | Purpose                                                                  | Deterministic recovery                                                 |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `teach_back.explanation.analyse` | Select one evidence-linked high-value gap or declare complete            | Bounded lexical/coverage analysis with explicit provisional disclosure |
| `teach_back.follow_up.generate`  | Ask one respectful junior question grounded in the selected excerpt      | Gap-specific one-question template with immediate help payload         |
| `teach_back.verdict.generate`    | Produce a nonnumeric evidence-linked verdict and editable recap proposal | Evidence-derived provisional verdict that never changes marks          |

All three call `PetrosAiGatewayService`; feature code imports no provider SDK and reads no provider key.
Invalid/unavailable structured output falls back provider-neutrally and is recorded with function, validation
failure, retry/fallback, latency, provider/model when available, and estimated/actual cost. Voice continues to
use independent Stage 9 `speech.transcribe`, `interaction.spoken`, and `speech.synthesise` routes.

## Persistence, ownership, and state transitions

Migration `packages/database/migrations/0197_petros_teach_back.sql` adds:

- `petros_teach_back_sessions` — one-to-one learning-session link, owner, finite lifecycle, coverage/current
  gap/probe state, help use, verdict, artifact bundle, repeat lineage, optimistic version;
- `petros_teach_back_segments` — ordered text or corrected transcript source of truth, owner-scoped media
  link, confidence, response link, structured analysis, function/route/correlation metadata;
- `petros_teach_back_follow_ups` — grounded gap/fingerprint, probe number, structured question/help, lifecycle,
  function/route/correlation metadata;
- `petros_teach_back_commands` — owner-scoped idempotency and replay-safe response state;
- `petros_teach_back_events` — content-free product/function/cost/latency/validation/fallback/policy trace.

Every state-changing repository write includes institution, student, expected version where applicable, and
active lifecycle constraints. The five tables have RLS and forced RLS with owner-private institution-plus-
student policies. Migration 0197 was applied to the configured development database and read back as
`row_security=true`, `force_row_security=true`, one policy each for all five tables.

The trace is segment → structured analysis facts → selected gap/fingerprint → follow-up decision/probe →
evidence-linked verdict. It stores concise contract output, not hidden chain-of-thought. Aggregate events do
not store explanation text, transcript text, question text, evidence excerpts, audio, or learner names.

## Learner evidence and artifact ownership

Close emits `application` evidence with profile dimension `explanation_transfer`. Credit is pulled toward
neutral according to verdict uncertainty, uses a stable `teach-back:{session}:verdict` source event for
idempotency, records the documented `singleSessionWeighting=conservative_toward_neutral`, and carries
`officialAssessmentChanged=false`. It is evidence about this explanation/transfer event, not a personality or
ability judgment. A learner-model delivery failure is content-free telemetry and does not invalidate a
successfully persisted verdict.

The verdict can create only an `artifact_commit` proposal. The existing Stage 7 bundle/curation surface owns
editing, selection, explicit save, discard, duplicate prevention, scheduling, and artifact provenance. Nothing
is auto-saved. The Teach-it-back dashboard reads linked `proposal.created` and `artifact.saved` events from
the Stage 7 event store so proposal/save rates reflect the actual ownership boundary.

## Optional voice and inherited Stage 9 gate

Text is complete and independent. Voice is an optional equivalent input that reuses the Stage 9 owner-private
media intent, bounded capture, retention, independent STT, replay, editable transcript, and confirmation
contract. The confirmed transcript—not uncertain provider recognition—is the explanation source of truth.
Low confidence or uncertain segments block conceptual submission until the learner edits/accepts the text.
Recording stops on page backgrounding/page hide, pause, close, or the 120-second cap.

`productionDeviceQaPassed=false` is literal in the session schema, student disclosure, admin dashboard, and
tests. Physical microphone, headset, walking/noise, disconnect, interruption, background-stop, pronunciation,
mixed-language, mobile-browser, and TTS acceptance is deferred from Stage 9. Voice is not production-ready and
no statement in this handoff should be read as such.

## Privacy-safe operations dashboard

`/ai/petros-teach-back` requires `ai.view`; each read writes
`petros.teach_back.dashboard.view` to the immutable audit trail with `contentInspected=false`. Filters cover
institution, text/voice, structured gap type, exact function, and time range. The view reports:

- start/complete/voluntary-repeat/pause counts, text versus optional voice, average time/follow-ups, help use,
  and pause/abandon move;
- structured gap distribution and one-way topic references, never learner-entered topic or speech text;
- verdict generation, validation fallback/failure, and uncertainty;
- conservative learner update success/failure;
- actual Stage 7 proposal and explicit-save counts;
- the two-probe cap and violations with target zero;
- the three dedicated function and provider/model call, cost, latency, retry, fallback, and validation totals;
- linked owner-private STT/TTS modality aggregates by media ID, without audio or transcript content;
- the explicit optional-voice, Stage 9-device-QA-false, production-ready-false gate.

## Primary files

- State/contracts/function registry: `packages/schemas/src/petros-teach-back.ts`,
  `packages/schemas/src/petros-learning.ts`, `packages/schemas/src/petros-ai-routing.ts`
- Database schema/migration: `packages/database/src/schema/petros-teach-back.ts`,
  `packages/database/migrations/0197_petros_teach_back.sql`
- API state machine, owner-scoped repository, controllers: `apps/api/src/modules/student/petros-teach-back/`
- Student document UI: `apps/student-web/src/components/petros/petros-teach-back.tsx` and
  `petros-teach-back.module.css`
- Petros mode entry: `apps/student-web/src/components/petros/petros-input-modes.tsx`
- Aggregate operations: `apps/super-admin-web/src/app/(app)/ai/petros-teach-back/page.tsx`
- Six-persona corpus/rubric: `packages/learn-evals/src/fixtures/teach-back.ts`,
  `packages/learn-evals/src/teach-back-quality.spec.ts`
- Architecture boundary: `docs/PETROS-AI-ROUTING.md`

## Executed verification

No real AI provider, STT, TTS, or physical device was used. Live external AI cost: **0 µUSD**.

- `pnpm --filter @edrion/database migrate` — passed; migration 0197 applied.
- PostgreSQL catalog readback — all five Stage 10 tables returned RLS `true`, forced RLS `true`, one policy.
- `pnpm --filter @edrion/api test` — **60 files, 391 tests passed**.
- `pnpm --filter @edrion/student-web test` — **5 files, 21 tests passed**.
- `pnpm --filter @edrion/schemas exec vitest run src/petros-teach-back.spec.ts` — **5/5 passed**.
- `pnpm --filter @edrion/learn-evals test -- teach-back-quality.spec.ts` — the full package run passed
  **3 files, 35 tests**, including all 13 Teach-it-back quality checks.
- Focused API service run — **11/11 passed**, including idempotent replay, corrected low-confidence STT,
  lifecycle replay, and aggregate dashboard/privacy assertions.
- Focused student Teach-it-back and mode-entry run — **5/5 passed**.
- Typechecks passed for schemas, database, API, student web, Super Admin web, and learn-evals after formatting.
- Final API, student web, and Super Admin production builds passed. Both Next builds emitted only the existing
  ambiguous Tailwind `ease-[var(--ease-emphasized)]` warning.

The full schemas package run retained two unrelated pre-existing failures in
`src/student/exam-questions.spec.ts`: quick-check pause expected true and over-15-minute quick-check expected
rejection. The Stage 10 schema file passed independently.

Lint was attempted for schemas, database, API, student web, and Super Admin. The first three cannot start
because the workspace resolves no `eslint` binary. The Next scripts launch an interactive “configure ESLint”
prompt and therefore cannot run non-interactively. Builds still ran Next’s configured type-validity phase.

## Browser and human acceptance status

The Browser skill was selected for local UI acceptance, but this Codex session did not expose its required
browser-control runtime after tool discovery. The skill forbids substituting a standalone browser automation
server, so no signed-in browser screenshots or visual assertions are claimed. Component tests and production
builds passed, but those do not replace visual, screen-reader, mobile, offline, or human acceptance.

No human reviewer was available. Repeat-use satisfaction, respect/tone, genuine relevance, nontrivial positive
verdict quality, and “would choose another topic voluntarily” remain unmeasured.

## Mandatory manual QA and dashboard acceptance runbook

Use two or more consenting reviewers, dedicated QA learners in separate tenants, reversible AI routes, and
licensed/synthetic content. Never capture credentials or another learner’s content. For every scenario retain
UTC start/end, reviewer/device/browser, session/segment/follow-up/media/bundle/correlation IDs, routing attempt
IDs, filtered dashboard exports, audit ID, screenshots at desktop/mobile, screen-reader notes, and a redacted
reviewer quote.

### 1. Strong complete explanation

- **Navigate/script/actions:** Student `/petros` → Teach it back → text; topic “photosynthesis”; audience
  younger student. Explain the energy source, inputs, glucose/oxygen outputs, causal mechanism, one example,
  and one boundary. Submit in one or two segments and finish.
- **Expected UI:** no invented gap; at most a genuinely useful clarification; finite progress; concise
  nonnumeric verdict with specific clear evidence, useful audience-fit reason, no ability flattery.
- **Expected backend/dashboard:** complete analysis with `primaryGap=null`; no unnecessary open follow-up;
  verdict trace; one conservative evidence event; one editable proposal; zero saved until explicit edit/save;
  started/completed and function/cost/latency aggregates increment.
- **Failure:** generic pestering, answer-rubric reveal, score/grade, unsupported praise, automatic save, marks
  mutation, or learner speech in admin.
- **Ask/capture:** “Did Petros listen more than it talked?”, “Was any question genuinely useful?”, “Would you
  teach another topic now, without a reward?” Capture verdict/evidence/proposal and the reviewer’s reason.

### 2. Fluent explanation with a missing causal link

- **Navigate/script/actions:** topic “electric current”; say a battery, wire, complete circuit, amperes, and
  lit lamp but intentionally omit what creates charge motion/energy transfer. Answer the follow-up once.
- **Expected UI:** “junior is confused about…” cites the actual segment and asks one question about the
  missing cause, not an unrelated example; probe shows 1 of 2; verdict cites the gap and improvement.
- **Expected backend/dashboard:** `missing_causal_link`, evidence excerpt/segment ID, one follow-up and function
  trace, response linkage, no policy violation; matching gap/topic reference aggregate.
- **Failure:** two questions, unsupported excerpt, immediate lecture, irrelevant probe, or a manufactured
  misconception.
- **Ask/capture:** “Could you see exactly which sentence caused the question?”, “Did it feel like a curious
  junior rather than an examiner?” Capture explanation/follow-up pair and filtered gap bucket.

### 3. Confident misconception and two-probe cap

- **Navigate/script/actions:** topic “seasons”; assert that seasons are caused by Earth being much closer to
  the Sun. Give two confident but incomplete responses to the same stuck point.
- **Expected UI:** respectful evidence-seeking misconception question, then a second distinct probe with an
  immediate help bridge; after the cap the session continues without a third probe or shame.
- **Expected backend/dashboard:** stable misconception fingerprint; probes 1 then 2 only; prior question
  resolutions; `two_probe_cap_helped`; zero violation; conservative uncertain evidence, never marks.
- **Failure:** third probe, repeated wording, mocking, ability judgment, endless refusal, or official grade
  change.
- **Ask/capture:** “Did the correction preserve your dignity?”, “Was the help early enough?”, “Would you try
  another misconception?” Capture both probes, help, event sequence, zero-violation dashboard.

### 4. “I don’t know,” hint, help, revision, and safe skip

- **Navigate/script/actions:** topic “osmosis”; submit “Osmosis is when water moves.” Use I don’t know, repeat
  in fresh sessions with Hint and Skip, then revise the original segment.
- **Expected UI:** every path gives a bridge or safe continuation; no withholding vacuum; revised text becomes
  source of truth and stale follow-up is retired; progress remains finite.
- **Expected backend/dashboard:** help/skip event and count, resolved follow-up, reset gap/probes, corrected
  segment analysis, optimistic version increment, no duplicate command result.
- **Failure:** trapped composer, help refusal, stale question remains open, duplicate move, or revision loses
  provenance.
- **Ask/capture:** “Was it safe to admit not knowing?”, “Did the hint preserve something for you to explain?”
  Capture each resolution state, correction indicator, and help dashboard delta.

### 5. Optional voice flow — deferred Stage 9 physical device gate

- **Navigate/script/actions:** only after explicitly resuming Stage 9 device QA. Use iPhone Safari, Android
  Chrome, desktop Chrome/Firefox, wired headset, Bluetooth headset, built-in mic, walking/noise, airplane/
  reconnect, interruption, background/lock, pause/resume, mixed-language and pronunciation scripts. Record,
  replay, correct transcript, submit, and switch a turn to text.
- **Expected UI:** recording is initially off; visible timer/captions/replay; background/pause/close stops mic;
  low-confidence transcript is editable and not conceptually judged; text is complete; permission denial and
  route failure recover without provider leakage.
- **Expected backend/dashboard:** owner media/retention, independent STT/TTS attempts, cache bypass, correction
  source-of-truth, segment media link, linked aggregate cost/latency/retry/fallback; no raw audio/transcript in
  Teach-it-back admin.
- **Failure:** background recording, false misconception from STT, audio-only essential information, retention
  breach, cross-owner media, or any production-ready gate before the full matrix passes.
- **Ask/capture:** comfort, transcript accuracy, interruption naturalness, walking usability, preferred text/
  voice choice; capture device permissions, stopped-mic indicator, corrected transcript, media expiry, routing
  and dashboard IDs. Until complete, keep `productionDeviceQaPassed=false`.

### 6. Verdict and artifact ownership inspection

- **Navigate/script/actions:** finish a session with one clear point and one gap. Inspect every verdict field,
  edit the recap, deselect/reselect, save once, retry the same save key, and discard in a fresh session.
- **Expected UI:** no numeric judgment; all verdict claims have visible segment excerpts; one improvement;
  audience fit; uncertainty when fallback used; marks false; proposal requires edit/select/save.
- **Expected backend/dashboard:** verdict schema validation; `artifact_commit`; proposal created, edited, saved
  only once; idempotent commit/duplicate prevention; proposal/save counts reconcile.
- **Failure:** unsupported evidence, score language anywhere, auto-save, duplicate artifact, or proposal text
  written into aggregate telemetry.
- **Ask/capture:** “Did the verdict teach you something specific?”, “Did the saved recap still feel like your
  work?” Capture before/after edit, saved artifact provenance, event counts.

### 7. Voluntary repeatability and fun

- **Navigate/script/actions:** after verdict, offer no reward or instruction. Observe whether reviewer chooses
  “Teach this topic again,” “Teach another topic,” or leaves. If repeating, use a new concept and complete it.
- **Expected UI/backend:** both choices are explicit; same-topic repeat sends the prior session ID; dashboard
  `repeatedVoluntarily` increments; there is no streak pressure, conversion prompt, or manipulative copy.
- **Failure:** counting refresh/retry as repeat, coercive engagement, or declaring success from completion.
- **Ask/capture:** 1–5 enjoyment is allowed only as research, not product verdict; ask “What made you want/not
  want another?”, “Which question felt most alive or most mechanical?”, “Would you use this before an exam?”
  Capture choice, lineage IDs, qualitative reason. Stage success requires credible positive reasons from at
  least two reviewers.

### 8. Diagnostics trace

- **Navigate/script/actions:** Super Admin `/ai/petros-teach-back`; filter the QA institution/mode/gap. Trace
  known IDs from segment through analysis, follow-up, help/cap, verdict, learner update, and proposal/save.
- **Expected UI/backend:** aggregate-only counts reconcile with owner-private database rows; abandon points,
  one-way topic references, validation/fallback and cost/latency are accurate; audit read is written.
- **Failure:** raw text/excerpt/name/media URL, mismatched tenant, missing link, impossible probe count, or
  unaudited read.
- **Ask/capture:** operator: “Could you diagnose reliability without reading student speech?” Capture filtered
  page, count reconciliation query, and immutable audit event.

### 9. AI Routing pause/fallback/cost acceptance

- **Navigate/script/actions:** Super Admin `/ai/petros-routing`; inspect all three dedicated functions and
  linked STT/TTS. Record baseline route preview, pause the primary in QA, run one scripted session, verify
  deterministic/fallback recovery, then restore the exact route state.
- **Expected UI/backend:** function/prompt/schema versions, capability and budgets, attempts, provider/model,
  validation, retry/fallback, latency/cost; student receives provider-neutral copy; fallback event is marked
  not validated by live AI, not falsely successful.
- **Failure:** broken core flow, provider name/key leakage, unmetered attempt, budget bypass, or route not
  restored.
- **Ask/capture:** operator: “Was the degraded verdict honest and usable?” Capture before/pause/after route,
  attempt IDs, Teach-it-back function rows, restoration evidence.

### 10. Six-persona quality dashboard review

- **Navigate/script/actions:** run complete-clear, fluent-causal-gap, confidently-wrong, very-short,
  verbose-confused, and STT-corrupted scripts from `fixtures/teach-back.ts`; inspect automated findings and
  read each transcript/output pair as a human.
- **Expected:** correct gap or no gap, grounded relevant question, no takeover, respectful tone, unique probes,
  evidence-supported verdict, explicit uncertainty for STT; enjoyment/specificity assessed independently of
  repetition count.
- **Failure:** any deliberate irrelevant/mocking/lecturing/repetitive/unsupported mutation passes, or fixture
  evidence disagrees with human reading.
- **Ask/capture:** reviewers rank relevance, respect, usefulness, and naturalness separately and explain one
  mismatch. Capture quality output, evidence refs, human adjudication, follow-up issue if needed.

### 11. Privacy, accessibility, responsive, and recovery acceptance

- **Navigate/script/actions:** use two tenant learners and an `ai.view` operator; attempt cross-tenant IDs;
  keyboard-only and VoiceOver/NVDA/TalkBack; 320/390/768/1440 widths, 200/400% zoom, reduced motion, slow 3G,
  offline/reconnect, refresh, optimistic conflict, pause/resume, captions/text-only.
- **Expected UI/backend:** semantic tab/panel/labels/status/error; focus remains usable; no horizontal loss;
  complete text alternative; truthful reload/retry; no duplicate command; owner queries return 404; aggregate
  admin and audit remain content-free; retention/deletion inherited from Stage 9.
- **Failure:** focus trap, unlabeled control, audio-only content, inaccessible evidence, silent data loss,
  duplicate session, cross-tenant existence leak, support raw-content access, or motion/overflow blocker.
- **Ask/capture:** “Could you complete this without sight/audio/mouse?”, “Did recovery preserve your words?”
  Capture accessibility tree/reader notes, viewport screenshots, network/conflict state, denial response, audit.

## Limitations and Stage 11 prerequisites

- Stage 9 physical microphone/device QA must pass before enabling any voice production-readiness flag.
- Two or more human reviewers must complete the runbook and provide credible positive voluntary-repeat reasons.
- Signed-in browser acceptance must cover student/admin desktop/mobile, keyboard, screen readers, reduced motion,
  slow/offline recovery, and cross-tenant denial.
- Assign and test real provider routes only in a cost-bounded QA environment; reconcile live costs and restore
  paused routes. Current external model cost is zero.
- Install/configure a non-interactive ESLint toolchain, then run the requested lints.
- Resolve or explicitly baseline the two unrelated schema-suite quick-check failures.
- Do not begin Stage 11 reflection surfaces until these Stage 10 gates and inherited Stage 9 voice gate are
  recorded honestly.

**Stage 10 not complete.**
