# Petros Stage 9 handoff — photo, handwriting, voice, and five-minute modes

Date: 2026-08-12  
Stage prompt: `docs/petros-stage-prompts/09-stage-09-input-modes.md`  
Status: **Stage 9 not complete**

The Stage 9 product, persistence, provider-independent routing, safety controls, student/admin UI,
fixtures, focused automation, builds, and a signed-in browser acceptance pass are implemented. The
prompt's Definition of Done additionally requires a successful real photographed-question extraction,
accurate human-reviewed line-linked handwriting critique, real microphone/headphone voice use, fluent-human
mixed-language assessment, and complete device/privacy/dashboard reconciliation. No capable vision, OCR,
handwriting, STT, or TTS route was assigned in the development database, no external production scanner was
configured, and no physical audio device or fluent language reviewer was available. Stage 8's separate
human acceptance gate is also still open. Those are release gates, not silently claimed as passes.

## Scope and shared-engine architecture

Stage 9 adds four optional entrances to the existing Petros learning document. It does not add a generic
chat page and does not implement Stage 10 Teach-it-back.

1. **Snap a question** — camera/file, crop/rotate/retake, image understanding, separate question
   extraction, multi-question selection, student correction, explicit stuck point, and a maximum-three-move
   Doubt session. Its opening asks where the learner is stuck and gives the fastest useful next step; it
   marks `completeSolutionIncluded=false`.
2. **Show handwritten work** — up to ten ordered pages, per-page crop/rotate, line recognition with
   normalized coordinates/confidence/uncertain tokens, editable accessible line list, line overlay,
   first-break versus consequence evaluation, grader-circle/mark impact, missing-step teaching, and a
   Repair reattempt.
3. **Voice session** — independent STT, spoken-interaction, and TTS functions; push-to-talk, optional
   30-second walking turns, replay, transcript correction, captions, mute, interruption, background stop,
   and explicit switch to the shared text session. Recording is off until the learner acts and all essential
   content has a text equivalent.
4. **Five-minute mode** — exactly `predict_then_reveal`, `layered_explanation`, `recall_check`, and
   `artifact_commit`, with 300 seconds and four moves persisted on the session. The longer-session choice is
   rendered only after deliberate close; offering and accepting it are separate idempotent events.

All media AI work calls `PetrosAiGatewayService.execute`. Stable registered functions are
`vision.image.understand`, `vision.question.extract`, `vision.handwriting.analyse`,
`work.handwriting.evaluate`, `speech.transcribe`, `interaction.spoken`, and `speech.synthesise`. The first
three modes create the existing Doubt/Repair/Learn session documents; they retain PLAN/RENDER/OBSERVE,
Why-this evidence, interaction state, pause/resume, artifact proposal/curation, and provider-neutral errors.
Five-minute mode uses the same loop policy and artifact store.

The OpenAI-compatible adapter now translates audio transcription and speech synthesis to their protocol
endpoints, supports binary responses and audio input, and the gateway supports per-call `disableCache`.
Every sensitive-media request bypasses response caching. No browser receives a provider credential or calls
a provider directly.

## Media security, storage, migration, and limits

Migration `packages/database/migrations/0196_petros_input_modes.sql` creates:

- `petros_media_objects` — owner, provenance, declared/detected type, transform, sanitized hash, duplicate,
  scan/lifecycle, structured result, hashed correction audit, expiry, session, and correlation metadata;
- `petros_media_jobs` — typed bounded job state, up to three attempts, retry/cancel/failure state, registered
  function reference, confidence, and provider request identifier;
- `petros_modality_events` — content-free mode/function/provider-model/cache/media-unit/latency/retry/fallback/
  confidence/correction/error/cost telemetry.

All three tables have forced RLS and institution-plus-student owner policies. The migrated development
database was read back and confirmed `row_security=true`, `force_row_security=true`, with all three owner
policies and the provider/model/cache telemetry columns present.

The common ingestion path enforces an expiring idempotent upload intent, daily owner quota, allowlisted MIME,
magic-byte MIME match, byte/duration/resolution limits, image metadata stripping, SHA-256 hash and owner-only
dedupe, safety scan/quarantine, owner-private object storage, signed student-bound short-lived content access,
typed processing, retry/cancel, short raw-media expiry, explicit export/delete, and orphan cleanup. Student
corrections are the source of truth; correction audit stores hashes and flags rather than duplicate raw text.
No biometric, identity, disability, emotion, mood, or mental-health inference is performed.

