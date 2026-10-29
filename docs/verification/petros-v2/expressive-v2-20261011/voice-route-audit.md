# Petros internal voice preview: route audit and paid-audition gate

11 October 2026, Asia/Kolkata. **Backend IMPLEMENTED AND TESTED with mocked transports; IMPLEMENTED BUT NOT YET PROVIDER-TESTED. Paid execution REQUIRES AUTHORIZATION.** This extension made zero provider calls, zero database connections, zero credential reads/decryptions and no route/registry changes. The existing stored [route inventory](../m0p-expressive/voice-routes.json), observed earlier on 11 October, is historical evidence; it was read from disk, not refreshed against the database. Actual account entitlement, network reachability, naturalness, microphone/device accuracy and provider invoices remain unqualified.

## Effective routes and implemented selection

| Previously observed configured candidate | Installed adapter behavior after this extension | Qualification |
| --- | --- | --- |
| `speech.synthesise`: `openai-live-eval / tts-1`, tier 0 | Strict preview forwards the selected supported voice and reports `effectiveVoice`; complete WAV response, no output word/phoneme/viseme timestamps. Supported voices: Alloy, Ash, Coral, Echo, Fable, Onyx, Nova, Sage, Shimmer. Cedar/Marin are rejected before HTTP. Existing V1 callers requesting Cedar/Marin retain their legacy Onyx fallback. | Configured in the historical inventory; no fresh live-route or sound test. |
| `speech.transcribe`: `groq / whisper-large-v3-turbo`, tier 0 | Recorded audio multipart transcription, English, `verbose_json`; input segment uncertainty is not learner correctness. Metering now includes Groq's ten-second minimum for this installed model. | Configured in the historical inventory; selected primary only in preview. |
| `speech.transcribe`: `groq / whisper-large-v3`, tier 1 | Same adapter and ten-second minimum. Preview does not force an alternative route or silently fall back. | Historical fallback candidate; selectable only if gateway legitimately makes it the current primary. |
| `interaction.spoken` | Existing code uses fixed Alloy/MP3 on Chat Completions audio. | No configured route in historical inventory; excluded. |
| `gpt-4o-mini-tts` and dated snapshots | Installed adapter supports model-specific voices and tutor instructions. | No historical configured route; **excluded from the capped preview** because official audio-token output pricing cannot be safely bounded by a character-only setting. No migration or provider provisioning was performed. |

