# Petros Stage 7 handoff — learner-owned artifacts and persistence

Date: 2026-08-10  
Stage prompt: `docs/petros-stage-prompts/07-stage-07-artifacts-persistence.md`  
Entry gate: Stage 6 same-topic personalization was verified before implementation. Stage 8 entry points were not started.

## Scope delivered

Stage 7 now provides a durable `propose → learner edits → explicit selection → save` boundary for
flashcards, notes, and structured diagrams. Proposals remain outside learner-owned products, review,
search, export, and ownership counts until commit. Saved cards reuse the existing deck/card product,
notes reuse `library_notes`, and diagrams reuse `visual_canvases`; the Petros wrapper adds portable
identity, provenance, lifecycle, schedule, and revision history without creating duplicate product
silos.

The session close flow always reaches an `artifact_commit` postlude, shows a reviewable bundle with no
default selection, supports partial failure/retry and durable discard, and reports authoritative counts.
The learner library provides due review, topic mixing, exam-aware explanations, precise source links,
honest missing-source fallback, permanent deletion, and an accessible structured diagram canvas that
saves revisions back to the existing canvas row.

The authorized Super Admin view is aggregate-only and audited. It reports funnel counts by artifact
type, save failures and measured commit latency, scheduler/due/retention data, duplicate and sanitation
signals, source health, storage footprint/orphans/failures, and lifecycle jobs. Petros AI Routing now
registers, filters, routes, and meters the flashcard, note, and structured-diagram capability contracts.

## Domain and persistence design

### Contracts and ownership

- `petros.artifact.stage7.v1` is the saved-wrapper schema.
- `petros.artifact-proposal.stage7.v1` is the proposal/bundle schema.
- `petros.artifact.proposal.stage7.v1` records the Stage 7 logical prompt/projection version.
- Every row is scoped by institution and student. Student endpoints derive scope from the authenticated
  principal and do not accept an owner ID from the request.
- Proposals and saved wrappers are separate tables. Product rows are created only in an explicit commit.
- Saved wrappers have a portable UUID, product target, revision, lifecycle state, source references,
  content/prompt/schema versions, and review state.
- Sources are typed as session block, document page, or assessment. Transfer exports remove
  institution-restricted sources and every excerpt.
- Structured diagrams are JSON graphs (2–40 nodes, up to 80 edges) with unique safe IDs, valid endpoints,
  bounded labels/descriptions, and a mandatory accessible description. React renders text, never raw SVG
  or HTML. The API rejects markup, event handlers, JavaScript/data-HTML URLs, broken graphs, and oversize
  content without modifying the learner's draft.

### Tables

- `petros_artifact_bundles`: one session-close review bundle per session.
- `petros_artifact_proposals`: AI/logical proposals, original and edited content, explicit selection,
  optimistic version, save/discard/failure state, and generation contract.
- `petros_saved_artifacts`: portable wrapper around the existing flashcard, note, or canvas product.
- `petros_artifact_revisions`: immutable student-save history.
- `petros_artifact_commit_commands`: owner-scoped idempotency receipts and partial response replay.
- `petros_artifact_review_outcomes`: client-idempotent review history and exactly-once learner evidence.
- `petros_artifact_events`: content-free operational/provenance events.
- `petros_artifact_jobs`: lifecycle job receipts/status foundation.

RLS is enabled for Stage 7 tables. Application transactions set/use the same institution/student scope as
the surrounding student module. Failure telemetry that must survive a rolled-back request uses an
independent maintenance connection and contains only owner IDs, object IDs, kind, stable error code, and
duration/count metadata—never artifact text.

### Commit semantics

- Bundle/proposal revisions use optimistic concurrency.
- A commit has an owner-scoped UUID idempotency key.
- Selected proposals are committed in independent per-item transactions, so one storage failure does not
  roll back successful siblings.
- The unique proposal-to-wrapper constraint prevents product duplication. A new command against an
  already-saved proposal returns `already_saved` and emits `artifact.duplicate_prevented`.
