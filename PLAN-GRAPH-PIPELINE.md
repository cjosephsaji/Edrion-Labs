# Tier 2 Plan — Graph Pipeline

## 1. Feature summary

The Graph Pipeline turns prompts, Library material, Edrion Learn sessions, and future Debate rounds into one versioned visual artifact. It upgrades the existing Visual Studio substrate rather than replacing it: one `CanvasGraph`, one canvas/revision history, one deterministic layout engine, and one generation/export queue. Its frozen JSON contract is [PLAN-GRAPH-JSON-CONTRACT.md](./PLAN-GRAPH-JSON-CONTRACT.md); Edrion Learn must not begin until that contract and this feature are merged.

## 2. Spec Amendments and resolved audit flags

### 2.1 Existing substrate verified

- Graph Hyperspec Constraints 1–6 are directionally correct, but §A’s example JSON is not the deployed shape. Canonical code is `packages/schemas/src/student/visuals.ts` and `packages/schemas/src/student/visual-graph-rules.ts`: root `graph_schema_version`, `root_node_id`, `layout_cache`; node `title/body/type/depth/status/origin/source_ref`; edge `source/target/type`. The plan freezes that shape and adds only optional v1 fields. No `packages/schemas/canvas-graph/` shadow type is created.
- `visual_canvases` and `visual_canvas_revisions` are defined in `packages/database/src/schema/visual-studio.ts` and created by `packages/database/migrations/0063_visual_studio.sql`. Canvas columns already include `title`, `archetype`, `graph`, `schema_version`, `origin`, provenance FKs, `version`, and timestamps. Do not add a duplicate title.
- The exact archetype CHECK is `mind_map|flowchart|cycle|timeline|hierarchy|comparison`; the spec’s `mindmap` spelling is rejected. The exact origin CHECK is `prompt|library_source|learn_topic|learn_session|memory|legacy`.
- Door mapping is therefore: `lab_topic → prompt` (or `learn_topic` when a topic row is the direct source), `library_material → library_source`, old `petros_session → learn_session` and is renamed Edrion Learn in all new code/copy, `manual → prompt`, while `memory` and `legacy` remain. `debate_clash` is genuinely absent and is the only forward origin addition.
- The tenancy CHECK is already correct and remains verbatim: institutional student canvas = `institution_id + student_id`, no independent owner; independent canvas = `independent_user_id`, no institution/student.
- Revisions already store `graph`, `schema_version`, `title`, and `archetype`; layout is already embedded in `graph.layout_cache`. Do not add a second `layout` column. `reason` is unconstrained text today, so add service/Zod validation rather than a brittle database CHECK unless all historical values are enumerated first.
- `@xyflow/react@^12.11.2` and `elkjs@^0.11.1` are installed and used by `apps/student-web/src/components/visual-studio/*` and `apps/student-web/src/lib/visual-studio/elk-layout.ts`. Extract the algorithm, do not build a second canvas UI.
- `packages/database/src/data-migrations/visual-canvases-v1.ts`, invoked by `packages/database/src/migrate.ts`, is a one-time legacy-artifact conversion. It is not a contiguous CanvasGraph version runner. Hyperspec §G’s missing-runner claim is confirmed.
- `apps/api/src/modules/student/visual-studio/visual-memory-diff.service.ts` computes a student/reference diff. It does not own revisions or write `learning_events`. The existing revision writes are in `visual-studio.repository.ts`, currently use last-writer-wins, hard deletion, a 20-revision cap, and indiscriminate pruning. The plan introduces a central revision gateway and explicitly integrates the diff observation with `LearningEventsWriter`; it does not pretend that path already exists.
- `LearningEventsWriter` currently swallows errors and owns its own write. Atomic graph/Learn writeback requires a transaction-aware strict method in the same writer/repository, while preserving the existing best-effort method for noncritical analytics.

### 2.2 Strategic calls resolved

1. **Origin mapping (§K.1):** use the mapping above; add only `debate_clash`. Recommendation: accepted.
2. **Isomorphic layout (§K.2):** accepted. `packages/canvas-layout` is Node-safe, contains no DOM/React imports, and becomes the sole algorithm implementation used by web and export workers.
3. **Study mode and `learn_attempts` (§K.3):** accepted as self-check only in v1; emit no mastery evidence because ungraded exposure would be noisy.
4. **Sharing snapshots (§K.4):** accepted. Reuse the Library share-scope/snapshot mechanism once its exact public share table/API is present; no live canvas ACL and no canvas-specific sharing table.
5. **Edrion Learn spawn timeout (§K.5):** retain 8 seconds as the synchronous boundary. Timeout returns one typed `SPAWN_TIMEOUT`; the background job continues and the canvas still appears in Lab.
6. **Debate reservation (§K.6):** accept `clash` as a v1 edge kind and the typed method contract. Do not ship an HTTP endpoint or fake Debate table. The method returns `NOT_IMPLEMENTED` until Tier 3 unless invoked with a future adapter.

