# Petros V2 M0 — readiness and V1 baseline

Observed: **8 October 2026 (Asia/Kolkata)**. Scope: **M0 only**. Outcome: **audit complete; readiness gate BLOCKED**. M1 and M0-P have not started. The production teaching engine, database contents, migrations, feature flags and provider settings were not changed.

`PASS` means the stated check actually succeeded at the stated scope. `WARNING` means an observed limitation or configuration risk. `BLOCKED` means a prerequisite is known to be absent or unsafe. `UNVERIFIED` means evidence was unavailable or a check was deliberately outside this authorization. A source declaration, enabled flag, stored health label or mocked response is not proof of live operation.

## Decision before M1

| Result  | Finding                                                                                                                 | Required next action                                                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKED | Configured database connection is a superuser with BYPASSRLS.                                                           | Reconcile application-role deployment and validate restricted-role access on a disposable clone before approving deployment changes. No role change was performed.                                                                              |
| BLOCKED | Four existing document-learning tables are absent; applied migration hashes/timestamps differ from the current journal. | Reconcile the existing migration history and rehearse the authorized repair on a disposable historical database. Do not run the migration runner blindly.                                                                                       |
| BLOCKED | Owner-private tables lack installed RLS, and the current role bypasses policies even on tables with RLS.                | Reconcile ordered grants/RLS effects and worker/request scope. Prove negative cases under the actual restricted role before use with real students.                                                                                             |
| BLOCKED | Zero active courses and zero reviewer qualifications in this configured target.                                         | Select a canonical course/subject binding and a currently qualified, permitted reviewer for both cloud computing and English argument analysis before verified pilot tests. Do not infer authority from being a teacher or from title matching. |
| WARNING | Five proposed V2 tables, engine pin and turn epoch are absent.                                                          | Expected future milestone work. Reserve/recheck migration numbers after existing drift is resolved; do not create these in M0.                                                                                                                  |
| PASS    | Existing changes preserved and V1 regressions pass in disposable/mocked fixtures.                                       | Preserve this baseline through subsequent approved additive changes.                                                                                                                                                                            |

M1 source/contract work requires a new approval after this report. The readiness acceptance gate has not been satisfied for the configured database or either real pilot subject. The synthetic engineering fixtures establish mechanism behavior, not real course authority or learning effectiveness.

## Repository preservation and execution boundaries

Baseline: branch `main`, HEAD `444ed328e714ad8c1a37985cb082d49536d6e6f0`. There were **175 pre-existing Git status entries**. Their expanded file contents were hashed before edits: **189 files**, including untracked work. Final comparison found **zero changed or missing pre-existing files**. No reset, checkout, stash, clean, stage, commit or deletion of an existing file occurred. Only the two requested deliverables remain newly created. An M0-only temporary test harness was created exclusively, run, and removed; its source is reproduced below.

PostgreSQL inspection used only `DATABASE_URL`, with connection-level default read-only mode plus individual `REPEATABLE READ READ ONLY` transactions, bounded statement/lock/connect timeouts, SELECT/catalog queries and aggregate counts. `DATABASE_MIGRATION_URL` was never used. The live migration runner, application bootstrap, registry synchronization, provider connectivity checker, gateway execution, scanner uploads and BullMQ enqueue/health-marker operations were not invoked.

No provider requests were made. No credentials, envelopes, hints, URLs containing credentials, student IDs/names/emails, session answers, transcript text or private assessment payloads were selected into the report. Credential availability was reduced to a boolean. Database errors were reduced to codes. Any database writes in tests occurred only in newly initialized disposable PostgreSQL clusters with synthetic fixtures; no production data dump was taken.

## Database, journal, RLS and permissions

| Result  | Observed check                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PASS    | 461 unique `pgTable` declarations in 100 schema files inventoried. Installed public catalog has 413 tables; 49 declared tables are absent (one installed table is outside this source declaration inventory). This is an inventory result, not full schema equivalence.                                                                                                                                            |
| WARNING | Journal has 156 entries, ending at `0233_petros_teacher_guidance`; referenced files exist and journal indices/timestamps are monotonic. 80 top-level SQL files are outside the active journal. Filename sequence alone does not mean those files were applied.                                                                                                                                                     |
| BLOCKED | Applied journal has 153 rows. Four current file hashes are unmatched: `0190_petros_quality_harness`, `0208_petros_document_teaching_plans`, `0209_petros_document_learning_path`, `0233_petros_teacher_guidance`. One applied hash is unknown to the current files. Unmatched hashes can mean an edited applied file or separately applied DDL; they are not, by themselves, proof that every statement is absent. |
| BLOCKED | Four actual missing tables: `petros_document_source_revisions`, `petros_document_preparations`, `petros_document_lesson_artifacts`, `petros_document_learner_paths`. This confirms the architecture audit's document-learning gap.                                                                                                                                                                                 |
| WARNING | `0208_knowledge_extraction_versions` and `0209_knowledge_preparations` hashes match, but their applied timestamps differ from the current journal. Current journal values are `1789800800001` / `1789800800002`; applied values are `1789800700000` / `1789800800000`.                                                                                                                                             |
| PASS    | Existing `assignments.petros_guidance`, `storage_objects.owner_staff_user_id` and session `version` columns exist despite the journal discrepancy. Actual PK/FK/CHECK definitions for session, command, observation/evaluation, immutable extraction, preparation, review and evidence records were inspected. This does not certify every index, trigger or column against Drizzle.                               |
| PASS    | `edrion_app` has SELECT and lacks table-level UPDATE/DELETE on audited append-only candidate/review/qualification/objective-evidence/learner-event/audit tables. Mutation triggers are present. This does not protect a superuser connection. Disposable suites exercise immutable-history and restricted-role behavior.                                                                                           |
| BLOCKED | Current role is both superuser and BYPASSRLS. Eight inventoried RLS-enabled tables also permit owner-role bypass because FORCE RLS is absent. The full expressions and flags were read from `pg_policies`/`pg_class`.                                                                                                                                                                                              |

The migration runner executes journaled Drizzle SQL, then **reapplies** `migrations/sql/zzz_grants.sql` and `zzz_rls.sql` in filename order, then executes the visual-canvases V1 data backfill. Those standalone effects are not tracked as ordinary applied Drizzle rows. Re-running it is a database mutation and was explicitly excluded. Several numeric prefixes have more than one historical migration name; use tags/hashes/timestamps, not prefix arithmetic, when reconciling.

Source RLS uses transaction-local institution/student/independent-owner GUCs. Some platform/migration branches allow unscoped access. `StudentTenantInterceptor` binds ordinary requests; `StudentOwnsTransactions` bypasses that interceptor only for server-marked handlers whose services must scope each operation themselves. Background jobs must re-resolve current authority. `ownerWhere` matches the globally unique student/independent owner; it does not itself verify institution membership or source entitlement.

Installed owner-scoped tables without RLS/policies in this inventory:

```text
assignment_assignees
knowledge_artifacts
knowledge_collections
knowledge_item_pages
knowledge_items
petros_ai_usage_events
petros_learner_calibration
petros_learner_concept_mastery
petros_learner_error_fingerprints
petros_learner_evidence_quarantine
petros_learner_model_jobs
petros_learner_move_outcomes
petros_learner_plan_snapshots
petros_learner_preferences
petros_learning_sessions
petros_observations
petros_question_specs
petros_session_commands
petros_session_detours
petros_session_events
petros_struggle_stretches
petros_topic_profile_audits
petros_topic_profile_overrides
```

Tables with RLS but owner-role bypass (separate from superuser bypass):

```text
assignments
petros_artifacts
petros_attachments
petros_conversations
petros_decline_stats
petros_messages
petros_pending_turns
storage_objects
```

Global AI definitions/models/rules and shared curriculum/profile tables were inventoried but were not automatically classified as student-private RLS failures. The missing-source list and installed constraint/policy evidence are included in the rerunnable JSON inventory.

## Authentication, material visibility, goals and approval

| Result     | Mechanism and evidence                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS       | Source inspection plus password-setup, JWT, auth/permission and disposable authenticated HTTP checks passed. Institutional students use signed HTTP-only cookies referencing live `portal_sessions`; independent learners use `independent_sessions`. Verification checks identity, expiry and revocation. Current principal/permissions are resolved on the server; password-change-required accounts are restricted. |
| WARNING    | Local config has `STUDENT_AUTH_DEV_HEADER=true`, `NODE_ENV=development`. The guard trusts the dev email header when there is no cookie and the flag is enabled; the guard has no separate production check. Production deployment must disable the flag. A real login/logout/password-reset journey against the configured database was not executed because it would write live sessions/accounts.                    |
| PASS       | Teacher guidance routes require `class_content.manage`; service authority resolves institution, class/subject teaching authority and current roster. File IDs must match institution, uploader, class, subject, file kind and ready status before assignment. Tests exercised real temporary file bytes and negative bindings.                                                                                         |
| PASS       | Personalized goals require explicit assignment recipients, even if classmates or course membership would otherwise grant access. Student file download is bound to the currently visible published goal plus its selected file IDs. SQL tests denied classmates, foreign institutions and mismatched class/subject/kind/files. `private, no-store` and download MIME/nosniff headers are present on file routes.       |
| PASS       | Learning-goal routes require `student.learn.use`, retain institutional-only scope, and do not grant general assignment-submission authority. Completion requires reflection and a completed Petros step owned by this student and goal. Teacher progress exposes participation metadata, not private answers. Completion is participation, not mastery.                                                                |
| PASS       | Pack review requires current identity, active staff status, exact subject qualification/version/evidence, time-valid qualification, `academics.alignments.approve`, and course authority. Latest review/revocation, source entitlement, enrollment and curriculum pins are rechecked for admission. Authoring self-approval is denied when teacher-authoring mode is enabled.                                          |
| PASS       | Disposable pack/source/curriculum tests denied foreign owners, source withdrawal/revocation, enrollment loss, revoked qualifications, changed payloads and unsupported compilation/rendering. Supplemental real-service tests explicitly denied expired qualification at approval and consumption.                                                                                                                     |
| BLOCKED    | Configured database has zero active courses, zero subject-mapped courses and zero qualification rows. Neither real pilot subject has a verified binding. The mechanism fixtures use synthetic qualified subjects; they do not supply the cloud/English pilot bindings.                                                                                                                                                 |
| UNVERIFIED | Running deployment's effective student permissions, cookie/origin protections and real account journeys were not recertified. Source CORS allowlist and SameSite cookies exist; no claim is made that every mutation has comprehensive CSRF protection.                                                                                                                                                                |

## Infrastructure, files and feature gates