- Stable storage codes use PostgreSQL code/constraint names and do not return raw database messages.
- Successful commits emit content-free duration and per-status counts; failures emit independent duration
  and stable code telemetry.

## Review scheduler

Scheduler version: `petros.review.exam-aware.v1`. The scheduler is deterministic code; it never spends an
AI call on review arithmetic.

- New cards return at the next 09:00 in the learner's timezone. If a known exam would occur first, the
  first review is safely placed before it.
- `Again` returns after at least ten minutes and increments lapses; `Hard`, `Good`, and `Easy` scale from
  the prior interval/ease.
- Confidence multiplies the interval: sure `1.0`, think-so `0.8`, guessing `0.55`.
- A future exam caps an interval to a safe fraction of the remaining time. Past exams are ignored.
- Due times never precede the review and are computed through timezone/DST boundaries.
- Pause/archive remove cards from the due queue without erasing outcomes; resume/restore re-enable them.
- Rebuild changes the stored scheduler version without deleting history.
- The due queue round-robins topics and explains that desirable retrieval difficulty to the learner.
- Review outcome idempotency is keyed by `clientReviewId`; learner-model evidence is attached once.

## Migrations, storage, and environment

Migrations:

- `packages/database/migrations/0193_petros_artifacts.sql` creates Stage 7 persistence, indexes, and RLS.
- `packages/database/migrations/0194_petros_visual_canvas_compat.sql` adds the missing `debate_id` compatibility
  column/FK/index needed by the existing typed `visual_canvases` insert path.
- `packages/database/migrations/meta/_journal.json` has journal entries 113 and 114.

No new environment variables or object-store secrets were added. Structured diagrams use existing database
canvas storage; Stage 7 creates no binary preview, so signed binary access is not invoked. Existing
`DATABASE_URL`, student auth, audit, feature-control, and Petros AI provider configuration remain required.
The local QA database was migrated with the repository migration command. Re-running it completed with no
new migration work and a zero-row visual backfill.

Local AI Routing acceptance configured the three Stage 7 capability contracts through the audited Super
Admin UI to the existing healthy structured-output route. This is environment configuration, not a seeded
provider secret or hard-coded provider dependency.

## Main implementation files

- `packages/schemas/src/petros-artifacts.ts`
- `packages/schemas/src/petros-review-scheduler.ts`
- `packages/schemas/src/petros-ai-routing.ts`
- `packages/database/src/schema/petros-artifacts.ts`
- `apps/api/src/modules/student/petros-artifacts/`
- `apps/api/src/modules/student/petros-loop/petros-loop.policy.ts`
- `apps/api/src/modules/student/petros-loop/petros-loop.service.ts`
- `apps/student-web/src/components/petros/petros-artifact-curation.tsx`
- `apps/student-web/src/components/petros/petros-artifact-library.tsx`
- `apps/student-web/src/components/petros/petros-repair-session.tsx`
- `apps/super-admin-web/src/app/(app)/ai/petros-artifacts/page.tsx`
- `apps/super-admin-web/src/components/petros-routing/petros-usage-budget-panel.tsx`

## Automated verification

Final commands and results:

| Command | Result |
|---|---|
| `pnpm --filter @edrion/database migrate` | PASS; migrations complete, visual backfill scanned 0 |
| `pnpm --filter @edrion/schemas typecheck` | PASS |
| `pnpm --filter @edrion/database typecheck` | PASS |
| `pnpm --filter @edrion/api typecheck` | PASS |
| `pnpm --filter @edrion/student-web typecheck` | PASS |
| `pnpm --filter @edrion/super-admin-web typecheck` | PASS |
| `pnpm --filter @edrion/schemas exec vitest run src/petros-artifacts.spec.ts` | PASS, 7/7 |
| `pnpm --filter @edrion/api exec vitest run src/modules/student/petros-artifacts/petros-artifacts.service.spec.ts src/modules/student/petros-loop/petros-loop.policy.spec.ts src/modules/student/petros-loop/petros-loop.service.spec.ts` | PASS, 33/33 |
| `pnpm --filter @edrion/student-web exec vitest run src/components/petros/petros-artifact-curation.spec.tsx src/components/petros/petros-repair-session.spec.tsx` | PASS, 13/13 |
| `pnpm --filter @edrion/api build` | PASS |
| `pnpm --filter @edrion/student-web build` | PASS; 32 pages, including `/petros/artifacts` |
| `pnpm --filter @edrion/super-admin-web build` | PASS; 33 pages, including `/ai/petros-artifacts` |
| `pnpm --filter @edrion/learn-evals run:smoke -- --baseline baseline/petros-stage5-smoke.json` | PASS; 16/16, mean 4.99/5, blocking 0, warnings 0, cost 0 µUSD |

