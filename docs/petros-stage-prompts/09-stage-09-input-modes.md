# Execution prompt 09 of 13 — Stage 9: photo, handwriting, voice, and five-minute modes

Use this prompt only after the five Stage 8 doors are stable. Complete multimodal inputs and the
five-minute session mode. Do not implement Teach-it-back from Stage 10.

## Mission

Let students enter Petros through the media they actually use: photograph a textbook question,
photograph handwritten work for line-by-line critique, run a hands-free voice session, or choose a
focused five-minute session. These modes must still feed the same PLAN/RENDER/OBSERVE engine and
must teach rather than simply output answers.

Provider capabilities are replaceable infrastructure. Every vision, OCR, handwriting, speech-to-text,
text-to-speech, and spoken-interaction capability must be a registered configurable AI Function.

## Required reading and entry gate

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` fully, particularly Parts 5–8, 10, and Stage 9.
2. Read `docs/PETROS-AI-ROUTING.md`; inspect upload/storage security, provider capability registry,
   input modality schemas, session intents, and existing audio/image components.
3. Verify all Stage 8 doors and their analytics manually.
4. Inspect privacy/retention, antivirus/content scanning, object storage, file limits, accessibility,
   and browser/mobile media APIs already used in the repo.
5. Preserve worktree changes. Do not expose API keys or send provider credentials to clients.

## Common multimodal ingestion pipeline

Implement secure, typed ingestion with:

- student/institution ownership and permission checks;
- explicit allowed MIME/type/size/duration/resolution limits;
- upload intent, scanning/quarantine, storage, processing, retry, expiry, and deletion states;
- EXIF/location stripping where appropriate;
- signed server-side provider access, never browser-to-provider secrets;
- content hash/idempotency and duplicate handling;
- accessible preview and user confirmation/crop/rotate/retake;
- source provenance and correlation IDs;
- retention/deletion/export disclosure;
- provider capability selection and fallback through the routing engine;
- clear handling for unreadable, unsupported, unsafe, or partial input.

Do not store biometric/emotional voice conclusions. Do not infer disability, identity, mood, or mental
health from an image or voice.

## Mode 1: snap a question

- Capture/upload a textbook or worksheet question and optionally crop the relevant region.
- Use registered image-understanding and question-extraction functions with structured validation.
- Display extracted question/context for student correction before teaching.
- First response must ask where the student is stuck—understanding, setting up, choosing a method, or
  solving—plus the fastest useful next step. Do not lead with the complete solution.
- Feed corrected extraction and stuck-point observation into a short Doubt session.
- Preserve source-image linkage without unnecessarily retaining the original forever.
- Handle multiple questions, diagrams, low light, rotation, glare, handwriting overlap, and unsupported
  content honestly.

## Mode 2: show handwritten work

- Capture/upload a student’s attempted work and let them order/crop pages.
- Register/use handwriting analysis and step-by-step work evaluation functions.
- Extract a structured sequence of lines/steps with confidence and coordinates.
- Show the recognized work for correction before critique.
- Identify the first logical break, later consequence errors, mark-losing step, and what a grader
  would circle; distinguish concept, method, arithmetic, notation, misread, and time-pressure errors.
- Teach the missing step and offer a reattempt. Do not merely grade or replace the whole solution.
- Visually link feedback to the relevant line while providing a nonvisual accessible equivalent.
- Never claim certainty when handwriting confidence is low.

## Mode 3: voice sessions

- Register/use speech-to-text, text-to-speech, and spoken-interaction functions independently.
- Provide push-to-talk and a safe hands-free option with clear recording state, permission, stop,
  replay, transcript, correction, mute, and switch-to-text.
- Support interruption/barge-in where the chosen stack permits and degrade gracefully otherwise.
- Keep spoken turns structured as session moves/observations, not chat messages.
- Keep prompts and responses concise enough for walking/commuting; announce progress and choices.
- Respect language/mixed-language preference and pronunciation.
- Make voice optional, accessible, and safe: no required continuous recording, no background capture
  after pause/close, and no essential information available only as audio.
- Handle network drop, permission denial, noisy audio, STT uncertainty, TTS failure, headset changes,
  and app/background limitations honestly.

## Mode 4: five-minute mode

- Accept one concept/goal and enforce a small time/move budget.
- Structure around one guess, one targeted teaching move, one check, and one curated card/forward link.
- Use faster route preferences only through configurable routing rules, never hardcoded providers.
- End deliberately near five minutes; do not turn into a full session without explicit student choice.
- Preserve learning evidence and artifacts just like longer sessions.

## Backend/API requirements

- Processing jobs/state machines for image/audio ingestion with bounded retries, cancellation, and
  cleanup.
- Typed outputs and confidence from extraction/transcription; student corrections become the source
  of truth and are audited without preserving unnecessary sensitive raw media.
- Capability-aware route planning for image/audio input and response formats.
- Per-function quotas, duration/file limits, cost ceilings, institution policy, and abuse controls.
- Idempotent session creation from processed media.
- Storage lifecycle, malware/quarantine, deletion/export, and orphan cleanup.
- Usage events include modality, media units where relevant, latency stages, errors, retries,
  fallbacks, and actual/estimated cost.

## Frontend requirements

- Native-feeling camera/file/microphone entry in relevant portal contexts without a generic chat page.
- Clear permission education and fallback to file/text input.
- Crop/rotate/retake, progress, cancel, retry, and correction screens.
- Handwriting overlays remain usable at mobile/desktop zoom and by keyboard/screen reader.
- Voice controls have large targets, unmistakable recording state, captions/transcript, and safe
  background behavior.
- Five-minute mode shows the finite promise and progress.
- All modes preserve block state, “Why this?”, artifact curation, resume, and provider-neutral errors.

## Admin/dashboard requirements

Extend Provider/Model management and Petros AI Routing to show capability-compatible options for
vision, image, STT, TTS, audio streaming, and structured output. Add modality operations views for:

- volume, success/failure, unreadable/low-confidence rate, correction rate;
- upload/scan/extraction/STT/TTS/end-to-end latency;
- cost by function, provider/model, institution, mode, and media unit;
- fallback/cache use and capability mismatch;
- storage/quarantine/orphan/deletion jobs;
- voice disconnect/permission/noise failure rates;
- five-minute completion and actual duration without manipulative engagement goals.

Never display raw student images/audio broadly. Privileged support access must be time-limited and audited.

## Automated verification required

Use licensed/synthetic fixtures and cover:

- file/MIME/size/duration validation, scan/quarantine, EXIF stripping, signed access, cleanup;
- question extraction schema, student correction, multi-question/low-quality handling;
- first snapped-question response teaches/clarifies instead of dumping a solution;
- handwriting step ordering, confidence, correction, first-break/consequence distinction, overlays;
- STT/TTS/spoken function separation, capability routing, language, interruption/degradation;
- recording stops on pause/close and raw media retention policy;
- five-minute move/time cap and explicit expansion choice;
- cost/quota/budget enforcement and provider fallback;
- idempotent jobs/session creation and network retry;
- ownership/cross-tenant/privacy/export/deletion;
- accessible alternatives and provider-neutral errors;
- Stage 5 multimodal cases for correctness, pedagogy, pacing, and artifacts.

Run focused tests, media-processing integration tests, typechecks, lint, builds, and quality subsets.
State which tests use mocks vs real providers/devices. Report exact commands/results and live cost.

## Mandatory manual QA and dashboard acceptance

Test on at least one real mobile-sized browser/device where possible and provide this runbook:

1. **Clear textbook photo:** Capture/crop/correct a single question. Confirm the first response asks
   the stuck point and gives a teaching step, not the final solution.
2. **Difficult photo cases:** Test rotation, glare, low light, multiple questions, a diagram, unsupported
   file, oversized file, and scan failure. Verify correction/retry/retake and truthful errors.
3. **Handwriting critique:** Upload a multi-step attempt containing one logic error and one arithmetic
   consequence. Confirm line mapping, first-break distinction, grader-style feedback, teaching step,
   and reattempt.
4. **Low-confidence handwriting:** Confirm Petros asks for correction rather than inventing a line.
5. **Voice walking flow:** With microphone/headphones, start, answer, interrupt, pause, resume,
   correct transcript, mute/switch to text, lock/background if supported, and finish. Confirm recording
   stops when indicated and captions contain all essential content.
6. **Voice failures:** Deny permission, add noise, drop network, pause STT/TTS providers, and change
   audio output. Confirm safe fallbacks and no lost session state.
7. **Mixed language:** Run a supported mixed-language voice/text interaction and have a fluent human
   assess comprehension and pronunciation.
8. **Five-minute mode:** Time the session. Confirm one concept/check/card, finite progress, deliberate
   close, and explicit offer before expansion.
9. **Routing dashboard:** Reconcile every vision/handwriting/STT/TTS/spoken call, model capability,
   latency, cost, retries, and fallbacks. Ensure provider pause/fallback is restorable.
10. **Modality operations dashboard:** Reconcile processing stages, confidence/correction, storage,
    quarantine, cleanup, voice disconnect, and duration metrics with fixture IDs.
11. **Privacy/security:** Verify another tenant cannot fetch media or results, signed URLs expire, raw
    media follows deletion policy, and privileged access is audited.
12. **Accessibility/responsiveness:** Keyboard/screen reader/zoom/large text/reduced motion, no-camera
    and no-microphone alternatives, portrait/landscape, slow network, and offline recovery.

Every step must state device/browser, navigation, fixture, actions, expected frontend, expected
backend/dashboard evidence, failure criteria, and screenshots/IDs/audio notes to capture.

## Definition of done

Stage 9 is complete only when a real photographed question produces teaching rather than an answer,
handwritten work receives accurate line-linked critique, voice is genuinely usable and safely
interruptible/fallback-capable, five-minute mode stays finite, and costs/privacy/failures are manually
reconciled in dashboards.

## Final response contract

Return scope, modality/security architecture, migrations/storage/env/device limits, clickable files,
automated/quality results, real browser/device checks, detailed dashboard manual runbook, live costs,
evidence, limitations, Stage 10 prerequisites, and `Stage 9 complete` or `Stage 9 not complete`.

