# Plan 06 — Library artifact family: concept map / flowchart workspace + key-terms glossary

> Consumer: Cursor Composer 2.5. Read `plans/fix/00-README.md` first, every session.
> Prerequisites: Plans 01, 02, and 05 complete. GATE-IN: (a) `GET /v1/health/ai` shows real
> models; (b) authed `POST /v1/student/lab/visuals` with `format: 'diagram'` returns 200;
> (c) the Library page (`http://localhost:3005/library`) renders. If any fail, stop.

## 1. Objective

From one uploaded source the spec promises a five-artifact family: Summary, Flashcard deck, Quiz
set, **Concept map / flowchart**, and **Key-terms glossary**. The first three exist and work
(plus a "tutor me" session). The last two don't exist at all. Build them following the exact
patterns of the existing three. Done = both artifacts can be generated from a library source,
open in their own workspace, and follow every AI-marking rule.

## 2. Current state (verified 2026-07-07; re-confirm before editing)

- Backend: `apps/api/src/modules/student/library/` — `library.controller.ts`,
  `library.service.ts`, `library.repository.ts`. Existing generation endpoints follow the pattern
  `POST /v1/student/library/items/:id/summarize | flashcards | quiz | tutor`. Read all three
  existing generation flows before writing anything — the new endpoints must be pattern-copies
  (same budget spend via `BudgetsService`, same `LearnAiCallLogger` usage, same artifact
  persistence via `library.repository.insertArtifact`).
- DB: artifacts persist to the `knowledge_artifacts` table
  (`packages/database/src/schema/student-knowledge.ts`). Check whether the `kind` column is an
  open text column or a constrained enum: `grep -n "kind" packages/database/src/schema/student-knowledge.ts`.
  If it's unconstrained text, NO migration is needed. If a DB-level constraint must change, the
  new migration file starts at `0060` (append-only; never edit 0000–0059).
- Frontend: `apps/student-web/src/app/(app)/library/[id]/page.tsx` is the source-detail page with
  the existing artifact actions (`useLibrarySummarize`, `useLibraryFlashcards`, `useLibraryQuiz`,
  `useLibraryTutor` in `apps/student-web/src/lib/hooks/library.ts`). Flashcard decks open at
  `library/decks/[id]`. Declarative graph rendering exists in
  `apps/student-web/src/components/lab/GraphCanvas.tsx` (extended for labeled diagrams in Plan 05)
  — REUSE it for the concept map; do not write a second graph renderer.
- Sessions grounded on library content already exist ("tutor" flow) — the concept map's
  "Learn this" node action should reuse however tutor launches a grounded session (read
  `useLibraryTutor` and its backend handler).

Re-confirm:

```
grep -n "summarize\|flashcards\|quiz\|tutor" apps/api/src/modules/student/library/library.controller.ts
grep -rn "concept.map\|glossary" apps/api/src/modules/student apps/student-web/src   # expect: nothing
```

## 3. Product-spec excerpts (verbatim — these ARE the requirements)

> **Concept map / flowchart** — an auto-extracted diagram of how the ideas in the source connect
> (definitions → dependencies → processes). Nodes are tappable to jump to that concept; a
> process-heavy source (e.g. "how a bill becomes law," "the cell cycle") renders as a step
> flowchart rather than a web.

> **Concept map workspace** — Tapping a node highlights its connections and shows a
> mini-definition; a "trace path" mode lights up the chain from a fundamental to an advanced idea
> so the student sees the prerequisite order. … Any node offers "Learn this" (launches a grounded
> session on just that concept) or "I'm shaky here" (flags it, feeding revision). … Legible over
> gimmicky — a clean dependency graph or vertical flowchart, never a decorative cloud. Dense maps
> collapse to sub-clusters the student expands on demand.

> **Key-terms glossary** — every defined term with its source location.

> **EDGE (all artifacts):** Every artifact carries an AI-accent (violet) cue and a "made from:
> [source]" line — the student always knows it was generated and from what, and can regenerate if
> the source was updated.

## 4. Tasks (in order)

### Task 1 — Schemas