Defaults, configurable through `.env.example`:

| Control | Default |
| --- | ---: |
| Image bytes | 10 MiB |
| Audio bytes per turn | 12 MiB |
| Audio duration per turn | 120 seconds |
| Image resolution | 24 megapixels |
| Uploads per student/day | 50 |
| Raw image retention | 24 hours |
| Raw audio retention | 1 hour |
| Upload intent lifetime | 15 minutes |
| Processing attempts | 3 |

`PETROS_MEDIA_SIGNING_SECRET` is mandatory in production. `PETROS_MEDIA_SCAN_URL` and optional
`PETROS_MEDIA_SCAN_TOKEN` configure the real scan service. Production now fails closed and leaves the object
quarantined when no external scanner is configured. The local EICAR-only signature checker is explicitly
development/test protection, not an antivirus claim. Current object storage is the repository's owner-scoped
local driver; a production object-store driver remains a deployment prerequisite.

## Admin and operational visibility

Provider management exposes vision, audio input/output, STT, TTS, audio streaming, OCR, handwriting,
structured output, and existing capabilities. The function registry contains all seven Stage 9 functions,
each independently assignable and fallback-capable.

`/ai/petros-modalities` requires `ai.view`; cleanup requires `ai.manage`. The aggregate-only dashboard
reports volume, successes/failures, low confidence/corrections, stage latency, retries/fallbacks, estimated
and actual cost, provider/model, function, institution, mode/media unit, cache bypass, capability mismatch,
storage/job state, voice failure modes, and five-minute start/offer/accept/duration. It returns no raw image,
audio, transcript, question, learner name, or provider response. Each dashboard read writes
`petros.modalities.dashboard.view` to the immutable audit trail with `contentInspected=false`. Broad raw
support access is intentionally disabled.

## Primary files

- Contracts and registry: `packages/schemas/src/petros-input-modes.ts`,
  `packages/schemas/src/petros-ai-routing.ts`, `packages/schemas/src/petros-learning.ts`
- Schema and migration: `packages/database/src/schema/petros-input-modes.ts`,
  `packages/database/migrations/0196_petros_input_modes.sql`
- API/state machine/safety: `apps/api/src/modules/student/petros-input-modes/`
- Shared provider adapters/cache behavior: `apps/api/src/modules/petros-ai-routing/`
- Student experience: `apps/student-web/src/components/petros/petros-input-modes.tsx`,
  `petros-input-modes.module.css`, and `petros-repair-session.tsx`
- Student route: `apps/student-web/src/app/(app)/petros/page.tsx`
- Operations dashboard: `apps/super-admin-web/src/app/(app)/ai/petros-modalities/page.tsx`
- Quality corpus: `packages/learn-evals/src/fixtures/multimodal.ts`,
  `packages/learn-evals/src/multimodal-quality.spec.ts`
- Routing guide: `docs/PETROS-AI-ROUTING.md`

## Executed automated verification

All Stage 9 fixture/provider checks below are deterministic mocks or synthetic/CC0 fixtures; none spent
external provider money or exercised a physical camera/microphone.

- `pnpm --filter @edrion/schemas exec vitest run src/petros-input-modes.spec.ts` — 4/4 passed.
- `pnpm --filter @edrion/api exec vitest run src/modules/student/petros-input-modes/petros-media-safety.spec.ts src/modules/student/petros-input-modes/petros-input-modes.service.spec.ts` — 10/10 passed after the production fail-closed and typed-fallback additions.
- `pnpm --filter @edrion/api exec vitest run src/modules/student/petros-loop/petros-loop.policy.spec.ts src/modules/student/petros-loop/petros-observation.policy.spec.ts` — 26/26 passed.
- `pnpm --filter @edrion/api exec vitest run src/modules/petros-ai-routing/petros-ai-gateway.service.spec.ts src/modules/petros-ai-routing/petros-response-validator.spec.ts src/modules/petros-ai-routing/petros-routing-engine.spec.ts` — 13/13 passed.
- `pnpm --filter @edrion/student-web exec vitest run src/components/petros/petros-input-modes.spec.tsx` — 2/2 passed.
- `pnpm --filter @edrion/learn-evals exec vitest run src/multimodal-quality.spec.ts` — 4/4 passed across snap, handwriting, voice, and five-minute correctness, pedagogy, pacing, artifact, and privacy assertions.
- Typechecks passed for `@edrion/schemas`, `@edrion/database`, `@edrion/api`,
  `@edrion/student-web`, `@edrion/super-admin-web`, and `@edrion/learn-evals`.