### 2.3 Behavioral corrections

- Generated limits are 60 nodes/120 edges/6 groups, but storage keeps the deployed 200/600 compatibility caps. Generated title/label constraints are refinements, not retroactive rejection of valid legacy/manual graphs.
- Save uses optimistic conflict semantics: stale `base_revision` returns `409 REV_CONFLICT` with latest revision. Remove the repository’s silent last-writer-wins behavior.
- Revisions are append-only committed states. Replace “save old snapshot before update” with “append the new committed snapshot, then point the canvas’s latest graph/version at it” in one transaction. Initial success is revision 1.
- Raise retention from 20 to 200 and never prune `generation`, `spawn`, `clash_build`, or `migration` anchors. If cap pruning is required, prune oldest ordinary `edit` snapshots in a tracked maintenance job; never delete synchronously inside a user save.
- Delete is soft (`deleted_at`), followed by a 30-day purge job; existing hard delete is removed.

## 3. Dependencies and contracts

### Reads/reuses

- Tier 0 idempotency: `apps/api/src/common/idempotency.service.ts`/the Request Engine’s UUID `Idempotency-Key`, 24-hour replay, completed replay 200, in-flight 409. Use the central service, not a canvas table.
- Module visibility: `student.surface.lab` plus a new capability flag `lab.canvas.enabled`; never use the obsolete `student.module.*` namespace.
- Library knowledge and FSRS: existing `knowledge_items`, Library chunk/index services, flashcard/deck tables, and the existing curation UI. Graph owns neither source storage nor cards.
- AI provider/budgets/logging: existing `learn-ai` provider interfaces and `learn_ai_calls`; graph purpose values must remain distinguishable.
- BullMQ worker registry and notifications; generation/export ready or failed are the only notifications.
- Design tokens, shared markdown/math, existing Visual Studio components, `AttachmentStorageService` for generated export artifacts.

### Exposes

- Frozen `CanvasGraph` v1 and migration API.
- `CanvasGraphService.generateForSession({owner, sessionId, blockId?, archetype, conceptContext, nodeBudget<=20})` for Edrion Learn.
- `CanvasGraphService.buildClashMap({owner, debateRoundId, transcriptRef, nodeBudget<=40})` typed Tier 3 contract; initially `NOT_IMPLEMENTED`.
- Stable canvas/revision read and edit APIs; Library prefill door; deterministic server/browser layout package.

## 4. Implementation phases

Migration numbers below reserve the next slot after the currently merged `0094_library_fsrs`. If another migration lands first, preserve order and rename the numeric prefix/journal index before merge rather than editing an already-applied migration.

### Phase A1 — Schema freeze and database migration (Graph §A, §C.1)

**Goal:** merge the contract and additive columns before API/UI work.

**Files**

- Modify `packages/schemas/src/student/visuals.ts` and `visual-graph-rules.ts`; add focused fixtures/specs beside them.
- Modify `packages/database/src/schema/visual-studio.ts`.
- Add `packages/database/migrations/0095_graph_pipeline.sql`; update `packages/database/migrations/meta/_journal.json`, `sql/zzz_grants.sql`, and `sql/zzz_rls.sql` only where the existing migration convention requires it.
- Treat `PLAN-GRAPH-JSON-CONTRACT.md` as the contract source; do not introduce an alternate schema folder.

**Migration detail**

- `visual_canvases.status text NOT NULL DEFAULT 'ready' CHECK (status IN ('generating','ready','failed'))`; existing rows backfill ready before enforcing not-null.
- `visual_canvases.deleted_at timestamptz NULL` and partial indexes for owner/list queries where `deleted_at IS NULL`, ordered by `updated_at DESC`.
- Add `node_count integer NOT NULL DEFAULT 0 CHECK (node_count >= 0)` for list cards; backfill from `jsonb_array_length(graph->'nodes')`; update only inside the revision gateway.
- Replace the origin CHECK with the exact old set plus `debate_clash`; do not rename stored values.
- Add index on `schema_version` for rows below current and status indexes needed by workers.
- Do not add `source_ref`, `title`, or `layout`: existing provenance columns/title and graph layout cache cover them. A future Debate FK waits for the real debate-round table; store its opaque ID in a narrowly typed `source_meta jsonb NULL` only if Tier 3 cannot bind to an existing key at implementation time, and record that decision before migration.
- Keep revision table columns. Add unique `(canvas_id,revision_number)` if not already enforced and indexes `(canvas_id,revision_number DESC)`. Database-level reason CHECK is deferred because historical free text must not be invalidated; Zod/service reason enum includes `created|generation|edit|ai_extend|migration|spawn|clash_build` plus an explicit legacy-read escape.
- Preserve the existing owner XOR CHECK and RLS. Every institutional insert still runs inside `runInInstitutionTenant`; independent access is owner-filtered and never acquires `institution_id`.