Quality artifacts:

- `packages/learn-evals/eval-runs/petros-quality/petros-quality-smoke-fixture-42-1786350928152.json`
- `packages/learn-evals/eval-runs/petros-quality/petros-quality-smoke-fixture-42-1786350928152.md`
- `packages/learn-evals/eval-runs/petros-quality/petros-quality-smoke-fixture-42-1786350928152.csv`

The repository's explicit lint scripts are not currently runnable: the API workspace cannot resolve an
`eslint` executable, while both Next 14 workspaces open the first-run interactive ESLint configuration
prompt. No lint configuration was generated as an unrelated repository-wide change. Both Next production
builds still completed their built-in lint/type validation phase successfully.

## Browser acceptance performed

Browser QA used the signed-in local student and Super Admin sessions. Primary learner fixture:

- institution/student: Greenwood learner Aarav Sharma (`student1@greenwood.edu`)
- session: `96af9ac1-d47b-4967-804a-216036942f85`
- bundle: `d6663694-3b0b-4a81-912c-9f38a2966a87`
- saved flashcard: `adeb2755-4525-4c7f-a3a6-5baf7ab27c1b`
- saved diagram: `f44ce214-7e52-4fe5-8e34-9777631ab1e0`

Verified in the UI and reconciled with APIs/database/dashboard:

- Three proposals appeared unselected and ownership remained zero before save.
- Meaningful flashcard and diagram edits survived a genuine per-item failure/retry; only those two were
  owned. The note remained proposal-only and was later durably discarded.
- The saved diagram was reopened in the structured canvas, edited, and saved as revision 2. A hostile SVG
  label was rejected with the draft retained.
- The source-session button opened the exact block anchor. A restricted/missing page showed the honest
  fallback and did not expose its excerpt during transfer.
- A due card was revealed and submitted as `Again` with guessing confidence; it returned sooner and the
  UI removed artificial urgency afterward.
- A second learner saw zero artifacts; direct cross-owner source access returned 404.
- Idempotent re-commit returned the same artifact and `already_saved`.
- Normal export returned two; approved transfer returned two with restricted sources/excerpts removed.
- A second measured session created three proposal-only items, explicitly saved one edited card in 39 ms,
  discarded the other two, closed, and permanently deleted the disposable saved card.
- The artifact dashboard showed 6 proposals, 6 edit/selection actions, 3 historical explicit saves, 2
  rejected unsafe save attempts, 1 review, 1 duplicate stopped, 1 unavailable source, 0 orphaned products,
  39 ms average/max across 1 measured commit, 1 export, 1 transfer, and 1 deletion. Current storage remained
  two wrappers after cleanup.
- Routing showed 63 registered functions, the three artifact functions configured with primary routes,
  and function filters. Direct Stage 7 persistence reused the Stage 4 rendered bundle and made no duplicate
  artifact-generation provider call, so the filtered artifact-function QA slice honestly showed 0 requests,
  0 attempts, $0 cost, 0 ms latency, 0 retries/failures/fallbacks, and no cached tokens. Upstream PLAN/RENDER
  usage remained metered independently.
- The library and structured canvas were checked at 390×844 and 844×390; semantic controls remained
  reachable, labels remained associated, and reduced-motion CSS disables the only spinner animation.