| Result     | Observation and practical limit                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PASS       | Public local API `/v1/health` returned HTTP 200, `status=ok`, `database=ok`. This proves health availability, not authenticated teaching or providers.                                                                                                                                                                                           |
| PASS       | Redis returned PONG. Seven fixed BullMQ queue metadata sets were read without constructing queues or posting jobs. Seven Bull-named connections and seven blocking consumers were observed.                                                                                                                                                      |
| WARNING    | Maintenance metadata contained 2 failed, 50 completed and 11 delayed jobs; notifications contained 1 delayed job. Other queues were empty. No payload/error content was fetched, and cause/recency is unverified. Historical completed counts do not prove current Petros job success.                                                           |
| UNVERIFIED | Actual job round-trip and recovery in the running API were not triggered. Queue workers are configured enabled and source creates seven workers at concurrency 5. Redis service deliberately fails open for several counters/caches; durable document commands/reservations must remain authoritative.                                           |
| WARNING    | PDF preparation is BullMQ-backed with durable claims, leases, fences and reauthorization. Document lesson preparation also registers a BullMQ handler with an in-process fallback. In the configured target its required document tables are absent, so it cannot be certified operational.                                                      |
| PASS       | API-relative local student and attachment storage directories exist and are readable. Current driver is `local`. Guidance uploads instantiate LocalDiskDriver directly, even if the general student storage driver were switched.                                                                                                                |
| UNVERIFIED | Shared-volume/object-store topology, permissions for writes, backups, retention, recovery and multi-replica accessibility were not proven. No live upload/readback or object-store request was performed.                                                                                                                                        |
| WARNING    | Scanner URL/token are absent. Production media scanning fails closed without the external scanner; development uses an EICAR signature check, which is not antivirus. Guidance-file upload does **not** call `scanMedia`, and marks the object ready even when extraction is unavailable. Document AV/quarantine/admission is a V2 prerequisite. |

Process/.env inventory: `PETROS_AI_MODE=live`, `PETROS_DOCUMENT_TEACHING_ENABLED=true`, Redis/workers enabled. Every inventoried newer Petros `*_ENABLED` flag is false, including PDF preparation, visual program, assessment contract, adaptive teaching, projectile, continuity, workspace, objective evidence, qualitative review, assignment learning, provider mapping, curriculum alignment, document retrieval, multi-source, teacher authoring, advanced models, document knowledge policy and document question execution. No flag was changed.

Database feature defaults: `student.portal` and `student.surface.learn` are active and true. No active scoped assignments/rollouts were found for the inventoried Petros/student keys. Other student surface defaults vary; the complete definitions are in JSON. Effective flags still depend on current principal, scope and dependency resolution. The verifier preserves explicit process overrides and uses root `.env` as fallback; the API startup uses `.env` with override enabled. A running process's full environment was not inspected.

### Extraction and rendering baseline

| Format                | Result                                                             | What was actually verified                                                                                                                                                                                                                                                     | Limit                                                                                                                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Digital PDF           | PASS (bounded fixture)                                             | Synthetic valid one-page PDF extracted by the production `KnowledgePdfProcess`; expected text and original SHA-256 matched. Six real OS-sandbox tests passed, including credentials/files/network/subprocess denial, output/RSS/CPU/wall bounds, cancellation and invalid PDF. | Flat page text only. No reading-order geometry, OCR, diagram/table understanding or reliable equation interpretation. One clean fixture is not a general fidelity guarantee.                                                                                                                                              |
| PPTX                  | PASS (text preview fixture); WARNING (full fidelity)               | Synthetic OOXML slide text exercised the current JSZip/paragraph preview path. Existing preview regression tests passed.                                                                                                                                                       | Fixture tests text extraction, not a full representative deck render. Numeric XML filename order is used, not presentation relationship order; notes, stable shape IDs, native table structure, SmartArt, animation and embedded media are not established. ZIP expanded-size/ratio/entry bounds are absent in this path. |
| Legacy PPT            | BLOCKED (isolated admission); UNVERIFIED (actual pilot extraction) | LibreOffice `26.8.0.3` answered `--version` with app credentials excluded. Current code converts PPT→PPTX and reads slide text, returning honest unavailable output on failure.                                                                                                | Converter inherits process credentials/environment, has only timeout/output caps, and lacks OS network/filesystem/CPU/RSS isolation. No actual private cloud PPT was processed. Existing stored readable text is not proof of reliable conversion, rendering or semantic coverage.                                        |
| Rendered PDF/slides   | UNVERIFIED for V2 isolation/fidelity                               | Visual preview source inspected: Office→PDF, PDF.js page count, external page-renderer and local derived cache.                                                                                                                                                                | These paths do not establish the same OS isolation as the PDF text worker. Converter/renderer version availability is not a rendering proof.                                                                                                                                                                              |
| Scans/images/low text | BLOCKED for source-grounded teaching until supported extraction    | No OCR/vision request made.                                                                                                                                                                                                                                                    | Images/unreadable files remain references; no claim that they were understood. Selective OCR/vision, immutable units and coverage/confidence are future work.                                                                                                                                                             |

Current PDF worker allows up to 500 pages and 2 million extracted characters, with 20-second wall bound, 128 MiB V8 heap, 256 MiB sampled process-tree RSS, 16 MiB output and CPU cap. These are V1 bounds, not proof that V2's proposed 20-page/30-slide pilot bounds already exist. Guidance uploads are limited to 20 MiB and up to five files; stored guidance text is truncated at 40,000 characters, and student-context excerpts are further bounded (600 characters per excerpt). Unsupported regions must remain explicit.

## Actual AI routing and voice

Stored provider credentials are present for enabled `google-gemini`, `groq` and `openai-live-eval`. `stage8-local-qa` is disabled and paused, despite its model being enabled. Health timestamps are from August 2026, so the stored healthy labels do not prove October reachability. The credential-encryption key is absent in the local environment; source uses a development fallback key and requires a configured key in production. Credential decryption was not attempted.

The installed OpenAI-compatible adapter implements Chat Completions, STT, TTS and one complete spoken HTTP turn. Anthropic and Gemini adapters implement their message/generate-content paths without equivalent dedicated speech-output functions. Generic audio capability metadata is insufficient to qualify an STT/TTS route; the registry defaults other adapter types to the OpenAI-compatible implementation.

All **76 stored functions are enabled**, and all have configured prompt/schema labels `v1`. **Zero active function-version records** were found. The gateway therefore uses caller-provided trusted guidance when no active version exists; this is a warning about release/version pinning, not proof that V1 requests necessarily fail. `ensureRegistry()` can insert/synchronize built-ins and inherit routes, so it was deliberately not called by the verifier. The inventory is the stored state before any such mutation.

The pure production route planner was replayed with a fixed synthetic request, 250 estimated tokens, English, zero prior failures/cost and a valid modality for each function. There are no enabled routing rules. Selection depends on owner/context/seed and budget; this is a reproducible **candidate order**, not an executed provider route. All functions had a capable stored candidate except `interaction.spoken`. Full per-function route membership follows in the appendix.

Enabled models: Gemini `gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.7-flash`; OpenAI `gpt-5-mini-2025-08-07`, `tts-1`; Groq `llama-3.1-8b-instant`, `whisper-large-v3`, `whisper-large-v3-turbo`; disabled-provider model `petros-stage8-deterministic-v1`. Gemini `gemini-2.5-flash-lite` is model-disabled. Unrouted enabled models are not evidence of a usable function. Current provider/account availability and text-model pricing were not independently certified.

### Budgets and fallback behavior

Global stored daily/monthly cap: **$5 / $5**, thresholds 70% warn, 90% restrict expensive, 95% lower cost, 100% stop nonessential, preserve-essential flag true. Provider daily/monthly caps: Gemini **$3 / $3**, Groq **$1 / $1**, OpenAI **$1 / $1**. At the inventory snapshot: OpenAI day spend **$0.013830**, month **$0.039757**; Gemini day **$0**, month **$0.005017**; Groq no usage aggregate. Global rolling-30-day preview spend was **$0.044774 (0.89548%)**, budget action `none`. These are usage-ledger values, not account balance or proof of billing reconciliation.

All functions use 32,000 max input tokens, 4,096 max output tokens, 45,000 ms timeout, 2 retries, temperature 0.3, caching/streaming enabled. Function request/student/institution/cost caps are absent in this stored settings snapshot. Global preview uses rolling 30 days while provider quotas use UTC calendar day/month; durable document reservation preview can use calendar month. General gateway attempts retry per candidate, then fallback. Durable document attempts additionally use reservation/fence/dispatch/settlement checks; ordinary companion TTS does not use that durable reservation path. Voice adapters return complete audio and ignore the streaming flag. No timing or budget reservation experiment was performed.

| Function/path                  | Stored route / adapter behavior                                                                                                                                                                                     | Result                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mentor TTS `speech.synthesise` | Only `openai-live-eval / tts-1`, tier 0. UI/controller accepts Cedar/Marin, default Cedar, speed 1. Adapter sends **Onyx**, WAV, no natural-tutor instructions for this model.                                      | BLOCKED for a correctly identified Cedar/Marin playground comparison; actual audio quality UNVERIFIED. Five historical month requests exist, not a fresh audition. |
| STT `speech.transcribe`        | Groq `whisper-large-v3-turbo` tier 0 → `whisper-large-v3` tier 1, OpenAI-compatible `/audio/transcriptions`, turn recording/upload/process then editable composer.                                                  | Candidate route PASS; endpoint/accuracy/device quality UNVERIFIED. No month requests in observed ledger.                                                           |
| `interaction.spoken`           | No stored routes. Adapter, if routed, uses HTTP `/chat/completions`, complete MP3, **Alloy** hardcoded. No actual streaming/duplex transport.                                                                       | BLOCKED for inclusion in current audition.                                                                                                                         |
| Legacy voice-turn chain        | Confirmed media → legacy loop (may submit an active legacy question) → spoken route → TTS → text. TTS fallback does not forward selected voice/style. Spoken audio transcript is not checked against intended text. | WARNING; preserve V1 semantics, fence this path before any V2 assessment reuse.                                                                                    |
| Local demo playback            | Supplied beat audio, otherwise automatic device `speechSynthesis`, rate 0.96. Device voice varies. Main mentor hook has no automatic device-speech fallback.                                                        | WARNING; distinguish this baseline from gateway audio.                                                                                                             |

Silent substitution occurs in the **adapter**, based solely on `/gpt-4o.*tts/i`: matching keys use requested Cedar/Marin (Cedar default) plus tutor instructions; every other TTS key uses Onyx. Thus an enabled future audio model name or provider capability does not make Cedar work through this adapter. Fallback can also change model/voice/style. The main speech response does not identify effective voice/route to the UI. Adapter tests mock HTTP bodies and confirm Cedar/Marin for matching keys and Onyx for `tts-1`; they prove request construction, not provider voice support.

The public TTS guide lists nine voices for `tts-1`: Alloy, Ash, Coral, Echo, Fable, Onyx, Nova, Sage and Shimmer; Cedar/Marin are outside that subset. Installed UI/adapter support is narrower than the public API list. The guide still recommends `gpt-4o-mini-tts`, but the model catalog marks it deprecated. [OpenAI TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech), [GPT-4o Mini TTS model](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts).

