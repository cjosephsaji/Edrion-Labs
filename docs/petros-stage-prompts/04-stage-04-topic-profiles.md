# Execution prompt 04 of 13 — Stage 4: topic profiles and the full move vocabulary

Use this prompt after Stages 2 and 3 pass their acceptance gates. Complete Stage 4 only; do not build
the Stage 5 evaluation harness beyond the tests required to prove this stage.

## Mission

Make Petros teach different kinds of material differently. Implement cached, versioned topic
profiles across the dimensions in Part 4.1 of the specification, authorized human override, and
profile-driven move weighting. Expand the engine from the initial four moves to the complete move
vocabulary. Four genuinely different topics must yield four structurally different sessions.

Petros is not a lesson template or chatbot. The product is the variety and appropriateness of the
next teaching action.

## Required reading and dependency audit

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` fully, focusing on Parts 2–4, 6, 8, 10, and
   Stage 4.
2. Read `docs/PETROS-AI-ROUTING.md`, inspect the AI Function Registry, loop, observation model, and
   existing block renderer.
3. Manually verify that Stage 3 changes course after wrong answers and composer questions.
4. Inspect permissions, institution/syllabus entities, subjects/topics, existing content metadata,
   and any curriculum ontology before creating new parallel concepts.
5. Preserve dirty-worktree changes and keep provider-specific logic inside adapters.

## Topic-profile contract

Define a shared, versioned schema that captures at least:

- canonical topic identity and curriculum/syllabus references;
- knowledge type: conceptual, procedural, factual/memorisation, skill-performance, or justified
  combinations;
- abstraction level on a documented scale;
- best natural representations: visual, symbolic, verbal, sequential, comparative, with weights;
- prerequisite density and explicit prerequisite concept links;
- misconception richness and known misconception references;
- mathematical load;
- memorisation load;
- availability and quality of real-world anchors;
- recommended/required/disallowed moves and move weights;
- recommended opening, practice, and closing patterns;
- source/provenance, confidence, generator version, reviewer, status, and timestamps;
- cache key/version and invalidation inputs;
- institution or curriculum overrides without corrupting the canonical profile.

Document every scale and enum. Avoid a free-form blob that cannot drive deterministic policy.

## Profile generation, caching, and override

- Register/use a provider-independent topic-profile generation AI Function with strict structured
  output and response validation.
- Ground generation in the topic, grade, curriculum, syllabus boundaries, and authoritative content
  available in Edrion. Do not let the model invent a syllabus.
- Cache profiles hard. Normal sessions must not regenerate an unchanged topic profile.
- Support explicit regeneration, version comparison, rollback, and invalidation when curriculum or
  prompt/schema version changes.
- Provide an authorized human review/edit/publish flow. Human overrides must take precedence and be
  visibly marked, versioned, auditable, and reversible.
- Validate impossible or contradictory profiles before publishing.
- Keep profile generation cost and latency separately metered.

## Expand the complete move set

Add PLAN policy, render schemas, typed blocks, success evidence, and eligibility rules for:

**Opening:** hook, prerequisite check, goal frame.

**Explaining:** layered explanation, worked example, analogy, story, derivation, diagram.

**Active:** predict-then-reveal, contrast case, misconception demolition, Socratic probe, recall check,
apply-to-your-world.

**Closing:** synthesis, artifact commit, forward link.

Enforce specification rules:

- Socratic probing is hard-capped at two probes; then Petros explains.
- Derivation is eligible only for mathematical material and a learner/session signal requesting
  depth.
- Prerequisite checks become strongly weighted or mandatory for high-density topics.
- Diagram choice follows representation/capability requirements and yields an editable block that
  can later persist in Stage 7.
- Hooks are skipped after a bad result or when time is short.
- Misconception demolition is weighted only where known misconceptions justify it.
- Exam contexts prefer exam-shaped practice.
- Every move exposes a specific student-safe “Why this?” derived from logged decision factors.
- Repetition, max-move, time, stop, and validation guardrails from earlier stages remain active.

If a move requires a new AI Function (diagram generation, analogy, prerequisite detection, etc.),
register it in the central function catalogue, route it through the gateway, give it a versioned
schema, and make it configurable in Super Admin. Never hardcode a provider.

## PLAN weighting and explainability

Implement a deterministic policy layer around model judgment. The policy should combine profile
weights, current goal, remaining time, observation history, move eligibility, capability
availability, and prior repetition. Log the input factors, normalized candidate weights, exclusions,
selected move, and any override. Do not store chain-of-thought.

The system must degrade sensibly when a capability is unavailable—for example, choose a textual or
SVG-safe alternative if no configured route can render a requested visual—while logging the reason.

## Data/API/backend requirements

- Tables/entities for canonical profiles, versions, prerequisite links, misconception metadata,
  institution overrides, review/publish state, and cache invalidation.
- Authenticated student read access only to published resolved profiles as needed by sessions.
- Authorized staff APIs for list/read/generate/edit/validate/publish/rollback/compare/regenerate.
- A resolved-profile endpoint/service that applies curriculum and institution override precedence.
- Concurrency/version checks so two reviewers cannot silently overwrite one another.
- Audits for profile generation, edit, publish, rollback, and privileged source inspection.
- Strict tenant boundaries and source licensing/privacy safeguards.

## Frontend/admin requirements

### Student session

- Render every move with an appropriate typed block rather than forcing all content into text cards.
- Preserve block state, progress, composer behavior, artifact proposals, accessibility, and mobile
  usability.
- Diagrams must be legible, zoomable/openable, editable in a safe structured form, and have a
  nonvisual description.
- Worked examples, contrast cases, misconception interactions, and Socratic probes must retain state.
- “Why this?” must cite profile/session factors in student-safe language.

### Authorized profile dashboard

Add a Topic Profiles surface in the suitable admin application. It must support:

- search/filter by subject, grade, curriculum, institution, status, and stale version;
- inspect all profile dimensions and resolved move weights;
- compare generated vs human-edited versions;
- validate, edit, publish, regenerate, rollback, and see cache status;
- preview the expected session-shape bias;
- show source/provenance and audit history;
- clearly distinguish canonical values from institution overrides;
- require appropriate permissions and confirmation for publish/rollback.

Super Admin → Petros AI Routing must show the profile generator and every new move function, their
routes/capabilities, validation failures, costs, latency, and fallbacks.

## Automated verification required

Test at least:

- schema bounds, contradictory profile rejection, versioning, cache hit/invalidation, and rollback;
- institution override precedence and cross-tenant isolation;
- human publish wins over generated draft;
- unchanged topics do not regenerate;
- all move schemas render and preserve interaction state;
- move eligibility rules, including two-probe Socratic cap and derivation restrictions;
- required prerequisite behavior for high-density topics;
- capability-unavailable fallback behavior;
- “Why this?” factors match logged policy factors;
- profile function registration and independent cost metering;
- four representative profiles produce measurably different move distributions/sequences;
- permissions, optimistic concurrency, audits, and no provider leakage.

Use these representative topics at minimum: integration by parts (procedural/symbolic),
photosynthesis (conceptual/factual/visual/misconception-rich), a historical narrative topic, and
programming loops or another skill-performance topic. Test deterministic policy with seeded inputs
as well as model-backed integration where credentials are intentionally available.

Run affected tests, typechecks, lint, builds, and migration/schema checks. Report exact results.

## Mandatory manual QA and dashboard acceptance

Perform browser smoke tests and give a human tester a precise runbook:

1. **Four-topic variety test:** Run the four representative topics with the same neutral learner
   context. Record move sequences, block types, and “Why this?” reasons. They must be structurally
   different, not merely differently worded.
2. **Profile inspection:** In Topic Profiles, open each topic and verify every dimension, provenance,
   resolved weights, cache status, and expected session bias.
3. **Human override:** Edit one move weight or representation, validate/publish it, start a new
   session, and confirm the changed behavior. Verify audit log and version comparison. Roll it back
   and verify behavior/cache reverts.
4. **Prerequisite route:** Use a high-prerequisite topic and confirm a prerequisite check appears and
   can branch into a detour after a wrong answer.
5. **Misconception route:** Confirm misconception demolition appears only for a justified topic and
   that “Why this?” names the relevant misconception signal.
6. **Socratic cap:** Trigger Socratic probing, fail to reach the insight, and verify Petros explains
   after at most two probes.
7. **Visual route:** Trigger a diagram topic. Verify visual quality, alternative description,
   editing/open-in-canvas affordance, mobile legibility, and capability fallback when the visual
   provider is paused.
8. **Admin AI Routing:** Confirm new functions automatically appear, provider options are capability
   appropriate, and cost/latency/validation/fallback data matches the four runs.
9. **Cache check:** Repeat a topic and confirm no profile-generation request/cost occurs. Change the
   relevant version and confirm exactly one regeneration.
10. **Permissions/tenant check:** Verify unauthorized users cannot edit/publish and one institution’s
    override cannot affect another.
11. **Responsive/accessibility:** Exercise all new block types at mobile and desktop breakpoints,
    keyboard-only, screen reader, zoom, reduced motion, and slow network.

For every check, include exact navigation, fixture/topic, action, expected UI, expected API/database
or dashboard evidence, failure criteria, and evidence capture.

## Definition of done

Stage 4 is complete only when four different topic profiles produce four meaningfully different,
explainable session structures; profiles are cached, reviewable, overridable, versioned, and
auditable; the full move vocabulary obeys its eligibility rules; and all routes/costs/failures are
observable without exposing private learner content.

## Final response contract

Return delivered scope, architecture/migrations, clickable files, test commands/results, browser
checks performed, the complete manual dashboard runbook, screenshots/IDs to capture, known debt,
Stage 5 prerequisites, and an explicit `Stage 4 complete` or `Stage 4 not complete` verdict.