The model-specific nine-voice legacy list was verified by fetching the official [OpenAI TTS guide, Voice options](https://developers.openai.com/api/docs/guides/text-to-speech#voice-options) on 11 October 2026. Its generic thirteen-voice list is broader than TTS-1 support. The [OpenAI pricing page](https://developers.openai.com/api/docs/pricing) currently lists TTS-1 at $15 per million characters, TTS-1-HD at $30 per million characters, and mini-TTS by text/audio tokens. [Groq speech-to-text documentation](https://console.groq.com/docs/speech-to-text) lists $0.04/hour for Turbo and $0.111/hour for large-v3, with a ten-second minimum billed recording. Stored modality rates must be requalified before enabling an audition; account-specific pricing, invoices, provider lifecycle and retention may differ.

## Server contracts and default behavior

All three responses explicitly send `Cache-Control: private, no-store`. All routes retain existing student authentication, student permissions, institutional portal and rate-limit guards, plus the same playground tester allowlist and password-change restriction. No dev-header or authentication bypass was added.

- `GET /v1/student/petros/companion/voice-preview/status`: sanitized current eligible route/price/capability metadata **only after all server gates are satisfied**. Default response is `authorization_required` with an explanatory reason, empty route arrays and limits; it performs no routing or database operation. An authorized status reads route metadata but dispatches no provider request. Model/account availability remains explicitly unqualified. It does not return credentials, credential presence, base URLs or private account identifiers.
- `POST .../speech`: `{routeId, voice, text, speed?}`. Public test text only, 500 characters, speed 0.85–1.15. Strict voice selection, one route attempt, no retries/cache. Returns audio, transcript, effective provider/model/voice and metered estimate. A stale route, unsupported voice, changed model/provider/price or missing accounting fails before dispatch.
- `POST .../transcription`: `{routeId, consent:true, audio:{mimeType:'audio/wav',dataBase64}}`. Canonical mono 16 kHz PCM16 WAV only, 330,000-byte bound and ten-second duration bound. The server verifies RIFF sizes, PCM format, rate, block alignment and data length rather than trusting browser duration. This fits the existing global 512 KB JSON cap without changing it. Empty, malformed and oversized audio fails. Response supplies an editable transcript; it does not submit an assessment or generate an adaptive response.

The preview controller owns its transactions using the existing `StudentOwnsTransactions` contract. Each route metadata read and each gateway database operation runs in a short owner-scoped `runOutsideTenant` / `runInStudentTenant` transaction; provider HTTP runs outside them. Failure/cancellation usage records commit before the endpoint rejects, rather than rolling back with a surrounding student request transaction. The existing gateway remains the only provider execution entrance. The preview adds a final route/model/provider and modality-price fence immediately before dispatch. Approval and abort are rechecked after the final awaited release preflight so an approval expiring during that lookup cannot dispatch afterward. Browser HTTP abort/disconnect propagates through gateway and adapter transports. Local audio must stop immediately; provider cancellation after dispatch cannot guarantee zero charge. No stale queued audio is created server-side. All output is transient and bypasses shared cache. Existing gateway usage records store route/request/cost and preview approval metadata; raw microphone data, preview text, audio and transcripts are not added to preview metadata or new persistent storage. Provider failure messages can echo submitted content, so preview usage stores error codes only. Provider account retention policies still apply.

The gateway adapter's `actualCostMicros` is a rate-derived modality estimate, not an invoice. Preview therefore returns `actualCostMicros:null` and labels `estimatedCostMicros` as the gateway metered estimate. Voice quality and bill reconciliation are not claimed tested.

## Exact authorization gates, currently disabled

No environment files were edited or flags enabled. These are configuration requirements for a later, separately approved isolated diagnostic run:

| Setting | Required value |
| --- | --- |
| `PETROS_V2_COMPANION_PLAYGROUND_ENABLED` | `true` |
| `PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS` | Approved authenticated synthetic tester student UUID, existing permission `student.learn.use` |
| `PETROS_V2_VOICE_PREVIEW_ENABLED` | `true` after separate user approval |
| `PETROS_V2_VOICE_PREVIEW_PAID_APPROVED` | `true` after separate user approval |
| `PETROS_V2_VOICE_PREVIEW_ISOLATED_APPROVED` | `true` only after the runtime/database has been independently verified isolated and restricted |
| `PETROS_V2_VOICE_PREVIEW_APPROVAL_ID` | Unique reviewed approval identity, 1–100 letters/digits/period/underscore/hyphen |
| `PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT` | UTC ISO timestamp in the future, at most 24 hours away |
| `PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS` | Proposed maximum `750000` ($0.75), schema forbids a higher value |
| `PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS` | Proposed `10000` ($0.01); each eligible request must price below it |
| `PETROS_AI_MODE` | `live` |
| `REDIS_ENABLED` | `true`, with reachable shared accounting and retained keys |
| `NODE_ENV` | Non-production only |

**An isolated-approval flag is an operator attestation, not proof that database credentials are safe.** Before enabling, the operator must supply an approved isolated API/database/Redis environment, restricted synthetic test identity, appropriately restricted database role and server-held provider credentials. The previously identified unsafe production database remains prohibited. Runtime startup and `previewRoute` reuse the existing registry initialization behavior; execute them only in that approved isolated environment. This implementation did not start the API.

The shared Redis quota atomically admits at most `floor(totalCap/perCallCap)` calls per approval identity (75 at the proposed values), across testers and API processes. Each slot conservatively consumes $0.01 regardless of returned estimate; failed, cancelled and ambiguous calls are never refunded. Keys last seven days, beyond the 24-hour approval. Accounting outage/exhaustion fails closed; automatic retries and route fan-out are disabled. **Redis persistence and key preservation are prerequisites:** losing/resetting counters or reusing approval identities after counter expiry invalidates the envelope. This is a bounded diagnostic admission ledger, not a new durable production billing system. Provider caps and actual rate qualification remain necessary outside it.

## Concrete proposed audition, no authorization granted

Propose 12 TTS requests: six matched public phrases in **Onyx and Nova**, at most 500 characters per request and speed 1. Six explicit microphone recordings, up to ten seconds each, through the current Groq Turbo primary. **18 calls**, no automatic retries or fallback.

Public matched phrases cover an equation ratio, a diagram relationship, claim/evidence wording, a saved-work correction, resuming a checkpoint and an undefined slope. Reuse the phrase examples in the [previous audition proposal](../m0p-expressive/voice-audition-proposal.md). Record calm delivery, clarity, pronunciation, pauses, mathematical terminology, correction naturalness, actual effective selection, latency, autoplay recovery and stop/interruption latency. Use synthetic public examples and retain the text interface.

At historical/current listed rates: 6,000 TTS characters = **$0.09**; six ten-second Turbo requests = **$0.0006667**, planned subtotal **$0.0906667** before account differences. The 18 calls reserve **$0.18** conservatively. Proposed absolute authorization ceiling remains **$0.75**; provider rate changes, invoice uncertainty and rejected/aborted attempts consume the envelope. Compare only currently eligible routes; a new Cedar/Marin or different billing model requires a revised qualification and approval. No live dialogue-generation calls are included.

## Evidence and remaining limits

[Backend zero-cost test results](voice-backend-tests.json): **132 passed, zero failed, five files**. Coverage includes deferred-release approval expiry, post-preflight abort, failure/cancellation accounting commits, owner-scoped short transactions, strict supported/unsupported voice construction, existing V1 speech compatibility, TTS/STT cancellation to mocked HTTP, admission and spend failures, real gateway route/price drift rejection, canonical WAV validation, consent, transient-cache controls and returned effective identity. They do not prove real voice naturalness, real microphone recognition or provider invoice accuracy. [Scoped lint](voice-backend-lint.log): zero errors and eleven type-import warnings (six on existing dependency imports and five on Nest constructor dependencies kept as runtime imports for decorator metadata). [Full API typecheck](api-typecheck.log): **passed**, exit 0 with no diagnostics on Node 24.21.0. The empty log reflects successful `tsc --noEmit --pretty false`.

Mouth articulation remains dependent on legitimate layered artwork. Output timing is whole audio activity/semantic caption only; input STT segments are not Petros output lip-sync timing. Full spoken conversation with real model responses, physical mobile audio qualification, naturalness auditions and longer recordings remain unimplemented or provider/authorization dependent. M0-R remains blocked; no deployment, database migration, RLS/role changes, learning writes or next milestone was attempted.