Evidence directory: `docs/petros-stage-07-evidence/`

- `proposal-only.png`
- `edited-partial-save.png`
- `artifact-library-mobile.png`
- `review-rescheduled.png`
- `source-fallback.png`
- `artifact-dashboard.png`
- `artifact-routing.png`

## Comprehensive human/dashboard runbook

Use disposable students and objects for destructive steps. For every step, keep the browser Network panel,
the aggregate artifact dashboard, and Petros AI Routing open. Capture the named IDs and screenshots.

### 1. Proposal-only boundary

- **Navigate/setup:** Student Portal → Petros → complete a session to `artifact_commit`; record student,
  institution, session, bundle, and all proposal IDs. Open deck, notes, canvas, artifact library, export, and
  Super Admin → Petros Artifacts in separate tabs.
- **Actions:** Do not select anything. Refresh and resume once. Inspect desktop rail and mobile sheet.
- **Expected UI:** card/note/diagram say “Proposed by Petros” and “Edit before saving”; zero defaults are
  checked; rail says three proposals and zero saved.
- **Expected API/DB/dashboard:** bundle GET returns three proposal rows; no `petros_saved_artifacts`, product,
  due-review, search, or export row references those proposal IDs; dashboard proposal counts increment by kind
  while saves/storage do not.
- **Failure/capture:** any owned/search/export item before commit fails the gate. Capture bundle/proposal IDs,
  proposal-only UI, product searches, export count, and dashboard before-save totals.

### 2. Edit and selective save

- **Navigate/setup:** In the open bundle, choose meaningful card text and diagram node/description edits;
  leave the note unselected.
- **Actions:** keep edits, select only card+diagram, save, refresh, and open deck/library/canvas.
- **Expected UI:** per-item `saved` states show the learner text; note remains unsaved; authoritative count is 2.
- **Expected API/DB/dashboard:** two wrappers/products and revision-1 rows exist with session/source provenance;
  no note product; `artifact.saved` increments flashcard and diagram only.
- **Failure/capture:** original AI wording, a default save, or a note product is failure. Capture edited bundle,
  saved IDs/product IDs, deck answer, canvas graph, revision/source rows, and funnel by type.

### 3. Durable discard

- **Navigate/setup:** Keep at least one unsaved proposal in an open/partially-saved disposable bundle.
- **Actions:** click “Discard unsaved proposals”, refresh, resume the session, and re-open owned products.
- **Expected UI:** zero unsaved; discarded editor is disabled; status states nothing new entered products.
- **Expected API/DB/dashboard:** bundle/proposal state is discarded, no new wrapper/product/review/search/export
  entry exists, previously saved siblings remain.
- **Failure/capture:** a discarded item returning as editable or owned is failure. Capture bundle version/state,
  proposal state, before/after product counts, refresh screenshot, and `bundle.discarded` event.

### 4. Retry, timeout, and idempotency

- **Navigate/setup:** use a disposable selected bundle; inject one product-write failure or abort the browser
  after the request begins; retain the idempotency UUID.
- **Actions:** double-click/submit the same command, reload, then retry the failed proposal with a new command.
- **Expected UI:** successful siblings stay saved; failed item retains edits and has actionable retry; no whole-
  bundle success claim; the repeat says already saved rather than duplicating.
- **Expected API/DB/dashboard:** one command receipt per owner/key, one wrapper/product per proposal, partial
  result statuses, stable failure code, duplicate-prevention increment, commit latency sample.
- **Failure/capture:** duplicate products, lost edits, raw SQL messages, or rollback of the successful sibling
  fail. Capture command/proposal/artifact IDs, response statuses, constraints, failure/latency/duplicate totals.

### 5. Review scheduling and learner evidence

- **Navigate/setup:** save a card with timezone and a future exam; record first due and scheduler version.
- **Actions:** make it due in a disposable fixture, reveal, select confidence, submit Again/Hard/Good/Easy;
  repeat the same `clientReviewId`; compare with/without upcoming and past exams; pause/resume/archive/restore;
  run schedule rebuild.