**Schema behavior**

- Add optional/defaulted `groups`, `group_id`, `event_date`, `color_token`, and `pinned`, and reserved edge `clash` exactly as frozen. Export literal arrays once and derive Zod enums/types/rule maps from them.
- Add generated-graph refinements without narrowing legacy storage parsing.
- Add a database parity helper that queries `pg_get_constraintdef` at startup/migration tests and compares sorted values with `visualArchetypeSchema.options`.

**Definition of done**

- Old fixtures parse and old rows migrate without data rewrite beyond metadata backfill.
- DB CHECK/Zod parity test fails on intentional drift.
- Owner XOR, origin set, soft-delete indexes, graph structural/group/archetype rules, byte cap, and generated-coordinate stripping have tests.
- Type-level test confirms a single exported `CanvasGraph` type.

### Phase A2 — Forward graph migration runner (Graph §G; deliberately early)

**Goal:** make version evolution safe before usage grows.

**Files**

- Add `packages/schemas/src/student/canvas-migrations/types.ts`, `registry.ts`, `runner.ts`, `fixtures/*`, and specs. The schema stays in `visuals.ts`; this folder contains transformations only.
- Add `apps/api/src/modules/student/visual-studio/visual-schema-migration.service.ts` and `visual-schema-backfill.processor.ts`; register in `visual-studio.module.ts` and the existing worker scheduler.
- Modify all canvas/revision reads in `visual-studio.repository.ts` to use migrate-on-read.

**Behavior**

- Registry steps export `{from,to,description,migrate}` and must be contiguous. With current v1 there are zero executable steps; tests prove the registry correctly accepts that and rejects gaps/duplicates/future versions.
- `migrateToCurrent(unknown)` validates each output and enforces a 50ms fixture budget at 60 nodes.
- Backfill selects non-deleted latest canvases with `schema_version < CURRENT`, cursor-paginates, row-locks with `SKIP LOCKED`, migrates, and commits through the revision gateway as reason `migration`. It is resumable and idempotent.
- Historical revisions are never rewritten. Read them through the pure runner and label the virtual view “Updated format.”
- Keep `visual-canvases-v1.ts` as the prior artifact importer; document its distinct role.

**Definition of done**

- Gap/duplicate/unknown-version/golden/idempotency/performance tests pass.
- A synthetic v1→v2 test step proves read migration and repeatable backfill without shipping schema v2.
- Backfill retry produces no duplicate migration revision.

### Phase A3 — Central revision/write gateway (Graph §C, §E.3)

**Goal:** all graph mutations become atomic, versioned, conflict-safe, and observable.

**Files**

- Add `visual-revision.service.ts` in `apps/api/src/modules/student/visual-studio/`.
- Refactor `visual-studio.repository.ts`, `visual-studio.service.ts`, `visual-memory-diff.service.ts`, and their specs.
- Extend `apps/api/src/modules/student/ledger/learning-events.writer.ts`/repository with a transaction-aware strict write path.

**Behavior**

- `commit({canvasId,baseRevision,graph,reason,actor,tx})`: lock canvas, owner-check, compare base, parse/migrate/validate, append next revision, update canvas graph/title/archetype/schema_version/node_count/version, and emit audit/event in one transaction.
- Initial generation uses the same gateway with expected revision 0. Hard failure leaves zero revisions.
- `409 REV_CONFLICT` includes `{latest_revision,latest_graph}`; no overwrite. Revision numbers are allocated under lock.
- The memory diff remains the canonical comparison algorithm but gains an explicit `observeCommittedGraph` adapter that writes relevant `learning_events` through the passed transaction. No mastery update occurs for passive Study mode.
- Soft delete uses optimistic `version`; purge only after 30 days, skips legal/shared references, and audits counts. Revision maintenance caps ordinary edits at 200 while preserving anchors.

**Definition of done**

