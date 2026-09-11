# Petros document learning

Petros document learning is a persistent, source-grounded learning path. It is not the former two-scene summary route and it does not mark a document complete after one timed visit.

## Runtime flow

1. Upload persists the original file and creates an immutable structured source revision. PDF extraction preserves ordered regions, headings, equations, tables, captions, confidence, and page coordinates where available. Empty or suspicious regions remain unresolved.
2. **Learn** acknowledges an idempotent preparation request immediately. The durable preparation records named stages, lease ownership, retries, failure detail, and timing.
3. Petros builds a provisional whole-document map, prioritizes one coherent concept, and sends only a bounded, fully identified source slice to the teaching generator.
4. The generator creates a v4 lesson with explicit teaching, exploration, guided-practice, independent-check, and connection/review purposes. Teaching and exploration do not require an answer. A malformed response gets one targeted repair; source analysis is not restarted.
5. Deterministic source, activity, visual, answer-key, phase, and coverage validators must pass before the artifact is atomically published.
6. Reusable lesson artifacts are shared only inside the institution/material revision scope. Learner paths, answers, support use, drafts, and evidence remain student-specific.
7. A session is pinned to its source and lesson revision. Completing it updates the concept, not the whole document.

The public endpoints are:

- `POST /v1/student/petros/documents/:sourceId/prepare`
- `GET /v1/student/petros/document-preparations/:preparationId`
- `GET /v1/student/petros/documents/:sourceId/path`
- `POST /v1/student/petros/intents/:intentId/start`
- the existing versioned Petros session read and command endpoints

The prepare endpoint returns preparation metadata only. Private rubrics, correct choices, and classification assignments are stored in `private_plan` and are never returned by preparation, path, or session payloads.

## Learning studio and visuals

The student experience is a learning studio: a compact outline, one central activity surface, and one auxiliary slot for source or contextual help. The footer reserves space for navigation and gives primary emphasis to only the action that advances the current state. Below 1280px the outline becomes a sheet; below 768px the lesson is a single column. Petros is quiet by default and never opens, moves, narrates, or prompts because of inactivity. Audio and microphone use are explicit and stop on navigation or pause.

The default rhythm is explain → explore → guided practice → independent check → connection/review. It is an instructional rhythm rather than a compulsory five-screen template. Diagnostics are optional and may be bypassed without creating learner evidence. Deferral records “not checked yet,” not failure. Review distinguishes explored, independent, supported, and deferred work.

All learning routes use the scoped Learn workspace navigation: Learn, Library, Notes, Flashcards, and Progress, with a consistent Ask Petros entry. Document, adaptive, and pilot routes keep the same application-level Petros provider while replacing portal chrome with the focused study shell.

Teaching motion uses a layered SVG rig with independent locomotion, arms, gaze, mouth, and leaf channels. Generated presentation data can name only declared target IDs; it cannot provide selectors, coordinates, SVG, or executable markup. A `ResizeObserver`-backed registry measures those targets after reflow, font loading, scrolling, and panel changes. When a target is absent or space is insufficient, Petros remains in his dock and the valid lesson content continues without a misleading gesture. Reduced-motion mode removes walking and transitional motion while retaining labels, connectors, and the full teaching text.

`PetrosTeachingPresentation` and `PetrosTeachingBeat` version the ordered visual/narration contract separately from source and grading schemas. `POST /v1/student/petros/sessions/:sessionId/presentation` stores a `PetrosPlaybackCheckpoint` in the existing learner-context JSON with `expectedVersion` and `idempotencyKey`. The command updates presentation position only; it does not unlock scenes, complete questions, or create evidence. Phrase captions follow real media events when authored audio is present. Hidden tabs pause playback and require an explicit resume.

Models return typed visual specifications, never JavaScript, JSX, raw SVG, or executable mathematics. Trusted React renderers currently cover annotated text, comparison, directly submitted classification, keyboard-reorderable sequences, worked steps, numeric exploration, concept maps, scenarios, coordinate graphs with linked parameters, true missing equation steps, process diagrams, evidence timelines, and prediction-first code traces. Classification answer assignments, completed missing steps, rubrics, and all answer keys are stripped from public plans.

