# Petros expressive companion and voice preview

11 October 2026, Asia/Kolkata. Extension of the approved M0-P playground. **Implemented for local review; natural facial idle and live provider qualification remain blocked.** M0-R remains blocked. No deployment or next milestone began.

Open the [existing local playground](http://localhost:3011/petros/companion-playground) using its existing authenticated, allowlisted tester session and refresh. The three approved public examples and whiteboard remain in place. Open **Internal inspector → Cloud sizing preview** for the five content cases, and **Internal Voice Preview** for route status, audition and microphone controls. The API must run the updated source in a separately approved isolated environment before a real audition can be enabled. No authentication bypass, environment flag activation or API startup was performed here.

## Feature status and before/after

| Feature | Classification | Result and practical limit |
| --- | --- | --- |
| Dynamic cloud | **IMPLEMENTED AND TESTED** | Replaced the fixed 140px cloud with intrinsic content width/height. Short captions stay compact; longer paragraphs wrap and scroll within a bounded text area. Empty content removes the cloud and tail unless an active operation/input genuinely needs a status. The separate maximum harbor reservation keeps conversation controls stationary. |
| Speech/status distinction | **IMPLEMENTED AND TESTED** | Public speech uses a connected triangular tail; active status uses a different surface and dotted tail. Typing says “Ready for your question”; “Listening” requires actual microphone capture. Source checks and audio preparation show only their current public operation status, with no private reasoning. |
| Authored pose transitions | **IMPLEMENTED AND TESTED** | Replaced abrupt full-image swaps with a 240ms opacity crossfade between whole authored PNGs during teaching. Cancellation, stalls, assessment-safe mode and reduced motion settle immediately. These are full-image transitions, not articulated motion. |
| Current teaching gestures | **IMPLEMENTED AND TESTED** | Pointing now requires the latest accepted action, a current highlight/focus and a visible connected target. Direction stays stable while the placement geometry changes. Existing bounded holds, cooldown and one gesture per action remain. Canvas highlighting provides precise reference; the PNG hand does not make exact contact. |
| Quiet student work | **IMPLEMENTED AND TESTED** | Rest and student checkpoints remain neutral and silent. No new idle timer, unsolicited dialogue or repetitive gestures were added. |
| Natural idle, blink, gaze, eyebrows, head, breathing, articulated hands/body | **REQUIRES ADDITIONAL ARTWORK** | Nine complete PNGs were inspected; no compatible editable layers were found. Petros remains visibly static at rest. A whole PNG moving vertically would not satisfy this requirement and was not added. |
| Internal voice-preview frontend and server gateway path | **IMPLEMENTED BUT NOT YET PROVIDER-TESTED** | Supported route/voice selectors, effective identity, public text, generate/play, stop, replay, error/text fallback, metered estimates, approval envelope and transient tab samples. Zero-cost transport, cancellation, input validation and actual local-audio lifecycle are tested. Real account entitlement/sound are unqualified. |
| Microphone and transcript correction | **IMPLEMENTED BUT NOT YET PROVIDER-TESTED** | Explicit recording and consent, at most ten seconds, canonical bounded PCM WAV, cancellation, denial/error handling and editable transcript. The transcript can be placed in the existing fixture question field. No real recording was submitted to a provider. |
| Conversation, feedback, lesson return | **FIXTURE-ONLY** | Existing contextual fixture dialogue and public demonstration feedback remain clearly labelled. Questions preserve the current checkpoint. A fixture reply can be copied into audition text, with fresh public-text confirmation and no automatic request. No adaptive tutor or real AI conversation was implemented. |
| Audio synchronization | **IMPLEMENTED AND TESTED** for media lifecycle | Existing presentation owner drives the actual audio player, epoch, speech pose and whole-utterance cloud. Only a real `playing` event admits the static talking image. Pause/stop/typing/hidden page/continuation revoke playback and ignore stale events. No second teaching or avatar clock. |
| Mouth movement and phoneme/viseme synchronization | **REQUIRES ADDITIONAL ARTWORK**; phoneme timing **NOT IMPLEMENTED** | The talking PNG contains one painted mouth. It cannot perform audio-reactive mouth motion. Installed TTS exposes no reliable output alignment. No lip-sync completion claim is made. |
| Live two-voice audition and spoken AI question/answer journey | **REQUIRES AUTHORIZATION** for provider qualification; real model conversation **NOT IMPLEMENTED** | Preview execution remains disabled. There is no production adaptive dialogue route attached to this public-fixture playground. |
| Physical-device voice, screen-reader and human naturalness qualification | **NOT IMPLEMENTED** as acceptance studies | Chromium viewport/touch and keyboard checks are engineering evidence only. No physical iPhone/Android, screen-reader user study or listener panel was available. |

Measured desktop clouds: two-word status **107 × 58px**, short sentence **123 × 58px**, two sentences **202 × 95px**, long paragraph **202 × 127px** with text scrolling; empty content has no box. The short cloud previously occupied a fixed 140px height. Idle observation lasted **66.115 seconds**; the student waiting observation included a full **30-second** uninterrupted wait. The continuous browser recording is **115.76 seconds** long; observation plus video encoding took 170 seconds.

The [art handoff](art-handoff.md) specifies complete occluded paint, consistent viewBox, independent facial/limb exports, pivots, gaze masks, mouth shapes, rest/expression variants, anchors and identity review. The [art inventory](artwork-inventory.json) records all nine preserved PNG hashes. Existing V1 artwork and its legacy voice/mouth behavior remain compatible.

## Voice routes, authorization and privacy

The [route audit and exact approval configuration](voice-route-audit.md) is the authority for provider details. Historical configured candidates are OpenAI `tts-1` (previously effectively Onyx) and Groq `whisper-large-v3-turbo`, with `whisper-large-v3` as historical fallback. This task read that inventory from disk and made no fresh database connection. The preview discovers sanitized current eligible routes only after all server gates pass; it dispatches no provider request during route inspection.

Strict TTS preview accepts the model-specific supported voices and rejects unsupported Cedar/Marin selections on TTS-1. It returns effective provider/model/voice and refuses route drift or fallback. Existing legacy callers retain their fallback compatibility. Mini-TTS remains excluded from the bounded audition because audio-token output pricing is not safely bounded by character pricing. Server credentials and provider URLs never enter the browser.

Proposed paid diagnostic: six identical public phrases in **Onyx and Nova**, plus six microphone samples through the eligible Turbo primary: **18 calls**, no automatic retries. At the documented listed/historical rates, expected usage is about **$0.090667**; conservative reservations total **$0.18**. Proposed absolute spending cap is **$0.75**. This is a proposal, not authorization. Exact flags, expiry, approval identity, credential/environment prerequisites, rate uncertainty and sample set are in the audit. An isolated-approval flag is an operator attestation, not proof of safe database access. The previously identified unsafe production database remains prohibited.

The backend retains student authentication, permissions, portal/rate-limit guards and the playground allowlist. Responses are private/no-store. Public diagnostic media/text/transcripts remain transient and bypass shared cache; usage metadata contains no raw media or text. Provider retention still follows the approved account policy. Disconnect abort propagates to transport, but cancellation after dispatch cannot guarantee zero provider charge. Shared Redis reservations conservatively count failed/aborted calls, fail closed on accounting loss, and depend on preserved persistent counters. Short tenant-owned scopes keep provider HTTP outside database transactions and preserve failure/cancellation metering.

## Verification and acceptance evidence

Final machine-readable results, browser measurements and screenshots accompany this report. Unit tests validate state and contracts; they do not establish visual naturalness or voice quality.

| Check | Evidence and result |
| --- | --- |
| Frontend, companion, voice, presentation, canvas, shell and V1 compatibility | [103 passed](frontend-tests.json), zero failed |
| Strict V2 schemas, reducer/timeline and V1 engine/model/presentation compatibility | [48 passed](schema-tests.json), zero failed |
| Gateway, TTS/STT adapter and preview safety contracts | [132 passed](voice-backend-tests.json), zero failed; mocked provider transport only |
| Voice UI/local HTML Audio/microphone-denial browser checks | [10 grouped checks passed](voice-browser-results.json); [request classification](voice-browser-requests.json) |
| Existing narration lifecycle in a real browser | [3 grouped checks passed](media-browser-results.json), local silent PCM only |
| Full canvas/cloud/browser walkthrough, idle and waiting | **40 grouped checks passed**, zero runtime errors: [browser results](browser-results.json), [cloud measurements](cloud-results.json), [idle observation](idle-observation.json), [waiting observation](waiting-observation.json) and continuous recording below |
| Expanded desktop/360px/320px companion containment | [5 grouped checks passed](mobile-expanded-results.json), zero runtime errors |
| Typechecks and lint | All three typechecks passed. Frontend lint has zero errors/warnings; backend lint has zero errors and 11 type-import warnings. Logs: [student](student-typecheck.log), [schemas](schema-typecheck.log), [API](api-typecheck.log), [frontend lint](frontend-lint.log), [backend lint](voice-backend-lint.log) |

Acceptance interpretation:

- **A:** Continuous idle observation records the actual still neutral pose. Natural blinking/gaze/posture acceptance remains artwork-blocked, regardless of test duration.
- **B:** Two-word, short, two-sentence, long and empty cloud cases are measured. The Send form stays fixed through pointer-down/blur/up. Long text remains available through scroll and keyboard focus.
- **C–F:** Equation and diagram playback, current-target pointing, real node drag/connection routing/editing, checkpoint waiting, typed contextual question/focus and continuation use the existing authoritative journal. Your turn stays a learning state with the actual response action. Card roles and contextual Ask remain the approved existing refinements.
- **G:** Approval/unavailable UI is demonstrated; selectors and local playback were exercised with explicitly mocked responses. No paid audition or naturalness evaluation is claimed.
- **H:** Real spoken provider conversation was not run. Microphone denial and mocked transcript correction are tested; live recognition and a live AI response remain open.
- **I:** Actual HTML Audio events and local silent PCM verify stop/replay/stall/resume/error behavior and a static speech pose. Mouth motion and phoneme timing remain unavailable.
- **J:** Chromium desktop, short desktop, tablet, 360px/320px, keyboard, touch and reduced-motion checks are recorded. Physical mobile audio and screen-reader qualification remain open.

Runtime uses pinned Node 24.21.0 and local Chromium. Browser QA serves disposable synthetic authentication metadata through the unchanged page/layout admission checks; it does not use real student learning records. Voice responses in browser QA are mocked and explicitly labelled QA; the silent PCM signal is not narration. No paid provider calls, production migrations, roles/RLS changes, evidence writes, production V2 assessment, API startup against the unsafe database, deployment or M1–M8 work occurred.

## Review artifacts and exact files

- [Compact short cloud](cloud-short.png), [long cloud](cloud-long.png), [empty cloud](cloud-empty.png).
- [Equation target](equation-directional-pose.png), [diagram target](diagram-directional-pose.png), [typed question](typing-stable-conversation.png).
- [Approval-required voice UI](voice-approval-required.png), [actual local-audio speech pose](voice-local-audio-speaking.png), [microphone denial](voice-microphone-denied.png).
- [320px canvas](after-320x568.png), [320px voice preview](voice-preview-320.png).
- [Continuous idle → equation → question → continuation → student work recording](naturalness-walkthrough.mp4); [diagram drag/connect recording](node-drag-and-connect.mp4).

[Exact source/test/harness file inventory](source-file-manifest.json) distinguishes files modified from the starting working tree from files created here. The [artifact manifest](artifact-manifest.json) records report/evidence paths and hashes; the [verification summary](verification-results.json) records final counts and limitations. The starting workspace already contained substantial uncommitted work; it was preserved. No staging, commit, branch reset or cleanup was performed.

Remaining dependencies are precise: approved facial/body layers; a separately approved isolated API/database/Redis environment and server credentials; spending authorization; actual-route voice/microphone and invoice qualification; physical-device/listener/accessibility review. No real AI conversation, natural facial motion, natural voice quality or lip synchronization is marked complete on fixture evidence alone. Preliminary browser attempts exposed a pressed-button-transform measurement error and a development chunk reload during concurrent edits; those were corrected before the passing runs. Final QA ran against stable sources. No new production build was run; the actual route compiled and ran in the isolated Next development harness, and source typechecks passed.