- `pnpm --filter @edrion/api build`, `pnpm --filter @edrion/student-web build`, and
  `pnpm --filter @edrion/super-admin-web build` passed. Both Next builds emitted only the existing ambiguous
  Tailwind `ease-[var(--ease-emphasized)]` warning.
- `pnpm --filter @edrion/database migrate` passed; the migration and forced-RLS policies were read back.
- Stage 9-scoped `git diff --check` passed for tracked changes.

Lint could not start because the workspace command resolves no `eslint` binary (`Command "eslint" not
found`). A package-wide schema run also retained two unrelated pre-existing failures in
`student/exam-questions.spec.ts` (quick-check pause and duration expectations); the Stage 9 schema suite
itself passed.

## Signed-in browser and live database evidence

Browser: Codex in-app Chromium-compatible browser. Student: seeded Aarav, institution
`27284a40-1166-4b73-aafc-f9906f468f73`, student `88ab5c8e-c136-4b2d-9a08-46f7d5f74668`.

- The `/petros` page exposed four named, accessible tab panels. At a real 390×844 browser viewport the
  completed session had `innerWidth=390`, document width `375`, and no horizontal overflow.
- Five-minute session `4ee128fa-61ae-40a0-8b47-98a5959090cb` completed all four exact moves in 65,749 ms,
  closed `goal_met`, produced three artifact proposals and saved none, then displayed “Choose a full
  session.” The dashboard reconciled started 1, offered 1, accepted 0. The longer session was not opened.
- A repository-owned JPEG was selected through the real file chooser, rotated 90 degrees, center-cropped,
  re-encoded, uploaded, metadata-sanitized, scanned clean, stored, and sent to routing. With no capable vision
  route it entered truthful retry state. The UI exposed Retry, Retake, Cancel, and typed fallback. Media
  `1f76e712-a893-484a-99ce-bb568b76d969`, storage
  `73b7f21e-d622-4b80-8229-3821531eb49b`, job
  `eef8f2a5-b5de-4b3e-8966-a65bff7fe09d`, correlation
  `54e348df-25b3-49f5-b4d6-3c2578ebcf29` retained clean scan, 24-hour expiry, transform, bounded retry,
  `vision.question.extract`, and provider-neutral `PETROS_NO_CAPABLE_ROUTE` evidence.
- The typed fallback opened Doubt session `40bc4bf2-7014-4e74-b7e1-91529552d49d`. Its first screen asked
  the four stuck-point choices, identified “setting up,” supplied the fastest useful setup step, and stated
  that no complete solution was shown. The confirmed typed question became the source of truth.
- A two-page handwriting file selection confirmed a multiple-file chooser, numbered queue, and page reorder.
  Provider recognition/evaluation was not claimed because no handwriting-capable route was assigned.
- Voice session `519980b8-e4bd-4966-aec7-b7915e0947bb` started with recording off and exposed Talk, mute,
  interrupt/new turn, and switch-to-text. Switch-to-text opened the same five-move Petros session and recorded
  a content-free event. Microphone permission was not requested or granted, so capture/STT/TTS is pending.
- The routing UI showed 64 registered functions including image understanding, question extraction,
  handwriting analysis, speech-to-text, spoken interaction, and text-to-speech. The Add Provider dialog
  showed vision, audio input/output, STT, TTS, audio streaming, OCR, handwriting, and structured output;
  it was closed without saving.
