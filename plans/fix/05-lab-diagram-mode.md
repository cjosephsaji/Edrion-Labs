# Plan 05 — Lab Visual Studio: implement Diagram mode (un-501 it)

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: Plans 01 and 02 complete. GATE-IN: `GET /v1/health/ai` shows real model IDs AND
> `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3001/v1/student/analytics` returns
> 401/403 (not 404). If either fails, stop.

## 1. Objective

The Lab's Visual Studio supports mind maps and flowcharts, but its third mode — Diagram — throws
501 "coming soon" on the backend and shows a disabled COMING SOON chip on the frontend. Implement
Diagram mode within the existing structured-spec architecture (AI returns a declarative spec, the
client renders it) — NOT image generation. Done = a student can generate, regenerate, and save a
labeled diagram exactly like the other two modes.

## 2. Current state (verified 2026-07-07; re-confirm before editing)

- Backend: `apps/api/src/modules/student/lab-visual/lab-visual.service.ts` line 21–23 —
  `generate()` throws `HttpException({ comingSoon: true, message: 'Diagram mode is coming soon.' }, 501)`
  when `parsed.format === 'diagram'`. The other two formats (`mind_map`, `flowchart`) call
  `this.ai.completeJson({ purpose: 'visual', tier: 'large', schema: graphSpecSchema,
  schemaName: 'graph', … })` and return the spec. `regenerate()` and `save()` are
  format-agnostic and already work; `save()` writes a library artifact with `kind: 'visual'`.
- Schemas: `generateVisualSchema`, `graphSpecSchema`, `regenerateVisualSchema`, `saveVisualSchema`
  come from `packages/schemas` (`@edrion/schemas`). `generateVisualSchema` already accepts
  `format: 'diagram'` (otherwise the service couldn't branch on it) — verify with
  `grep -rn "diagram" packages/schemas/src`.
- Frontend: `apps/student-web/src/app/(app)/lab/visual/page.tsx` — line ~72 region renders the
  Diagram chip in a disabled "COMING SOON" state. Rendering for the two live modes is
  `apps/student-web/src/components/lab/GraphCanvas.tsx` (declarative spec → SVG; also used by
  Quick Answer visuals).
- Architecture constraint from the original build (`plans/00-overview.md` §9, deferred features):
  visuals v1 are **structured specs rendered client-side**; rendered-image generation is a
  deliberately deferred seam. Stay inside that decision.

Re-confirm:

```
grep -n "comingSoon" apps/api/src/modules/student/lab-visual/lab-visual.service.ts
grep -n -i "coming soon" apps/student-web/src/app/(app)/lab/visual/page.tsx
grep -rn "graphSpecSchema" packages/schemas/src
```

## 3. Product-spec excerpts (verbatim)

> **Interactive diagrams & flowcharts** — Open a diagram (labeled anatomy, a circuit, a
> data-structure) … tap parts … Tapping a part reveals its role … A "quiz me on this diagram"
> flips labels off and asks the student to place them. Any element links to its concept for a
> deeper session, and the diagram can be saved into the Library as a study artifact.

> **EDGE (Lab):** Legible over gimmicky — a clean dependency graph or vertical flowchart, never a
> decorative cloud. … big handles, no hover-only affordances … reduced-motion is respected.

Scope note: "quiz me on this diagram" and tap-part-reveals-role are the full vision; the MANDATORY
scope for this plan is generate/label/regenerate/save parity with the other two modes, with
tappable labeled parts (tap → shows the part's description). Label-quiz mode is a stretch goal —
implement only if the mandatory scope is verified and time remains.

## 4. Tasks (in order)

### Task 1 — Decide the diagram spec shape (extend, don't fork)

- Files: `packages/schemas/src/**` (locate `graphSpecSchema`'s module).
- Change: extend the existing graph/visual spec (or add a sibling `diagramSpecSchema` in the same
  module) to describe a labeled diagram: parts with `id`, `label`, `description`, simple geometry
  (positioned boxes/ellipses and connector lines are sufficient — the model supplies structure,
  the client owns layout polish). Prefer the smallest extension that `GraphCanvas` can render;
  read `GraphCanvas.tsx` FIRST and shape the schema around what it can draw or be minimally
  extended to draw. Export any new schema from the package index like its siblings.

### Task 2 — Backend: generate diagrams

- File: `apps/api/src/modules/student/lab-visual/lab-visual.service.ts`.
- Change: delete the 501 branch. When `format === 'diagram'`, call `this.ai.completeJson` with
  the same budget/logging pattern as the existing call (`budgets.spend` before, `callLog.log`
  after), `tier: 'large'`, the diagram schema, and a system prompt directing: a clean labeled
  diagram of the topic's structure, 5–12 parts, each with a one-sentence `description`, connectors
  showing containment/flow, no decorative content. Extend `stubSpec()` to return a plausible
  diagram stub for the `!this.ai.available` path (match how it stubs the other formats).
- Acceptance: authed `POST /v1/student/lab/visuals` with
  `{"topic":"the human heart","format":"diagram"}` returns 200 with a spec matching the schema
  (parts + descriptions + connectors), not 501.

### Task 3 — Frontend: enable the mode and render it

- Files: `apps/student-web/src/app/(app)/lab/visual/page.tsx`,
  `apps/student-web/src/components/lab/GraphCanvas.tsx`.
- Change: remove the COMING SOON/disabled state on the Diagram chip; render diagram specs in
  `GraphCanvas` (or a `DiagramCanvas` sibling if the render logic genuinely diverges — prefer
  extending `GraphCanvas`). Tapping/clicking a part highlights it and shows its `description`
  (tap-friendly: min ~44px targets, no hover-only reveal). Regenerate ("show it differently") and
  Save must work through the existing `useRegenerate`/`useSaveVisual` hooks unchanged — verify the
  saved artifact appears in the Library.
- Acceptance: in the browser — generate a diagram, tap two parts (descriptions show), regenerate,
  save, find it in `/library`.

### Task 4 — Stretch (only if Tasks 1–3 verified): label quiz

- "Quiz me on this diagram": hide labels, present them as a shuffled list, student assigns each to
  a highlighted part, immediate per-placement feedback (diagnostic tone, never punitive red).
  Purely client-side over the existing spec. Skip cleanly if out of time — say so in the report.

## 5. Verification gate (GATE-OUT — Plan 06 partially depends on this)

1. Both typechecks pass; API test suite still green.
2. `POST /v1/student/lab/visuals` with `format: 'diagram'` → 200 + valid spec (paste the part
   count in the report).
3. Browser flow from Task 3 demonstrated (generate → tap → regenerate → save → visible in Library).
4. Mind map and flowchart modes still work (regression — generate one of each).

## 6. Out of scope / guardrails

- NO image generation (DALL·E/gpt-image or similar) — structured specs only; that seam is
  deliberately deferred per overview §9.
- Do NOT redesign Visual Studio's layout or touch the mock-exam/debate Lab modules.
- Do NOT break the saved-artifact contract (`kind: 'visual'` in `save()`); Library rendering of
  existing visuals must keep working.
- Keep the "point-and-ask Petros" and "draw on screen" tiles as coming-soon (the spec itself says
  so) — do not build them.

## 7. Escalation — stop and report if

- `generateVisualSchema` does NOT accept `format: 'diagram'` (schema drift from described state).
- `GraphCanvas` is fundamentally incompatible with labeled-part rendering (would need a rewrite,
  not an extension) — report the design choice before building a parallel renderer.