- Files: `packages/schemas/src/student/**` (co-locate with the existing library/visual schemas).
- Change: add zod schemas for (a) a concept-map artifact — nodes (`id`, `label`,
  `miniDefinition`, `sourceLocation`), directed edges (`from`, `to`,
  relation `depends_on | part_of | step`), and a `layout: 'web' | 'flowchart'` discriminator the
  model chooses based on whether the source is process-heavy; (b) a glossary artifact — an array
  of `{ term, definition, sourceLocation }`. `sourceLocation` = page/passage reference string,
  same convention the summary artifact uses for traceability (read how summarize stores its
  source references and match it).

### Task 2 — Backend generation endpoints

- Files: `library.controller.ts`, `library.service.ts` (+ repository only if a new query is needed).
- Change: add `POST /v1/student/library/items/:id/concept-map` and
  `POST /v1/student/library/items/:id/glossary`, each a pattern-copy of `summarize`: load the
  item's extracted text, spend budget, call `ai.completeJson` (tier: large) with a system prompt
  per the spec excerpts (concept map: extract how ideas connect, choose web vs. flowchart by
  content shape, 8–20 nodes, every node's miniDefinition grounded in the source; glossary: every
  DEFINED term only — terms the source actually defines — with its location), log the call,
  persist via `insertArtifact` with `kind: 'concept_map'` / `kind: 'glossary'` and a
  `fromLabel` naming the source (matching the existing artifacts' "made from" convention).
- Acceptance: authed POST to each endpoint on a seeded/uploaded source returns the persisted
  artifact; `GET` of the library item then lists both artifacts alongside summary/flashcards/quiz.

### Task 3 — Frontend: actions + concept-map workspace

- Files: `apps/student-web/src/lib/hooks/library.ts` (add `useLibraryConceptMap`,
  `useLibraryGlossary` — copy the shape of `useLibraryQuiz`), `library/[id]/page.tsx` (two new
  artifact actions/cards in the same row as the existing three, violet AI-accent + "made from"
  line), and a new workspace route `apps/student-web/src/app/(app)/library/maps/[id]/page.tsx`
  (mirror how `library/decks/[id]` is routed and fetches its artifact).
- Concept-map workspace behavior: render via `GraphCanvas` (web layout) or a vertical stepped
  flowchart (per the artifact's `layout`); tap a node → highlight its edges + show
  `miniDefinition` + its `sourceLocation`; "Learn this" button on the node panel launches a
  grounded session reusing the tutor-flow launch path scoped to that concept; "I'm shaky here"
  posts the existing revision-flag mechanism if one exists (grep for how "shaky"/revision flags
  work in `learn/revision`; if no endpoint exists, mark the node locally and note the gap in the
  report — do NOT invent a new backend contract).
- Glossary rendering: a clean list on the source-detail page or a simple sub-view — term,
  definition, source location. No dedicated route needed.
- Acceptance: browser flow — open a source → generate concept map → workspace opens → tap nodes →
  "Learn this" starts a session; generate glossary → terms with locations render; both artifacts
  show violet accent + "made from: [source name]".

### Task 4 — Trace-path + cluster collapse (stretch, only if Tasks 1–3 verified)

- "Trace path" mode: select two nodes → highlight the directed chain between them.
- Dense maps (>14 nodes): group by connectivity into collapsible clusters.
- Skip cleanly if out of time; say so in the report.

## 5. Verification gate (GATE-OUT)

1. Both typechecks pass; any new migration (only if `kind` was constrained) is numbered `0060`
   and `db:migrate` runs clean.
2. Both endpoints return persisted artifacts (paste artifact `kind`s from the library item GET).
3. Browser flow from Task 3 demonstrated end-to-end.
4. Regression: summarize, flashcards, quiz, and tutor still work on the same source.

## 6. Out of scope / guardrails

- Do NOT touch the upload/OCR ingestion pipeline.
- Do NOT build a second graph renderer — extend `GraphCanvas`.
- Do NOT auto-generate these artifacts on upload (they are student-initiated here; auto-artifacts
  from completed Learn topics are a different existing mechanism).
- Glossary contains only terms the source defines — no AI-invented vocabulary lists.

## 7. Escalation — stop and report if

- `knowledge_artifacts.kind` is DB-constrained AND changing it would break existing rows.
- The tutor-flow session launch can't be scoped to a single concept without backend changes
  beyond a pattern-copy — report the needed contract change first.
