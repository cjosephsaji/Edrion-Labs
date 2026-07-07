# Plan 04 — AI interaction upgrades: hint ladder, Pin-to-canvas, intent preview

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: Plans 01 and 03 complete. GATE-IN: `GET /v1/health/ai` shows real models AND the
> Ask Petros drawer streams its answer. If either fails, stop.

Three independent phases. Complete and verify each before starting the next. If a session runs
long, stop cleanly at a phase boundary and tell the user which phases are done.

## 1. Objective

Three spec-required interactions have their backend halves built but were never wired into the UI:
on-demand hints (endpoint + hook exist, unused), Pin-answer-to-canvas (hook exists, no button),
and the live intent preview / disambiguation on the Learn home input (not built). Done = all three
behave exactly as the spec excerpts below describe.

## 2. Current state (verified 2026-07-07; re-confirm before editing)

- **Hints:** backend `POST /v1/student/learn/sessions/:id/blocks/:blockId/hint` exists
  (`apps/api/src/modules/student/learn/sessions.controller.ts`). Frontend mutation exists at
  `apps/student-web/src/lib/hooks/useLearnSession.ts` lines 68–70 (`hint`, exported line 95) —
  **never called**. `apps/student-web/src/components/learn/HintLadder.tsx` instead reveals hints
  pre-generated inside the block content, client-side only, and the practice page
  (`apps/student-web/src/app/(app)/learn/session/[id]/practice/[blockId]/page.tsx`) posts answers
  with `hintsUsed` counts (useLearnSession.ts lines 117–118).
- **Pin:** `usePinAsk()` exists at `apps/student-web/src/lib/hooks/useAsk.ts` line 13, calling
  `POST /v1/student/learn/ask/pin` (backend: `learn/ask.controller.ts`). No Pin button exists in
  `apps/student-web/src/components/learn/AskPetrosDrawer.tsx`. A `NoteCard` block component
  already exists at `apps/student-web/src/components/learn/blocks/` and the session canvas renders
  blocks via `components/learn/BlockRenderer.tsx`.
- **Intent input:** the Learn home page (`apps/student-web/src/app/(app)/learn/page.tsx`) submits
  the free-text box to `useIntent` → `POST /v1/student/learn/intent` on submit only. No
  while-typing preview, no disambiguation step. The backend router
  (`apps/api/src/modules/student/learn-ai/router.service.ts`) classifies intent (AI with heuristic
  fallback, logged since Plan 01).

Re-confirm:

```
grep -rn "\.hint" apps/student-web/src --include=*.tsx        # expect: no call sites
grep -n "usePinAsk" apps/student-web/src/components/learn/AskPetrosDrawer.tsx   # expect: nothing
grep -n "preview\|disambig" apps/student-web/src/app/(app)/learn/page.tsx        # expect: nothing
```

## 3. Product-spec excerpts (verbatim — these ARE the requirements)

**Hint ladder (§5):**
> The hint control reveals rungs one at a time; each rung is visually distinct from an answer
> (tinted, laddered). Rung 1 Nudge (a question back at them) → Rung 2 Bigger hint (more direction)
> → Rung 3 Walkthrough (guided path, still not a bare answer). The ladder never skips to the
> solution. … Hint directness is tunable in Settings (where rung 1 starts). … On graded
> institutional work, the governance policy can cap the ladder or disable it entirely — the
> student sees why ("concept help only on graded work").

**Pin (§4):**
> A Pin action drops the answer into the canvas as a violet Note Card — the one-way flow that
> turns a passing question into permanent structure. Unpinned chat is ephemeral by default. …
> [flow] taps Pin → a violet Note Card appears in the canvas right by that step → closes the
> drawer → the lesson is now annotated with their own question, permanently.