- Final aggregate dashboard: input volume 4, success 2, corrections 1, retained media 2, jobs 2; two snap
  inputs, one voice start, one five-minute start; scan average 17 ms, image-understanding failure 29 ms,
  question-extraction/error aggregate 30 ms; cache hits 0, one sensitive-media cache bypass, three capability
  mismatch signals, estimated/actual cost 0 micros. No raw content appeared.
- Three latest immutable dashboard-read audits returned `contentInspected=false`. Database event readback
  reconciled upload intent/ready, function failure, processing failure, student confirmation, voice start/
  switch, five-minute start/offer, and their fixture/session IDs.

Screenshots:

- `/Users/macbook/.codex/visualizations/2026/08/12/019ff6a1-3e2a-7171-b84c-ad5948e5cd34/petros-stage9-five-minute-closed-mobile-390-final.jpg`
- `/Users/macbook/.codex/visualizations/2026/08/12/019ff6a1-3e2a-7171-b84c-ad5948e5cd34/petros-stage9-modalities-admin.jpg`

Live provider/device cost: **0 µUSD**. Shared-loop live generation degraded transparently to the existing
deterministic built-in teaching blocks. No external vision, handwriting, speech, or synthesis request ran.

## Mandatory manual QA and dashboard acceptance runbook

Use a dedicated QA learner and reversible provider routes. Never capture cookies, tokens, credentials, or
another learner's content. For every row, retain before/after screenshots, UTC timestamps, media/job/session/
correlation IDs, provider/model/function attempt IDs, the filtered routing export, and the filtered modality
dashboard export. “Expected backend” always includes owner scope, content-free telemetry, and zero raw media
in admin responses.

### 1. Clear textbook photo

- **Device/browser:** physical iPhone Safari and Android Chrome; also desktop Chrome file fallback.
- **Navigate/fixture/actions:** `/petros` → Snap; use a licensed single algebra question with high contrast;
  photograph, crop, rotate if needed, process, compare/correct extraction, select each stuck-point option,
  confirm one, and complete the first block.
- **Expected frontend/backend:** preview remains accessible; extracted text/diagram is editable; the opening
  asks the stuck point and gives one fastest useful step before any solution; one clean owner media row,
  independent image-understanding and question-extraction calls, confirmation hash audit, one idempotent
  maximum-three-move Doubt session, dashboard latency/cost/provider-model reconciliation.
- **Fail/capture:** fail on final-answer-first, invented text, duplicate session, client/provider credential,
  or wrong image linkage. Capture original/crop/correction/opening/first block and all IDs.

### 2. Difficult photo cases

- **Device/browser:** same physical phones plus desktop Chrome at 400% zoom.
- **Navigate/fixture/actions:** repeat Snap with 90/180/270-degree rotation, controlled glare, low light, two
  questions, a labeled diagram, handwriting overlap, unsupported text/PDF, an over-10-MiB image, over-24-MP
  image, EICAR test fixture in an isolated test scanner, and scanner outage.
- **Expected frontend/backend:** multi-question selector; honest diagram description; low-quality retake/crop
  guidance; MIME/size/resolution rejected before provider; unsafe/scanner-unavailable stays quarantined;
  retry bounded at three; Retake/Retry/Cancel/typed fallback remain available; dashboard matches each reason.
- **Fail/capture:** fail if quarantined bytes reach a provider, failures expose provider names, unsupported
  content is guessed, or retry exceeds three. Capture every error state and dashboard delta.

### 3. Handwriting critique

- **Device/browser:** physical phone camera plus iPad/desktop browser and keyboard.
- **Navigate/fixture/actions:** Show your work; upload a CC0/synthetic two-page derivation containing one
  deliberate method break followed by one arithmetic consequence; reorder pages, crop, correct recognized
  lines, confirm, inspect overlay/accessibility list, open Repair, and perform the reattempt.
- **Expected frontend/backend:** stable reading order and coordinates; first break visually and textually
  distinct from consequence; concept/method/arithmetic/notation/misread/time-pressure category, grader circle,
  mark impact, one missing teaching step, reattempt prompt; separate handwriting and evaluation calls; Repair
  starts at the first break and dashboard reconciles both.
- **Fail/capture:** fail on whole-solution replacement, grading without confirmation, line mismatch, or later
  arithmetic marked as root cause. Capture pages, corrected lines, overlay, accessible list, evaluation, session.

