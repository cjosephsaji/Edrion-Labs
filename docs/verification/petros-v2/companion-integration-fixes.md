# Petros V2 companion integration fixes

Date: 2026-10-11. Status: implemented integration fixes, verified locally, stopped for human review. M0-R remains blocked. No M1–M8 work, deployment, migration, production configuration change, production database connection, or paid provider call was performed.

## Result and qualification

| Classification | Result |
| --- | --- |
| IMPLEMENTED | Requested unsupported voices cannot silently become Onyx. Model-dependent selection, explicit stale-preference handling, successful-route receipts, retry preservation, and stale-playback cancellation are wired through portal speech. |
| IMPLEMENTED | The exact `/petros/companion-playground` route uses the shared avatar, with idle visible before Play, settled editing/pause states, valid target gestures, actual audio appearance, bounded clouds, and one teaching/media owner. |
| APPROXIMATED | Idle uses a complete PNG moving at most 2px and tilting slightly. Speaking reuses the existing SVG overlay at a fixed 135ms interval, gated by actual playback. Neither is facial articulation, audio-level response, nor lip synchronization. |
| IMPLEMENTED | Mini TTS fails closed in portal and diagnostic preview, including misleading character-price configuration. Credential, enabled, health, price, approval and account voice restrictions are checked without dispatch. |
| UNVERIFIED | Genuine Cedar/Marin sound, provider account entitlement, invoice reconciliation, live STT and device speech quality were not auditioned. Browser audio is the existing silent local QA WAV. |
| ARTWORK-DEPENDENT | Independent eyes, eyelids, head, facial expression, mouth shapes and articulated arms need additional authored assets. |
| AWAITING AUTHORIZATION | A later paid Cedar/Marin comparison needs the metering work described below and separate approval. No route was activated for it. |

The implementation follows `PETROS_V2_IMPLEMENTATION_PLAN.md`, the companion integration audit, the M0-P reports, existing speech capabilities, manifest and presentation controller. It preserves the current V1 session services and the separate portal and diagnostic STT paths.

## Root causes and fixes

| Issue | Root cause | Implemented behavior |
| --- | --- | --- |
| Cedar and Marin sounding alike | The non-strict adapter replaced either unsupported name with legacy Onyx. | Any explicit unsupported voice is rejected, including non-strict requests. The gateway skips incompatible candidates before HTTP and may retry a compatible route using the same requested voice. |
| Misleading voice selector | Two names were hardcoded without the effective model, provider or receipt. | An authenticated, no-store metadata endpoint exposes eligible voices and non-sensitive route identity. The portal, document help and pilot controls show the route and last actual audio identity. |
| Stale preferences and playback | Local storage retained incompatible names, while selection changes did not reliably fence pending audio. | Cedar/Marin remain visibly unavailable on legacy routes. Generation is disabled until explicit selection; storage is not silently rewritten. Changing voice aborts pending synthesis, stops audio and clears the displayed receipt. |
| Voice-insensitive cache/receipt | Generic speech cache keys lacked voice identity; preview receipts assumed the planned route. | Speech synthesis bypasses the shared cache. Gateway results identify the successful candidate. Preview verifies the authorized route against that successful receipt before exposing audio. |
| Playground static before Play | The portal and Playground owned different image presentation and idle policies. | A render-only shared avatar owns PNG alignment, optional whole-image idle, speaking overlay and reduced motion. Existing route controllers continue to supply the state. |
| Inconsistent speaking visuals | Portal mouth timers and Playground static speaking artwork used different triggers. | Shared speaking activates on actual media `playing`/device utterance start. Pause, stall, interruption, failure, cancellation and completion stop movement. PNG/SVG switching is immediate to prevent a doubled face; authored gesture crossfades remain available. |
| Misleading status text | Typed question entry could look like microphone listening; portal bubbles cycled speculative text. | Public operation labels distinguish Ready for your question, Recording, Transcribing, Preparing speech, Speaking, Teaching, Waiting and Paused. Listening appears only with active microphone recording. Speculative thought rotation was removed. |
| Unsafe Mini reservation | The existing preview could bound characters, but Mini bills output audio tokens. | Mini remains unavailable with a specific metering explanation. A positive character price cannot qualify it. |
| Late STT updates | Abort and generation checks did not cover the complete intent/upload/process sequence. | The portal forwards cancellation through all supported requests, imposes a 60s transcription deadline and fences results after every await. Manual edits cancel active transcription. Typed drafts survive failures and microphone tracks are released. |

