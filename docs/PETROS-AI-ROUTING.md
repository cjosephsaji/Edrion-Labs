# Petros AI routing and embedded learning

Petros is an embedded learning system, not a chat product. Student-facing features call one
provider-independent gateway; provider names, model identifiers, retries, budgets, and failures
remain inside the API control plane.

## What is implemented

- A code-owned AI Function Registry covering the current Petros capability catalogue. Registry
  entries are synchronized into Postgres when the routing module starts or the admin overview is
  opened, so a newly registered function becomes configurable without a separate UI change.
- Provider, model, capability, function, prompt/schema version, routing rule, budget, and usage
  persistence.
- Primary, secondary, and third-tier routes, including percentage traffic allocation within a tier.
- Context rules for subject, topic, grade, session type, difficulty, modality, language,
  institution, token estimate, prior failures, speed, and reasoning quality.
- Capability, health, pause state, quota, cost ceiling, and budget-threshold filtering before a
  provider is selected.
- Retry and fallback execution with per-attempt token, cost, latency, cache, error, and fallback
  metering.
- Versioned response validation for structured output. Invalid output is retried or sent to a
  fallback; it is never silently accepted.
- AES-256-GCM provider credential storage. Raw API credentials are never returned by an API or
  exposed to a browser.
- OpenAI-compatible, Anthropic, and Gemini adapter families. DeepSeek, Kimi, Llama, Qwen, Mistral,
  Groq, and self-hosted OpenAI-compatible endpoints can use the compatible adapter with a custom
  base URL; a new protocol is added behind the common adapter interface.
- A Super Admin Petros AI Routing section for functions, routes, providers/models, routing rules,
  usage/cost reporting, budgets, health tests, and dry-run route previews.
- Embedded student repair sessions entered contextually from a published result, with durable
  observations, deterministic PLAN decisions, typed RENDER blocks, and profile-driven sequencing.
- Cached, versioned topic profiles with canonical and institution-specific layers, human
  review/publish/rollback, strict validation, and auditable source inspection.
- The complete 18-move Petros vocabulary. Each move has a registered provider-independent function,
  typed render contract, deterministic eligibility rules, and student-safe decision evidence.
- Stage 9 multimodal entrances for question photos, handwriting, optional voice turns, and finite
  five-minute sessions. Image understanding, question extraction, handwriting analysis, work
  evaluation, speech transcription, spoken interaction, and speech synthesis are independently
  registered functions; each still enters the shared PLAN/RENDER/OBSERVE loop.
- Stage 10 Teach-it-back as a first-class `teach_it_back` session. Explanation analysis, one-question
  junior follow-up generation, and evidence-linked nonnumeric verdict generation use the independent
  `teach_back.explanation.analyse`, `teach_back.follow_up.generate`, and
  `teach_back.verdict.generate` contracts. Voice remains an optional Stage 9 input and is not a release
  claim until physical microphone/device QA passes.
- Stage 11 reflection surfaces use deterministic syllabus/evidence derivations for the map,
  recommendations, calibration, and prerequisite candidates. Only bounded recap wording and
  gap-hypothesis explanation use independent `reflection.session_recap.generate` and
  `reflection.gap_explanation.generate` routes with versioned validation and deterministic fallback.

## Runtime request path

```text
Embedded Petros feature
        |
        v
PetrosAiGatewayService.execute(functionKey, context, input)
        |
        +--> function contract + prompt/schema version
        +--> budget and student/institution/function quotas
        +--> routing rules + capabilities + provider health
        +--> cache lookup
        |
        v
ordered route attempts (primary -> fallback 1 -> fallback 2)
        |
        +--> provider adapter
        +--> response validation
        +--> usage/cost event for every attempt
        |
        v
provider-neutral Petros response
```

Feature code must inject `PetrosAiGatewayService` and call `execute`. It must not import a provider
SDK or read a provider API key. The function key is the stable contract between a feature and the
routing control plane.

Sensitive Stage 9 media requests always set `disableCache`. The gateway records every function
attempt independently with its capability decision, provider/model, latency, media units, retry,
fallback, cache status, and estimated/actual cost. Provider identity and failures remain hidden from
students; the modality operations dashboard exposes aggregates only.

## Stage 9 media path

```text
owner-scoped upload intent
        |
        +--> declared limits + magic-byte MIME check
        +--> image metadata stripping + SHA-256 owner dedupe
        +--> external malware scan (production fails closed if absent)
        |
        v
owner-private storage + bounded processing job (maximum 3 attempts)
        |
        +--> signed, student-bound server access
        +--> capability-compatible registered AI Function(s)
        +--> typed validation + confidence + provider-neutral retry state
        |
        v
student correction becomes source of truth
        |
        v
shared Petros Doubt / Repair / Learn session
```