- Concurrent saves yield one success/one 409 and monotonic revisions.
- Transaction-failure tests prove no half revision/canvas/event write.
- Undo/redo append a new revision representing the chosen state; they never delete history.
- No production graph mutation bypasses the gateway (architecture/grep test or repository method visibility).

### Phase A4 — Generation, repair, consumer services, and API (Graph §B, §C.2, §H)

**Goal:** one validated generation path for every door.

**Files**

- Refactor `visual-generation.service.ts`, `visual-prompts.ts`, `visual-grounding.service.ts`, processor/controller/service and tests.
- Add/extend DTOs in `packages/schemas/src/student/visuals.ts` and hooks in `apps/student-web/src/lib/hooks/visuals.ts` (or the existing visual hook module).

**Endpoints**

- `POST /student/canvas/generate` with required UUID idempotency key; body `{archetype,source,title?}` where source is a discriminated union for prompt, Library item/page range, or Learn topic. Return 202 `{canvasId,jobId,status:'generating'}`; completed replay returns the same identifiers.
- `GET /student/canvas?cursor&limit<=50`, default 20, excludes soft-deleted.
- `GET /student/canvas/:id` and `/revisions`; graph is migrate-on-read.
- `POST /student/canvas/:id/revisions` `{baseRevision,graph}`; `POST /:id/extend` `{baseRevision,nodeId,prompt}`; both idempotent where they can enqueue/duplicate effects.
- `DELETE /student/canvas/:id` `{version}` soft-deletes.
- Keep established route aliases temporarily if existing UI uses `/student/visual-studio`; route them into the same service and deprecate, never duplicate implementation.

**Pipeline**

- Create generating row, enqueue `canvas.generate`, structure LLM call only, deterministic repair (drop dangling edges/orphans within 20%, truncate generated titles, derive collision-free IDs, strip coordinates), one LLM repair maximum, then commit revision 1. Invalid second output marks failed with typed safe reason.
- Log calls to `learn_ai_calls`; enforce shared AI budget and lower consumer node budgets. Do not invent graph-specific cost storage.
- `generateForSession` uses `origin='learn_session'`, source session/block refs, an 8-second wait, and background completion on timeout.
- Debate method signature and clash fixture ship; implementation returns typed `NOT_IMPLEMENTED`, never creates a fake round.
- Library entry grounds from the existing knowledge index/chunks and uses `origin='library_source'`.

**Definition of done**

- Valid output uses one call; invalid output at most two; hard fail zero revisions. Budget, topicality, idempotency, retry-same-canvas, source ownership, and timeout/background tests pass.
- Clash fixture validates, while the stub has no externally routable endpoint.
- Notifications fire only ready/failed if user is not actively watching.

### Phase A5 — Isomorphic layout and export (Graph §B.2, §F)

**Goal:** identical layout in browser and server export.

**Files**

- Add workspace package `packages/canvas-layout/{package.json,src/index.ts,src/archetypes/*,src/*.spec.ts}`.
- Refactor `apps/student-web/src/lib/visual-studio/elk-layout.ts` and `layout-client.ts` into adapters over it.
- Add export processor/service under the existing visual module; reuse `document-render` only for document products, not graph SVG/PNG. PDF export may wrap the graph’s rendered SVG through the standard export worker/storage pattern without becoming a `document_render` issuance artifact.

**Behavior**

- Implement frozen algorithm map, pins, comparison groups, timeline dates, and deterministic ordering. No React/DOM in package.
- Export request `{format:'svg'|'png'|'pdf',revisionNumber?}` is idempotent, queues a snapshot-pinned job, stores through existing attachment storage, and returns a short-lived signed URL. Watermark obeys institution white-label config.

**Definition of done**

- Per-archetype snapshots are byte-stable across repeated Node/browser-compatible runs.
- Export uses the requested immutable revision, handles fonts/math, and never mutates graph/revisions.
- Large graph/export memory and signed-URL authorization tests pass.

### Phase A6 — Existing Visual Studio UX, Study mode, cards, and Library door (Graph §D–§F, §H.4)

**Goal:** extend the real canvas UI with the new contract rather than rebuild it.

**Files**

- Modify existing `apps/student-web/src/components/visual-studio/*`, `lib/visual-studio/*`, Lab route/home, Library material workspace, and standard Library curation component/hook.
- Add only missing group/timeline/pin editors and generation sheets; retain current React Flow nodes, accessibility, keyboard help, offline queue, and CSS.

**UX**

