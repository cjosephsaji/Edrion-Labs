# Execution prompt 02 of 13 — Stage 2: the PLAN → RENDER loop

Use this prompt in a fresh Codex/GPT coding task after Stage 1 has been merged or is present in the
working tree. Complete only this stage and its direct prerequisites. Do not begin Stage 3.

## Mission

Implement the architectural heart of Petros: a provider-independent teaching loop that makes one
structured PLAN decision at a time and separately RENDERs that decision into a typed learning
block. Support exactly four intelligent moves in this stage: layered explanation, worked example,
recall check, and synthesis. Every decision must be logged and must power a truthful “Why this?”
explanation in the student interface.

Petros is a teaching engine embedded in the Edrion student portal. It is not a chatbot. Do not add a
standalone chat page, generic message bubbles, or an “Ask Petros anything” destination.

## Required reading and repository rules

Before changing code:

1. Read `/Users/macbook/Downloads/PETROS-BUILD-SPEC.md` completely, especially Parts 1–6 and Stage 2.
2. Read `docs/PETROS-AI-ROUTING.md` and inspect the existing Stage 1 student surface.
3. Inspect `packages/schemas/src/petros-ai-routing.ts` and
   `apps/api/src/modules/petros-ai-routing/` before designing another AI abstraction.
4. Inspect `AGENTS.md` files and the dirty worktree. Preserve unrelated and user-owned changes.
5. Use `PetrosAiGatewayService` for every model call. Never import a provider SDK or read an API key
   in a Petros feature.
6. Do not apply a migration to a shared or remote database without explicit authority. Create the
   migration and state the exact safe command if execution is not authorized.

## Stage-entry gate

Audit Stage 1 before proceeding. Verify that the existing session is a document-like stream of
typed blocks, block interaction state survives scrolling/rerenders, segmented progress remains
visible, the composer affordance exists, the artifact rail/sheet is responsive, and mobile layout
is usable. Fix only Stage 1 defects that block the loop. Record any non-blocking Stage 1 debt in the
handoff; do not turn this into a Stage 1 redesign.

## Architecture to implement

### 1. Explicit session state

Create a typed, versioned Petros session-state contract. A PLAN request must receive all relevant
state explicitly rather than relying on conversational memory:

- session ID, student ID, institution ID, and session type;
- topic and current goal;
- time budget, elapsed time, and remaining move budget;
- checkpoint plan and current checkpoint;
- ordered prior moves with decision, rendered block reference, status, and observed outcome;
- learner context currently available without inventing Stage 6;
- topic context currently available without inventing Stage 4;
- source/door context, if present;
- prompt version and output-schema version.

Persist enough session and decision state to resume after a refresh and to audit a run. Keep AI
transcripts out of the learner model. Use append-oriented decision/event records where practical.
Include ownership and institution scoping on every row.

### 2. PLAN as a separate AI function

Use or register the appropriate AI Function for next-teaching-action selection. Its response must
be strict structured output, validated before use. Define a versioned schema resembling:

- selected move type;
- target concept/subgoal;
- concise student-safe reason for “Why this?”;
- internal decision rationale suitable for an audit log, without exposing chain-of-thought;
- move parameters;
- expected evidence of success;
- checkpoint/progress effect;
- whether the move can stream;
- a termination recommendation and reason.

Do not store or request hidden chain-of-thought. Store concise decision factors and policy facts.
Reject malformed or unsupported decisions and use configured retry/fallback behavior. If all AI
routes fail, use a safe deterministic fallback that keeps the session usable and hides provider
details from the student.

### 3. RENDER as a separate AI function

PLAN chooses the move; RENDER produces only the content for that move. Define a discriminated,
versioned teaching-block schema for the four stage moves:

- `layered_explanation`: concise first layer, optional deeper layers, key idea, source grounding;
- `worked_example`: problem statement, ordered steps, reveal/prediction points, final check;
- `recall_check`: one to three questions, answer contract, feedback metadata, but no Stage 3 struggle
  ladder yet;
- `synthesis`: student synthesis prompt, optional tightening guidance, forward link.

Validate every block. Do not guess missing structured fields. Retry or fall back. Persist the exact
prompt/schema version, function key, chosen route reference, and resulting block ID.

### 4. Loop coordinator and guardrails

Implement a coordinator/state machine that performs PLAN → validated decision → RENDER → validated
block → wait for completion → next PLAN. It must:

- cap the total number of moves;
- deliberately close when the goal is met, time expires, or the student stops;
- prevent the same move type from being selected three times consecutively by overriding the third
  repetition and logging the policy intervention;
- prevent duplicate in-flight planning for one session;
- make repeated requests idempotent;
- recover cleanly from a refresh or API retry;
- never reveal provider/model/fallback errors to the student;
- render the current block while the next eligible planning work is prepared, without committing a
  speculative block that may no longer fit the state;
- keep streaming cancellable on navigation or pause.

### 5. Backend/API surface

Add authenticated, institution-scoped endpoints or commands for:

- creating a loop-backed session from the existing result-repair context;
- reading/resuming the session document and current state;
- requesting/continuing the next move;
- completing a non-question block;
- pausing and closing a session;
- reading the student-safe decision reason for a block;
- authorized diagnostic inspection of planning decisions.

