# Graph Pipeline — Implementation Record

Phases A1–A7 of `PLAN-GRAPH-PIPELINE.md` (contract: `PLAN-GRAPH-JSON-CONTRACT.md`).

## Built phases

| Phase | Status | Summary |
|-------|--------|---------|
| A1 | Done | Frozen CanvasGraph v1 in `@edrion/schemas`, migration `0095_graph_pipeline.sql`, design tokens |
| A2 | Done | Forward migration runner + BullMQ schema backfill |
| A3 | Done | `VisualRevisionService` gateway, `409 REV_CONFLICT`, soft delete, 200-revision cap with anchors, tx-aware ledger |
| A4 | Done | `POST /student/canvas/*` routes, `visual-graph-repair.ts`, `CanvasGraphService` + Debate stub |
| A5 | Done | `@edrion/canvas-layout` package (isomorphic ELK), `VisualCanvasExportService` stub |
| A6 | Done | `CanvasConflictSheet`, autosave `REV_CONFLICT` handling |
| A7 | Done | `GET /student/lab/home`, `lab.canvas.enabled` flag (`0096_lab_canvas_flags.sql`) |

## Migrations

- `0095_graph_pipeline.sql` — `status`, `deleted_at`, `node_count`, `source_meta`, indexes
- `0096_lab_canvas_flags.sql` — `lab.canvas.enabled` feature definition

## Central revision gateway

```ts
VisualRevisionService.commit(principal, { canvasId, baseRevision, graph, title, archetype, reason })
VisualRevisionService.commitInitial(principal, { id, title, archetype, graph, origin, ... })
VisualRevisionService.softDelete(principal, canvasId, expectedVersion)
VisualRevisionService.commitMigration(canvasId)
```

Conflict response: `{ code: 'REV_CONFLICT', latest_revision, latest_graph }`.

## Canvas API (aliases `/student/visual`)

- `POST /student/canvas/generate` — idempotency key header, discriminated `source`
- `GET /student/canvas`, `GET /student/canvas/:id`, `GET /student/canvas/:id/revisions`
- `POST /student/canvas/:id/revisions`, `POST /student/canvas/:id/extend`, `DELETE /student/canvas/:id`

## Debate stub

```ts
CanvasGraphService.buildClashMap(roundId) // throws NOT_IMPLEMENTED
CanvasGraphService.validateClashFixture() // returns debateClashFixture
```

## Flags

- `student.surface.lab` — module visibility
- `lab.canvas.enabled` — Mind Maps card + canvas routes

## Test commands

```bash
pnpm --filter @edrion/schemas test src/student/visual-graph-contract.spec.ts \
  src/student/canvas-migrations/runner.spec.ts

pnpm --filter @edrion/api test \
  src/modules/student/visual-studio/visual-revision.service.spec.ts \
  src/modules/student/visual-studio/visual-revision-gateway.spec.ts \
  src/modules/student/visual-studio/visual-schema-backfill.processor.spec.ts \
  src/modules/student/visual-studio/visual-studio.service.spec.ts \
  src/modules/student/visual-studio/visual-studio.processor.spec.ts
```

## Deviations

- Export processor is queued stub only (`VisualCanvasExportService`); full signed-URL pipeline deferred.
- `generateCanvas` pre-allocates `canvas_id` in idempotent replay body when job has not finished (processor still assigns at completion).
- Lab home UI still static; API aggregation available at `GET /student/lab/home`.
