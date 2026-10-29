# Petros V2 — Final M0-P spoken teaching review

11 October 2026. Implementation and isolated verification completed; **ready for human M0-P review, not a claim that the entire live voice experience is complete**.

The approved interface is preserved. Reading, equations and diagrams now have offline audible narration, and authored fixture replies can speak through the same presentation owner. The normal conversation contains bounded microphone controls and editable transcription binding. Live STT, paid voice comparison and Mini TTS remain unverified or blocked. No later milestone was started.

## Voice Preview root cause

The inspected local configuration enables the frontend Playground in `apps/student-web/.env.development.local`. The API loads the workspace `.env` in `apps/api/src/main.ts`; that file contains no Playground or voice-preview approval settings, and the inspected API process inherited no Playground settings. `loadApiEnv` therefore defaults backend Playground admission to disabled with an empty tester allowlist, and preview/paid/isolated approvals to false. `PetrosVoicePreviewService.admit` fails closed before route discovery. Enabling the page alone cannot authorize its diagnostic endpoint.

The request path is `Scenario → useVoicePreview → StudentApiClient`, credentialed `GET http://localhost:3007/v1/student/petros/companion/voice-preview/status`, then `PetrosVoicePreviewController`, student authentication/permission/portal/rate-limit guards, institutional admission and service gates. The controller is registered; the API prefix and frontend endpoint agree. Previously, any failed status request became a null status and the generic “Route status could not be loaded” label.

**Evidence boundary:** the configuration mismatch is source/configuration verified and reproduced with an authenticated isolated Nest HTTP test. The original browser's HTTP response was not captured because the existing API's database isolation is unproven. Authentication, portal availability or another upstream failure could additionally affect that session. No request was sent to the existing API and no approval flags were changed. A truncated initial listener inventory led to an incorrect connection hypothesis; the complete listener/TCP check established that port 3007 is reachable. [Safe runtime diagnosis](spoken-teaching-20261011/runtime-diagnosis.json) records that correction without database URLs, credentials or tester identifiers.

The unrelated “audio is not available for this example” state came from **no fixture narration bindings**. Resolving preview admission would not have narrated the lesson. That gap is now addressed independently with local assets.

## Implemented behavior

`PresentationController` remains the single lesson clock, semantic action journal, checkpoint owner and audio owner. No second lesson controller, generic chatbot, browser speech-synthesis fallback or animation-frame provider request was added.

Fifteen MP3 segments are bound by existing beat IDs. They cover all three fixture timelines. The first reading segment narrates the complete public passage; the following segments explain claim, support and warrant. Equation segments use authored speech-friendly language, including “point A, at one comma two,” “change in y divided by change in x,” and “six divided by three.” TTS never receives raw LaTeX. Diagram clips explain the node or relationship admitted by that beat. Existing validated actions, semantic target registration, source highlighting and companion cues remain authoritative.

The clips were generated offline with the installed macOS Samantha voice at 165 words/minute, using only the existing public fixture text and the documented speech-friendly substitutions. They are a **synthetic demonstration voice**, distinct from provider voices such as Onyx, Nova, Cedar or Marin. This zero-cost local authoring implements the requested public demonstration; it does not certify a production voice, account entitlement or pedagogical review. [Reproducible authoring script](generate-spoken-fixtures.mjs), [text/provenance/hash manifest](../../../apps/student-web/public/petros/audio/spoken-fixtures.json), [non-silence validation](spoken-teaching-20261011/audio-validation.json).

All **27** audio files—15 lesson segments and 12 fixture replies—decode successfully, match their manifest SHA-256 hashes and have nonzero speech energy. Total MP3 payload is 1,093,677 bytes. A local equation sample is [the substitution explanation](../../../apps/student-web/public/petros/audio/slope-writing-beat-3.mp3). These are not the prior silent QA WAVs. Subjective naturalness, pronunciation quality and physical speaker/device behavior still need human listening.

The existing footer now offers **Narration enabled**. It defaults off for each selected example. Text-only Play creates no audio player. Turning the toggle on or off pauses an active lesson; Continue uses the chosen mode. Only bundled audio is automatically selected for teaching. The toggle never grants paid generation permission. Unsupported/missing media and autoplay failures retain text recovery and the acknowledged action prefix.