Use clear request/response schemas in the shared schema/API-client packages. Enforce permissions,
ownership, idempotency, rate limits, validation, and audit logging. Do not expose raw prompts,
credentials, provider names, internal errors, or another student’s data.

### 6. Student frontend

Replace the hardcoded sequence with loop-backed blocks while retaining the Stage 1 interaction
grammar. The page must:

- stream or progressively reveal new typed blocks without becoming a chat timeline;
- show stable block state after scroll, rerender, refresh, and resume;
- keep segmented progress visible;
- expose “Why this?” on every intelligent move using the logged PLAN reason;
- render loading skeletons using the expected move/block type;
- offer pause/resume and a deliberate close;
- have useful empty, slow, validation-failure, retry, offline, and exhausted-fallback states;
- remain keyboard accessible and usable at mobile and desktop breakpoints;
- preserve the rule that proposed artifacts are not automatically saved.

### 7. Admin and observability

Ensure PLAN and RENDER are visible as independently configurable functions in Super Admin → Petros
AI Routing. An authorized operator must be able to see:

- active prompt and schema versions;
- provider/model routes and fallbacks;
- calls, token usage, cost, latency, validation failures, retries, and fallbacks by function;
- planning-decision logs with session/student identifiers appropriately redacted;
- repetition-guardrail overrides and deterministic-fallback use;
- correlation IDs linking a session block, decision, and usage event.

Do not expose student content broadly. Apply existing `ai.view`/`ai.configure` permissions and audit
configuration mutations.

## Automated verification required

Add and run tests for at least:

- PLAN schema accepts every supported move and rejects malformed/unknown decisions;
- RENDER schemas validate all four block variants and reject invalid structures;
- PLAN and RENDER are separate function calls and separately metered;
- two materially different topics can produce different move sequences;
- the third identical consecutive move is overridden and logged;
- max-move, time-up, goal-met, pause, resume, and close behavior;
- idempotent continue calls and duplicate/in-flight protection;
- validation retry followed by configured fallback;
- provider outage produces a provider-neutral student error/fallback block;
- institution/student isolation and permission enforcement;
- session state survives API restart/page refresh where the architecture promises it;
- frontend block-state retention and accessible progress/“Why this?” controls.

Run focused tests first, then all affected package typechecks, lint where available, and production
builds for the API and affected web apps. Do not report “tests pass” without commands and results.

## Mandatory manual QA and dashboard acceptance

Automated tests are not sufficient. After implementation, perform browser-based smoke testing when
the environment permits, then give the human tester this exact style of runbook with navigation,
fixtures, actions, and expected results:

1. **Procedural-topic run:** From Student Portal → Results → “See what to fix,” start a mathematics
   or procedural session. Confirm the document grows block by block, progress advances, state stays
   when scrolling, pause/resume works, and no chat bubbles/provider names appear.
2. **Conceptual-topic run:** Start a conceptually different topic. Capture the ordered move types for
   both runs. They must differ for an explainable reason; identical templates fail this stage.
3. **Why-this audit:** Open “Why this?” on every block. Each explanation must be specific to the
   session state and must match the corresponding planning log—not generic filler.
4. **Refresh/resume:** Interact with a stepper or layer, refresh, leave and return, and confirm prior
   content and interaction state remain intact without duplicate blocks.
5. **Failure exercise:** In Super Admin, temporarily pause the primary provider or route PLAN to a
   controlled failing model. Confirm retry/fallback behavior, generic student messaging, and a
   successful recovery. Restore configuration afterward.
6. **Routing dashboard:** In Super Admin → Petros AI Routing, filter usage by PLAN and RENDER. Confirm
   separate token/cost/latency rows, correct model routes, retries/fallbacks, and no leaked API key.
7. **Decision diagnostics:** Open the authorized planning-decision view. Confirm correlation IDs,
   prompt/schema versions, move reason, and any repetition override can be traced to the rendered
   block.
8. **Responsive/accessibility:** Test at approximately 390×844 and 1440×900, keyboard-only through
   interactive controls, visible focus, screen-reader labels, reduced motion, slow network, and a
   mid-stream pause.
9. **Cross-tenant check:** Attempt to retrieve a session/block using a different student or
   institution. The API must deny it without disclosing existence.

For every manual check, state where to look, the expected result, what constitutes failure, and the
evidence to capture (screenshot, session ID, usage row, decision-log row, or network response).

## Definition of done

Stage 2 is done only when two different topics can produce demonstrably different four-move-engine
sequences; the PLAN reason is visible and auditable; blocks render/resume reliably; routing,
validation, fallback, and cost events are inspectable; and both automated and manual acceptance
evidence is supplied.

## Final response contract

End the coding task with:

1. outcome and exact scope delivered;
2. architecture/data/API/frontend/admin summary with clickable file links;
3. migrations and environment variables, clearly stating what was and was not applied;
4. automated commands and results;
5. browser/manual checks actually performed;
6. a dashboard-by-dashboard human QA checklist with expected results;
7. known limitations and Stage 3 prerequisites;
8. a clear verdict: `Stage 2 complete` or `Stage 2 not complete`, with unmet criteria.