**Intent preview (§2):**
> As they type, Petros previews the detected intent (a small hint appears: "Looks like a quick
> question" vs "Looks like a topic to learn") so the routing feels transparent, not magical. …
> Ambiguous input ("derivatives") should ask a one-tap disambiguation ("Quick answer, or learn it
> properly?") rather than guessing wrong. Empty submit does nothing.

## 4. Tasks

### Phase 1 — Wire on-demand hints into the ladder

- Files: `components/learn/HintLadder.tsx`, the practice page, `useLearnSession.ts` (consume the
  existing `hint` mutation; check the backend handler for its request body — it takes a `rung`).
- Change: when the student requests a rung that has no pre-generated hint in the block content
  (or when the block carries none), call the `hint` mutation with the rung number and render the
  returned hint in the ladder; show a small loading shimmer on the rung while fetching. Keep
  pre-generated hints as the instant path when present. Keep the `hintsUsed` count flowing into
  the answer submission exactly as now. Respect the existing hint-directness preference if the
  ladder already reads it (check `usePreferences` in `src/lib/hooks.ts`); if it doesn't, start
  rung numbering from the preference value.
- Acceptance: in a practice block with fewer than 3 pre-baked hints, requesting the next rung
  produces a server-generated hint (visible network call to `/hint`, hint text renders, never a
  bare final answer).

### Phase 2 — Pin button in the Ask Petros drawer

- Files: `components/learn/AskPetrosDrawer.tsx`, `useAsk.ts` (`usePinAsk`), possibly
  `BlockRenderer.tsx`/session page for canvas refresh.
- Change: add a "Pin to lesson" action on each completed Petros answer in the drawer. On tap:
  call `usePinAsk` with what the backend pin endpoint expects (read `ask.controller.ts` +
  `ask.service.ts` for the exact DTO — likely the ask/turn id + session/block context), then
  invalidate/refetch the session query so the new violet `note_card` block appears in the canvas
  near the block that was being asked about. Show pinned state on the drawer message ("Pinned ✓",
  disabled second tap).
- Acceptance: ask → pin → note card visible in canvas at the right position → survives a full
  page reload (persisted server-side).

### Phase 3 — Live intent preview + disambiguation

- Files: `apps/student-web/src/app/(app)/learn/page.tsx`,
  `src/lib/hooks/useIntent.ts`; backend `learn/sessions.controller.ts` /
  `learn-ai/router.service.ts` only if a preview flag is needed.
- Change (backend, only if needed): the intent endpoint should support a lightweight
  `preview: true` mode that classifies without creating anything. If `POST /learn/intent` already
  just classifies-and-returns (read the controller — it may already be side-effect free), reuse
  it as-is.
- Change (frontend): debounce ~600ms while typing (min ~8 chars); call the preview; render a small
  hint line under the input: "Looks like a quick question" / "Looks like a topic to learn" (use
  the router's returned route kinds). On submit with an ambiguous/low-confidence classification,
  render an inline two-button choice — "Quick answer" / "Learn it properly" — instead of routing;
  the tap routes. Empty/whitespace submit: no-op. Debounced preview failures fail silent (no
  error toast for a preview).
- Cost guardrail: preview must use the cheapest tier (the router already uses the small/nano
  tier — verify, don't upgrade it) and must not fire on every keystroke.
- Acceptance: typing "what is the powerhouse of the cell" shows the quick-question hint; typing
  "I want to master trigonometry" shows the topic hint; submitting the single word "derivatives"
  offers the two-button disambiguation; empty submit does nothing.

## 5. Verification gate (GATE-OUT)

1. Both typechecks pass; no new console errors on the touched pages.
2. Phase acceptance criteria 1–3 each demonstrated in the browser (report a line per phase).
3. Regression: a full guided session still runs start-to-finish (create → blocks stream → answer a
   checkpoint → finish).

## 6. Out of scope / guardrails

- Do NOT generate hints client-side or embed answers in hints; rung 3 is a walkthrough, never the
  bare solution (spec hard rule).
- Do NOT make the drawer auto-pin or persist unpinned chat into the canvas (unpinned = ephemeral).
- Do NOT auto-route ambiguous input; the disambiguation choice is the student's.
- Do NOT redesign the Learn home layout; the preview hint is a small additive element.

## 7. Escalation — stop and report if

- The pin endpoint's DTO doesn't match anything the drawer can supply (missing block context) —
  report the mismatch rather than changing the backend contract unilaterally.
- The intent endpoint creates server-side records on every call and has no clean preview path —
  report before adding a new endpoint.