## Shared avatar architecture and authority

`PetrosAvatar` renders the existing eight authored PNG poses, optional approximate mouth SVG, common crop and fallback presentation. It creates no audio player, microphone, teaching clock, session state or checkpoint store. `PetrosSpeechCloud` is content-sized presentation only; callers supply public captions or truthful operation status.

- Portal `PetrosMentor` supplies its existing session/voice state.
- Playground `FloatingCompanion → CompanionRig → PetrosAvatar` retains `PresentationController` as the owner of progression, narration, preview audio, interruptions, gestures and checkpoints. The regular mentor is not mounted there.
- Document/studio `PetrosRig` retains its SVG frame and placement but delegates character pixels to the shared avatar. The inflation pilot uses the same primitive.
- The studio playback hook now exposes actual speaking separately from Play intent and fences old media callbacks. Device narration clears a paused/queued utterance before restarting the current beat.

The idle cycle lasts 18 seconds, with extended rest, one gentle lift and a slight tilt. Editing, pause, microphone activity, teaching gestures and assessment-safe contexts suppress idle where appropriate. OS reduced motion, the app's reduced-motion attribute and explicit reduced-motion props suppress idle and mouth movement. No new image assets or character identity were introduced.

The mouth overlay reuses the existing neutral artwork and crop. It has no phoneme/viseme/word timestamps or audio-level measurement. Adding an analyser here would complicate cross-origin audio and device speech without a uniform signal; the limited fixed-timer treatment is retained and labelled honestly in the manifest and code.

## Voice routing and receipts

The chain is now: explicit UI selection → unchanged or explicitly updated preference → requested voice in the frontend request → authenticated model/route qualification → gateway candidate validation/retry → strict adapter payload → successful route/effective voice receipt → frontend receipt validation → actual browser playback.

Legacy `tts-1`/`tts-1-hd` expose their capability-registry voices, optionally narrowed by account-specific `qualifiedSpeechVoices`. Route eligibility is not presented as proof of provider entitlement; a successful synthesis receipt supplies the effective identity. An unpriced, disabled, paused, down, credential-less or unaffordable route is unavailable. Route restrictions are rechecked before dispatch, including preview route drift.

Portal receipts contain `requestedVoice`, `effective.voice`, `effective.modelKey`, `effective.providerKey`, `effective.routeId`, and `fallback.voice`/`fallback.route`. Voice substitution is prohibited, so `fallback.voice` is false on accepted results. Legitimate route fallback is reported from the actual successful route ID, including a different route at the same tier. API keys and credential envelopes are never returned.

Provider-mocked tests exercise the actual gateway and adapter with synthetic credentials and mocked HTTP. Both legacy Cedar and Marin are rejected before HTTP; Onyx and Nova remain distinct payloads; generic Mini adapter requests forward Cedar and Marin unchanged; retries return the successful fallback route. These direct Mini adapter tests establish payload behavior only, and do not bypass Mini's portal/preview availability block.

The diagnostic UI distinguishes **Generate and play new speech** from **Replay previously generated sample**. Each new sample creates a new approved request. Saved replay preserves its original receipt and performs no synthesis. Pause/resume reuse the existing player through `PresentationController`, preserve teaching progress and do not issue a new request.

## Mini TTS qualification, costs and later audition

**Mini is unavailable and is not ready for a paid audition yet.** The user-authorized safe fallback is implemented instead of claiming a character reservation bounds output audio.