- **Expected UI:** first review is next local study morning; fragile/failing cards return sooner; exam tightening
  is explained; mixed-topic difficulty is explained without urgency; paused/archived cards leave the queue.
- **Expected API/DB/dashboard:** due never precedes review, outcome persists once, duplicate review returns the
  same outcome, learner evidence attaches once, history survives lifecycle/rebuild, scheduler/version/due/
  retention metrics reconcile.
- **Failure/capture:** duplicate evidence/history, retroactive/impossible dates, AI scheduling calls, or hidden
  exam tightening fail. Capture card/outcome/evidence IDs, before/after state, timezone/exam, queue and dashboard.

### 6. Source navigation and degradation

- **Navigate/setup:** save artifacts from a session block, document page, and published result; make one source
  missing/restricted in a disposable fixture.
- **Actions:** open every source button and perform a transfer export.
- **Expected UI:** available links land on the exact block/page/result; unavailable source explains that the
  artifact remains the learner's; no dead inert citation.
- **Expected API/DB/dashboard:** source resolver enforces owner/tenant, returns `available/href/reason`, logs a
  content-free unavailable event, and transfer removes restricted sources/excerpts.
- **Failure/capture:** cross-owner resolution, stale navigation, leaked excerpt/label, or artifact deletion fails.
  Capture artifact/source index, destination URL/anchor, fallback, transfer JSON redaction, source-health count.

### 7. Diagram canvas, accessibility, and hostile fixtures

- **Navigate/setup:** open a saved diagram in `/petros/artifacts`; prepare a label such as
  `<svg onload=alert(1)>bad</svg>` in a disposable draft.
- **Actions:** edit title, node label/description, connection label, and accessible description; keyboard-tab
  through controls; save; rotate/mobile test; attempt hostile save; cancel/reload.
- **Expected UI:** structured canvas opens, every input has a label, revision increments, text is safely rendered,
  hostile save explains rejection and leaves the draft unchanged, screen-reader description remains meaningful.
- **Expected API/DB/dashboard:** optimistic revision and existing `visual_canvases` graph update together; revision
  history persists; sanitation/save-failure counters increment without content exposure.
- **Failure/capture:** raw SVG/HTML execution, broken edges, silent sanitization, lost description, or stale canvas
  fails. Capture artifact/canvas/revision IDs, desktop/mobile/landscape, keyboard order, accessibility tree, error,
  and sanitation totals.

### 8. Artifact operations dashboard

- **Navigate/setup:** Super Admin → AI Administration → Petros Artifacts with an `ai.view` employee; optionally
  filter by institution/date. Keep manual-run expected counts.
- **Actions:** refresh after each proposal/edit/save/failure/review/source/export/transfer/deletion operation.
- **Expected UI:** funnel by type, measured commit latency, review retention/due/scheduler, source/integrity,
  storage/orphans/failures, and jobs reconcile; page states aggregate-only/audited.
- **Expected API/DB/dashboard:** response contains counts/bytes/versions/statuses only; audit action is
  `petros.artifacts.dashboard.view`; no student content or provider secret appears.
- **Failure/capture:** inconsistent counts, missing failures, orphan count >0, content exposure, or unaudited read
  fails. Capture dashboard response/screenshot, audit ID, SQL aggregate counts, filter inputs, and expected delta.

### 9. Petros AI Routing

- **Navigate/setup:** Super Admin → Petros AI Routing; filter/search `Artifacts`; confirm flashcard, note, and
  editable diagram contracts have a healthy structured-output primary route and no provider name reaches student UI.
- **Actions:** use each function filter in Usage & Budgets; run route preview; exercise a live generated fixture if
  intentionally configured to call that function; compare upstream PLAN/RENDER when the bundle is projected from
  existing session output.
- **Expected UI:** each contract is independently filterable; cost, requests/attempts, latency, cached tokens,
  validation/failures, retries, and fallback reconcile. A zero-call deterministic projection must show zeros—not
  fabricated usage.