OpenAI's 1 October 2026 deprecation notice lists `tts-1`, `tts-1-hd` and two mini-TTS snapshots for shutdown **6 January 2027**, recommending `gpt-realtime-2.1-mini`. That notice does not establish support in this installed `/audio/speech` adapter; do not switch routes merely from a catalog recommendation. No model/provider migration was made. [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations).

STT confidence defaults to 0.8 without segments, otherwise uses `1 - no_speech_prob`; this is not calibrated word or semantic accuracy. Mentor stop aborts fetch and clears local playback, but companion speech does not propagate disconnect/cancel signal or a durable presentation epoch to the gateway. TTS metering counts characters/text tokens, not actual output-audio tokens. Speech is free-form authenticated client text (up to 2,000 characters), rather than an authorized pinned public utterance. These are Playground/V2 integration gaps, not changes made here.

### M0-P audition matrix and proposed bounded budget (not executed)

| Candidate                        | Admission now                                                      | Required evidence before listening comparison                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current `tts-1` → effective Onyx | Single configured candidate; API and subjective quality unverified | Capture exact route/effective voice, actual returned transcript, autoplay/failure behavior, request cost and interruption. Treat UI Cedar/Marin labels as inaccurate. |
| Supported route → Cedar          | No eligible configured Cedar route                                 | Explicit tested model/adapter capability map, supported endpoint/account/lifecycle and approved settings change.                                                      |
| Same qualified route → Marin     | No eligible configured Marin route                                 | Same text/rig/language, stable voice metadata, actual audition.                                                                                                       |
| Spoken HTTP / Alloy              | Ineligible: no route                                               | Only add if explicitly qualified, working and transcript-validated; label complete HTTP turns accurately.                                                             |
| Device speech demo               | Separate existing baseline                                         | Label device/browser voice; do not count it as a routed natural-voice candidate.                                                                                      |