The installed adapter requests binary audio and has no verified output-audio-token usage reconciliation or enforceable maximum output-token billing bound. A local audio duration cutoff, timeout, response-size cap or canceled fetch alone does not prove the provider stopped billing. Existing generic token estimates and character reservations cannot supply that proof.

Official references reviewed on 2026-10-11: [Mini TTS model](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts), [speech endpoint](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create), and [pricing](https://developers.openai.com/api/docs/pricing). The published standard rates are $0.60 per million text input tokens and $12 per million output audio tokens. Documentation of a voice name does not prove this account can synthesize it.

Before Mini qualification can be enabled:

1. Add separate input-text/output-audio-token pricing and normalized usage receipts; reconcile provider-reported usage instead of calling an estimate an actual invoice cost.
2. Establish a documented, enforceable provider-side output/billing ceiling or a dedicated isolated account budget that cannot exceed the approved envelope. Client timeouts alone are insufficient.
3. Reserve the proven maximum before HTTP using the existing durable/shared accounting architecture. Charge every dispatched retry and retain conservative holds on ambiguous failures/cancellation; prevent concurrent overspend and fail closed if accounting is unavailable.
4. Test input/output usage, missing/invalid usage, limit exhaustion, pricing drift, concurrent reservations, timeout, disconnect, late result, retry and invoice reconciliation. Qualify provider/account access and health without enabling production routes.
5. Supply an isolated non-production runtime, restricted database access, tester allowlist, server-side credentials, approval ID/expiry and separately approved spending limits. Existing approval and assessment-safe boundaries remain in place.

Proposed later audition, **AWAITING AUTHORIZATION and the metering prerequisites above**:

- Public text, identical for both voices, 79 characters: “The vertical change is six. The horizontal change is three. Their ratio is two.”
- Four new requests: Cedar twice and Marin twice, one qualified pinned Mini route, same format/speed/instructions, no retries; compare receipts and blind listening notes. Replays cost no new synthesis request.
- Illustrative estimate only: assume 100 text tokens and 1,000 output audio tokens per sample. This gives $0.01206/sample and $0.04824 for four. Output length and entitlement remain unverified, so this is not a maximum.
- Proposed hard spending cap: **$0.25 total**, at most four dispatched samples, **$0.05 proven maximum reservation per sample**, with $0.05 envelope headroom. Dispatch is forbidden until the per-call bound and shared total cap are enforceable. Abort rather than exceed either bound. All dispatched failures count against the cap.

No paid synthesis, transcription, credential change, production route configuration or live activation occurred in this task. Existing bounded legacy preview reservations, no-retry/pinned-route limits and authorization gates remain intact.

## STT, playback and cloud preservation

Portal STT continues through the existing media intent/upload/process pipeline. MIME, ownership and safety validation are preserved; its editable transcript and typed-question behavior remain. The Playground's bounded canonical WAV diagnostic path remains separate. Playback requests have a 45s frontend deadline; STT has a 60s deadline. Transport abort is propagated where supported, but an already accepted server job/provider operation is not guaranteed to stop or become free.

The shared mouth closes immediately when actual audio stops or stalls. Epoch/generation fences prevent old callbacks or late synthesis/transcription from reviving presentation. Preview pause/resume keeps the current sample and lesson checkpoint; Stop discards active preview media and fences its callbacks.

Clouds retain the existing Playground side placement, anchored tail, bounded wrap/scroll and stable adjacent controls. Empty ordinary clouds disappear; short text stays compact. Portal status clouds reuse the content-sized primitive without inserting the portal conversation panel into the Playground. There is no fabricated internal reasoning.

## Automated verification

All commands used the isolated Node 24.21.0 runtime, synthetic test fixtures and no live API/database runtime. JSON reports list every test file and assertion.

| Check | Final result | Evidence |
| --- | --- | --- |
| Relevant frontend, avatar, controller, voice, STT cancellation, canvas and V1 compatibility tests | 149 passed, 0 failed, 21 files | [frontend results](integration-fixes-20261011/frontend-tests.json) |
| Gateway/adapter, route qualification, preview guards, companion and media safety tests | 128 passed, 0 failed, 7 files | [API results](integration-fixes-20261011/api-tests.json) |
| Presentation/learning/V2 timeline/action/canvas schemas | 28 passed, 0 failed, 5 files | [schema results](integration-fixes-20261011/schema-tests.json) |
| API `tsc --noEmit` | Passed | [API typecheck](integration-fixes-20261011/api-typecheck.log) |
| Student `tsc --noEmit` after generated output settled | Passed | [student typecheck](integration-fixes-20261011/student-typecheck.log) |
| Targeted ESLint over changed TS/TSX/MJS | Passed, 0 errors, 23 warnings | [lint](integration-fixes-20261011/targeted-lint.log) |
| Student production `next build` | Passed, 42 pages generated | [build](integration-fixes-20261011/student-build.log) |
| `git diff --check` | Passed | [diff check](integration-fixes-20261011/diff-check.log) |

The production build used `PETROS_ISOLATED_VERIFICATION=1`, disabled Playground feature flags, blank impersonation values and API `http://127.0.0.1:9`. It used an isolated output directory and never started the real API. The lint warnings concern runtime Nest DI imports classified as type-only; they were retained because decorator metadata needs those imports. The monorepo root also emits its existing Next pages-directory advisory.

No unrelated pre-existing test failure was identified in these targeted final runs; this does not claim the entire dirty monorepo is validated. Early assertions and the browser harness were repaired during this work. An early student typecheck overlapped Next regenerating `.d.ts` files and reported missing generated paths; the final sequential run passed. Preliminary browser/lint diagnostics are labelled as such and are not acceptance evidence.

## Mounted browser evidence

The harness booted only local synthetic HTTP metadata and the actual mounted Next application on localhost. It used an allowlisted synthetic institutional session, blocked external browser requests and reused the existing **silent** QA WAV. It did not boot the API, connect a database, call a provider or enable any paid flags. This verifies presentation, lifecycle and request identity; it is not a genuine voice audition or production authorization test.

| Walkthrough | Observed result |
| --- | --- |
| `/home` idle | 61.798s measured; 61 samples, 21 distinct transforms, 41 samples at rest. Full recording is 69.36s. |
| Exact `/petros/companion-playground` idle | 61.626s measured; 60 samples, 21 distinct transforms, 40 samples at rest. Full recording is 69.28s. |
| Reduced motion | OS setting stopped running idle animations on both routes; mouth movement suppression also has mounted component tests. |
| Portal preference/receipt | Stored Cedar stayed Cedar and could not generate on the synthetic legacy route. Explicit Nova and Onyx produced distinct requests and matching receipts. Changing selection stopped old playback. |
| Teaching/attention | Equation and diagram examples admitted visible semantic targets. Pointing revoked on pause; typing settled the avatar; Ask/Continue retained playback. No portal mentor duplicate mounted. |
| Actual audio | Real browser `HTMLAudioElement` playing, pause, resume, selection change, cancel and saved replay controlled speaking. No extra synthesis on replay and no stale mouth after stop. |
| Clouds/mobile | Empty, short phrase, sentence, multiple sentences and paragraph remained bounded; adjacent control geometry stayed fixed. 360px layout remained within viewport under reduced motion. |
| Ordinary and document pages | `/learn` retained the portal companion. A synthetic owned V1 document session showed the shared avatar, explicit voice selection, actual audio/pause and editable question. Session-less document URL remained unadmitted and used its dedicated frame. |
| Permission boundary | Unauthenticated Playground request remained redirected to login. Existing backend admission/approval/assessment tests stayed in force. |

[Primary browser assertions and request log](integration-fixes-20261011/browser-results.json), [idle transform summary](integration-fixes-20261011/browser-motion-summary.json), [document assertions](integration-fixes-20261011/document-browser-results.json).

Recordings:

- [Portal full idle and speech, 69s](integration-fixes-20261011/portal-idle-and-speech.webm)
- [Playground full idle, teaching and speech, 69s](integration-fixes-20261011/playground-idle-teaching-speech.webm)
- [Portal speech excerpt, 8s](integration-fixes-20261011/portal-speech-short.webm)
- [Playground interaction excerpt, 8s](integration-fixes-20261011/playground-interactions-short.webm)
- [Document shared avatar and admission](integration-fixes-20261011/document-shared-avatar.webm)

Screenshots:

- [Portal idle](integration-fixes-20261011/portal-idle.png), [reduced motion](integration-fixes-20261011/portal-reduced-motion.png), [stored Cedar](integration-fixes-20261011/portal-stale-preference.png), [effective Nova audio](integration-fixes-20261011/portal-speaking.png).
- [Playground idle before Play](integration-fixes-20261011/playground-idle.png), [reduced motion](integration-fixes-20261011/playground-reduced-motion.png), [equation attention](integration-fixes-20261011/equation-attention.png), [diagram attention](integration-fixes-20261011/diagram-attention.png).
- [Actual speaking](integration-fixes-20261011/playground-speaking.png), [paused sample](integration-fixes-20261011/playground-speech-paused.png), [360px reduced motion](integration-fixes-20261011/playground-mobile-reduced-motion.png).
- [Empty cloud](integration-fixes-20261011/cloud-empty.png), [sentence/status](integration-fixes-20261011/cloud-status.png), [short](integration-fixes-20261011/cloud-short.png), [multiple sentences](integration-fixes-20261011/cloud-two.png), [paragraph](integration-fixes-20261011/cloud-long.png).
- [Document speaking](integration-fixes-20261011/document-shared-speaking.png), [document paused/reduced motion](integration-fixes-20261011/document-shared-paused-reduced-motion.png).

## Remaining limitations and artwork

Whole-image movement and pose crossfades are supported approximations. The fixed mouth timer can indicate speaking but does not track loudness or pronunciation. Browser screenshots can capture an authored-pose crossfade; it is not independently moving anatomy. Real microphone capture, platform/device speech behavior, all browser families and real owned production learning sessions require separate verification. The isolated browser fixture does not establish live account entitlements, production RLS readiness or staging safety.

For real blinking and expressive attention, provide independent eye whites/pupils, eyelids in open/half/closed states, separate head/body pivots and clean underlying artwork. For genuine speech animation, provide aligned neutral/open/closed and supported viseme mouth shapes, plus provider timing or another validated timing signal. For articulated pointing, provide separate arm/hand layers or authored directional frames with anchors and occlusion metadata. Preserve the existing character proportions and identity. See the existing [art handoff](expressive-v2-20261011/art-handoff.md).

M0-R remains blocked. Mini stays unavailable. The next step is human review of these changes and evidence; no later milestone starts automatically.

## Exact files created and modified

The starting snapshot contains 5,031 existing tracked/untracked files. Final preservation audit: 4,993 unchanged byte-for-byte, 38 deliberately modified existing files, **zero missing files**. Existing uncommitted changes were neither reset nor discarded. “Modified existing” includes files that were already untracked at task start. See [starting hashes](integration-fixes-20261011/starting-hashes.json), [starting status](integration-fixes-20261011/starting-status.txt) and [preservation audit](integration-fixes-20261011/preservation-audit.json).

Modified existing implementation/test/artwork-metadata files:

- `apps/api/src/modules/petros-ai-routing/petros-ai-gateway.service.ts`
- `apps/api/src/modules/petros-ai-routing/petros-provider-adapters.spec.ts`
- `apps/api/src/modules/petros-ai-routing/petros-provider-adapters.ts`
- `apps/api/src/modules/petros-ai-routing/petros-voice-route-capability.spec.ts`
- `apps/api/src/modules/student/petros-companion/petros-companion.controller.ts`
- `apps/api/src/modules/student/petros-companion/petros-companion.module.ts`
- `apps/api/src/modules/student/petros-companion/petros-companion.service.ts`
- `apps/api/src/modules/student/petros-companion/petros-companion.spec.ts`
- `apps/api/src/modules/student/petros-companion/petros-voice-preview.service.ts`
- `apps/api/src/modules/student/petros-companion/petros-voice-preview.spec.ts`
- `apps/student-web/public/petros/v2/rig/manifest.json`
- `apps/student-web/src/components/petros/petros-document-teaching.tsx`
- `apps/student-web/src/components/petros/petros-inflation-pilot.module.css`
- `apps/student-web/src/components/petros/petros-inflation-pilot.tsx`
- `apps/student-web/src/components/petros/petros-mentor.module.css`
- `apps/student-web/src/components/petros/petros-mentor.spec.tsx`
- `apps/student-web/src/components/petros/petros-mentor.tsx`
- `apps/student-web/src/components/petros/petros-speaking-avatar.tsx`
- `apps/student-web/src/components/petros/use-petros-voice.spec.tsx`
- `apps/student-web/src/components/petros/use-petros-voice.ts`
- `apps/student-web/src/features/learning-studio/integrals-teaching-studio.spec.tsx`
- `apps/student-web/src/features/learning-studio/integrals-teaching-studio.tsx`
- `apps/student-web/src/features/learning-studio/petros-rig.tsx`
- `apps/student-web/src/features/learning-studio/use-teaching-playback.ts`
- `apps/student-web/src/features/petros-v2/companion/companion-cloud.tsx`
- `apps/student-web/src/features/petros-v2/companion/companion-controller.ts`
- `apps/student-web/src/features/petros-v2/companion/companion-naturalness.spec.tsx`
- `apps/student-web/src/features/petros-v2/companion/companion-rig.tsx`
- `apps/student-web/src/features/petros-v2/companion/companion.module.css`
- `apps/student-web/src/features/petros-v2/playground/companion-playground.tsx`
- `apps/student-web/src/features/petros-v2/playground/floating-companion.tsx`
- `apps/student-web/src/features/petros-v2/playground/narration-playback.spec.ts`
- `apps/student-web/src/features/petros-v2/presentation-controller.ts`
- `apps/student-web/src/features/petros-v2/voice/use-voice-preview.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-preview-types.ts`
- `apps/student-web/src/features/petros-v2/voice/voice-preview.spec.tsx`
- `apps/student-web/src/features/petros-v2/voice/voice-preview.tsx`
- `apps/student-web/src/lib/api-client.ts`

Created implementation/test/harness files:

- `apps/api/src/modules/petros-ai-routing/petros-speech-integration.spec.ts`
- `apps/api/src/modules/student/petros-companion/petros-portal-speech.service.ts`
- `apps/api/src/modules/student/petros-companion/petros-portal-speech.spec.ts`
- `apps/student-web/src/components/petros/petros-avatar.module.css`
- `apps/student-web/src/components/petros/petros-avatar.spec.tsx`
- `apps/student-web/src/components/petros/petros-avatar.tsx`
- `apps/student-web/src/components/petros/petros-speech-cloud.module.css`
- `apps/student-web/src/components/petros/petros-speech-cloud.tsx`
- `apps/student-web/src/components/petros/petros-speech-types.ts`
- `apps/student-web/src/components/petros/petros-voice-controls.tsx`
- `apps/student-web/src/features/learning-studio/use-teaching-playback.spec.tsx`
- `docs/verification/petros-v2/verify-companion-integration-fixes.mjs`
- `docs/verification/petros-v2/companion-integration-fixes.md` (this report)

Created acceptance evidence lives in `docs/verification/petros-v2/integration-fixes-20261011/`. [Evidence inventory](integration-fixes-20261011/evidence-inventory.json) lists exact files, sizes and SHA-256 hashes; duplicate raw browser captures were removed after saving the named recordings.