Migration `packages/database/migrations/0196_petros_input_modes.sql` adds owner-private,
force-RLS media lifecycle, processing job, and content-free modality event tables. Raw bytes remain
in the configured student object-storage driver and are never returned by operations APIs. Default
limits are 10 MiB/image, 12 MiB/audio turn, 120 seconds/audio turn, 24 megapixels, 50 uploads/day,
24-hour raw-image retention, and 1-hour raw-audio retention. Configure them with the
`PETROS_MEDIA_*` variables in `.env.example`.

## Stage 10 Teach-it-back path

```text
student chooses topic, audience, and text or optional voice
        |
        v
owner-private teach_it_back session + finite move/time budget
        |
        +--> student explanation segment / corrected transcript is source of truth
        +--> teach_back.explanation.analyse (one evidence-linked high-value gap at most)
        +--> teach_back.follow_up.generate (one junior question; two probes per gap maximum)
        +--> immediate help on cap, hint, I-don't-know, correction, revision, or safe skip
        |
        v
teach_back.verdict.generate
        |
        +--> one-line nonnumeric verdict + student-visible evidence
        +--> conservative explanation-transfer evidence; official marks untouched
        +--> Stage 7 editable recap/card proposal; never auto-saved
```

Migration `packages/database/migrations/0197_petros_teach_back.sql` adds owner-private session,
segment, follow-up, idempotent command, and content-free aggregate event tables with forced RLS.
The Teach-it-back operations view reconciles session/repeat/help/abandon aggregates, structured gap
buckets, two-probe violations, verdict validation/uncertainty, learner-evidence delivery, explicit
artifact proposal/save outcomes, the three dedicated functions, and linked aggregate STT/TTS events.
Learner speech, transcript text, evidence excerpts, audio, and names are not returned.

## Stage 11 reflection path

```text
published curriculum/prerequisite graph + owner learner events
        |
        +--> deterministic map state, freshness, transparent ranking, calibration math
        +--> deterministic shared-prerequisite candidates with minimum evidence thresholds
        +--> versioned owner-private snapshot and evidence links
        |
        +--> reflection.session_recap.generate (optional wording refinement)
        +--> reflection.gap_explanation.generate (optional hypothesis explanation)
        |       invalid/unavailable -> deterministic structured fallback
        v
student Learning Progress + bounded Stage 8 reflection_action intent
```

Migration `packages/database/migrations/0198_petros_reflection.sql` adds force-RLS snapshots, map
states, transparent recommendations, calibration insights, recaps, alarms, evidence links, and
content-free lifecycle/function telemetry. Derivations are source-hashed and idempotent. The
aggregate dashboard never returns learner content or names; privileged individual evidence reads
require `ai.view`, recent authentication, and an audit entry.

## Stage 12 institutional loop path

```text
versioned institution policy + assignment/class/guardian relationships
        |
        +--> tenant-validated effective policy and stable per-session snapshot
        +--> deterministic syllabus and active-homework teaching-shape enforcement
        +--> exact student disclosure of teacher/parent purpose, categories, and retention
        |
        +--> institution.teacher_escalation_summary.generate
        |       invalid/unavailable -> editable deterministic privacy-safe summary
        +--> institution.parent_digest.generate
        |       invalid/unavailable -> deterministic localized limited digest
        v
consented teacher handoff / thresholded class signal / guardian digest
        |
        v
tracked delivery job + aggregate-only audited operations
```

Migration `packages/database/migrations/0199_petros_institutional.sql` adds nine force-RLS tables for
policy versions, stable session snapshots, homework decisions/corrections, disclosure receipts,
teacher handoffs, class signals, guardian preferences/digests, and content-free events. The two
Stage 12 functions are independent contracts. Provider/model identities, hidden reasoning, raw
answers, voice, images, private questions, unrelated history, and unsaved artifacts are excluded
from institution, guardian, and operations responses. The `petros.institutional.delivery` tracked
job performs idempotent handoff and digest delivery with cancellation windows and bounded retries.

`PETROS_MEDIA_SIGNING_SECRET` is required in production. `PETROS_MEDIA_SCAN_URL` should point to the
production malware/content scanner; without it production scanning fails closed and the object
remains quarantined. `PETROS_MEDIA_SCAN_TOKEN` is optional authentication for that scanner. The
local EICAR signature check is deliberately development/test-only and is not an antivirus claim.

## Database setup

Apply migration `packages/database/migrations/0186_petros_ai_routing.sql` through the repository's
normal migration workflow before opening the admin page. The migration creates only new Petros
tables and a default global budget policy; it does not seed a provider or model assignment.

Set `PETROS_CREDENTIAL_ENCRYPTION_KEY` in the API environment before storing credentials. Production
startup rejects credential encryption without this key. The development fallback exists only to
keep a new local database bootable and must not be used for shared environments.

## Adding a function