### 4. Low-confidence handwriting

- **Device/browser:** physical phone under controlled low light plus VoiceOver/TalkBack and keyboard.
- **Navigate/fixture/actions:** upload faint/cursive/partially cropped synthetic work with one unreadable line;
  inspect warnings, tab through every line, correct uncertainty, then evaluate.
- **Expected frontend/backend:** confidence/uncertain tokens announced; Petros refuses certainty and requires
  correction/retake; evaluation uses confirmed lines only; raw uncertain text is not copied into operational
  events.
- **Fail/capture:** fail if it invents a line, disables correction, or overlay is the only feedback. Capture
  screen-reader notes, focus order, before/after hashes, and confidence aggregates.

### 5. Voice walking flow

- **Device/browser:** physical iPhone Safari and Android Chrome with wired and Bluetooth headphones.
- **Navigate/fixture/actions:** Voice; review permission copy; start push-to-talk, replay, correct transcript,
  submit, interrupt spoken output, enable 30-second walking mode, pause/resume the text session, mute, switch
  to text, lock/background and return, then finish.
- **Expected frontend/backend:** unmistakable recording state; recording starts only after action and stops on
  stop/background/unmount/limit; every spoken move has captions; STT correction is source of truth; STT,
  spoken generation, and TTS have separate function/cost rows; interruption never loses session state.
- **Fail/capture:** fail on background recording, audio-only information, stale playback after interruption,
  or transcript bypass. Capture screen recording, headset/output notes, timestamps, media/turn/session IDs.

### 6. Voice failures

- **Device/browser:** both physical phones, throttled network, and provider admin in desktop Chrome.
- **Navigate/fixture/actions:** deny mic; grant/revoke mid-flow; add controlled noise; drop network during upload
  and after STT; pause STT, spoken, then TTS routes separately; disconnect/change headset; background app.
- **Expected frontend/backend:** permission education and text fallback; replay/correction retained; upload is
  idempotent; no false transcript; provider-neutral retry/degradation; TTS failure preserves complete text;
  permission/noise/disconnect/TTS/background counters reconcile and paused routes restore safely.
- **Fail/capture:** fail on lost document state, continued recording, secret/provider leakage, or one paused
  function disabling unrelated voice functions. Capture each failure/counter before and after restoration.

### 7. Mixed language

- **Device/browser:** physical phone/headset with a fluent human reviewer for each enabled language pair.
- **Navigate/fixture/actions:** enable mixed-language mode; ask and answer with natural code switching; correct a
  deliberate transcription error; listen to names, formulas, and technical terms; repeat through text fallback.
- **Expected frontend/backend:** declared language/preferences reach independent functions; transcript remains
  editable and complete; pronunciation/comprehension score is assessed by the human, not inferred from voice;
  no identity, mood, or proficiency label is persisted.
- **Fail/capture:** fail on materially changed meaning, missing captions, invented pronunciation confidence,
  or an essential audio-only instruction. Capture reviewer rubric, transcript diffs, audio notes, route IDs.

### 8. Five-minute mode

- **Device/browser:** physical phone and desktop browser with an external stopwatch.
- **Navigate/fixture/actions:** `/petros` → Five-minute; enter one concept/goal; time and complete every move;
  save one curated card on one run and decline on another; close; verify the longer-session offer; accept only
  in a separate run.
- **Expected frontend/backend:** exact four-move progress and finite copy; close near five minutes; evidence and
  selected artifacts persist; no fifth move; offer only after close; offered and accepted count separately;
  300-second/four-move units and actual duration reconcile.
- **Fail/capture:** fail on automatic expansion, offer before close, missing artifact consent, or engagement-
  optimization metric. Capture stopwatch, each move, close/offer, accepted/nonaccepted dashboard rows.

### 9. Routing dashboard

- **Device/browser:** desktop Chrome, authorized `ai.manage` account.
- **Navigate/fixture/actions:** `/ai/petros-routing`; inspect all seven functions and provider/model capabilities;
  dry-run image/audio contexts; assign primary plus reversible fallback; run one fixture per function; pause each
  primary independently, observe fallback, then restore the exact prior configuration.
