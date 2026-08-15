# Petros Stage 4 handoff — topic profiles and full move vocabulary

Date: 2026-08-08

Verdict: **Stage 4 complete.** The implementation meets the Stage 4 product definition. The
repository's API lint script remains unavailable because ESLint is not linked/configured; that
pre-existing toolchain issue is recorded under verification and does not hide a TypeScript, test,
migration, build, or browser failure.

## Delivered scope

- A strict, documented topic-profile contract covering canonical identity, curriculum grounding,
  knowledge type, abstraction, weighted representations, prerequisite density and links,
  misconception richness and references, mathematical/memorisation load, real-world anchors,
  move rules and weights, session-shape patterns, provenance, confidence, review state, and cache
  invalidation inputs.
- Canonical, immutable profile versions plus institution-specific, versioned overrides. Generated
  drafts never supersede a published human version during session resolution.
- Provider-independent `topic.profile.generate` routing with validated structured output,
  authoritative-reference checks, separate request/cost attribution, deterministic fallback, and a
  semantic hard cache.
- Authenticated staff list/read/generate/edit/validate/publish/rollback/compare/override APIs with
  optimistic concurrency, recent-auth requirements for privileged publication, platform audit, and
  profile-local audit history.
- The complete 18-move vocabulary: hook, prerequisite check, goal frame, layered explanation,
  worked example, analogy, story, derivation, diagram, predict then reveal, contrast case,
  misconception demolition, Socratic probe, recall check, apply to your world, synthesis, artifact
  commit, and forward link.
- A deterministic PLAN policy combining profile weights, goal, time, observation history,
  capability availability, prior repetition, and explicit eligibility rules. Diagnostics retain
  normalized candidate weights, exclusions, overrides, and student-safe factors—not chain-of-thought.
- One automatically registered, independently routeable renderer function per move and a distinct
  typed block contract for every move.
- A student progressive document that preserves typed interaction state, accessible feedback,
  explicit artifact consent, responsive diagram editing/expansion, alternative descriptions, and
  “Why this?” evidence.
- A Super Admin Topic Profiles surface for filtering, inspection, JSON editing, validation,
  generation, publication, comparison, rollback, institution override, provenance, cache state,
  audit history, weight inspection, and session-shape preview.
- Petros AI Routing diagnostics now surface the profile generator and all move renderers alongside
  route, capability, validation, latency, cost, and fallback evidence.

## Architecture and migrations

The runtime path is:

```text
topic + grade/curriculum/institution context
  -> semantic cache identity and invalidation check
  -> published canonical profile
  -> optional published institution override
  -> resolved profile snapshot attached to the learning session
  -> deterministic PLAN eligibility and normalized weighting
  -> registered move-specific RENDER function
  -> exact typed block + persisted interaction state
  -> privacy-safe decision/usage/audit diagnostics
```

Migration `0189_petros_topic_profiles.sql` adds:

- `petros_topic_profiles`
- `petros_topic_profile_versions`
- `petros_topic_profile_prerequisites`
- `petros_topic_profile_misconceptions`
- `petros_topic_profile_overrides`
- `petros_topic_profile_invalidations`
- `petros_topic_profile_audits`
- Stage 4 profile snapshots and selection-policy evidence on existing Petros session/decision data

Old Stage 2/3 sessions are upgraded lazily with a real published resolved profile. No blanket
synthetic-version data rewrite is used.

Primary implementation files:

- `packages/schemas/src/petros-topic-profiles.ts`
- `packages/schemas/src/petros-learning.ts`
- `packages/schemas/src/petros-ai-routing.ts`
- `packages/database/migrations/0189_petros_topic_profiles.sql`
- `packages/database/src/schema/petros-topic-profiles.ts`
- `apps/api/src/modules/petros-topic-profiles/`
- `apps/api/src/modules/student/petros-loop/petros-loop.policy.ts`
- `apps/api/src/modules/student/petros-loop/petros-loop.service.ts`
- `apps/student-web/src/components/petros/petros-repair-session.tsx`
- `apps/super-admin-web/src/components/petros-routing/petros-topic-profiles-panel.tsx`

## Automated verification

All commands ran from `/Volumes/Chris/Edrion Labs` unless a package directory is shown.