Proposed first technical benchmark: two public subject contexts × six short utterances × at most two eligible routes, **24 requests maximum**, at most 500 characters each (12,000 total), six 10-second STT fixtures, stop/failure checks included. At the inventoried `tts-1` character price of **$15/M characters**, full TTS success would be **$0.18**; with all three allowed attempts it is **$0.54**. Stored STT rates are $0.04/hour (turbo) and $0.111/hour (fallback); a conservative six-attempt envelope for 60 seconds is **$0.0111**. Proposed hard technical ceiling: **$0.75**, counting all retries, failures and discarded audio. This leaves headroom within the observed $1 OpenAI/Groq caps, but availability must be rechecked at execution. No quota was reserved. The TTS reference rate was verified in the [TTS-1 model catalog](https://developers.openai.com/api/docs/models/tts-1); stored rates are not blanket provider pricing certification.

The ten-minute free conversation and at-least-12-learner comparison required by M0-P need a separately priced dialogue/voice budget after routes are qualified; they are **UNVERIFIED**, and are not covered by the $0.75 technical fixture envelope. No paid calls are authorized in this M0 task.

## Companion Playground blockers and V1 avatar baseline

| Result                                        | Finding                                                                                                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS (source/assets and UI regressions)       | Real existing assets: eight `/petros/states/*.png` images and `/petros/petros-pointing.png`. Main institutional mentor mounts for Learn permission outside dedicated pilot/document views. Companion context owns page/thread/focus integration.               |
| WARNING                                       | Current speaking avatar uses the idle PNG plus an SVG mouth overlay toggled every 135 ms, with reduced-motion handling. It is not a viseme rig; head/body/hands retain one pose. Word highlighting is time-estimated.                                          |
| BLOCKED for revised-art gate                  | No `public/petros/v2/rig` layered exports/capability manifest were present. Independent eyes/brows/gaze/head/arms, aligned pose anchors and reviewed clips remain an art dependency. A future current-art playground must honestly label unsupported controls. |
| BLOCKED for supported voice comparison        | Single current TTS route, silent Onyx substitution, stale health, no eligible spoken route, no tested replacement lifecycle/adapter map. Real-device STT, latency, audio quality and immediate provider cancellation are unverified.                           |
| BLOCKED for V2-integrated teaching/assessment | No engine/epoch pin, authorized utterance endpoint or unified public/private cue and assessment boundary exists yet. M0-P must use reviewed public fixtures and emit no real evidence.                                                                         |
| UNVERIFIED                                    | Ten-minute persona consistency/repetition, 12-learner preference comparison, mobile/autoplay/microphone accessibility and naturalness measurements have not been performed. Existing UI tests do not establish those product outcomes.                         |

A fixture-only current-art playground can be proposed after approval; it does not require enabling every V1 feature. Neither paid auditions nor the playground were built in M0.

## V1 baseline and test results

Live aggregate baseline: **one paused learning session**, zero active/closed sessions in this catalog, no companion conversations, no knowledge items; one published teacher goal and one ready legacy-PPT guidance object marked readable/not truncated. No IDs, filenames, source text or answers were copied. A ready/readable flag does not establish AV scanning, source coverage or correctness. Saved live sessions/goals/files were not resumed or mutated.

Disposable historical baseline: the existing document-source suite migrates representative pre-S2 owner/page rows, an immutable S2 extraction and a pre-S5 completed command through additive migrations without rewriting them. It uses real restricted-role tenant transactions and authenticated HTTP/source services. The full Phase 2 journey teaches/adapts/simulates, records bounded evidence, reviews and resumes. Unit loop tests cover active→paused→resumed→closed behavior. Teacher upload/goal tests cover temporary bytes, attachment scoping, publication/close and completion. UI fixtures cover teacher goals and avatar narration/voice stop/errors. This is synthetic historical rehearsal, not a cloned production dataset or a new learning-effectiveness claim.

| Suite                                                                      | Result                                              | Scope                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API student/teacher-guidance/routing plus selected disposable integrations | PASS: **521 passed**, 0 failed, 2 initially skipped | Includes 100 document-source PostgreSQL cases, 6 real PDF OS-sandbox cases, 6 pack-authority, 12 curriculum-closure, 10 compatibility and 1 full-journey integration case. Two guidance tests required a separate local URL and were rerun below. |
| Student Petros/Learning Studio/password setup                              | PASS: **201 passed**, 0 failed                      | DOM/component/fixture baseline; browser microphone/audio service not exercised.                                                                                                                                                                   |
| Petros schema contracts                                                    | PASS: **192 passed**, 0 failed                      | Includes qualification expiry, pack/evidence/private contract constraints.                                                                                                                                                                        |
| Additional auth/session/permission/tenant/JWT                              | PASS: **37 passed**, 0 failed                       | Service/guard/JWT regression checks.                                                                                                                                                                                                              |
| Additional disposable M0 checks                                            | PASS: **4 passed**, 0 failed                        | Expired reviewer cannot approve; previously approved pack denied after expiry; PostgreSQL read-only mode rejects DDL with `25006`; wrapper reruns the guidance suite on its private database.                                                     |
| Guidance SQL on disposable database                                        | PASS: **2 passed**, 0 failed                        | Actual PostgreSQL recipient and file-binding negatives.                                                                                                                                                                                           |
| New verifier typecheck / ESLint / whitespace                               | PASS                                                | Explicit temporary tsconfig includes the script (normal API include excludes scripts); no TypeScript errors, no ESLint errors/warnings, no whitespace errors.                                                                                     |
| Verifier reruns / offline / unavailable / strict                           | PASS                                                | Default and repeat runs do not mutate existing files; offline skips DB/Redis; deliberately unavailable loopback endpoints produce UNVERIFIED; strict returns exit 1 because blockers exist.                                                       |
| Live authenticated teacher/student/browser/provider journey                | UNVERIFIED                                          | No live session/goal writes or paid calls. Previous synthetic teacher browser screenshots/results from 7 October were inspected, not represented as a fresh live journey.                                                                         |

**957 passed assertions** across these runs (including the wrapper assertion), no final failures; the initial two skipped assertions were subsequently exercised successfully. An early supplemental harness attempt used a Unix-socket query parameter unsupported by this installed postgres URL parser; those two connections failed before assertions. It was corrected to a new disposable loopback port and all six supplemental/wrapped checks passed. This was a test connection setup issue, not a production-code repair.

API tests ran with the repository's provider network trap and mocked adapter/gateway calls. Each database-writing suite initializes its own cluster and ignores application database URLs. The supplemental fixture's time change only tests expiry; it is not simulated retention evidence.

### Reproduce

From `/Volumes/Chris/Edrion Labs` (no installation or migration command required):

```sh
./packages/database/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/verify-petros-v2-readiness.ts
./packages/database/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/verify-petros-v2-readiness.ts --offline --compact
./packages/database/node_modules/.bin/tsx --tsconfig apps/api/tsconfig.json apps/api/scripts/verify-petros-v2-readiness.ts --strict --compact
```

The verifier emits JSON to stdout and never overwrites the report. Redirect only to a new external file when saving a run. `--strict` returns 1 for BLOCKED; ordinary inventory exits 0 even with blockers. An unavailable dependency is explicitly UNVERIFIED. Use the direct `tsx` launcher for machine-readable strict output; pnpm may append its own error summary after a nonzero child exit. The script does not automatically run regression suites or create database fixtures.

```sh
env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u PETROS_GUIDANCE_TEST_DB_URL PETROS_LOCAL_DB_TESTS=1 pnpm --filter @edrion/api exec vitest run src/modules/student src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts src/modules/portal/teaching/petros-teacher-guidance-files.service.spec.ts src/modules/petros-ai-routing src/modules/integrations/petros-pack-authority.integration.spec.ts src/modules/integrations/petros-curriculum-closure.integration.spec.ts src/modules/integrations/petros-compatibility.integration.spec.ts src/modules/integrations/petros-phase2-full-journey.integration.spec.ts --maxWorkers=1 --minWorkers=1
env -u DATABASE_URL -u DATABASE_MIGRATION_URL pnpm --filter @edrion/student-web exec vitest run src/components/petros src/features/learning-studio 'src/app/(auth)/student-password-setup.spec.tsx' --maxWorkers=1 --minWorkers=1
env -u DATABASE_URL -u DATABASE_MIGRATION_URL pnpm --filter @edrion/schemas exec vitest run petros --maxWorkers=1 --minWorkers=1
env -u DATABASE_URL -u DATABASE_MIGRATION_URL pnpm --filter @edrion/api exec vitest run src/modules/portal/portal-session.service.spec.ts src/modules/portal/portal-auth-login.service.spec.ts src/modules/portal/portal-auth.service.spec.ts src/modules/portal/portal-auth.controller.spec.ts src/modules/portal/tenant-scope.spec.ts src/common/jwt.spec.ts src/common/guards/permissions.guard.spec.ts --maxWorkers=1 --minWorkers=1
```

Disposable suites require `initdb` and `pg_ctl`. They apply current checked-in migrations only to their own databases, not through `src/migrate.ts`. The guidance suite requires a disposable **loopback TCP** URL; its existing guard rejects foreign URLs. Do not point it at the application database.

<details>
<summary>Supplemental M0 fixture (temporary file created, tested and removed)</summary>

The exact source used is below. For reruns, create this as a **new, exclusively created** `apps/api/src/modules/integrations/petros-m0-disposable-readiness.spec.ts`, run only that file with the same `PETROS_LOCAL_DB_TESTS=1` and cleared application URLs, then remove only the file just created. It initializes its own cluster; the last check opens only a temporary loopback port. The helper closes/removes the disposable cluster. No existing test file needs editing.

```ts
import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { schema } from '@edrion/database';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
const run = promisify(execFile);
describe('M0 additional disposable authority checks', () => {
  let db: Phase2TestDatabase;
  beforeAll(async () => {
    db = await startPhase2TestDatabase();
  }, 30000);
  afterAll(async () => {
    vi.useRealTimers();
    await db?.close();
  });
  it('denies approval by an expired but otherwise valid qualified reviewer', async () => {
    const f = await phase2AuthorityFixture(db);
    await f.admin.insert(schema.petrosReviewerQualifications).values({
      id: f.qualificationId,
      version: 1,
      institutionId: f.institutionId,
      reviewerUserId: f.teacherUserId,
      reviewerStaffId: f.teacherId,
      subjectKey: f.subjectId,
      status: 'active',
      validFrom: new Date('2020-01-01'),
      validUntil: new Date('2020-01-02'),
      evidenceKind: 'institution_record',
      evidenceHash: 'c'.repeat(64),
      recordedByUserId: f.teacherUserId,
    });
    await expect(f.approve()).rejects.toMatchObject({
      response: { code: 'PETROS_REVIEWER_QUALIFICATION_EXPIRED' },
    });
  });
  it('denies a previously approved pack after its exact reviewer qualification expires', async () => {
    const f = await phase2AuthorityFixture(db);
    await f.qualify();
    await f.approve();
    await f.current();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-02'));
    try {
      await expect(f.current()).rejects.toMatchObject({
        response: { code: 'PETROS_REVIEWER_QUALIFICATION_EXPIRED' },
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('PostgreSQL rejects a write in the readiness read-only transaction mode', async () => {
    await expect(
      db.adminSql.begin('isolation level repeatable read read only', async (tx) => {
        await tx`CREATE TABLE m0_must_not_exist(id int)`;
      }),
    ).rejects.toMatchObject({ code: '25006' });
  });
  it('runs both existing guidance SQL negatives on this disposable database only', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('PORT_UNAVAILABLE');
    const port = address.port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await run(
      'pg_ctl',
      [
        '-D',
        join(db.directory, 'data'),
        '-m',
        'fast',
        '-w',
        'restart',
        '-o',
        `-F -k ${db.directory} -h 127.0.0.1 -p ${port}`,
      ],
      { timeout: 15000, maxBuffer: 65536 },
    );
    const env = {
      ...process.env,
      PETROS_LOCAL_DB_TESTS: '0',
      PETROS_GUIDANCE_TEST_DB_URL: `postgresql://petros_test@127.0.0.1:${port}/postgres`,
    };
    delete env.DATABASE_URL;
    delete env.DATABASE_MIGRATION_URL;
    await run(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        'src/modules/student/assignments/petros-guidance-visibility.integration.spec.ts',
        '--maxWorkers=1',
        '--minWorkers=1',
        '--reporter=json',
        '--outputFile=/tmp/petros-m0-guidance-tests.json',
      ],
      { cwd: process.cwd(), env, timeout: 30000, maxBuffer: 65536 },
    );
  }, 45000);
});
```

</details>

## Exact files examined and changed

Retained changes:

- `apps/api/scripts/verify-petros-v2-readiness.ts` — new safe inventory and synthetic extraction probes.
- `docs/verification/petros-v2/readiness.md` — this evidence, baseline and gate report.

Examined scope is separated below: semantic source audit, exact schema/migration files read by the verifier, direct test files executed, and original Git status inventory. Transitive runtime/package imports were used by tests/typechecking; they are not claimed as individually reviewed source files. `.env` was parsed with allowlisted output only. Existing verification documents are historical evidence, not freshly executed tests.

<details>
<summary>Semantic/source audit paths (repository-relative)</summary>

```text
.prettierrc
CODEBASE_AUDIT.md
PETROS_V2_BLUEPRINT.md
PETROS_V2_IMPLEMENTATION_PLAN.md
apps/api/package.json
apps/api/scripts/verify-petros-teacher-guidance.ts
apps/api/src/common/queue/queue.constants.ts
apps/api/src/common/queue/queue.worker.ts
apps/api/src/common/redis/redis.service.ts
apps/api/src/main.ts
apps/api/src/modules/health/health.controller.ts
apps/api/src/modules/integrations/petros-phase2-authority-fixture.ts
apps/api/src/modules/integrations/petros-phase2-test-database.ts
apps/api/src/modules/petros-ai-routing/petros-ai-credentials.service.ts
apps/api/src/modules/petros-ai-routing/petros-ai-gateway.service.ts
apps/api/src/modules/petros-ai-routing/petros-ai-routing.repository.ts
apps/api/src/modules/petros-ai-routing/petros-ai-routing.service.ts
apps/api/src/modules/petros-ai-routing/petros-provider-adapters.ts
apps/api/src/modules/petros-ai-routing/petros-routing-engine.ts
apps/api/src/modules/portal/attachment-storage.service.ts
apps/api/src/modules/portal/course-content/portal-material-preparation.jobs.ts
apps/api/src/modules/portal/teaching/petros-teacher-guidance-files.service.ts
apps/api/src/modules/portal/teaching/petros-teacher-guidance.service.ts
apps/api/src/modules/portal/teaching/portal-teaching.controller.ts
apps/api/src/modules/student/assignments/petros-guidance-files.ts
apps/api/src/modules/student/assignments/petros-guidance-visibility.ts
apps/api/src/modules/student/assignments/student-assignments.controller.ts
apps/api/src/modules/student/assignments/student-assignments.service.ts
apps/api/src/modules/student/auth/student-auth.controller.ts
apps/api/src/modules/student/auth/student-auth.service.ts
apps/api/src/modules/student/core/owner-scope.ts
apps/api/src/modules/student/core/student-auth.guard.ts
apps/api/src/modules/student/core/student-owned-transactions.ts
apps/api/src/modules/student/core/student-session.service.ts
apps/api/src/modules/student/core/student-tenant.interceptor.ts
apps/api/src/modules/student/knowledge/knowledge-pdf-process.ts
apps/api/src/modules/student/knowledge/knowledge-preparation.repository.ts
apps/api/src/modules/student/knowledge/pdf-extract.cjs
apps/api/src/modules/student/knowledge/petros-teaching-pack.service.ts
apps/api/src/modules/student/materials/material-document-preview.service.ts
apps/api/src/modules/student/materials/material-visual-preview.service.ts
apps/api/src/modules/student/materials/presentation-converter.ts
apps/api/src/modules/student/petros-companion/petros-companion.controller.ts
apps/api/src/modules/student/petros-companion/petros-companion.service.ts
apps/api/src/modules/student/petros-input-modes/petros-media-safety.ts
apps/api/src/modules/student/petros-input-modes/petros-input-modes.service.ts
apps/api/src/modules/student/petros-session-intent/petros-document-preparation.service.ts
apps/api/src/modules/student/storage/drivers/local-disk.driver.ts
apps/api/src/modules/student/surfaces/surface-gate.service.ts
apps/api/src/modules/student/surfaces/surfaces.service.ts
apps/api/tsconfig.json
apps/api/vitest.config.ts
apps/api/vitest.setup.ts
apps/student-web/package.json
apps/student-web/src/components/petros/petros-speaking-avatar.tsx
apps/student-web/src/components/app-shell/app-shell.tsx
apps/student-web/src/components/petros/petros-companion-context.tsx
apps/student-web/src/components/petros/petros-mentor.tsx
apps/student-web/src/components/petros/use-petros-voice.ts
apps/student-web/src/features/learning-studio/petros-rig.tsx
apps/student-web/src/features/learning-studio/use-teaching-playback.ts
apps/student-web/vitest.config.ts
docs/AUDIT.md
docs/verification/petros-teacher-guidance-20261007/README.md
docs/verification/petros-teacher-guidance-20261007/browser-results.json
package.json
packages/config/src/index.ts
packages/database/migrations/meta/_journal.json
packages/database/migrations/sql/zzz_grants.sql
packages/database/migrations/sql/zzz_rls.sql
packages/database/package.json
packages/database/src/client.ts
packages/database/src/migrate.ts
packages/feature-flags/src/resolve.ts
```

</details>

Architecture audit consulted (conclusions, voice/routing and migration inventory): `/Users/macbook/.codex/visualizations/2026/10/08/01a11b97-5c16-7b01-999a-a541b23dfc58/edrion-ai-architecture-audit.md`. OpenAI Docs skill read: `/Users/macbook/.codex/skills/.system/openai-docs/SKILL.md`; the four public sources are linked at their findings.

<details>
<summary>Declared tables absent from the configured public catalog (49)</summary>

```text
campus_events
club_memberships
clubs
debate_adjudication_calls
debate_adjudication_runs
debate_ai_opponent_scripts
debate_clashes
debate_consents
debate_feedback_reports
debate_formats
debate_motion_suggestions
debate_motions
debate_prep_notes
debate_skill_snapshots
debate_speaker_scores
debate_speech_analyses
debate_transcripts
debate_verdicts
event_registrations
exam_profiles
hostel_mess_menus
identity_scan_audit
library_fine_invoice_links
library_holds
mfa_factors
mfa_recovery_codes
petros_document_learner_paths
petros_document_lesson_artifacts
petros_document_preparations
petros_document_source_revisions
placement_applications
placement_companies
placement_drives
placement_seasons
prep_diagnostic_runs
prep_enrollments
prep_error_notebook_entries
prep_exam_day_cards
prep_plan_blocks
prep_plans
sensitive_report_audit_log
sensitive_report_seals
sensitive_report_unseal_approvals
student_diary_entries
student_diary_pages
student_id_cards
student_request_gates
student_sensitive_report_ownership
transport_trip_broadcasts
```

</details>

<details>
<summary>Schema files read by the verifier (exact paths)</summary>

```text
packages/database/src/schema/_helpers.ts
packages/database/src/schema/academics.ts
packages/database/src/schema/admissions.ts
packages/database/src/schema/ai.ts
packages/database/src/schema/announcements.ts
packages/database/src/schema/assignments.ts
packages/database/src/schema/attendance-policy.ts
packages/database/src/schema/attendance.ts
packages/database/src/schema/billing.ts
packages/database/src/schema/campus-life.ts
packages/database/src/schema/campus-mirrors.ts
packages/database/src/schema/campus-placements.ts
packages/database/src/schema/campuses.ts
packages/database/src/schema/commercial.ts
packages/database/src/schema/conduct.ts
packages/database/src/schema/copilot.ts
packages/database/src/schema/counseling.ts
packages/database/src/schema/curriculum-alignment.ts
packages/database/src/schema/debate.ts
packages/database/src/schema/doc-gen.ts
packages/database/src/schema/document-issuance.ts
packages/database/src/schema/documents.ts
packages/database/src/schema/enrollments.ts
packages/database/src/schema/exam-prep.ts
packages/database/src/schema/exams.ts
packages/database/src/schema/expenses.ts
packages/database/src/schema/facilities.ts
packages/database/src/schema/features.ts
packages/database/src/schema/federation.ts
packages/database/src/schema/fees.ts
packages/database/src/schema/front_desk.ts
packages/database/src/schema/gradebook.ts
packages/database/src/schema/grading.ts
packages/database/src/schema/health.ts
packages/database/src/schema/hostel.ts
packages/database/src/schema/identity.ts
packages/database/src/schema/index.ts
packages/database/src/schema/institutional-bridge.ts
packages/database/src/schema/institutions.ts
packages/database/src/schema/integrations.ts
packages/database/src/schema/inventory.ts
packages/database/src/schema/it.ts
packages/database/src/schema/jobs.ts
packages/database/src/schema/labs.ts
packages/database/src/schema/learn.ts
packages/database/src/schema/library-review.ts
packages/database/src/schema/library.ts
packages/database/src/schema/mark-releases.ts
packages/database/src/schema/messaging.ts
packages/database/src/schema/parent-comm.ts
packages/database/src/schema/parent-docs.ts
packages/database/src/schema/parent-engage.ts
packages/database/src/schema/parent-money.ts
packages/database/src/schema/parent-notify.ts
packages/database/src/schema/parent-safety.ts
packages/database/src/schema/parent-wellbeing.ts
packages/database/src/schema/payroll.ts
packages/database/src/schema/people.ts
packages/database/src/schema/petros-adaptive.ts
packages/database/src/schema/petros-ai-routing.ts
packages/database/src/schema/petros-artifacts.ts
packages/database/src/schema/petros-assignment-learning.ts
packages/database/src/schema/petros-companion.ts
packages/database/src/schema/petros-continuity.ts
packages/database/src/schema/petros-document-learning.ts
packages/database/src/schema/petros-document-outlines.ts
packages/database/src/schema/petros-input-modes.ts
packages/database/src/schema/petros-institutional.ts
packages/database/src/schema/petros-learner-model.ts
packages/database/src/schema/petros-learning-artifacts.ts
packages/database/src/schema/petros-learning.ts
packages/database/src/schema/petros-objective-evidence.ts
packages/database/src/schema/petros-phase4-institutional.ts
packages/database/src/schema/petros-quality.ts
packages/database/src/schema/petros-reflection.ts
packages/database/src/schema/petros-release.ts
packages/database/src/schema/petros-session-intent.ts
packages/database/src/schema/petros-teach-back.ts
packages/database/src/schema/petros-teaching-packs.ts
packages/database/src/schema/petros-topic-profiles.ts
packages/database/src/schema/petros-visual-operations.ts
packages/database/src/schema/petros-workspace.ts
packages/database/src/schema/petros.ts
packages/database/src/schema/portal-sessions.ts
packages/database/src/schema/recipients.ts
packages/database/src/schema/records.ts
packages/database/src/schema/registration.ts
packages/database/src/schema/reports.ts
packages/database/src/schema/requests.ts
packages/database/src/schema/roles.ts
packages/database/src/schema/security.ts
packages/database/src/schema/settings.ts
packages/database/src/schema/student-knowledge.ts
packages/database/src/schema/student.ts
packages/database/src/schema/support.ts
packages/database/src/schema/timetable.ts
packages/database/src/schema/today.ts
packages/database/src/schema/transport.ts
packages/database/src/schema/users.ts
packages/database/src/schema/visual-studio.ts
```

</details>
<details>
<summary>Journal SQL files read and hashed by the verifier (exact paths)</summary>

```text
packages/database/migrations/0000_damp_baron_zemo.sql
packages/database/migrations/0001_smiling_imperial_guard.sql
packages/database/migrations/0002_right_maelstrom.sql
packages/database/migrations/0003_nosy_oracle.sql
packages/database/migrations/0004_cultured_agent_brand.sql
packages/database/migrations/0005_violet_smiling_tiger.sql
packages/database/migrations/0006_parched_morlun.sql
packages/database/migrations/0007_purple_garia.sql
packages/database/migrations/0008_chemical_black_bolt.sql
packages/database/migrations/0009_even_kronos.sql
packages/database/migrations/0010_amusing_newton_destine.sql
packages/database/migrations/0011_perfect_amphibian.sql
packages/database/migrations/0012_hesitant_black_bolt.sql
packages/database/migrations/0013_complete_lethal_legion.sql
packages/database/migrations/0014_chubby_harry_osborn.sql
packages/database/migrations/0015_perpetual_frog_thor.sql
packages/database/migrations/0016_far_speed_demon.sql
packages/database/migrations/0017_demonic_jack_power.sql
packages/database/migrations/0018_high_pride.sql
packages/database/migrations/0019_reflective_ezekiel_stane.sql
packages/database/migrations/0020_dusty_taskmaster.sql
packages/database/migrations/0021_mighty_katie_power.sql
packages/database/migrations/0022_closed_lyja.sql
packages/database/migrations/0023_deep_tattoo.sql
packages/database/migrations/0024_demonic_shadowcat.sql
packages/database/migrations/0025_certain_darkhawk.sql
packages/database/migrations/0026_careless_frightful_four.sql
packages/database/migrations/0027_free_silk_fever.sql
packages/database/migrations/0028_clean_lord_tyger.sql
packages/database/migrations/0029_thankful_killmonger.sql
packages/database/migrations/0030_school_expenses.sql
packages/database/migrations/0031_parent_admissions.sql
packages/database/migrations/0032_parent_admission_otps.sql
packages/database/migrations/0033_institution_documents.sql
packages/database/migrations/0034_admission_additional_info.sql
packages/database/migrations/0035_student_incidents.sql
packages/database/migrations/0036_admission_info_requests.sql
packages/database/migrations/0037_parent_portal.sql
packages/database/migrations/0038_grade_published.sql
packages/database/migrations/0039_rbac_consolidation.sql
packages/database/migrations/0040_petros_core.sql
packages/database/migrations/0041_document_generation.sql
packages/database/migrations/0042_petros_topicality.sql
packages/database/migrations/0043_petros_pending_turns_payload_rename.sql
packages/database/migrations/0043_academic_terms.sql
packages/database/migrations/0044_programme_levels.sql
packages/database/migrations/0045_merge_teachers_into_staff.sql
packages/database/migrations/0046_student_identity.sql
packages/database/migrations/0047_learning_events.sql
packages/database/migrations/0048_storage_objects.sql
packages/database/migrations/0049_student_preferences.sql
packages/database/migrations/0050_learn_core.sql
packages/database/migrations/0051_learn_revision.sql
packages/database/migrations/0052_homework.sql
packages/database/migrations/0053_class_course_content.sql
packages/database/migrations/0054_calendar_planner.sql
packages/database/migrations/0055_report_cards.sql
packages/database/migrations/0056_institutional_seeds.sql
packages/database/migrations/0057_knowledge_base.sql
packages/database/migrations/0058_mock_exams.sql
packages/database/migrations/0059_debate_achievements.sql
packages/database/migrations/0060_library_ingestion.sql
packages/database/migrations/0061_library_ingest_runs.sql
packages/database/migrations/0062_exam_assignment_questions.sql
packages/database/migrations/0063_visual_studio.sql
packages/database/migrations/0064_exam_engine.sql
packages/database/migrations/0065_programme_subjects.sql
packages/database/migrations/0066_petros_context.sql
packages/database/migrations/0067_person_middle_names.sql
packages/database/migrations/0068_dashboard_prefs.sql
packages/database/migrations/0069_fee_structure_slot.sql
packages/database/migrations/0070_programme_structure.sql
packages/database/migrations/0071_academic_term_active_default.sql
packages/database/migrations/0072_programme_subjects_slot_backfill.sql
packages/database/migrations/0073_parents_middle_name.sql
packages/database/migrations/0074_question_config_answer_json.sql
packages/database/migrations/0075_student_feature_flags.sql
packages/database/migrations/0076_academic_scope_tables.sql
packages/database/migrations/0077_academic_scope_backfill.sql
packages/database/migrations/0078_bell_schedules.sql
packages/database/migrations/0079_bell_schedule_backfill.sql
packages/database/migrations/0080_calendar_unify.sql
packages/database/migrations/0081_calendar_types_backfill.sql
packages/database/migrations/0083_strip_bell_schedules.sql
packages/database/migrations/0084_lab_subject_timetable_sync.sql
packages/database/migrations/0085_request_engine.sql
packages/database/migrations/0086_module_visibility.sql
packages/database/migrations/0087_fees_engine.sql
packages/database/migrations/0088_today_feed.sql
packages/database/migrations/0089_timetable_exceptions.sql
packages/database/migrations/0090_attendance_forecaster.sql
packages/database/migrations/0091_attendance_day_view.sql
packages/database/migrations/0092_marks_results.sql
packages/database/migrations/0093_term_recompute_feed.sql
packages/database/migrations/0094_library_fsrs.sql
packages/database/migrations/0095_graph_pipeline.sql
packages/database/migrations/0096_lab_canvas_flags.sql
packages/database/migrations/0096_edrion_learn_orchestrator.sql
packages/database/migrations/0097_student_tutor_policy_domain.sql
packages/database/migrations/0098_documents_issuance.sql
packages/database/migrations/0099_mark_release_batches.sql
packages/database/migrations/0100_mock_exam_extensions.sql
packages/database/migrations/0101_mock_system_paper_pack.sql
packages/database/migrations/0108_learn_teardown.sql
packages/database/migrations/0109_learn_engine.sql
packages/database/migrations/0110_ai_capability_values.sql
packages/database/migrations/0186_petros_ai_routing.sql
packages/database/migrations/0187_petros_learning_loop.sql
packages/database/migrations/0188_petros_observation_loop.sql
packages/database/migrations/0189_petros_topic_profiles.sql
packages/database/migrations/0190_petros_quality_harness.sql
packages/database/migrations/0191_petros_quality_seed_bigint.sql
packages/database/migrations/0192_petros_learner_model.sql
packages/database/migrations/0193_petros_artifacts.sql
packages/database/migrations/0194_petros_visual_canvas_compat.sql
packages/database/migrations/0195_petros_session_intents.sql
packages/database/migrations/0196_petros_input_modes.sql
packages/database/migrations/0197_petros_teach_back.sql
packages/database/migrations/0198_petros_reflection.sql
packages/database/migrations/0199_petros_institutional.sql
packages/database/migrations/0200_petros_failure_fixes.sql
packages/database/migrations/0201_petros_companion.sql
packages/database/migrations/0202_class_notes.sql
packages/database/migrations/0203_teaching_subject_scope.sql
packages/database/migrations/0204_course_subject_link.sql
packages/database/migrations/0205_petros_mentor_state.sql
packages/database/migrations/0206_petros_session_intent_doors.sql
packages/database/migrations/0207_petros_document_lesson_outlines.sql
packages/database/migrations/0208_petros_document_teaching_plans.sql
packages/database/migrations/0209_petros_document_learning_path.sql
packages/database/migrations/0208_knowledge_extraction_versions.sql
packages/database/migrations/0209_knowledge_preparations.sql
packages/database/migrations/0210_petros_question_execution.sql
packages/database/migrations/0211_petros_ai_attempt_reservations.sql
packages/database/migrations/0212_petros_visual_snapshot.sql
packages/database/migrations/0213_petros_assessment_contract.sql
packages/database/migrations/0214_petros_question_knowledge_policy.sql
packages/database/migrations/0215_petros_compatibility_contracts.sql
packages/database/migrations/0216_v10_rls_immutability.sql
packages/database/migrations/0217_petros_runtime_closure.sql
packages/database/migrations/0218_petros_teaching_packs.sql
packages/database/migrations/0219_petros_objective_evidence.sql
packages/database/migrations/0220_petros_projectile_commands.sql
packages/database/migrations/0221_petros_adaptive_bindings.sql
packages/database/migrations/0222_petros_assignment_learning.sql
packages/database/migrations/0223_petros_learning_artifacts.sql
packages/database/migrations/0224_petros_adaptive_observations.sql
packages/database/migrations/0225_petros_qualitative_lifecycle.sql
packages/database/migrations/0226_petros_phase2_owner_links.sql
packages/database/migrations/0227_petros_workspace.sql
packages/database/migrations/0228_petros_continuity.sql
packages/database/migrations/0229_petros_phase4_institutional.sql
packages/database/migrations/0230_petros_phase5_release.sql
packages/database/migrations/0231_staff_departments.sql
packages/database/migrations/0232_maintenance_reporting_tables.sql
packages/database/migrations/0233_petros_teacher_guidance.sql
```

</details>
<details>
<summary>Top-level SQL present outside the journal (filenames inventoried; not applied)</summary>

```text
packages/database/migrations/0097_edrion_learn_orchestrator.sql
packages/database/migrations/0099_mock_exam_extensions.sql
packages/database/migrations/0100_learn_student_tutor_policy.sql
packages/database/migrations/0101_mock_exams_visibility.sql
packages/database/migrations/0110_debate_core.sql
packages/database/migrations/0111_debate_flags.sql
packages/database/migrations/0112_debate_format_seeds.sql
packages/database/migrations/0113_debate_capture_states.sql
packages/database/migrations/0114_debate_transcript_index.sql
packages/database/migrations/0115_debate_adjudication_primary.sql
packages/database/migrations/0116_debate_report_share.sql
packages/database/migrations/0117_debate_prep_notes.sql
packages/database/migrations/0118_debate_spar_invite.sql
packages/database/migrations/0119_debate_retention_marker.sql
packages/database/migrations/0120_campus_bundle_a_core.sql
packages/database/migrations/0121_campus_bundle_a_flags.sql
packages/database/migrations/0122_campus_bundle_a_library_policy.sql
packages/database/migrations/0123_campus_library.sql
packages/database/migrations/0124_campus_transport.sql
packages/database/migrations/0125_campus_digital_id.sql
packages/database/migrations/0126_campus_identity_verify.sql
packages/database/migrations/0127_campus_outpass.sql
packages/database/migrations/0128_campus_access_scan.sql
packages/database/migrations/0129_campus_hostel_mess.sql
packages/database/migrations/0130_prep_core.sql
packages/database/migrations/0131_prep_mock_fk.sql
packages/database/migrations/0132_prep_flags.sql
packages/database/migrations/0133_prep_enrollment.sql
packages/database/migrations/0134_prep_plan_blocks.sql
packages/database/migrations/0135_prep_error_notebook.sql
packages/database/migrations/0136_prep_diagnostic.sql
packages/database/migrations/0137_prep_mock_adaptive.sql
packages/database/migrations/0138_prep_cohort.sql
packages/database/migrations/0139_prep_exam_day.sql
packages/database/migrations/0140_campus_bundle_b_placements.sql
packages/database/migrations/0141_campus_bundle_b_events.sql
packages/database/migrations/0142_placement_interviews.sql
packages/database/migrations/0143_placement_eligibility.sql
packages/database/migrations/0144_bundle_b_flags.sql
packages/database/migrations/0145_placement_offers_idx.sql
packages/database/migrations/0146_placement_events.sql
packages/database/migrations/0147_placement_profiles.sql
packages/database/migrations/0148_placement_resumes.sql
packages/database/migrations/0149_clubs_events_flags.sql
packages/database/migrations/0150_event_seats.sql
packages/database/migrations/0151_ptm_slots.sql
packages/database/migrations/0152_campus_diary.sql
packages/database/migrations/0153_health_mirror.sql
packages/database/migrations/0154_grievance.sql
packages/database/migrations/0155_sensitive_report_seal.sql
packages/database/migrations/0156_sensitive_audit.sql
packages/database/migrations/0157_sensitive_unseal.sql
packages/database/migrations/0158_sensitive_grants.sql
packages/database/migrations/0159_sensitive_hardening.sql
packages/database/migrations/0160_webhook_envelope.sql
packages/database/migrations/0161_webhook_rotation_overlap.sql
packages/database/migrations/0162_webhook_delivery_retries.sql
packages/database/migrations/0163_webhook_ui.sql
packages/database/migrations/0164_webhook_replay.sql
packages/database/migrations/0165_webhook_ops.sql
packages/database/migrations/0166_mfa_factors.sql
packages/database/migrations/0167_mfa_recovery.sql
packages/database/migrations/0168_mfa_challenge.sql
packages/database/migrations/0169_mfa_aal2.sql
packages/database/migrations/0170_mfa_catalogue.sql
packages/database/migrations/0171_support_session_sweep.sql
packages/database/migrations/0172_principal_metrics.sql
packages/database/migrations/0173_principal_rollups_daily.sql
packages/database/migrations/0174_principal_rollups_weekly.sql
packages/database/migrations/0175_principal_dashboard.sql
packages/database/migrations/0176_principal_dashboard_ui.sql
packages/database/migrations/0177_compliance_evidence.sql
packages/database/migrations/0178_compliance_posture.sql
packages/database/migrations/0179_platform_audit_debt.sql
packages/database/migrations/0180_debate_motion_seeds.sql
packages/database/migrations/0181_tier3_completion.sql
packages/database/migrations/0182_prep_sat_dev_corpus.sql
packages/database/migrations/0183_prep_sat_cr1_active.sql
packages/database/migrations/0184_federation_us_integrations.sql
packages/database/migrations/0185_federation_classlink_saml.sql
```

</details>
<details>
<summary>Direct test files executed (includes temporary supplementary fixture)</summary>

```text
apps/api/src/common/guards/permissions.guard.spec.ts
apps/api/src/common/jwt.spec.ts
apps/api/src/modules/integrations/petros-compatibility.integration.spec.ts
apps/api/src/modules/integrations/petros-curriculum-closure.integration.spec.ts
apps/api/src/modules/integrations/petros-m0-disposable-readiness.spec.ts
apps/api/src/modules/integrations/petros-pack-authority.integration.spec.ts
apps/api/src/modules/integrations/petros-phase2-full-journey.integration.spec.ts
apps/api/src/modules/petros-ai-routing/petros-ai-gateway.service.spec.ts
apps/api/src/modules/petros-ai-routing/petros-provider-adapters.spec.ts
apps/api/src/modules/petros-ai-routing/petros-response-validator.spec.ts
apps/api/src/modules/petros-ai-routing/petros-routing-engine.spec.ts
apps/api/src/modules/portal/portal-auth-login.service.spec.ts
apps/api/src/modules/portal/portal-auth.controller.spec.ts
apps/api/src/modules/portal/portal-auth.service.spec.ts
apps/api/src/modules/portal/portal-session.service.spec.ts
apps/api/src/modules/portal/teaching/petros-teacher-guidance-files.service.spec.ts
apps/api/src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts
apps/api/src/modules/portal/tenant-scope.spec.ts
apps/api/src/modules/student/assignments/petros-guidance-visibility.integration.spec.ts
apps/api/src/modules/student/assignments/petros-learning-goal-completion.spec.ts
apps/api/src/modules/student/attendance/attendance-zone.spec.ts
apps/api/src/modules/student/auth/student-password-setup.spec.ts
apps/api/src/modules/student/core/student-rate-limit.guard.spec.ts
apps/api/src/modules/student/home/student-home-ranking.spec.ts
apps/api/src/modules/student/knowledge/knowledge-document-retrieval.spec.ts
apps/api/src/modules/student/knowledge/knowledge-pdf-process.spec.ts
apps/api/src/modules/student/materials/material-document-preview.service.spec.ts
apps/api/src/modules/student/materials/material-file-types.spec.ts
apps/api/src/modules/student/materials/student-materials.controller.spec.ts
apps/api/src/modules/student/petros-artifacts/petros-artifacts.service.spec.ts
apps/api/src/modules/student/petros-companion/petros-companion.spec.ts
apps/api/src/modules/student/petros-companion/petros-mentor.engine.spec.ts
apps/api/src/modules/student/petros-companion/petros-mentor.service.spec.ts
apps/api/src/modules/student/petros-document-grounding.spec.ts
apps/api/src/modules/student/petros-input-modes/petros-input-modes.service.spec.ts
apps/api/src/modules/student/petros-input-modes/petros-media-safety.spec.ts
apps/api/src/modules/student/petros-loop/petros-adaptive.renderer.spec.ts
apps/api/src/modules/student/petros-loop/petros-document-teaching.policy.spec.ts
apps/api/src/modules/student/petros-loop/petros-loop.policy.spec.ts
apps/api/src/modules/student/petros-loop/petros-loop.service.spec.ts
apps/api/src/modules/student/petros-loop/petros-math-evaluator.spec.ts
apps/api/src/modules/student/petros-loop/petros-observation.policy.spec.ts
apps/api/src/modules/student/petros-loop/petros-pilot.policy.spec.ts
apps/api/src/modules/student/petros-loop/petros-pilot.service.spec.ts
apps/api/src/modules/student/petros-reflection/petros-reflection.engine.spec.ts
apps/api/src/modules/student/petros-reflection/petros-reflection.permissions.spec.ts
apps/api/src/modules/student/petros-reflection/petros-reflection.service.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-document-outline.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-document-preparation.normalization.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-document-source.integration.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-document-source.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-document-teaching.spec.ts
apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.spec.ts
apps/api/src/modules/student/petros-teach-back/petros-teach-back.service.spec.ts
apps/api/src/modules/student/results/student-results.spec.ts
apps/student-web/src/app/(auth)/student-password-setup.spec.tsx
apps/student-web/src/components/petros/material-preparation-status.spec.tsx
apps/student-web/src/components/petros/petros-artifact-curation.spec.tsx
apps/student-web/src/components/petros/petros-artifact-library.spec.tsx
apps/student-web/src/components/petros/petros-assigned-goal.spec.tsx
apps/student-web/src/components/petros/petros-companion.spec.tsx
apps/student-web/src/components/petros/petros-compatibility-surfaces.spec.tsx
apps/student-web/src/components/petros/petros-context-entry.spec.tsx
apps/student-web/src/components/petros/petros-continuity.spec.tsx
apps/student-web/src/components/petros/petros-document-door.spec.tsx
apps/student-web/src/components/petros/petros-document-study.spec.tsx
apps/student-web/src/components/petros/petros-document-teaching.spec.tsx
apps/student-web/src/components/petros/petros-home.spec.tsx
apps/student-web/src/components/petros/petros-inflation-pilot.spec.tsx
apps/student-web/src/components/petros/petros-input-modes.spec.tsx
apps/student-web/src/components/petros/petros-intent-detail.spec.ts
apps/student-web/src/components/petros/petros-learning-evidence.spec.ts
apps/student-web/src/components/petros/petros-learning-resume.spec.tsx
apps/student-web/src/components/petros/petros-lesson-narration.spec.ts
apps/student-web/src/components/petros/petros-math.spec.tsx
apps/student-web/src/components/petros/petros-mentor.spec.tsx
apps/student-web/src/components/petros/petros-narrated-text.spec.tsx
apps/student-web/src/components/petros/petros-program-workspace.spec.tsx
apps/student-web/src/components/petros/petros-projectile-explorer.spec.tsx
apps/student-web/src/components/petros/petros-reflection.spec.tsx
apps/student-web/src/components/petros/petros-repair-session.spec.tsx
apps/student-web/src/components/petros/petros-reviewed-objective-picker.spec.tsx
apps/student-web/src/components/petros/petros-spatial.spec.ts
apps/student-web/src/components/petros/petros-teach-back.spec.tsx
apps/student-web/src/components/petros/petros-teaching-block-renderer.spec.tsx
apps/student-web/src/components/petros/petros-visual-explorer.spec.tsx
apps/student-web/src/components/petros/petros-workspace-note-save.spec.tsx
apps/student-web/src/components/petros/use-document-question.spec.tsx
apps/student-web/src/components/petros/use-petros-voice.spec.tsx
apps/student-web/src/features/learning-studio/integrals-teaching-studio.spec.tsx
apps/student-web/src/features/learning-studio/presentation-adapter.spec.ts
packages/schemas/src/petros-adaptive-policy.spec.ts
packages/schemas/src/petros-ai-routing.spec.ts
packages/schemas/src/petros-artifacts.spec.ts
packages/schemas/src/petros-assessment.spec.ts
packages/schemas/src/petros-companion.spec.ts
packages/schemas/src/petros-compatibility.spec.ts
packages/schemas/src/petros-context.spec.ts
packages/schemas/src/petros-document-preparation.spec.ts
packages/schemas/src/petros-document-retrieval.spec.ts
packages/schemas/src/petros-document-source.spec.ts
packages/schemas/src/petros-engine-models.spec.ts
packages/schemas/src/petros-engine-phase6-cooling.spec.ts
packages/schemas/src/petros-engine.spec.ts
packages/schemas/src/petros-input-modes.spec.ts
packages/schemas/src/petros-institutional.spec.ts
packages/schemas/src/petros-knowledge-policy.spec.ts
packages/schemas/src/petros-learning.spec.ts
packages/schemas/src/petros-objective-evidence.spec.ts
packages/schemas/src/petros-phase2-pack.spec.ts
packages/schemas/src/petros-presentation.spec.ts
packages/schemas/src/petros-projectile-binding.spec.ts
packages/schemas/src/petros-projectile-model.spec.ts
packages/schemas/src/petros-qualitative-review.spec.ts
packages/schemas/src/petros-quality.spec.ts
packages/schemas/src/petros-question-execution.spec.ts
packages/schemas/src/petros-reflection.spec.ts
packages/schemas/src/petros-release.spec.ts
packages/schemas/src/petros-session-intent.spec.ts
packages/schemas/src/petros-teach-back.spec.ts
packages/schemas/src/petros-topic-profiles.spec.ts
packages/schemas/src/petros-visual-program.spec.ts
```

</details>
<details>
<summary>Pre-existing Git status entries (unaltered)</summary>

```text
 M apps/api/src/modules/portal/academics.repository.ts
 M apps/api/src/modules/portal/academics.service.ts
 M apps/api/src/modules/portal/onboarding.repository.ts
 M apps/api/src/modules/portal/onboarding.service.ts
 M apps/api/src/modules/portal/people.repository.ts
 M apps/api/src/modules/portal/people.service.ts
 M apps/api/src/modules/portal/portal-auth-login.service.ts
 M apps/api/src/modules/portal/portal-auth.controller.ts
 M apps/api/src/modules/portal/portal-auth.guard.ts
 M apps/api/src/modules/portal/portal-auth.service.ts
 M apps/api/src/modules/portal/portal-credential.service.ts
 M apps/api/src/modules/portal/portal-session.service.ts
 M apps/api/src/modules/portal/portal.module.ts
 M apps/api/src/modules/portal/programme-structure.repository.ts
 M apps/api/src/modules/portal/programme-structure.service.ts
 M apps/api/src/modules/portal/teaching/portal-teaching.controller.ts
 M apps/api/src/modules/registration/registration-approval.service.ts
 M apps/api/src/modules/registration/registration-email.service.ts
 M apps/api/src/modules/registration/registration.repository.ts
 M apps/api/src/modules/registration/registration.service.spec.ts
 M apps/api/src/modules/registration/registration.service.ts
 M apps/api/src/modules/student/assignments/student-assignments.controller.ts
 M apps/api/src/modules/student/assignments/student-assignments.service.ts
 M apps/api/src/modules/student/auth/student-auth.controller.ts
 M apps/api/src/modules/student/auth/student-auth.service.ts
 M apps/api/src/modules/student/core/student-auth.guard.ts
 M apps/api/src/modules/student/core/student-session.service.ts
 M apps/api/src/modules/student/core/student.decorators.ts
 M apps/api/src/modules/student/courses/student-courses.service.ts
 M apps/api/src/modules/student/homework/homework-policy.service.ts
 M apps/api/src/modules/student/materials/material-document-preview.service.spec.ts
 M apps/api/src/modules/student/materials/material-document-preview.service.ts
 M apps/api/src/modules/student/materials/material-visual-preview.service.ts
 M apps/api/src/modules/student/me/student-me.controller.ts
 M apps/api/src/modules/student/me/student-me.service.ts
 M apps/api/src/modules/student/petros-companion/petros-briefing.service.ts
 M apps/api/src/modules/student/petros-companion/petros-student-context.service.ts
 M apps/api/src/modules/student/petros-loop/petros-loop.policy.ts
 M apps/api/src/modules/student/petros-reflection/petros-reflection.repository.ts
 M apps/api/src/modules/student/petros-session-intent/petros-session-intent.repository.ts
 M apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.spec.ts
 M apps/api/src/modules/student/petros-session-intent/petros-session-intent.service.ts
 M apps/api/src/modules/student/student.types.ts
 M apps/institution-web/src/app/(app)/academics/departments/page.tsx
 M apps/institution-web/src/app/(app)/academics/programme-structure/page.tsx
 M apps/institution-web/src/app/(app)/careers/placements/page.tsx
 M apps/institution-web/src/app/(app)/gradebook/page.tsx
 M apps/institution-web/src/app/(app)/homework/page.tsx
 M apps/institution-web/src/app/(app)/onboarding/page.tsx
 M apps/institution-web/src/app/(app)/staff/page.tsx
 M apps/institution-web/src/app/(app)/students/page.tsx
 M apps/institution-web/src/app/(app)/teaching/[classId]/[subjectId]/page.tsx
 M apps/institution-web/src/app/(app)/users/page.tsx
 M apps/institution-web/src/app/globals.css
 M apps/institution-web/src/app/layout.tsx
 M apps/institution-web/src/app/login/page.tsx
 M apps/institution-web/src/app/providers.tsx
 M apps/institution-web/src/components/academics/created-programmes-panel.tsx
 M apps/institution-web/src/components/academics/curriculum-grid.tsx
 M apps/institution-web/src/components/academics/programme-builder.tsx
 M apps/institution-web/src/components/academics/resource-form.tsx
 M apps/institution-web/src/components/academics/resource-manager.tsx
 M apps/institution-web/src/components/app-shell/sidebar.tsx
 M apps/institution-web/src/components/gradebook/release-panel.tsx
 M apps/institution-web/src/components/gradebook/weight-map-editor.tsx
 M apps/institution-web/src/components/guardian/app-shell.tsx
 M apps/institution-web/src/components/timetable/timetable-grid.tsx
 M apps/institution-web/src/lib/academics-types.ts
 M apps/institution-web/src/lib/academics.ts
 M apps/institution-web/src/lib/onboarding-types.ts
 M apps/institution-web/src/lib/onboarding.ts
 M apps/institution-web/src/lib/people-types.ts
 M apps/institution-web/src/lib/portal-session.ts
 M apps/institution-web/tailwind.config.ts
 M apps/public-web/src/components/register/register-flow.tsx
 M apps/student-web/src/app/(app)/assignments/[id]/page.tsx
 M apps/student-web/src/app/(app)/layout.tsx
 M apps/student-web/src/app/(app)/learn/page.tsx
 M apps/student-web/src/app/(app)/petros/page.tsx
 M apps/student-web/src/app/(auth)/activate/page.tsx
 M apps/student-web/src/app/(auth)/login/page.tsx
 M apps/student-web/src/components/assignment-list-screen.tsx
 M apps/student-web/src/components/design-system/action-button.tsx
 M apps/student-web/src/components/design-system/primitives.module.css
 M apps/student-web/src/components/petros/petros-door-button.tsx
 M apps/student-web/src/components/petros/petros-inflation-pilot.module.css
 M apps/student-web/src/components/petros/petros-inflation-pilot.tsx
 M apps/student-web/src/components/petros/petros-mentor.module.css
 M apps/student-web/src/components/petros/petros-mentor.tsx
 M apps/student-web/src/components/petros/petros-repair-session.spec.tsx
 M apps/student-web/src/components/petros/petros-repair-session.tsx
 M apps/student-web/src/components/petros/petros-session.module.css
 M apps/student-web/src/features/learning-studio/petros-rig.tsx
 M apps/student-web/src/lib/hooks.ts
 M apps/super-admin-web/src/app/(app)/registration-requests/[id]/page.tsx
 M apps/super-admin-web/src/app/globals.css
 M apps/super-admin-web/src/app/layout.tsx
 M apps/super-admin-web/src/components/registration/approve-wizard.tsx
 M packages/api-client/src/types.ts
 M packages/database/migrations/meta/_journal.json
 M packages/database/src/schema/academics.ts
 M packages/database/src/schema/assignments.ts
 M packages/schemas/src/academics.ts
 M packages/schemas/src/index.ts
 M packages/schemas/src/people.ts
 M packages/schemas/src/petros-learning.spec.ts
 M packages/schemas/src/petros-learning.ts
 M packages/schemas/src/portal-auth.ts
 M packages/schemas/src/registration.ts
 M packages/schemas/src/student/auth.ts
 M packages/schemas/src/student/me.ts
 M packages/shared-types/src/programme-structure.spec.ts
 M packages/shared-types/src/programme-structure.ts
 M packages/ui/src/button.tsx
 M scripts/registration-smoke.sh