Audio completion releases a semantic beat. Existing target highlighting follows the admitted action, and visual reveal follows actual media progress when duration is known. These are semantic segment boundaries and approximate reveal, **not word-level alignment**. Unknown duration does not invent progress. Reduced motion displays complete visual steps while retaining the audio/student-response barrier. Student editing remains unavailable until the presentation step has actually finished.

Pause, interruption, waiting/stalled media, page backgrounding and cancellation stop speaking. In-tab Continue restores the saved audio position where seeking is supported. If seeking cannot be restored, the controller reports text recovery. Reload restores the validated canvas journal and a paused state; intra-clip audio position is not persisted across reload, so a partially completed clip can restart without repeating its semantic operation.

## Questions and response speech

One `useVoicePreview` session is mounted by the Playground scenario and shared by the normal controls and the collapsible Internal Voice Preview. It reuses the existing bounded recording/encoding route rather than copying the portal's separate media-intent/upload/process pipeline. Status inspection is read-only and sends no provider request.

Recording requires an authorized STT route, explicit public-test consent, a Record question click and browser microphone permission. Capture is capped at ten seconds. Permission wait is bounded at 20 seconds, encoding/transcription at 45 seconds; cancellation stops tracks and fences late permission, encoding, HTTP and playback callbacks. Existing canonical mono PCM16 WAV conversion and independent server byte/duration validation are preserved. STT receipts must match the selected provider, model and route. No continuous listening or automatic question submission exists.

A recognized transcript appears in **Your question**, remains editable and requires **Send question**. The response still comes from `fixtureDialogue` and is labelled simulated. Public-test consent remains required: this diagnostic path is not authorization to send private student or assessment content. Recordings, samples and conversation text are transient in the tab; the existing local canvas/reasoning checkpoint remains separate. Provider retention policies still apply after an authorized dispatch.

When narration is enabled, the twelve exact authored fixture replies automatically use their local clips. Replay response, Pause/Resume response and Stop response operate through the existing audio owner and preserve the lesson checkpoint. A dynamic selected-element fallback has no bundled clip; its text remains available. For such replies, a ready qualified route can expose an explicit one-request paid-generation option with a public-text acknowledgement and estimate. It does not dispatch on question submission or merely enabling narration.

Generated samples are retained in the bounded six-sample tab cache. Replaying one reuses its original audio and effective identity without a new TTS request. Effective voice/model/provider/route substitutions and transcript mismatches are rejected. Continuing, typing, changing voice, leaving the scenario or cancelling fences stale work. Provider cancellation after dispatch cannot guarantee that an accepted call becomes free.

## Diagnostics, avatar and cost safety

Safe status messages now distinguish connection failure, authentication, disabled preview, missing tester authorization, spending approval, no qualified provider, temporary routing/database failure, timeout and an incompatible response contract. Status requests have an eight-second deadline. Raw routing exceptions, database details, credentials and backend URLs are not echoed into these messages. The backend returns distinct reason codes and sanitized descriptions; failed prerequisites do not dispatch providers. Text and local narration remain usable independently.

Internal Voice Preview remains collapsible. Its actual supported model and server-qualified voice choices, public text, Generate, cached Replay, Pause/Resume, Stop, transcription editor and effective receipt remain available when authorized. Changing a voice stops the prior sample. A failed generation never starts the mouth.

The existing `PetrosAvatar` and capability manifest are unchanged. Only actual `HTMLAudioElement` playing state enables speaking; pause, stall, end, interruption and failure close it. Reduced motion keeps the existing restrained speaking indication. The SVG mouth is the existing fixed-timer approximation, **not phoneme/viseme lip synchronization**. New facial artwork is unnecessary for this pass and remains a separate dependency for precise articulation.

Legacy TTS qualification and strict effective voice validation are preserved. Preview price/envelope validation now also rejects non-finite, unsafe, zero or negative values before reservation. Existing shared Redis reservations, expiry, owner scopes, pinned routes, no cache, zero automatic retries and one route attempt remain intact. Failed/interrupted dispatches may consume a reservation. Receipts distinguish gateway estimates from unavailable provider invoice charges.