- Six-tile archetype chooser with reduced-motion static previews; source sheet; generating staged copy; retry same canvas; calm failure.
- Edit interactions block illegal edges live, but server remains authoritative. Autosave submits `baseRevision`; conflict sheet offers refresh/explicit reapply, never silent overwrite.
- Inline AI extend validates subgraph and full merge; one committed `ai_extend` revision, original untouched on failure.
- Study mode is read-only/self-checked and emits no `learn_attempts`. “Make flashcards” deterministically proposes candidates, then uses Library’s review-before-save curation; zero candidates shows exact guidance.
- Library “Study this” skips source picker, defaults mind map but offers all six, locks source, and returns to the same canvas route with a source chip.
- Offline list/last canvas is stale-readable; editing is disabled with “You’re offline — viewing only.”

**Definition of done**

- Keyboard/mobile/reduced-motion/accessibility tests cover create, edit, conflict, retry, Study, cards, and Library prefill.
- No cards save without explicit acceptance; saved cards use existing deck/flashcard/FSRS rows and source links.
- Existing canvas routes/legacy canvases remain usable.

### Phase A7 — Lab home, flags, hardening, and closeout (Graph §I–§J)

**Goal:** expose a resilient Lab hallway and production gates.

**Files**

- Add/modify `GET /student/lab/home` aggregation in the student Lab module, Lab home UI/nav, `packages/feature-flags` definitions/seeds, terminology defaults, and end-to-end/load/security suites.

**Behavior**

- One response supplies visible cards and canvas resume. Order: Mock Exams, Mind Maps, Debate; Entrance Prep slim link. Flags remove cards without gaps; unshipped enabled pillars show non-tappable Coming soon.
- Mind Maps resume is most recently edited non-deleted canvas. Resume failure degrades to plain card; hallway still renders.
- Configure `lab.canvas.enabled`, daily AI budget default 30, export watermark; sharing inherits Library config. No canvas-specific sharing switch.

**Definition of done**

- One-round-trip Lab home, flag matrix, tenant isolation/RLS, rate limits, idempotency, queue retry, accessibility, and 60-node performance gates pass.
- Add `IMPLEMENTED-GRAPH-PIPELINE.md` (or append a clearly delimited Graph section to root `IMPLEMENTED.md` if that remains the repository convention) listing built phases, migrations, deviations, exact frozen contract, Edrion Learn method, Debate stub, flags, operations/runbooks, and test commands.

## 5. Risks and landmines

| Risk | Guard |
|---|---|
| LLM emits coordinates or alternate hyperspec JSON | Strict canonical parser, generation-coordinate stripping, single prompt vocabulary, contract fixtures. |
| Zod/DB archetype drift | Startup `pg_get_constraintdef` parity assertion and migration test. |
| Two graph dialects emerge | One exported schema/type; Edrion Learn and Debate contract tests import it. |
| Revision races/lost edits | Row lock, `baseRevision`, 409 payload, central gateway. |
| History loss from old 20-cap/hard delete | Async 200-cap policy preserving anchors; soft delete and audited purge. |
| Layout differs in export | Node-safe package and byte-stable cross-runtime fixtures. |
| Bad repair silently changes meaning | Deterministic repairs are narrow and logged; >20% orphan drop triggers the one LLM repair; hard fail preserves original. |
| Cross-tenant source reference | Resolve/authorize source before row creation and repeat in worker; owner constraints on every read/write. |
| Sharing forks ACL/storage | Reuse Library snapshot share contract; do not implement until that exact seam is bound. |
| Debate reservation creates premature data model | Reserve only enum/method/fixture; no fake table or route. |
| Export jobs exhaust memory | Node/byte caps, concurrency limits, job timeouts, snapshot-pinned inputs. |

## 6. Acceptance and closeout checklist

- Check every Graph hyperspec acceptance item in §A–§J against an automated test or named manual QA script; record deviations, never silently waive.
- Contract: exact field/archetype parity, structural rules, clash fixture, generated budgets, byte cap, source provenance.
- Pipeline: one structure call plus at most one repair, zero revision on hard fail, retry same canvas, ready/failed notifications only.
- Revisions: initial revision 1, append-only commits, conflicts, undo/redo-as-new-commit, retention anchors, soft delete.
- Migration runner: chain CI, read migration, resumable/idempotent backfill, historical read-only migration, performance budget.
- UX: six archetypes, reduced motion, live structural blocks, offline read-only, Study mode, Library prefill, explicit card curation.
- Consumers: Edrion Learn 8-second typed timeout/background completion and stable Debate stub.
- Security/operations: institutional tenant context, independent owner isolation, source authorization, idempotency replay, rate/AI budgets, queue dashboards and retry runbook.
- Closeout record names all exposed Tier 3 contracts and confirms no feature created a second graph, card, Library, policy, or renderer substrate.