?? PETROS_V2_BLUEPRINT.md
?? PETROS_V2_IMPLEMENTATION_PLAN.md
?? apps/api/scripts/repair-petros-guidance-presentations.ts
?? apps/api/scripts/verify-petros-teacher-guidance.ts
?? apps/api/src/modules/portal/academics-programme-tree.spec.ts
?? apps/api/src/modules/portal/onboarding-progress.spec.ts
?? apps/api/src/modules/portal/portal-auth-login.service.spec.ts
?? apps/api/src/modules/portal/portal-auth.controller.spec.ts
?? apps/api/src/modules/portal/portal-auth.service.spec.ts
?? apps/api/src/modules/portal/portal-credential-account.spec.ts
?? apps/api/src/modules/portal/portal-credential-account.ts
?? apps/api/src/modules/portal/portal-credential-multi-institution.spec.ts
?? apps/api/src/modules/portal/portal-linked-credential-reset.spec.ts
?? apps/api/src/modules/portal/portal-session.service.spec.ts
?? apps/api/src/modules/portal/programme-structure-edit.spec.ts
?? apps/api/src/modules/portal/staff-departments.spec.ts
?? apps/api/src/modules/portal/student-default-account.spec.ts
?? apps/api/src/modules/portal/teaching/petros-teacher-guidance-files.service.spec.ts
?? apps/api/src/modules/portal/teaching/petros-teacher-guidance-files.service.ts
?? apps/api/src/modules/portal/teaching/petros-teacher-guidance.service.spec.ts
?? apps/api/src/modules/portal/teaching/petros-teacher-guidance.service.ts
?? apps/api/src/modules/registration/registration-approval.service.spec.ts
?? apps/api/src/modules/registration/registration-email.service.spec.ts
?? apps/api/src/modules/registration/registration.repository.spec.ts
?? apps/api/src/modules/student/assignments/petros-guidance-files.ts
?? apps/api/src/modules/student/assignments/petros-guidance-visibility.integration.spec.ts
?? apps/api/src/modules/student/assignments/petros-guidance-visibility.ts
?? apps/api/src/modules/student/assignments/petros-learning-goal-completion.spec.ts
?? apps/api/src/modules/student/auth/student-password-setup.spec.ts
?? apps/api/src/modules/student/materials/presentation-converter.ts
?? apps/institution-web/public/
?? apps/institution-web/src/app/choose-institution/
?? apps/institution-web/src/components/academics/staff-departments-panel.tsx
?? apps/institution-web/src/components/app-shell/switch-institution-link.tsx
?? apps/institution-web/src/components/teaching/petros-guidance-attachments.tsx
?? apps/institution-web/src/components/teaching/petros-teacher-guidance.tsx
?? apps/institution-web/src/lib/academic-structure-terms.ts
?? apps/institution-web/src/lib/institutions.ts
?? apps/institution-web/src/lib/staff-profile-fields.ts
?? apps/student-web/src/app/(app)/learn/goals/
?? apps/student-web/src/app/(auth)/change-password/
?? apps/student-web/src/app/(auth)/student-password-setup.spec.tsx
?? apps/student-web/src/components/design-system/button-loading.spec.tsx
?? apps/student-web/src/components/petros/petros-assigned-goal.spec.tsx
?? apps/student-web/src/components/petros/petros-assigned-goal.tsx
?? apps/student-web/src/components/petros/petros-home.module.css
?? apps/student-web/src/components/petros/petros-home.spec.tsx
?? apps/student-web/src/components/petros/petros-home.tsx
?? apps/student-web/src/components/petros/petros-intent-detail.spec.ts
?? apps/student-web/src/components/petros/petros-intent-detail.ts
?? apps/student-web/src/components/petros/petros-speaking-avatar.tsx
?? apps/student-web/src/components/petros/petros-teacher-goals.tsx
?? apps/super-admin-web/public/
?? docs/verification/petros-teacher-guidance-20261007/
?? packages/database/migrations/0231_staff_departments.sql
?? packages/database/migrations/0232_maintenance_reporting_tables.sql
?? packages/database/migrations/0233_petros_teacher_guidance.sql
?? packages/schemas/src/onboarding-structure.spec.ts
?? packages/schemas/src/petros-teacher-guidance.ts
?? scripts/dev/backfill-student-logins.ts
```

</details>
<details>
<summary>Real V1 avatar asset files inventoried (no new rig created)</summary>

```text
apps/student-web/public/petros/petros-pointing.png
apps/student-web/public/petros/states/petros-idle.png
apps/student-web/public/petros/states/petros-listening.png
apps/student-web/public/petros/states/petros-point-down.png
apps/student-web/public/petros/states/petros-point-left.png
apps/student-web/public/petros/states/petros-point-right.png
apps/student-web/public/petros/states/petros-point-up.png
apps/student-web/public/petros/states/petros-talking.png
apps/student-web/public/petros/states/petros-thinking.png
```

</details>

### Complete effective function candidate inventory

Every row is a pure-planner result for the synthetic context above. Active version count is zero for every function. Order notation: `provider/model @ tier`. No API/provider call is implied.

| Function                                          | Candidate/fallback order                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `answer.evaluate`                                 | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `artifact.diagram.generate`                       | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `artifact.diagram.refine`                         | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |
| `artifact.flashcards.generate`                    | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `artifact.notes.generate`                         | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `assignment.assist`                               | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `assistant.context.answer`                        | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `companion.briefing.phrase`                       | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `companion.thread.summarize`                      | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `companion.turn`                                  | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `document.concepts.extract`                       | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `document.teaching.plan`                          | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `document.understand`                             | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `doubt.analyse`                                   | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `engagement.analyse`                              | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `engagement.fatigue_intervention`                 | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `engagement.motivate`                             | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `evaluation.teaching_quality.judge`               | google-gemini/gemini-3.7-flash @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                           |
| `explanation.deep`                                | google-gemini/gemini-3.7-flash @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                           |
| `explanation.general`                             | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `explanation.simple`                              | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `hint.generate`                                   | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `institution.parent_digest.generate`              | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `institution.teacher_escalation_summary.generate` | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `interaction.spoken`                              | NO_CAPABLE_ROUTE                                                                                                          |
| `language.mixed_teaching`                         | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `language.translate`                              | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `learner_model.update`                            | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `misconception.detect`                            | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `mistake.classify`                                | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `plan.exam_revision.generate`                     | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `plan.study.generate`                             | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `practice.generate`                               | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `prerequisite_gap.detect`                         | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `quiz.generate`                                   | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `reflection.gap_explanation.generate`             | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `reflection.session_recap.generate`               | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `session.close.synthesise`                        | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `session.recap.generate`                          | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `solution.worked.generate`                        | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `speech.synthesise`                               | openai-live-eval/tts-1 @ 0                                                                                                |
| `speech.transcribe`                               | groq/whisper-large-v3-turbo @ 0 → groq/whisper-large-v3 @ 1                                                               |
| `syllabus.retrieve_ground`                        | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teach_back.explanation.analyse`                  | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teach_back.follow_up.generate`                   | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teach_back.verdict.generate`                     | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teacher.escalation_summary`                      | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teaching.block.render`                           | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teaching.move.analogy.render`                    | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.apply_to_your_world.render`        | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.artifact_commit.render`            | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.contrast_case.render`              | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.derivation.render`                 | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.diagram.render`                    | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.forward_link.render`               | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.goal_frame.render`                 | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.hook.render`                       | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.layered_explanation.render`        | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.misconception_demolition.render`   | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.predict_then_reveal.render`        | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.prerequisite_check.render`         | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.recall_check.render`               | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.socratic_probe.render`             | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.story.render`                      | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.synthesis.render`                  | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.move.worked_example.render`             | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `teaching.next_action.select`                     | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `teaching.plan.generate`                          | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `topic.profile.generate`                          | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1 → openai-live-eval/gpt-5-mini-2025-08-07 @ 2 |
| `vision.handwriting.analyse`                      | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |
| `vision.image.understand`                         | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |
| `vision.question.extract`                         | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |
| `visual.animation.generate`                       | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |
| `visual.diagram.generate`                         | google-gemini/gemini-3.5-flash-lite @ 0 → openai-live-eval/gpt-5-mini-2025-08-07 @ 1                                      |
| `visual.simulation.generate`                      | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |
| `working.evaluate_steps`                          | google-gemini/gemini-3.7-flash @ 0 → google-gemini/gemini-3.5-flash-lite @ 1                                              |