- **Expected frontend/backend:** only capability-compatible models selectable; sensitive calls cache-disabled;
  each function attempt reports model, latency, cost, retry/fallback and validation; student UI stays provider-
  neutral; every admin change is audited.
- **Fail/capture:** fail on hardcoded provider, incompatible selection, cached raw media, missing attempt, or
  unrestored route. Export before/after configuration and per-function reconciliation.

### 10. Modality operations dashboard

- **Device/browser:** desktop Chrome, authorized `ai.view` account.
- **Navigate/fixture/actions:** `/ai/petros-modalities`; filter by mode/function/institution and compare the
  fixture ledger from steps 1–9; run cleanup after expiry in a disposable fixture; inspect quarantine/orphan/
  deletion and voice/five-minute metrics.
- **Expected frontend/backend:** exact volume/success/failure/confidence/correction/latency/cost/media-unit/
  fallback/cache/mismatch/storage/job/voice/duration totals; provider/model only aggregate; dashboard read audit
  has `contentInspected=false`.
- **Fail/capture:** fail on raw image/audio/transcript/question/name, unexplained count/cost delta, or unaudited
  read. Capture filtered screens, API JSON, SQL aggregate, and audit event ID.

### 11. Privacy and security

- **Device/browser:** two isolated browser profiles for two institutions plus database/security tooling.
- **Navigate/fixture/actions:** create media as tenant A; attempt read/process/confirm/access/export/delete as
  tenant B and a second learner in A; replay/alter/expire signed URLs; inspect raw-object expiry; delete and run
  orphan cleanup; attempt support access without/with an approved time-limited mechanism.
- **Expected frontend/backend:** uniform owner-safe not-found behavior, forced RLS, student-bound expiring token,
  no cross-owner hash dedupe, bytes removed at deletion/expiry, confirmed learning evidence handled per policy,
  broad raw support rejected; any future privileged access time-limited and immutable-audited.
- **Fail/capture:** fail on metadata/content leak, durable signed URL, raw bytes after cleanup, deletion of another
  learner, or unaudited support access. Retain only IDs/status/policy output—never foreign content.

### 12. Accessibility and responsiveness

- **Device/browser:** iPhone portrait/landscape Safari, Android portrait/landscape Chrome, desktop Chrome/
  Firefox/Safari; VoiceOver, TalkBack, NVDA/VoiceOver; 200/400% zoom, large text, reduced motion, slow 3G/offline.
- **Navigate/fixture/actions:** keyboard through all tabs, file controls, crop/rotate/reorder/corrections/overlay
  alternatives/voice controls/five-minute blocks; run no-camera and no-microphone paths; rotate/zoom during
  processing; disconnect/reconnect and resume.
- **Expected frontend/backend:** named tab panels, visible focus, logical order, 44px voice targets, accessible
  line list, captions, status/error announcements, no horizontal loss at supported breakpoints, no forced
  animation, provider-neutral retry and persisted block state.
- **Fail/capture:** fail on keyboard trap, overlay-only information, hidden recording state, truncated controls,
  lost state, or unavailable file/text alternative. Capture screenshots at each breakpoint, accessibility
  tree/focus notes, reduced-motion and offline recovery evidence.

## Limitations and Stage 10 prerequisites

- Assign and validate real capability-compatible vision, question extraction, handwriting, work-evaluation,
  STT, spoken-interaction, and TTS routes with explicit cost ceilings and reversible fallbacks.
- Configure and validate the external production scanner and production object-storage driver; load-test upload,
  signing, expiry, deletion, and orphan cleanup.
- Complete the 12-step physical-device/human runbook, especially real photo teaching, handwriting accuracy,
  microphone/headset interruption, mixed-language human assessment, cross-tenant/security, and accessibility.
- Complete the outstanding Stage 8 human browser acceptance gate before claiming the prerequisite doors stable.
- Decide whether multi-page handwriting must be evaluated as one consolidated attempt; this implementation
  queues/reorders up to ten pages but processes and critiques the active page independently.
- Keep Stage 10 Teach-it-back separate. It may consume these confirmed transcripts/steps and the shared loop,
  but must not broaden recording, inference, raw-media access, or automatic engagement behavior.

**Stage 9 not complete**