**Mini TTS stays blocked.** The current binary speech adapter does not enforce an output-audio-token bound or reconcile those provider units. A character limit or a fictitious character price cannot prove a bound on Mini's output audio billing. No Mini pricing, route activation or substitute voice was invented. Safe unit tests preserve this rejection. Activation still needs a proven pre-dispatch spending bound, validated input/output pricing, provider usage handling and reconciliation against shared limits; authorization alone does not supply that missing contract.

## Verification and evidence

All runs used Node 24.21.0, in-memory backend dependencies and loopback fixture services. Neither `AppModule` nor the actual API bootstrap was used for verification. Existing production/unsafe database configuration was not used. No database migration, role/RLS edit, production flag enablement, student assessment write, provider credential change or paid call was made.

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend controllers, voice UI, status timeout/contracts, canvas, checkpoint history, shared avatar and portal/V1 voice compatibility | **119 passed**, 0 failed, 16 files | [JSON](spoken-teaching-20261011/frontend-tests.json) |
| Preview safety, actual isolated Nest controller/guard HTTP, gateway, adapters, voice qualification and portal speech | **145 passed**, 0 failed, 7 files | [JSON](spoken-teaching-20261011/api-tests.json) |
| Actual mounted Chromium spoken-teaching walkthrough | **11 grouped checks passed**, 0 runtime errors | [Results and request classification](spoken-teaching-20261011/browser-results.json) |
| Text-only diagram editing and checkpoint regression | **3 grouped checks passed**, 0 runtime errors | [Results](spoken-teaching-20261011/regression-browser-results.json) |
| Local audio decode, hashes and non-silence | **27 files passed** | [Audio validation](spoken-teaching-20261011/audio-validation.json) |
| Student/API typechecks | Passed | [Student](spoken-teaching-20261011/student-typecheck.log), [API](spoken-teaching-20261011/api-typecheck.log) |
| Isolated student production build | Passed | [Build log](spoken-teaching-20261011/student-build.log) |
| Targeted lint | 0 errors; existing Nest runtime DI type-import warnings retained | [Lint](spoken-teaching-20261011/lint.log) |
| Working-tree preservation and diff whitespace | No starting source file removed; deliberate edits inventoried | [Preservation](spoken-teaching-20261011/preservation-audit.json), [diff check](spoken-teaching-20261011/diff-check.log) |

The production build used an empty inherited environment, disabled Playground admission, blank impersonation headers and API `127.0.0.1:9`, with the existing separate verification build output. Frontend/backend targeted checks do not certify the entire unrelated dirty monorepo. Early harness failures were selector/fixture setup issues; the final passing reports above supersede them.

The isolated Nest HTTP suite exercises real authentication/permission/portal/rate-limit guard instances with synthetic in-memory session dependencies, including no session, expired session, a sanitized successful status, frontend-only enablement denial, spending approval and expiry. It is not proof of real account entitlements or deployed RLS.

Browser QA mounted the actual route and unchanged page/layout admission checks with a synthetic tester. It allowed only its two fixture ports and trapped other browser destinations. Equation narration was actually played, paused, resumed, interrupted by a question, replaced by local response speech, replayed and resumed from the saved position without duplicate canvas actions. Submission released the student barrier. Diagram nodes/relationships narrated on their semantic steps; the reading MP3 was decoded in the browser and measured as non-silent. Desktop, 360px and 320px, keyboard audio control, captions and reduced motion were checked.

Microphone QA used Chromium's injected non-silent public audio device and real `getUserMedia`, MediaRecorder and WAV preparation. The backend returned a deliberately incorrect **synthetic transcript**, which was corrected before explicit submission. Additional browser tests exercised permission denial, transcription/TTS failure, stale generation, nine status failures and typed recovery. **No physical microphone, real STT recognition or provider voice quality is certified by that test.** Diagnostic voice names were exercised with synthetic route metadata; no Onyx/Nova audible comparison is claimed.

The separate browser regression verifies repeated identical questions each receive one local spoken reply, and preserves inline diagram rename, keyboard movement, connection rendering, “provides” relationships, undo/redo, selected-element questions, response submission and reload recovery. No duplicate acknowledged teaching actions appeared.