### Evidence outputs for this run

These local temporary results contain redacted inventories or synthetic test output and may expire with OS cleanup. The report preserves counts, findings and exact reproduction commands.

| File                                    | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `/tmp/petros-m0-api-tests.json`         | `4682f477c5190768e5b1d71a2ea17c30691b683baeb1c2c8b287b3dc65e76415` |
| `/tmp/petros-m0-web-tests.json`         | `fd787c432aee3f68b79ab2d6a93c2fcfe0b16a822ded6ec8b924ca1572ccecb3` |
| `/tmp/petros-m0-schema-tests.json`      | `ca228a1fbbc6f006bac587f3464795a407960a3040e1531f1937f48ed07ef1c2` |
| `/tmp/petros-m0-auth-tests.json`        | `f2f72e973cb0ce79b7e6c9271fd0dbd7606df7eb4908ec8e30174024f520be9f` |
| `/tmp/petros-m0-extra-tests.json`       | `a7deb3ea07d500dfb5438fa767a0887adbe1bc196234092c1ea7d3eca6a16e31` |
| `/tmp/petros-m0-guidance-tests.json`    | `251445f9ce8bf50b8efaaa7a2269a7c145542833083daa14628c19447ff8b153` |
| `/tmp/petros-m0-final-inventory.json`   | `2e04d86891a7411b17476391323e054738e698b68280097ec95ae680911bc911` |
| `/tmp/petros-m0-offline-inventory.json` | `222d456459cd7317d3407f618eb34721a0e85428fe65242d4a6a6e65386109d3` |

Initial preservation manifest: `/var/folders/t4/gvftc8ld2jv8vr4bxn2ty5mw0000gn/T/petros-m0-s2ur4qlp/initial-worktree.json`; SHA-256 `d1d24982eaef18e1f3b0bc9d88442763a3de917e7bb8a3c624199c0592303ce5`.

**Stop:** no M1 contracts/migrations, Companion Playground, artwork generation, route/provider changes or production teaching changes were started. Approval is required for the next milestone and its concrete prerequisite work.