Quantitative visuals use bounded declarative expressions and shared values for labels, graphics, and checking. Coordinate graphs render labelled bounds, numeric ticks, responsive SVG view boxes, and reject functions or parameter shifts that would be silently clipped. A shared TeX renderer provides KaTeX HTML plus MathML for equations and mixed prose; new content uses explicit commands while a conservative adapter repairs recognized legacy notation such as the stored word `integral`. Unsupported representations or checks fail preparation honestly instead of becoming a paragraph presented as a visual or a fabricated grade.

## Reliability

- No model call runs inside the student's request transaction.
- Preparation is deduplicated by institution, source revision, requested concept, curriculum key, and generator version.
- Worker leases recover after an interrupted process.
- Provider calls use bounded timeouts and route attempts. Deep Gemini activity unions use a compact provider-facing hint, while the full application schema and semantic validators remain authoritative.
- Autosaves are coalesced, serialized per session, and sent only when the draft differs from authoritative state. Pending saves flush before checking, navigation, and pause; stale responses cannot overwrite newer typing.
- Expired previews retain duration, priority, and typed doubt. The refreshed scope must be confirmed before starting.
- Provider or voice failure leaves source status, text teaching, and interactions available with an actionable retry state.

## Storage and versions

Migration `0209_petros_document_learning_path.sql` adds source revisions, preparations, reusable lesson artifacts, and learner paths. Migration `0208_petros_document_teaching_plans.sql` remains for legacy history. New starts use generator `document-teaching-2026-09-09-studio-r5`; saved v1–v3 sessions remain readable and pinned, while new starts receive validated v4 artifacts.

Primary contracts are in `packages/schemas/src/petros-document-learning.ts` and `packages/schemas/src/petros-document-teaching.ts`. Preparation is implemented in `petros-document-preparation.service.ts`, adaptation in `petros-document-teaching.policy.ts`, and the browser stage in `petros-document-teaching.tsx` plus `petros-document-activity.tsx`.

## Acceptance evidence

The fixture suite covers structured extraction, document mapping, paths longer than twelve concepts, private/public plan separation, all five instructional purposes, ungraded completion, conservative provider-output repair, graph-domain correctness, mathematical-family checking with an explicit `+ C`, math rendering, adaptation policy, command handling, and the student preparation transition. Browser screenshots and complete interaction journeys are required before enabling a subject/visual combination broadly; typechecks alone are not release acceptance.

On the September 8, 2026 local live fixtures, preparation acknowledgement measured 166–690 ms. The final r4 integrals run acknowledged in 297 ms and published its first validated lesson in about 11.4 seconds; the next mapped concept was available in the background within the next 12 seconds. A cached lesson start measured 594 ms, and the source preview resolved 16 ordered units in 384 ms. Earlier cold runs took roughly 27 seconds when a targeted repair was required. Provider failures are recorded separately with route, error code, latency, token use, and preparation provenance. These are engineering measurements, not production latency promises.

Browser acceptance covered both machine-learning and calculus fixtures: source-specific diagnostics, pilot-derived side-by-side presentation, equation rendering, independent checking, incorrect-answer remediation, adaptive level changes, mobile stacking, and exact resume after reload. The integrals path keeps the cover as reference material and exposes the first substantive concept as the recommendation.

## Known gated cases

- Image-only PDF pages now receive selective, cached OCR from a rendered page image; failed or low-confidence OCR remains explicitly unresolved. Moving the existing synchronous upload extraction into the durable queue is still required before broad scanned-document release.
- Numeric answers and a restricted symbolic grammar are checked deterministically from server-only contracts. Polynomial equivalence and indefinite integrals up to an additive constant are supported; expressions needing richer domain proofs (including variable denominators) are intentionally ungraded by this checker.
- Subject-specific visual-family gates now cover mathematics, physics, chemistry, biology, economics, computing, humanities, and language fixtures. Broad enablement still requires screenshot review of every visual family at desktop/mobile widths. Keep `PETROS_DOCUMENT_TEACHING_ENABLED` controlled during rollout.