Selected screenshots: [text-only equation](spoken-teaching-20261011/equation-text-only.png), [narrated formula](spoken-teaching-20261011/equation-narrated-formula.png), [paused narration](spoken-teaching-20261011/equation-narration-paused.png), [local response](spoken-teaching-20261011/local-fixture-response.png), [recording](spoken-teaching-20261011/question-recording.png), [reviewed transcript response](spoken-teaching-20261011/question-reviewed-response.png), [diagram relationship](spoken-teaching-20261011/diagram-narrated-relationship.png), [reading](spoken-teaching-20261011/reading-narrated-passage.png), [360px reduced motion](spoken-teaching-20261011/mobile-reduced-motion-speech.png), [320px paused](spoken-teaching-20261011/mobile-320-paused.png), [diagram checkpoint recovery](spoken-teaching-20261011/diagram-edit-checkpoint-recovery.png).

[Browser walkthrough recording](spoken-teaching-20261011/spoken-teaching-walkthrough.webm) captures visuals/captions; Playwright's video does not record an audio track. Use the linked MP3 or interactive review demo to listen.

## Capability classification

| Capability | Classification | Practical limit |
| --- | --- | --- |
| Accurate status diagnostics and text recovery | IMPLEMENTED AND BROWSER-VERIFIED | Original served API response was not queried; isolated service/HTTP and failure transports verified. |
| Narrated reading, equations and diagrams | IMPLEMENTED WITH LOCAL AUDIO | Fifteen non-silent offline segments; semantic alignment, no word timings. |
| Twelve authored fixture response clips and replay | IMPLEMENTED WITH LOCAL AUDIO | Unmatched dynamic replies retain text. |
| Pause, interrupt, continue, checkpoint and media-driven mouth | IMPLEMENTED AND BROWSER-VERIFIED | In-tab audio resume; phoneme animation not supported. |
| Main microphone controls, WAV preparation and editable transcript | IMPLEMENTED AND BROWSER-VERIFIED | Injected browser microphone and synthetic STT response only. |
| Real microphone/provider STT accuracy | IMPLEMENTED BUT LIVE PROVIDER UNVERIFIED | Needs approved isolated backend, credentials, route/cost authorization and physical-device review. |
| Paid response TTS, effective receipt and cached replay binding | IMPLEMENTED BUT LIVE PROVIDER UNVERIFIED | No real provider output generated. |
| Actual legacy voice comparison | REQUIRES PROVIDER/COST AUTHORIZATION | Qualified voices and bounded live audition still required. |
| Cedar/Marin live route | REQUIRES PROVIDER/COST AUTHORIZATION | Also requires the missing enforceable Mini metering/bound contract. |
| Enforced Mini output-audio-token reservation/reconciliation | NOT IMPLEMENTED | Existing adapter cannot prove a spending bound; intentionally remains excluded. |
| Real authenticated deployed preview service/RLS | BLOCKED BY ENVIRONMENT | No approved isolated database-backed runtime was established. |
| Adaptive source-grounded AI teaching and precise viseme animation | NOT IMPLEMENTED | Outside M0-P; future engine and supported artwork/timing respectively. |

## Human review procedure