- **Expected API/DB/dashboard:** function registry keys are `artifact.flashcards.generate`,
  `artifact.notes.generate`, and `artifact.diagram.generate`; routes are audited; usage rows exist only for real
  provider attempts.
- **Failure/capture:** missing/unrouted functions, fake usage, unmetered real calls, mismatched totals, or provider
  details in student responses fail. Capture function IDs/routes/preview, filter screenshots, usage-event IDs and sums.

### 10. Privacy, export, transfer, and deletion

- **Navigate/setup:** use two students and, where available, two institutions; give owner A saved artifacts with a
  restricted source. Use only disposable objects for deletion.
- **Actions:** list/open/source/export as A; repeat direct IDs as B; perform normal export, approved transfer, then
  permanent deletion and refresh all products.
- **Expected UI:** B sees zero/404; A export remains portable; transfer notice explains redaction; deletion warns
  that it is permanent and then removes the wrapper/product.
- **Expected API/DB/dashboard:** owner/tenant predicates deny B, restricted sources/excerpts are absent from
  transfer, normal portable identity remains, product+wrapper deletion is atomic, export/transfer/deletion totals
  increment.
- **Failure/capture:** any cross-owner read, former-institution restricted data, orphan product/wrapper, or recoverable
  claim after hard delete fails. Capture principals/institutions, status codes, redacted export, IDs, before/after rows,
  job/event and dashboard totals.

### 11. Responsive, offline, slow-network, and assistive QA

- **Navigate/setup:** test session rail and library at desktop, 390×844 portrait, 844×390 landscape, 200% zoom,
  reduced motion, keyboard only, a real screen reader, slow 3G, then offline.
- **Actions:** edit all artifact kinds, select/deselect, rotate, refresh, go offline before “Keep edits”, reconnect,
  retry save, and double-click commit.
- **Expected UI:** desktop rail becomes the mobile sheet/stack without clipped controls; focus is visible/logical;
  labels/status/error announcements are spoken; reduced motion removes spinner animation; local edits survive
  refresh/offline and commit truthfully requires reconnection; no duplicate appears.
- **Expected API/DB/dashboard:** offline makes no ownership claim/write, reconnect sends the saved optimistic version,
  stale versions produce recovery, idempotency prevents duplicates, counts remain authoritative.
- **Failure/capture:** lost edits, horizontal control clipping, inaccessible dialogs, silent status, motion despite
  preference, false saved state, or duplicate product fails. Capture viewport/rotation/zoom, accessibility tree and
  screen-reader transcript, network waterfall/offline screenshot, local draft key, command ID, and final counts.

## Limitations and operational notes

- The in-app browser exposed viewport control but no network-throttling/offline capability and cannot substitute for
  a real screen-reader transcript. Offline edit retention is covered by the student component test; slow-network,
  full 200% zoom, and screen-reader voice checks remain explicit human-device steps in the runbook.
- The artifact-generation function slice was intentionally zero-cost in the captured fixture because Stage 7 reused
  already-rendered Stage 4 artifact residue. This is not a missing usage row: no separate provider attempt occurred.
- The test-only restricted source reference and due-time adjustment were created solely to exercise fallback/transfer
  and a due review. They contain no production learner content.
- The working tree contained unrelated pre-existing changes and untracked Stage 1–6 work. Stage 7 did not reset,
  delete, stage, or commit any unrelated file.

## Stage 8 prerequisites

Before Stage 8:

1. Deploy/apply migrations 0193 and 0194 and verify RLS/grants in the target environment.
2. Confirm the three artifact functions have an approved structured-output route and budget in that environment.
3. Run the focused tests, typechecks, three builds, and the Stage 5 quality comparison above.
4. Run the destructive/privacy portions of the runbook with disposable cross-tenant fixtures.
5. Complete real-device slow-network, 200% zoom, and screen-reader checks.
6. Treat saved wrapper/product IDs and review evidence as the Stage 8 entry-point source of truth; do not bypass the
   proposal/explicit-save boundary from any new entry point.

Stage 7 complete