| Check | Result |
| --- | --- |
| API targeted Stage 4 tests: `cd apps/api && pnpm exec vitest run src/modules/student/petros-loop/petros-loop.policy.spec.ts src/modules/student/petros-loop/petros-loop.service.spec.ts src/modules/petros-topic-profiles/petros-topic-profiles.service.spec.ts` | PASS — 3 files, 26 tests |
| Shared schemas: `cd packages/schemas && pnpm exec vitest run src/petros-topic-profiles.spec.ts src/petros-learning.spec.ts` | PASS — 2 files, 14 tests |
| Student typed-block UI: `cd apps/student-web && pnpm exec vitest run src/components/petros/petros-repair-session.spec.tsx` | PASS — 1 file, 7 tests |
| Full API suite: `cd apps/api && pnpm test` | PASS — 50 files, 311 tests |
| `pnpm --filter @edrion/schemas typecheck` | PASS |
| `pnpm --filter @edrion/database typecheck` | PASS |
| `pnpm --filter @edrion/api-client typecheck` | PASS |
| `pnpm --filter @edrion/api typecheck` | PASS |
| `pnpm --filter @edrion/student-web typecheck` | PASS |
| `pnpm --filter @edrion/super-admin-web typecheck` | PASS |
| `cd apps/api && pnpm build` | PASS |
| `cd apps/student-web && pnpm build` | PASS — `/petros/session` production route generated |
| `cd apps/super-admin-web && pnpm build` | PASS — `/ai/petros-routing` production route generated |
| `pnpm --filter @edrion/database migrate` | PASS; replay is idempotent and post-migration grants/RLS ran |
| Stage 4-scoped `git diff --check` | PASS |
| `cd apps/api && pnpm lint` | BLOCKED — package script cannot find `eslint`; direct installed ESLint 10 also finds no flat config |

The two Next production builds performed their built-in lint/type validation. The root formatter is
also currently unable to load the configured `prettier-plugin-tailwindcss`; no dependency install or
repo-wide tooling rewrite was folded into Stage 4.

The tests explicitly cover profile bounds and contradictions, high-density prerequisite evidence,
all function registrations, exact schemas for all 18 blocks, four different deterministic
sequences, repetition override, derivation gating, two-probe cap, visual capability fallback,
time/move caps, composer causality, confidence-triggered recall, profile invalidation/cache behavior,
human-publication precedence, tenant override isolation, concurrency, rollback audit, provider
outage fallback, tenant/session ownership, lazy session upgrade, answer idempotency, and persistent
diagram/artifact interaction state.

## Browser smoke evidence performed

The signed-in smoke used the local API plus Super Admin and Student applications. No model provider
was configured, so the same provider-independent routes exercised their registered deterministic
fallback. This produced zero provider cost while preserving route/fallback diagnostics.

- Super Admin → Petros AI Routing loaded 61 registered functions, including
  `topic.profile.generate` and every one of the 18 move renderers. The Functions and Diagnostics
  views showed prompt/schema versions, capability requirements, fallback, latency, cost, request,
  and correlation evidence without provider credentials or raw learner content.
- Topic Profiles generated and validated Integration by parts, Photosynthesis, History of a
  revolution, and Programming loops. The inspector showed every profile dimension, provenance,
  cache identity, weights, expected patterns, versions, and local audit history.
- Repeating Photosynthesis with identical semantic inputs hit the profile cache; the published
  version remained the human-reviewed version and no new generation route/cost appeared.
- Four neutral-context student sessions were structurally different:

  | Topic | Session evidence ID | Observed opening sequence |
  | --- | --- | --- |
  | Integration by parts | `8b383897-8a88-4bb6-82c4-70ce40f453c4` | Prerequisite check; the reason names high prerequisite density |
  | Photosynthesis | `b85ee20c-d877-464f-8962-02a5704eb62a` | Misconception demolition |
  | History of a revolution | `0d6d09d2-2cb3-42a4-9295-d1a8252b62be` | Goal frame → Story |
  | Programming loops | `54fd9d55-e84b-42c7-b369-4198d6bddbee` | Prerequisite check → Predict then reveal |

- In the Integration session, an intentionally wrong, high-confidence Product Rule answer locked
  atomically, recorded the misconception signal, produced a hint/equivalent retry, and changed the
  next action.
- At 390 × 844 CSS pixels the session had no horizontal overflow. Sampled interactive controls were
  corrected to at least 44 px high; semantic progress and radio groups remained present. Desktop
  layout and viewport reset were also checked.

## Complete manual dashboard acceptance runbook

Use fresh test data and capture both the named screenshot and the request/session/profile ID shown in
the UI or browser network panel. Preserve correlation IDs from Diagnostics rather than raw learner
answers.

