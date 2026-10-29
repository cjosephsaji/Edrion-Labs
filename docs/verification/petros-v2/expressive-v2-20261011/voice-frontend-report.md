# Voice preview frontend implementation

11 October 2026, Asia/Kolkata. No paid provider request or microphone recording of a real learner was executed by these checks.

## Implemented and tested with zero-cost transports

The Companion Playground has a collapsed Internal Voice Preview. Opening it performs the authenticated status read; a closed fixture performs no voice network request and does not initialize a microphone or audio player. The server supplies eligible provider/model/voice choices. The interface shows the effective selection, format, sample estimate, spending envelope, provider retention notice and returned metering receipt. Actual provider invoice cost remains explicitly unavailable.

Generating speech requires public text attestation and a ready server route. Comparing voices retains the same public text. The current public fixture reply can be copied into that field without dispatching; this resets the public text attestation. Up to six returned samples remain in tab memory for free replay, with explicit Stop/cancel and Clear controls. Audio is discarded if its effective route, model, provider, voice or echoed transcript differs from the requested selection.

Microphone capture follows an explicit Start action and browser permission. Its indicator turns on only after actual recording starts. The preview captures the first ten seconds, converts the supported browser recording to canonical mono 16 kHz PCM16 WAV and submits only through the gated gateway preview endpoint. The server independently verifies duration and byte count. Stopping leads to an editable transcript, and the reviewed text can be copied to the ordinary fixture question field. It remains there for the learner to send; the resulting dialogue is still simulated. There is no live adaptive conversation implementation or automatic transcription submission as assessment evidence.

Permission denial, unavailable codecs, empty audio, provider errors, request timeouts, autoplay rejection, media failure/stall, page hiding and interruptions retain text interaction. Permission received after cancellation stops its tracks immediately. Starting another question, teaching continuation, restart, close, assessment-safe toggle or disposal invalidates pending work and old playback callbacks.

The existing PresentationController remains the sole audio owner. Explicit preview audio uses its existing media fields, watchdog timer and epoch; there is no second teaching or avatar clock. Only real `playing` admits the authored speech pose. `timeupdate` reports actual preview audio time without changing the teaching canvas or reveal progress. `waiting`/`stalled`, pause, stop and interruption remove speaking state. Previewing retains an interrupted lesson's prior narration position. A fixed disposal evaluation-order bug had previously allowed old speaking state to survive its media fence.

## Dependencies and honest boundaries

- **Implemented but not yet provider-tested:** authorized TTS generation and STT transport, canonical browser recording conversion and effective-route validation. The automated tests use mocked routes, media capture and provider responses.
- **Requires authorization:** all paid auditions, an approved isolated runtime, live gateway credentials/route qualification and the server spending envelope described in [voice-route-audit.md](voice-route-audit.md).
- **Fixture-only:** reviewed transcript questions and their responses; copying a response into an audition field does not turn fixture dialogue into AI understanding.
- **Requires additional artwork:** independent mouth movement and facial controls. The existing authored speech PNG is static; playback state synchronization is not lip synchronization. No word, phoneme or viseme timing is inferred.
- **Not implemented:** natural live dialogue generation or a production spoken learner journey. Physical-device microphone/speaker quality and naturalness are unqualified.
- No approved narration sample was found. The existing silent QA WAV remains only a lifecycle test signal and is not shipped or labeled as a voice audition.

## Exact application files

Created:

- `apps/student-web/src/features/petros-v2/voice/voice-preview.tsx`
- `apps/student-web/src/features/petros-v2/voice/voice-preview.module.css`
- `apps/student-web/src/features/petros-v2/voice/use-voice-preview.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-preview-types.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-preview-audio.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-preview.spec.tsx`
- `apps/student-web/src/features/petros-v2/voice/voice-preview-audio.spec.ts`

Modified:

- `apps/student-web/src/features/petros-v2/presentation-controller.ts`
- `apps/student-web/src/features/petros-v2/playground/narration-playback.spec.ts`

Root integration changes in the playground, companion controller and rig are documented in the consolidated report.

## Verification

- **29 passed, 0 failed, three files:** [test JSON](voice-frontend-tests.json), [test log](voice-frontend-tests.log). Covers the default gate/no collapsed dispatch, supported choices, effective voice substitution rejection, real media event admission, cached replay, stop, stale generation, unmount, microphone denial, empty capture, late permission, transcript correction, fixture reply copying, assessment-safe cancellation, canonical WAV output, checkpoint preservation and cancellation across controller operations.
- **ESLint: zero errors, zero warnings:** [lint log](voice-frontend-lint.log). The repository's existing pages-directory discovery message remains.
- **Scoped student source typecheck: pass, exit 0**, [typecheck log](voice-frontend-typecheck.log). The temporary configuration includes `vitest.setup.ts` and excludes changing generated Next directories. The preliminary temporary-config run omitted that setup file and reported matcher declaration errors; its log is retained separately.
- Root-owned browser results qualify actual HTML Audio lifecycle with a local silent test signal and mocked route transport, not provider quality or a real-device microphone journey.
