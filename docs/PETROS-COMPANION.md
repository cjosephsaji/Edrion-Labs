# Petros companion

The student portal's study companion. This document is the map: what exists, where it
lives, and the rules that must not be broken when it changes.

Implementation plan: `PLAN-PETROS-HANDS-ON-STUDY-BUDDY.md`.
Phase 0 baseline (what was wrong before): `docs/PETROS-COMPANION-PHASE0.md`.

## Shape

```text
Portal                                       API
──────                                       ───
AppShell
  PetrosCompanionProvider ─── owns open state, selection, live thread
    <page> usePetrosPage({candidates})       POST /v1/student/petros/companion/turns
    PetrosAskButton  ─ explicit selection      PetrosCompanionService.turn
    PetrosCompanionPanel                         PetrosStudentContextService.resolve
      typed blocks, action confirm                 ↳ re-reads every candidate from the DB
  PetrosBriefingStrip (home)                     PetrosActionRegistryService.validate
                                                 PetrosAiGateway → companion.turn
                                               GET  /companion/thread     (envelope)
                                               GET  /companion/briefing   (no model call)
                                               POST /companion/actions/:id/decision
                                               GET/PUT /companion/preferences
```

Tables (migration 0201, all forced RLS, owner = institution + student):
`petros_student_threads`, `_messages`, `_action_proposals`, `_companion_preferences`,
`_nudge_state`.

## Rules

**Selection is the student's.** Pages register candidates; only an explicit act — an
`PetrosAskButton` press or a detail view — sets focus. Array order is never the selection
algorithm. This is what the previous `document.querySelector('[data-petros-target]')`
assistant got wrong, and it is the bug most likely to come back.

**The client's text is a hint, never a fact.** `visibleCandidates` carries refs and ids so
the API knows what to look up. Titles, dates, marks and feedback are re-read server-side
under the student's own permissions and surface flags. Never quote a client-supplied string
back to the model as a record.

**Context adapters mirror the portal's own visibility rule.** Assignments are visible by
class OR course enrolment OR assignee row; homework by its submission row plus a visible
status. Anything stricter silently hides the student's own work — see
`PetrosStudentContextService.assignmentVisibility`.

**Routes are declared, not guessed.** `PETROS_ROUTE_RULES` in
`packages/schemas/src/petros-companion.ts` classifies every portal route as `supported`,
`unavailable` (Petros says why) or `hidden` (not mounted). A route with no rule resolves to
`unavailable`, never to `/home`. `petros-companion.spec.ts` fails if a portal route is
missing.

**Nothing changes without a confirmation.** The model may name an action key and propose
arguments; the registry owns permissions, validation, previews and execution. State-changing
actions in `PETROS_MUTATING_ACTIONS` always require a confirm press, and the
`proposed → confirmed` update is the concurrency gate that makes execution exactly-once.

**Validate before the first write.** Student requests run inside one institution-scoped
transaction (`StudentTenantInterceptor`). A statement that violates a constraint aborts the
whole request, so a later "mark this failed" write cannot land. `revalidate()` runs before
anything is claimed.

**Never claim an action happened.** `correctCompletionClaim` rewrites any past-tense claim
into an offer. Petros proposes; the portal acts.

**Priority is deterministic.** The briefing's ordering comes from fixed bands in
`PetrosBriefingService`, never from a model, and no AI request is made when the student
changes pages.

**Nothing internal reaches the student.** No provider, model, routing, prompt version,
concept key or entity id. If a label cannot be resolved to something a student would
recognise, say something honest instead.

## Adding a page

1. Add a rule to `PETROS_ROUTE_RULES`.
2. Call `usePetrosPage({ title, candidates })` with real entity ids.
3. Render `PetrosAskButton` on each card.
4. If the entity type is new, add it to `PETROS_ENTITY_TYPES`, give it a gate in
   `ENTITY_GATES`, and add a `lookup` branch that reuses the module's own visibility rule.

Without step 4 the candidate resolves to nothing, and Petros will say he cannot confirm the
item — which is the correct failure, not a silent guess.

## Proof

- `scripts/petros-companion-smoke.sh` — 36 assertions against a live API: grounding on a
  non-first item, client text ignored, idempotent turns, continuity across routes, route
  honesty, cross-institution isolation, propose/confirm/execute-once, preferences,
  deterministic briefing, session results returning to the thread, thread lifecycle.
- `apps/api/.../petros-companion.spec.ts` — 27 behavioural tests: humour suppression,
  distress, completion claims, charter honesty, forged keys and destinations.
- `packages/schemas/src/petros-companion.spec.ts` — route matrix and block contract.
- `apps/student-web/.../petros-companion.spec.tsx` — selection, continuity, confirmation.

## Checking mobile

Chrome's `resize_window` reports success but leaves `window.innerWidth` unchanged in this
setup, so screenshots are not evidence of mobile layout. Render the portal in a phone-sized
same-origin iframe instead — CSS media queries evaluate against the frame's own viewport:

```js
const f = document.createElement('iframe');
f.src = '/learn';
f.style.cssText = 'width:390px;height:844px;border:0';
document.body.appendChild(f);
// f.contentWindow.innerWidth === 390, matchMedia('(max-width: 920px)').matches === true
```

Two checks worth running per route:

- **Horizontal overflow** — `documentElement.scrollWidth > innerWidth`. This found
  `/progress` rendering 16,485px wide on a 390px phone.
- **Tap targets** — any `a[href]`, `button`, `input`, `[role="switch"]` under ~40px in
  either dimension. Apple's floor is 44px.

One caveat: CSS transitions do not always tick inside the probe iframe, so a panel measured
mid-transition reads as off-screen. Set `transition: none` on the element before measuring
position, or you will chase a bug that is not there.