1. Add its contract to `PETROS_FUNCTION_CATALOG` in
   `packages/schemas/src/petros-ai-routing.ts`, including modalities, response format, capabilities,
   defaults, and whether it is essential.
2. Add and activate a prompt/schema version through the version API or repository tooling.
3. Call the gateway with the new function key from the embedded feature.
4. Open the Petros AI Routing admin section. Registry synchronization adds the function and it can
   be assigned providers, fallbacks, limits, and rules.
5. Add a response validation and routing test for any new structured contract or routing behavior.

## Adding a provider

Use an existing adapter family when the service implements a supported protocol. Otherwise,
implement the common `PetrosProviderAdapter`, register the adapter family in the adapter factory,
and keep protocol translation inside that adapter. Add provider/model records and credentials from
Super Admin; no student feature should change.

## Budget behavior

The default global policy warns at 70%, restricts expensive routes at 90%, prefers lower-cost routes
at 95%, and stops non-essential functions at 100%. Essential teaching and safety functions remain
eligible for configured fallbacks. Institution, student, and function request ceilings are checked
in addition to provider and global spend.

## Current student-stage boundary

Stages 4–12 now share the same durable session foundation, deterministic policy around gateway
judgment, registered typed teaching blocks, contextual Stage 8 doors, Stage 7 artifact curation,
Stage 9 input modes, and the Stage 10 reversed teaching loop. A snapped question opens at the confirmed stuck point without a complete
solution. Corrected handwriting opens Repair at the first logical break. Voice uses independent
STT, spoken-generation, and TTS routes with transcript confirmation and complete text fallback.
Five-minute mode is exactly four moves—predict, targeted explanation, recall check, and artifact
commit—and offers a longer session only after deliberate close.

Teach-it-back reverses the interaction: the learner explains, Petros identifies at most one grounded
gap, asks one junior-like question at a time, helps after two probes, and closes with a nonnumeric
evidence-linked verdict. It records bounded explanation-transfer evidence, not a personality judgment,
and proposals remain behind explicit Stage 7 edit/save. Stage 11 adds embedded Learning Progress,
transparent next actions, optional calibration, session-process recaps, and prerequisite hypotheses
rather than another chat page. Stage 12 applies a versioned institutional learning boundary, stable
student disclosure, optional consented teacher handoffs, privacy-thresholded class signals, and
limited guardian digests. Stage 9 physical voice/device acceptance, Stage 10 positive human
repeat-use feedback, Stage 11 human usefulness/accessibility acceptance, and Stage 12 cross-role
human/device/privacy acceptance remain release gates; optional voice support is not a
production-readiness claim.

## Verification

- Routing-engine and response-validator unit tests cover explicit rules, capability filtering,
  budgets, fallbacks, traffic allocation, and structured-output rejection.
- Schema, database, API, API client, Super Admin, and student portal TypeScript checks pass.
- Super Admin and student portal production builds pass.
- Topic Profile inspection, validation, caching, the four representative session shapes, routing
  diagnostics, and the embedded repair path have been exercised in a signed-in browser at desktop
  and mobile breakpoints.
- Stage 9 focused safety, schema, routing, service, loop-policy, student component, and four-case
  multimodal quality suites cover typed outputs, metadata stripping, quarantine, signed access,
  correction-as-source-of-truth, independent voice functions, finite policy, privacy, pacing, and
  artifacts. The detailed machine evidence and remaining human/device gates are recorded in
  `docs/PETROS-STAGE-09-HANDOFF.md`.
- Stage 10 schema, API/service, student component, six-persona quality, migration/RLS, and build checks
  cover first-class state, text/optional voice submission, complete-versus-gapped analysis, grounded
  one-question follow-ups, STT uncertainty, the two-probe/help cap, concurrency/tenant scope, nonnumeric
  verdicts, conservative learner evidence, proposal-only artifacts, and privacy-safe aggregate operations.
  Exact evidence and the still-open browser/device/human gates are recorded in
  `docs/PETROS-STAGE-10-HANDOFF.md`.
- Stage 11 deterministic derivation, recap/gap routes, reflection components, migration/RLS, and quality
  checks cover transparent map/action state, calibration, evidence-linked recaps, bounded prerequisite
  hypotheses, lifecycle, privacy-safe aggregate operations, and deterministic fallback. Its human,
  dashboard, privacy, device, and accessibility gates remain in `docs/PETROS-STAGE-11-HANDOFF.md`.
- Stage 12 schema, engine/service/permissions/job, loop, student component, quality, migration/RLS,
  responsive browser, and aggregate operations checks cover policy versioning, server-authoritative
  enforcement, stable disclosure, consented handoff, cohort suppression, digest retry, delivery tracking,
  and the two independent function contracts. Exact evidence and all still-open combined acceptance gates
  are recorded in `docs/PETROS-STAGE-12-HANDOFF.md`.