An isolated local-audio demonstration is available at [the fixture review entry](http://localhost:3062/qa-login), which opens `/petros/companion-playground` on port 3061. The entry supplies **only a synthetic fixture session**; it is part of the QA harness, not an application authentication bypass. Provider routes remain blocked. No real account or database is required.

To reproduce after stopping the demo, use Node 24.21.x from the workspace root:

```sh
PATH=/tmp/node-v24.21.0-darwin-arm64/bin:$PATH node docs/verification/petros-v2/verify-spoken-teaching.mjs --review
```

The two loopback ports are 3061 and 3062. Ctrl-C stops both fixture servers. Running the same script without `--review` runs automated browser acceptance and then stops its servers. The secondary editing check runs with `--review` serving: `node docs/verification/petros-v2/verify-spoken-teaching-regression.mjs`.

1. Open the review entry, select **Build an equation**, and first press Play with narration unchecked. Captions and equations progress in text-only mode.
2. Pause, check **Narration enabled**, and press Continue. Listen to the offline explanation. The footer shows Speaking only while audio plays. The equation card highlights the semantic step.
3. Pause during speech, then Continue. Ask “Why is the slope two?” in Your question and Send. The authored simulated reply speaks locally. Pause, stop or replay that response; Continue lesson resumes the saved teaching position.
4. At Your turn, enter `2` and reasoning, then Submit demonstration response and Continue. The submitted work remains. Try the reading and diagram examples; enable narration for each example.
5. **Spoken question in the default review is honestly unavailable.** With a separately authorized isolated STT route, consent to the public test, press Record question, speak, then Stop and transcribe question. Correct Your question before Send. The answer remains a fixture response. No continuous listening occurs.
6. Open Internal Voice Preview to inspect the blocked reason. In an authorized backend, choose an actually qualified model/voice, acknowledge identical public sample text and Generate. Replay uses saved audio. Different voice selections require explicit new generations. Default review does not pretend to audition provider voices.
7. Connection, authentication, tester, disabled-preview, spending and provider failures have distinct instructions. Continue using local narration/text while resolving provider prerequisites; do not point the Playground at the previously identified unsafe database.

## Remaining authorization and limited audition proposal

A real audition requires a separately approved isolated API/database/Redis environment with restricted runtime roles, legitimate tester sessions, portal permission, provider credentials, qualified routes, current verified pricing, approval identity/expiry and shared spend controls. The isolated-approved flag is an operator attestation, not proof of safe database access. Do not change production roles, enable V2 in production or use the unsafe database to supply these dependencies.

Proposed envelope, **not executed or authorized**: at most four dispatches—one identical public sentence in each of two qualified legacy voices, plus two public STT recordings capped at ten seconds. Reserve at most 10,000 micro-USD per call; a 50,000 micro-USD ($0.05) shared absolute envelope leaves margin above the four conservative reservations ($0.04). Zero automatic retries, one pinned route attempt, failed/aborted dispatches count, and stop if current route estimates exceed the per-call reservation. Compare the sentence already shown in Internal Voice Preview unchanged. Review current actual pricing before authorizing; synthetic test rates are not a current provider quote. Provider invoice charges must be recorded separately from gateway estimates. Mini is excluded until its missing cost contract is solved.

## Exact files and preservation

Starting source hashes and status were captured before edits. Existing uncommitted work was not reset, staged, committed or discarded. [Starting hashes](spoken-teaching-20261011/starting-hashes.json), [starting status](spoken-teaching-20261011/starting-status.txt), [exact created/modified source manifest](spoken-teaching-20261011/source-file-manifest.json) and [preservation audit](spoken-teaching-20261011/preservation-audit.json) list paths and hashes, including each of the 27 new MP3s.

Modified existing implementation/test files:

- `apps/api/src/modules/student/petros-companion/petros-voice-preview.service.ts`
- `apps/api/src/modules/student/petros-companion/petros-voice-preview.spec.ts`
- `apps/student-web/src/features/petros-v2/presentation-controller.ts`
- `apps/student-web/src/features/petros-v2/canvas/teaching-canvas.tsx`
- `apps/student-web/src/features/petros-v2/playground/companion-playground.tsx`
- `apps/student-web/src/features/petros-v2/playground/narration-playback.spec.ts`
- `apps/student-web/src/features/petros-v2/playground/teaching-playground.spec.tsx`
- `apps/student-web/src/features/petros-v2/voice/use-voice-preview.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-preview.tsx`
- `apps/student-web/src/features/petros-v2/voice/voice-preview.spec.tsx`
- `apps/student-web/src/features/petros-v2/voice/voice-preview-types.ts`

Created source/test/harness files:

- `apps/api/src/modules/student/petros-companion/petros-voice-preview.http.spec.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-service-status.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-service-status.spec.ts`
- `apps/student-web/src/features/petros-v2/voice/teaching-voice-controls.tsx`
- `apps/student-web/src/features/petros-v2/voice/teaching-voice-controls.spec.tsx`
- `apps/student-web/public/petros/audio/spoken-fixtures.json` and its 27 individually inventoried MP3s
- `docs/verification/petros-v2/generate-spoken-fixtures.mjs`
- `docs/verification/petros-v2/verify-spoken-teaching.mjs`
- `docs/verification/petros-v2/verify-spoken-teaching-regression.mjs`
- `docs/verification/petros-v2/companion-spoken-teaching.md` (this report)

Acceptance evidence is under `docs/verification/petros-v2/spoken-teaching-20261011/`. Implementation stops here for human review. Live provider qualification, physical microphone/listener review and Mini metering remain separate prerequisites; none is represented as complete.