### 1. Four-topic variety

- **Navigation:** Student → `/petros/session?source=learn&topic=<encoded topic>`; start a fresh
  session for each topic.
- **Fixture/action:** Use the same neutral learner context and time budget for Integration by parts,
  Photosynthesis, History of a revolution, and Programming loops. Continue through at least two
  moves, answering any prerequisite correctly so the session can advance.
- **Expected UI:** Four structurally different typed-block sequences. Baseline expectation is the
  sequence table above; wording may vary, block kinds and reasons must not collapse to one template.
- **Expected evidence:** `petros_learning_sessions.resolved_topic_profile`, ordered
  `petros_planning_decisions`, and `petros_teaching_blocks` agree with the UI. Diagnostics shows
  normalized candidates, exclusions, selected move, profile version, and matching safe factors.
- **Failure:** Identical move/block sequence for all four topics, missing profile snapshot, generic
  reason unrelated to logged factors, or a provider/model name in the student UI.
- **Capture:** `S4-QA-01-four-topic-grid.png`, four session IDs, first two correlation IDs per session.

### 2. Profile inspection

- **Navigation:** Super Admin → AI → Petros AI Routing → Topic Profiles.
- **Fixture/action:** Search and open each of the four profiles; apply subject/grade/curriculum/status
  filters and inspect Canonical, Resolved, Versions, Provenance, Cache, Weights, Patterns, and Audit.
- **Expected UI:** Every documented dimension is present; weights resolve to a valid distribution;
  prerequisites/misconceptions carry source references; expected session bias matches the topic;
  canonical and override provenance are visually distinct.
- **Expected evidence:** `GET /petros-topic-profiles/:id` and `GET .../:id/resolved?institutionId=...`
  match `petros_topic_profiles`, the published `petros_topic_profile_versions` row, normalized links,
  and the published override if selected.
- **Failure:** Missing dimension, impossible/unnormalized weights, unresolved source, hidden stale
  state, or resolved values that cannot be traced to canonical/override provenance.
- **Capture:** `S4-QA-02-profile-<topic>.png`, profile ID, canonical version ID, override version ID.

### 3. Human override, comparison, and rollback

- **Navigation:** Super Admin → AI → Petros AI Routing → Topic Profiles → Photosynthesis.
- **Fixture/action:** In the strict JSON editor increase `diagram` weight and the visual
  representation weight, add a reason, Validate, Save draft, compare with the published version,
  then Publish with confirmation. Start a new student session. Finally Roll back to the prior
  version with a reason and start another session.
- **Expected UI:** Human-edited provenance is visible; comparison identifies only intended fields;
  the post-publish session biases toward Diagram; rollback creates and publishes a new auditable
  version instead of mutating history; subsequent resolution returns to the previous bias.
- **Expected evidence:** PUT, publish, and rollback requests carry `expectedVersion` and succeed once.
  Immutable version rows, profile-local audits, and platform audit entries record actor/reason. New
  sessions reference the new canonical version; old sessions retain their snapshot.
- **Failure:** Generated draft wins over published human data, silent lost update, history mutation,
  cache still resolves the superseded version, or absent audit actor/reason.
- **Capture:** `S4-QA-03-compare.png`, `S4-QA-03-rollback.png`, profile ID, three version IDs, session IDs.

### 4. Prerequisite route and detour

- **Navigation:** Student → `/petros/session?source=learn&topic=integration%20by%20parts`.
- **Fixture/action:** Start fresh; commit an intentionally incorrect Product Rule prerequisite answer
  with confidence “Sure”; follow the equivalent retry/support path.
- **Expected UI:** Prerequisite check appears first or is mandatory. “Why this?” names high
  prerequisite density. Wrong answer locks with a hint, records confident misconception evidence,
  and opens a visible detour/return route.
- **Expected evidence:** The decision has `prerequisite_check` selected with the density factor;
  observation/evaluation/struggle rows share correlation/question IDs; the next PLAN input includes
  the resulting observation and active detour.
- **Failure:** Hook before mandatory prerequisite, no route change after wrong answer, answer can be
  changed after commit, or diagnostics expose the raw answer instead of a protected reference.
- **Capture:** `S4-QA-04-prerequisite-detour.png`, session `8b383897-8a88-4bb6-82c4-70ce40f453c4`
  may be used as baseline, question and correlation IDs.

### 5. Misconception route

- **Navigation:** Student → fresh Photosynthesis session, then fresh Programming loops session.
- **Fixture/action:** Continue both with neutral context. On Photosynthesis, answer the misconception
  interaction; inspect “Why this?”.
