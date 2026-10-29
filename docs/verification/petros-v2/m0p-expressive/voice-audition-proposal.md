# Petros M0-P voice route inventory and audition proposal

11 October 2026, Asia/Kolkata. **Preparation only. No paid requests, route changes, auditions or cost reservations were executed.** [Fresh stored inventory](voice-routes.json) was collected with default read-only connection settings and a bounded READ ONLY transaction. No credentials, account identifiers, endpoints containing secrets or learner records were selected. Stored credential presence is a boolean; health dates remain August 2026. Reachability, account entitlement and actual sound remain unverified.

## Effective routes and adapter behavior

| Function / configured route | Effective voice / format | Adapter requirements and limits | Candidate audition cost |
| --- | --- | --- | --- |
| TTS: `openai-live-eval / tts-1`, tier 0 | **Onyx** / complete WAV | OpenAI-compatible `/audio/speech`; stored credential required; caller limited to 2,000 characters, adapter 4,096. Cedar/Marin selectors are overridden for this model. No natural-delivery instructions on this route. | $0.0075 per 500-character sample at $15/M characters |
| STT: `groq / whisper-large-v3-turbo`, tier 0 | No output voice; transcript and provider segments | `/audio/transcriptions`, multipart audio, `verbose_json`, English language; no streaming playback. Segment/no-speech information is not calibrated semantic correctness. | $0.0001111 per 10-second recording at $0.04/hour |
| STT: `groq / whisper-large-v3`, tier 1 | No output voice; transcript and provider segments | Same recorded-turn adapter; actual fallback requires route/health/budget qualification. | $0.0003083 per 10-second recording at $0.111/hour |
| Spoken HTTP turn: `interaction.spoken` | No configured route | Adapter code uses Chat Completions audio, fixed Alloy/MP3. Code existence does not establish an available route. | Unavailable / no test proposed |
| Conditional TTS: `gpt-4o-mini-tts` with Cedar or Marin | Adapter would forward the selected voice, WAV and tutor instructions | **No configured candidate.** Matching model key is only a request-construction condition. Account/model lifecycle/price and endpoint support must be qualified before a new proposal. | Unpriced / excluded from this budget |
| Realtime replacement family | No supported installed route | Existing adapters do not implement the recommended Realtime transport. No provider migration is part of this task. | Unpriced / excluded |

The fresh inventory has zero enabled routing rules. All three functions have a 45-second configured timeout and two retries. OpenAI and Groq each have a stored $1 daily and $1 monthly provider cap; current remaining quota has not been reserved or certified.

Current prices agree with the stored modality rates. OpenAI lists $15/M characters for [TTS-1](https://developers.openai.com/api/docs/models/tts-1); Groq lists $0.04/hour and $0.111/hour, with a **10-second minimum billed request**, in [Speech to Text](https://console.groq.com/docs/speech-to-text). OpenAI's [TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech) lists voice availability by model; availability in that catalog is broader than this application's adapter/controller. The official [deprecation notice](https://developers.openai.com/api/docs/deprecations#2026-10-01-text-to-speech-models) schedules TTS-1 and named mini-TTS snapshots for 6 January 2027. This proposal is therefore a limited diagnostic comparison of the current route, not a production voice selection or migration.

## Playback, timing, cancellation and metering

The adapter downloads complete binary TTS output and returns base64 plus an echo of the input transcript. It supplies no output word/viseme timing or audio-level stream. STT segment times describe the student's input, not Petros's generated output. The existing V1 hook approximates word positions using character weights against duration; M0-P does not reuse those as accurate timestamps.

M0-P's existing presentation controller now prepares local audio segment handling. Only real `playing` admits the speaking pose. `loadedmetadata`/`canplay` do not imply speech. `timeupdate` supplies currentTime/duration for bounded canvas reveal inside one semantic beat; the full caption remains visible. A stall freezes reveal and gestures; pause, questions, page hiding, restart and disposal stop audio and fence its handlers. An in-memory resume restores actual player time; reload restores the saved semantic prefix in paused text mode. Audio absence, unsupported codecs, autoplay rejection, media error or a 12-second load/stall timeout retain the work and expose text continuation. No viseme data or mouth animation is synthesized.

No approved narration file exists in the inspected repository. The playground therefore remains in explicit text mode. Unit tests use synthetic media objects; the browser media test uses a silent local WAV **test signal**, not narration or a voice-quality audition. This is zero-cost lifecycle preparation, not natural voice certification.

The gateway accepts abort signals and reserves/settles each durable document attempt when a budgetReservation is supplied. The ordinary companion TTS service does not supply that reservation or forward an HTTP disconnect signal. The V1 client abort stops local fetch/playback but cannot guarantee provider cancellation or zero charge. TTS metering here uses the stored character rate; STT uses reported duration/segment end. Its estimator does not enforce Groq's 10-second minimum, so short recordings can be undercounted. Missing modality pricing may fall back to token estimates. Retries, fallback and ambiguous/failed attempts need a measured billing audit before production voice integration; none is assumed fixed in this M0-P task.

## Concrete audition envelope, pending separate approval

Propose **12 Onyx TTS samples**, at most 500 characters each; **six 10-second student recordings per STT model**, with explicit primary/fallback identity recorded. Test matched phrases at speed 1, headset and speaker output. No live learning responses or private assessments.

Suggested phrases include:

- “The vertical change is six. The horizontal change is three. Their ratio is two.”
- “Read the arrow from shared resources, through provides, to the application.”
- “This sentence is the claim. Which sentence gives the supporting reason?”
- “Your diagram is saved. Your explanation has not been evaluated.”
- “We paused at the substitution step. Continue whenever you’re ready.”
- “If the two x coordinates are equal, this slope ratio is undefined.”

Use neutral explanation, mathematical symbols/numbers, diagram terminology, short/long sentences, a question, a limitation and silence-adjacent turns. STT recordings should include Indian-English pronunciation, corrections, numbers, “slope,” “resources,” quiet speech and modest background noise. Record transcript accuracy without inferring emotions or understanding.

Score calm conversational delivery, intelligibility, pronunciation, cadence/pauses, harshness, consistency, fatigue over several minutes and actual effective voice. Measure first audible playback latency, stalls, stop latency and final billable usage. Interrupt at early/middle/late playback, while loading and during a stall; ask a contextual question, background the tab, reject autoplay and recover in text. Compare retained canvas/action IDs and resume checkpoints; no old audio or gesture may publish after cancellation.

Devices: desktop Chromium and Safari, Android Chrome, iPhone Safari, built-in speakers and a headset; explicit mic permission and codec checks on each. Browser emulation does not qualify real device microphone/audio behavior.

Cost ceiling: 6,000 TTS characters = **$0.09**, or **$0.27** with all three attempts. Sixty seconds for each STT model = **$0.0025167** combined, or **$0.00755** with three attempts per model. Conservative planned subtotal **$0.27755**; proposed absolute maximum **$0.75** including retries, failed/discarded audio and interruption overhead. Stop before any call whose maximum charge would exceed the remaining envelope. No automatic retries beyond the counted attempts and no unqualified voice/model substitution. This allowance excludes dialogue generation, larger learner studies and conditional Cedar/Marin/Realtime candidates. Recheck actual configured quotas, price units, account entitlement and effective-route metadata first. The user must separately approve execution; this task stops with the proposal.
