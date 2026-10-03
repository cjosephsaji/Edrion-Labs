# Main integration — 2026-10-03

Merge parents: `284da48` (published main) and `8125778` (completed Petros phases and student UI).

The merge preserves the document teaching, pilot, math, and preparation APIs already on main alongside the bounded extraction, source authority, execution, release, and continuity changes. Portal navigation and the rounded student UI remain on existing student pages; the dedicated document and pilot studios retain their standalone frames.

Document preparation uses bounded extraction output to create shared source revisions, including documents published before enrollment. Intent previews persist the previous strict schema while the current reader restores the complete authorized concept map from its pinned outline. Older response projections exclude new metadata and retain their original topic/citation limits. A new disposable-database regression verifies a 32-concept map, the rollback projection, and starting the final concept. Session disclosures include every page actually supplied for concept teaching.

The migration audit verifies all 153 tags from both parents, unchanged published main journal entries, continuous indices, and strictly increasing appended timestamps. SQL migrations remain unchanged from their source parent. Upgrade fixtures select migration boundaries by tag, and compare command snapshots in a stable order.

Validation:

- Schema, API, and student typechecks pass.
- Schema tests: 494 pass.
- API default suite: 713 pass; 227 gated integration cases skipped in this invocation.
- Student suite: 227 pass across 44 files.
- Focused document-intent tests: 15 pass after the final source-scope change.
- API production build passes.
- API/student lint has zero errors; existing warnings remain.
- Disposable PostgreSQL/Redis source integration and the literal S1–S11 journey: 101 pass; see `document-integration-tests.txt`.
- Isolated student production build passes; see `student-build.txt`.

Tests use disposable synthetic infrastructure. No shared database migrations or provider calls were performed. The isolated web build excludes root and application environment files. This integration does not close the pre-existing Firefox or external Phase 6 release gates; feature flags retain their configured defaults.

Raw iterative logs remain local and ignored; adjacent text files contain the final successful verification output.