- **Expected UI:** Photosynthesis can select Misconception demolition and names the referenced
  misconception signal. Programming loops does not select that move unless its profile contains a
  grounded known misconception.
- **Expected evidence:** Photosynthesis decision candidates include a nonzero justified weight and
  misconception reference; an unjustified topic records `missing_known_misconception` (or equivalent)
  exclusion. References equal supplied authoritative profile data.
- **Failure:** Misconception demolition appears with no known reference, invented syllabus/source,
  or reason that claims a signal absent from the decision log.
- **Capture:** `S4-QA-05-misconception.png`, both session IDs and selected decision IDs.

### 6. Socratic hard cap

- **Navigation:** Super Admin profile editor for a test profile, then its Student session.
- **Fixture/action:** Publish a test-only profile that strongly recommends Socratic probe. In the
  session fail to reach the target twice and continue once more.
- **Expected UI:** At most two Socratic probe blocks. The next block explains directly through an
  eligible explaining move and its reason says the probe limit was reached.
- **Expected evidence:** Ordered decisions show two probes; the next decision excludes
  `socratic_probe` with the hard-cap factor/override. No model response may extend the cap.
- **Failure:** A third Socratic probe, cap enforced only in UI, or missing exclusion evidence.
- **Capture:** `S4-QA-06-socratic-cap.png`, session ID and all three decision/correlation IDs.

### 7. Visual route and capability fallback

- **Navigation:** Photosynthesis profile → confirm Diagram/visual weighting; Student → fresh session;
  Super Admin → Petros AI Routing → Providers/Routes for the diagram renderer.
- **Fixture/action:** Reach a Diagram block. Expand/open it, edit a safe node label, reload the
  session, zoom the page, and inspect the nonvisual description. Pause/remove the visual-capable
  route and repeat in a new session.
- **Expected UI:** Diagram remains legible and editable, edit/expanded state survives reload, and a
  useful alternative description is available. With capability unavailable, an SVG-safe/textual
  typed fallback appears without a broken empty canvas.
- **Expected evidence:** Block interaction state persists in `petros_teaching_blocks`; route
  diagnostics show required capability and fallback; PLAN records the capability exclusion/override.
- **Failure:** Lost edits, inaccessible unlabeled visual, overflow at mobile zoom, provider error in
  student UI, or an unavailable capability still selected without fallback evidence.
- **Capture:** `S4-QA-07-diagram-desktop.png`, `S4-QA-07-diagram-mobile.png`, block and route request IDs.

### 8. Admin AI Routing observability

- **Navigation:** Super Admin → AI → Petros AI Routing → Functions, Usage, and Diagnostics.
- **Fixture/action:** Search `topic.profile.generate`; filter `move.render.`; inspect requests from
  the four-topic runs and one capability fallback.
- **Expected UI:** One profile generator plus all 18 renderer functions appear automatically;
  capability-compatible provider choices, prompt/schema versions, validation status, latency,
  tokens/cost, cache, route tier, and fallback reason agree with the runs.
- **Expected evidence:** Function catalogue/database synchronization is 1:1; usage request IDs match
  decision/profile audit references; learner and institution identifiers are hashed/redacted.
- **Failure:** Missing function, arbitrary provider hardcode, combined/unattributed profile cost,
  disagreement between route and usage, raw learner content, or exposed credentials.
- **Capture:** `S4-QA-08-functions.png`, `S4-QA-08-diagnostics.png`, request/correlation IDs.

### 9. Hard cache and invalidation

- **Navigation:** Super Admin → Topic Profiles → Photosynthesis → Cache/Audit; AI Routing → Usage.
- **Fixture/action:** Generate/resolve with byte-for-byte equivalent semantic inputs twice. Record
  version/hit/cost. In a test deployment bump one relevant generator prompt/schema version or change
  an authoritative invalidation input, resolve twice again.
- **Expected UI:** Unchanged repeat increments cache evidence without a new profile version or
  generation charge. The version/input change marks stale and causes exactly one generated draft;
  the second post-change resolve is another hit. Existing human publication remains active until
  review/publish.
- **Expected evidence:** Cache key and invalidation JSON change once; one invalidation and one
  generated-version audit exist; exactly one new `topic.profile.generate` usage request exists.
- **Failure:** Regeneration on every session, display-label casing changes identity, zero
  regeneration after a real version change, more than one regeneration, or generated draft silently
  replacing published human review.
- **Capture:** `S4-QA-09-cache-before.png`, `S4-QA-09-cache-after.png`, profile/version/request IDs.

### 10. Permissions and tenant isolation

- **Navigation:** Open Topic Profiles as an `ai.view`-only user, then as an `ai.configure` user;
  repeat resolved-profile checks for two institutions.
- **Fixture/action:** Attempt edit/publish with the viewer account. Publish a distinctive
  institution-A override, resolve/start sessions for institution A and institution B, then attempt a
  stale concurrent update from two reviewer tabs.
- **Expected UI:** Viewer can inspect but cannot mutate; publish/rollback requires recent auth and
  confirmation. Only institution A sees its override. One concurrent writer receives a conflict and
  must reload.
- **Expected evidence:** 403 responses for unauthorized mutations, platform audit for privileged
  source inspection/mutations, override row scoped to institution A, B resolves canonical, and the
  stale request returns the optimistic concurrency code without a version write.
- **Failure:** Hidden button is the only enforcement, cross-tenant override leakage, publication
  without recent auth, silent overwrite, or audit without actor/institution scope.
- **Capture:** `S4-QA-10-permission.png`, `S4-QA-10-tenant-compare.png`, user/role fixture IDs and
  profile/override IDs (never credentials).

### 11. Responsive and accessibility release pass

- **Navigation:** Exercise representative blocks from `/petros/session` at desktop and 390 × 844;
  use browser zoom, keyboard-only navigation, a real screen reader, reduced-motion preference, and
  throttled network.
- **Fixture/action:** Cover all 18 types across fixture sessions; tab through “Why this?”, choices,
  hints, diagram editing, composer, pause/close, and explicit artifact choice. Reload with an
  interaction pending and with a saved interaction.
- **Expected UI:** Logical focus order, visible focus, semantic progress/radio/status announcements,
  minimum 44 px touch targets, no horizontal overflow, useful alternative diagram description,
  preserved state, no forced motion, and recoverable loading/error states.
- **Expected evidence:** Accessibility tree roles/names are stable; persisted interaction payloads
  contain only structured safe state; network retry/idempotency does not duplicate a block or answer.
- **Failure:** Keyboard trap, lost focus/state, unlabeled control, touch target below 44 px, clipped
  diagram, motion despite preference, duplicate action after retry, or private/provider details in an
  error.
- **Capture:** `S4-QA-11-mobile.png`, `S4-QA-11-a11y-tree.txt`, screen-reader recording reference,
  session/block IDs and throttled request ID.

## Known debt and intentional boundaries

- No live model provider/credentials were configured locally. Browser QA exercised the registered
  deterministic fallback; model-backed integration should be added to a credentialed test lane, not
  simulated or hardcoded in the feature.
- Real-device screen-reader, virtual-keyboard, reduced-motion, high zoom, and slow-network coverage
  remains a release QA activity. Automated semantics/state tests and desktop/mobile browser smoke are
  complete.
- Diagram edits and artifact choices are durable within the learning session. Permanent canvas and
  learner-library persistence is intentionally Stage 7 work.
- The Stage 5 evaluation harness was not built. Stage 4 contains only the deterministic/unit/browser
  verification needed to freeze its contracts.
- Repository lint/format tooling needs a separate repair: link/configure a compatible ESLint and
  restore the configured Tailwind Prettier plugin. Stage 4 source compiles and passes scoped
  whitespace checks despite that tooling gap.

## Stage 5 prerequisites

1. Freeze `petros.topic-profile.v1`, PLAN v3, RENDER v2, the 18 exact block schemas, generator
   prompt/schema version, and decision-factor vocabulary as evaluation baselines.
2. Seed the four representative published profiles and neutral learner/session fixtures with stable
   IDs, expected eligible/excluded moves, and approved authoritative references.
3. Add evaluation cases for correct routing, structural variety, explanation appropriateness,
   grounded prerequisite/misconception use, two-probe enforcement, and student-safe reasons.
4. Add route/capability scenarios for healthy model, malformed structured response, latency,
   provider outage, no visual capability, budget restriction, cache hit, and invalidation.
5. Measure profile generation independently from PLAN/RENDER and assert no charge/request on a cache
   hit.
6. Preserve privacy-safe diagnostics: hashed student/institution references, correlation/request IDs,
   decision factors, and no chain-of-thought or raw learner answer in eval exports.
7. Run the complete manual acceptance runbook above in the credentialed evaluation environment and
   attach the named evidence artifacts.
