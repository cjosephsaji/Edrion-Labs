# Petros V2 — M2-F-A native DOCX, TXT and Markdown

13 October 2026, Asia/Kolkata. Authorized isolated engineering only. Detailed artifacts: [m2fa-evidence](m2fa-evidence/). No configured database, deployment, paid inference, academic approval, assessment authority or student release.

## A. Executive summary

Genuine DOCX, TXT and Markdown bytes now pass through the existing content adapter, isolated worker, preparation queue, immutable repository and source authorization architecture. Native structures, original SHA-256, versioned locators, uncertainty and capability restrictions are retained. DOCX is parsed as OOXML; PDF conversion is not its data source.

The selected primary suites passed **1222 tests, 0 failed, 0 skipped**. With the final additional security case, **1223 distinct passing test instances** were verified; repeated focused runs are deduplicated. Actual restricted-role database tests: **26 passed**. Final browser review: **33 checks passed**.

Engineering label recovery is **DOCX 84/84, TXT 7/7, Markdown 38/38**. These include declared inert-source and unsupported-feature classifications, with separate categories below. They are not independent academic fact-recovery or semantic certification. All clean documents remain extraction-partial where warnings or separate visibility channels exist. `teachingReady` remains false.

## B. Architecture

```mermaid
flowchart LR
  A[Current material or guidance authority] --> B[Ready scan receipt, type, size and hash]
  B --> C[Existing credential-free parser worker]
  C --> D[PDF / PPTX / DOCX / TXT / Markdown adapter]
  D --> E[Common bounded content units and native locators]
  E --> F[Existing immutable source revisions and repository]
  F --> G[Authorized retrieval and existing inspector]
  F --> H[Bounded interpretation eligibility]
  H --> I[Existing gateway, source approval and spending gates]
```

No second document database, intelligence service, authentication system, queue platform, model client or teaching engine was introduced. New format dispatch is based on current storage metadata plus native byte validation. Production remains disabled: the service requires test mode and explicit `PETROS_M2_ISOLATED_ENABLED=true`.

## C. DOCX extraction

Native paragraphs retain order, styles, established outline/heading levels, runs, bold/italic, superscript/subscript, tabs, explicit line breaks, language where present and source spans. Ordinary bold text is not made a heading. Numbering resolves abstract definitions, levels, overrides and starts; the fixture's ordered list starts at 3. Nested list relationships use actual numbering levels. Explicit complex restart rules are flagged and preserved as paragraphs instead of guessed numbers.

Tables retain grids, rows, columns, explicit header flags, authentic values, `gridSpan` and vertical merge relationships. The Availability cell spans two rows; Measurement spans two columns. Continuations are not duplicated as independent table facts. Nested tables are supported within the declared bound. Unmatched/legacy merges or revision-bearing tables are uncertain and excluded from semantic table eligibility.

DrawingML PNG/JPEG images retain relationship ID, part, MIME, original media hash, dimensions, alt text, inline/floating placement and native EMU sizes. Media can be regenerated only from the currently authorized original source. There are no unrestricted public asset URLs. Linked images are never fetched.

OMML retains **exact inert original XML**, with equation identity and native source span. It is not flattened into an invented formula. Oversized mathematical representations become unresolved native evidence. Hidden math is segregated. No symbolic solver, executable expression, verified math interpretation or automatic computation was added.

Headers, footers, footnotes, endnotes, comments, insertions, deletions and hidden text have separate channels. The explicit view policy uses unchanged main text; unresolved revision states are not assumed accepted or rejected. Hidden run styles and hidden math cannot become visible semantic evidence. Ordinary native retrieval excludes non-visible channels; staff/source inspection retains explicit channel labels.

Hyperlinks and bookmarks remain inert. Fields, text boxes/VML, content controls, advanced drawings/charts/objects and unsupported structures are exposed or flagged. Note-reference IDs are inspectable, but complete reference graphs are not qualified. Caption text/styles are recovered; target association is explicitly uncertain. Strict OOXML variants and non-UTF-8 XML parts are outside this qualified pilot. Macro/executable packages, encrypted/non-ZIP packages, external non-hyperlink relationships and unsupported media fail admission.

There is **no qualified Word renderer or pagination mapping**. The inspector supplies native structural reconstruction and exact original XML locations, not pixel-perfect Word output or guessed pages.

## D. TXT extraction

Policy: strict UTF-8, UTF-8 BOM, and BOM-declared UTF-16LE/BE. Malformed sequences, unpaired surrogates, truncated UTF-16, undeclared binary/control content and unsupported encodings are rejected. No lossy decoding or heuristic charset guessing occurs.

LF, CRLF, CR and mixed endings retain original identity. Byte offsets include BOM displacement; decoded offsets and columns use UTF-16. Astral Unicode boundaries are tested. Paragraphs and blank-line boundaries retain original text. Explicit `#` section markers can become headings; textual list markers are labelled conservatively. Plain prose is not turned into educational objectives or sophisticated hierarchy.

Limits include 20 MiB original bytes, 2 million characters, 100,000 lines and 16,000 UTF-16 units per line, subject to stricter unit/inventory/output bounds. Known binary/container signatures renamed as text fail type validation. Other encodings and sophisticated inferred/code structure are unsupported.

## E. Markdown extraction

CommonMark/GFM parsing uses pinned `mdast-util-from-markdown 2.0.3`, `mdast-util-gfm 3.1.0` and `micromark-extension-gfm 3.0.0`, already present in the workspace's frontend dependency tree. The [parser documentation](https://github.com/syntax-tree/mdast-util-from-markdown) and [GFM extension documentation](https://github.com/syntax-tree/mdast-util-gfm) describe the underlying syntax-tree interfaces.

Headings, paragraphs, ordered/unordered/nested lists, blockquotes, fenced and indented code, inline code, emphasis/strong, escapes, thematic breaks, tables, alignments, links and reference links are represented. Original unnormalized source ranges, syntax identities and parent heading/list/fence references are retained. Code lines have native references. Logical CommonMark code text may normalize line endings/indentation; the complete original fence/source and raw line ranges remain separately available and tested.

Links/images remain inert. Remote images are unfetched; local references do not grant filesystem or attachment access. Unsafe schemes and traversal destinations are labelled unsafe. Raw HTML, scripts and event handlers are inert source text with unsupported warnings. Empty fences are retained as empty inert syntax. Inline math remains literal source. No HTML adapter, code executor or math evaluator was added.

The existing upload policy admits **`.md`**, not `.markdown`; the latter is deliberately not enabled. AST depth, nodes, nesting, block length, table dimensions, links and output are bounded.

## F. Common schemas

`sourceLocatorSchema` adds versioned `docx`, `txt` and `markdown` discriminators using `petros.native-locator.v1`. DOCX references part/hash, native path/XML span, paragraph/run/table/cell/object identities, ancestry and UTF-16 offsets. TXT/Markdown references original byte span, encoding, decoded span, line/column and newline convention; Markdown also pins syntax node and parser version.

Optional `nativeLocators` and native metadata retain compatibility with old revision/unit versions. No defaults repin historical hashes. Unknown kinds fail strict parsing. Exact inventory membership, source pins, original text/byte correspondence and XML spans are validated. Native semantic references resolve exact run/cell/code-line locations; legacy references retain their existing locators.

Display/cite/native highlight are separate from edit/explain/compute/assess. New units acquire no teaching or assessment approval.

## G. Database integration

The existing bounded revision JSON accommodates these formats without a new table. However, the existing database trigger explicitly rejects new locator kinds and the preparation constraint rejects new stage names. Therefore [m2fa-native-locators.sql](../../../packages/database/proposals/m2fa-native-locators.sql) is a **separate, unregistered SQL proposal** extending only the invoker provenance function and bounded stage discriminator. Exact JSON equality rejects truncated locator subsets. Historical migrations and the 159-entry journal remain unchanged.

The proposal and the separate M2-G staff reservation proposal were rehearsed only in newly initialized disposable PostgreSQL clusters. Application operations use real **`edrion_app`, NOBYPASSRLS**, never the fixture owner. Owner connections only initialize fixtures and simulate external publication/withdrawal changes.

The 26 integration cases cover all three formats, immutable revisions, rollback/retry, duplicate preparation, current-source replacement, correction lineage, forged and incomplete locators, cross-institution and nonrecipient denial, exact native inspection, denied asset access, stale publication, source withdrawal and existing PDF/PPTX compatibility. Actual guidance identities remain `guidance_attachment:<objectId>:<publicationVersion>` with null class-material IDs. Assignment, institution, class, subject, object, publication and recipient checks remain active.

## H. Queue integration

The existing `knowledge.content.m2.prepare` job and durable preparation owner dispatch all five formats. Queue payloads contain IDs only. New native stages identify format detection, extraction, structural validation, unit construction, semantic eligibility and persistence. No Word rendering or OCR stage is claimed when it did not run.

Duplicate delivery returns the existing receipt or `not_claimed`. Private Redis/BullMQ tests exercise expired lease recovery and reject late fences. All three native formats test withdrawal/fence/cancellation/hash mismatch and transaction rollback with actual file parsing. Source authority is checked before reading and again before atomic persistence/publication. Parsing and model work do not span database transactions.

This is local recovery evidence; full application restart/recovery qualification remains an original open gate.

## I. Security

ZIP preflight bounds entries, expanded/individual sizes and ratio before decompression; checks names, duplicate entries, local/central boundaries and encryption. CRC validation, content types, root/main relationships and all XML content parts are checked. DTD/entities, malformed XML, traversal, active/embedded executable content (including disguised executable magic), external resources, corrupt/oversized media and excessive table/XML/paragraph structures fail safely.

Text encoding, line/character/size limits and Markdown nesting/tables/URLs/raw HTML are tested with genuine bytes. Instructions to reveal private answers remain untrusted source; comments, deletions, hidden styles and hidden math do not enter visible interpretation. Model approval fields are rejected. Safe partial cases are reported, not silently corrected.

Native parsers reuse the credential-free OS boundary, denied network access, installed-package read roots, 128 MiB JS heap, 15-second CPU bound, 20-second worker deadline, 256 MiB RSS bound and 16 MiB output limit. Original input remains ≤20 MiB; native inventory ≤512 locators/64 KiB and canonical units ≤96 KiB. Temporary directories are cleaned on success/failure/timeout/cancellation. No application credentials are supplied.

The dependency audit reports existing monorepo advisories (6 low, 45 moderate, 51 high, 9 critical); none target the newly pinned Markdown parser packages. This does not certify deployment security or justify unrelated dependency upgrades.

## J. Interpretation

The existing `petros.m2.interpretation.v2` / `document.understand` gateway accepts bounded visible native units and exact native semantic anchors. A caller may select an authorized unit; at most eight units, bounded anchor subsets and the existing 48 KiB request limit apply. Source sharing, spending, route and current preparation/reservation checks remain required.

Controlled responses exercise valid/forged/cross-source references, failed reservations, unavailable/unsupported routes, private channels, corrected immutable interpretations, revocation during dispatch and approval fabrication. DOCX runs/cells and Markdown code lines are persisted with exact source pins.

**Genuine model inference: 0. Paid provider calls/spending: 0. Independent academic approvals: 0.** Controlled transport is explicitly labelled. Parsing correctness and mechanical citation validity are not semantic entailment or teaching approval.

## K. Accuracy

| Format | Declared engineering labels | Native labels | Inert source labels | Unsupported notices |
| --- | --- | --- | --- | --- |
| DOCX | 84/84 (100%) | 63/63 | 18/18 | 3/3 |
| TXT | 7/7 (100%) | 7/7 | 0/0 | 0/0 |
| Markdown | 38/38 (100%) | 28/28 | 6/6 | 4/4 |

Labels cover three DOCX subjects, one topic-neutral TXT body and two Markdown subjects, including neutral documents with no Cloud/English labels. Gold values and selected expected native locations are authored independently of parser output. Every admitted unit is checked for provenance; all expected native path/line tests pass. No new-format OCR or vision recovery is counted.

The six clean documents produce 147 canonical units. No declared important label is silently omitted. Known unsupported features retain visible notices; the absence of a missed engineering label is not a claim of full Word/dialect coverage.

Independent qualified review is **pending**. The master ≥95% independently reviewer-labelled fact recovery and genuine semantic quality gates remain open. Existing Cloud native **19/21**, English **18/18**, uncalibrated Cloud OCR and unresolved flattened relationship remain unchanged.

## L. Source comparisons

Twenty genuine altered files cover nine DOCX changes (cell, heading, paragraph insert/delete, list, image, math, revision state, footnote), four TXT changes (statistic, negation, encoding, newline), and seven Markdown changes (heading, code, cell, URL, language, quote, unsafe HTML).

Original hashes and representations change; actual changed values/code are asserted. Original snapshots remain immutable. DB tests preserve old physical units while current entitlement rejects obsolete revisions and returns current values. Encoding/newline-only changes are distinguished from logical payload changes. Existing interpretations cannot inherit a new source hash/revision silently. Detailed comparisons: [format-evaluation.json](m2fa-evidence/format-evaluation.json).

## M. Inspector and demonstrations

Current localhost: **http://127.0.0.1:4873**. Reproduce with the tested Node 24.21 runtime:

```sh
cd "/Volumes/Chris/Edrion Labs"
/tmp/node-v24.21.0-darwin-arm64/bin/node apps/api/scripts/inspect-petros-m2.mjs --m2fa --serve --port 4873
```

Use a supported Node 24.21+ installation if the temporary runtime has expired. The local `node@24` symlink currently points to Node 25; it is not the verified runtime.

1. Select `m2fa/cloud-notes.docx`, then its table and `99.9` cell. Compare the original XML cell, native row/column/path, merged cells and embedded image. Select equation and separate comments/hidden/revision channels.
2. Select `m2fa/cloud-notes.txt`, then Availability. Inspect encoding, original bytes, line/column and exact span. Switch to `m2fa/text-statistic.txt` to observe 97.3 and the new hash.
3. Select `m2fa/argument-notes.md`, then the Python code unit. The complete original fence is shown exactly, alongside logical code and raw line anchors. Inspect headings, lists, table, quote and inert links/images.
4. Select malformed TXT or raw HTML/unsupported DOCX fields to inspect rejection or partial support.
5. Expand restricted-role evidence to review current tenant/recipient/withdrawal/asset denials from actual DB tests.
6. Select `cloud-models.pptx` and `argument.pdf` to inspect existing rendered modes and unchanged recovery.

The 33 browser checks cover keyboard selection, meaningful table headers, preserved whitespace, Unicode, 360px layout, enlarged text, explicit source details, no remote fetching/DOM execution, fixed-source path denial and absence of upload endpoints. Historical default and `--m2g` modes/output directories are retained. Screenshots: [DOCX](m2fa-evidence/inspector-docx.png), [TXT](m2fa-evidence/inspector-txt.png), [Markdown](m2fa-evidence/inspector-markdown.png), [unsupported](m2fa-evidence/inspector-unsupported.png), [360px](m2fa-evidence/inspector-360px.png). Brief real browser recordings are under [walkthrough](m2fa-evidence/walkthrough/).

## N. Performance

Twenty repeated clean-file samples per format, one benchmark worker at a time, Node v24.21.0, darwin/arm64, Apple M4. Empirical p95 uses sorted sample rank; it is not population certification or a one-off measurement.

| Format | n | Validation p95 ms | Native syntax parse p95 ms | Reconstruction p95 ms | Total p95 ms | OS parser peak KiB | Characters | Units | Evidence bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| docx | 20 | 225.90 | 6.13 | 4.13 | 358.88 | 101424 | 677 | 34 | 99511 |
| txt | 20 | 0.45 | 0.00 | 0.63 | 89.97 | 49472 | 169 | 5 | 6012 |
| markdown | 20 | 0.62 | 17.42 | 1.82 | 322.21 | 67696 | 638 | 20 | 44275 |

TXT syntax parsing is its strict decoder/line reconstruction, so the separate syntax-tree parse metric is 0. OS `resourceUsage.maxRSS` measures parser peak memory; 100 ms process-tree samples can miss a fast TXT worker and are separately recorded, never described as zero memory use. Total includes sandbox/runtime/schema overhead; phase percentiles do not sum to total.

| Queue source | n acknowledgments | BullMQ dispatch p95 ms |
| --- | --- | --- |
| structures.pdf | 20 | 0.345 |
| m2fa/cloud-notes.docx | 20 | 0.250 |
| m2fa/cloud-notes.txt | 20 | 0.183 |
| m2fa/argument-notes.md | 20 | 0.241 |

These measure private Redis dispatch acknowledgment, not a qualified HTTP upload acknowledgment. One complete enqueue-to-preparation sample per native format: cloud-notes.docx: 2226.62 ms; cloud-notes.txt: 1100.94 ms; argument-notes.md: 1812.85 ms. These are individual observations, **not p95**. Optional Word rendering, new-format OCR and genuine model inference were not run; their latency is unavailable. See [performance.json](m2fa-evidence/performance.json) and [database-evidence.json](m2fa-evidence/database-evidence.json).

## O. Tests, commands and warnings

| Primary suite | Passed | Failed | Skipped |
| --- | --- | --- | --- |
| api-regression-tests | 294 | 0 | 0 |
| database-tests | 26 | 0 | 0 |
| m1-regression-tests | 19 | 0 | 0 |
| v1-source-regression-tests | 100 | 0 | 0 |
| schema-regression-tests | 578 | 0 | 0 |
| evaluation-regression-tests | 46 | 0 | 0 |
| frontend-regression-tests | 159 | 0 | 0 |

Final focused native tests: 102 passed; worker/metrics compatibility: 108 passed; final security: 22 passed, including the additional hidden-math case. Rechecks are not added blindly to totals. Final distinct case instances: **1223 passed, 0 failed, 0 skipped**.

```sh
/tmp/node-v24.21.0-darwin-arm64/bin/node apps/api/scripts/verify-petros-m2fa.mjs
/tmp/node-v24.21.0-darwin-arm64/bin/node apps/api/scripts/verify-petros-m2fa-checks.mjs
cd apps/api
/tmp/node-v24.21.0-darwin-arm64/bin/node scripts/verify-petros-m2fa-inspector.mjs
/tmp/node-v24.21.0-darwin-arm64/bin/node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/benchmark-petros-m2fa.ts
```

Verification scripts whitelist environment variables, refuse target arguments/configured connections, and use private PostgreSQL/Redis. Exact suite arguments/environments are in [verification-commands.json](m2fa-evidence/verification-commands.json); typecheck/build/lint commands, exit codes and timings are in [final-checks.json](m2fa-evidence/final-checks.json). The benchmark must run in a clean test environment without configured DB/provider variables; for example:

```sh
env -i PATH=/tmp/node-v24.21.0-darwin-arm64/bin:/opt/homebrew/bin:/usr/bin:/bin HOME=/Users/macbook LC_ALL=C LANG=C NODE_ENV=test /tmp/node-v24.21.0-darwin-arm64/bin/node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/benchmark-petros-m2fa.ts
```

Run this command from `apps/api`. An attempted final inspector restart under the workspace sandbox failed with worker `EPERM`; after the user enabled command execution, the unchanged credential-free parser boundary and all 33 browser checks passed again.

API, schemas, student, institution portal and learn-evals typechecks passed on Node 24.21. API build and runtime asset copying passed, including all three new worker files. Focused TypeScript lint passed with zero warnings. No full Next.js production build or staging rollout is claimed; frontend tests/typechecks cover affected public contracts.

Initial attempts retained in evidence: missing C locale caused disposable PG startup failure; a native table assertion assumed DOCX for Markdown; preliminary Node 25 runs used a misleading local symlink; V1 5-second harness timeouts required a 20-second test timeout without changing parser/DB limits; a concurrent voice test failed and passed with the frontend suite run sequentially. CJS deprecation, React `act`, reduced-motion and existing Redis teardown warnings remain recorded. None are hidden as a final successful run. No final selected tests are skipped.

## P. Code inventory and preservation

Baseline: branch `main`, HEAD `444ed328e714ad8c1a37985cb082d49536d6e6f0`, 947 status entries, 5314 captured source/evidence hashes. No reset, stash, discard, stage or commit occurred. No missing/unrelated changed files remain. Both master documents, historical evidence, existing original PDF/PPTX fixtures, migration journal and migration SQL match captured bytes.

An existing M2-G visual test unexpectedly overwrote seven ZIP/JSON pairs. Their original bytes were recovered **only after matching their exact captured SHA-256 hashes**; fresh generated results are retained separately. [Restoration evidence](m2fa-evidence/historical-visual-restoration.json) documents this mistake and recovery. The reproduction script now snapshots/restores historical visual and M1 outputs in `finally`.

Modified pre-existing files:

- `apps/api/package.json`
- `apps/api/scripts/inspect-petros-m2.ts`
- `apps/api/scripts/petros-m2-inspector.html`
- `apps/api/src/modules/integrations/petros-m2-document-understanding.integration.spec.ts`
- `apps/api/src/modules/petros-ai-routing/petros-ai-routing.repository.ts`
- `apps/api/src/modules/student/knowledge/adapters/content-adapter.ts`
- `apps/api/src/modules/student/knowledge/knowledge-document.module.ts`
- `apps/api/src/modules/student/knowledge/knowledge-pdf-process.ts`
- `apps/api/src/modules/student/knowledge/petros-content-intelligence.service.ts`
- `apps/api/src/modules/student/knowledge/petros-content-interpretation.ts`
- `apps/api/src/modules/student/knowledge/petros-content-unit.repository.ts`
- `apps/api/src/modules/student/knowledge/petros-m2-test-helpers.ts`
- `packages/schemas/src/petros-v2/content.ts`
- `pnpm-lock.yaml`

New implementation/evaluation/scripts:

- `apps/api/scripts/benchmark-petros-m2fa.ts`
- `apps/api/scripts/record-petros-m2fa-baseline.mjs`
- `apps/api/scripts/restore-petros-m2fa-visual-evidence.py`
- `apps/api/scripts/summarize-petros-m2fa-evidence.py`
- `apps/api/scripts/verify-petros-m2fa-inspector.mjs`
- `apps/api/scripts/verify-petros-m2fa-checks.mjs`
- `apps/api/scripts/verify-petros-m2fa.mjs`
- `apps/api/src/modules/student/knowledge/adapters/docx-content.adapter.spec.ts`
- `apps/api/src/modules/student/knowledge/adapters/docx-content.adapter.ts`
- `apps/api/src/modules/student/knowledge/adapters/m2fa-docx.cjs`
- `apps/api/src/modules/student/knowledge/adapters/m2fa-native.cjs`
- `apps/api/src/modules/student/knowledge/adapters/m2fa-test-fixtures.ts`
- `apps/api/src/modules/student/knowledge/adapters/m2fa-text.cjs`
- `apps/api/src/modules/student/knowledge/adapters/markdown-content.adapter.spec.ts`
- `apps/api/src/modules/student/knowledge/adapters/markdown-content.adapter.ts`
- `apps/api/src/modules/student/knowledge/adapters/native-file-security.spec.ts`
- `apps/api/src/modules/student/knowledge/adapters/native-file.adapter.ts`
- `apps/api/src/modules/student/knowledge/adapters/txt-content.adapter.spec.ts`
- `apps/api/src/modules/student/knowledge/adapters/txt-content.adapter.ts`
- `apps/api/src/modules/student/knowledge/petros-content-format-expansion.spec.ts`
- `packages/database/proposals/m2fa-native-locators.sql`
- `packages/learn-evals/src/petros-v2/fixtures/generate-m2fa-fixtures.py`
- `packages/learn-evals/src/petros-v2/format-expansion-a.ts`

The 53 new genuine fixture files and their manifest are under `packages/learn-evals/src/petros-v2/fixtures/sources/m2fa/`; all are original CC0 engineering material. Complete filenames/hashes: [code-inventory.json](m2fa-evidence/code-inventory.json). Audit: [preservation.json](m2fa-evidence/preservation.json).

Three direct parser dependencies were added with exact MIT-licensed version pins, reusing existing installed parser families. Existing JSZip 3.10.1, Sax 1.6.0, Mammoth 1.12.0 dependency location and canvas 0.1.100 were reused. License/version details and rationale: [baseline.json](m2fa-evidence/baseline.json). Lockfile additions are consistent; no unrelated dependency upgrades were made.

## Q. Existing blocker preservation

- Cloud native PDF/PPTX remains 19/21; English remains 18/18. Cloud OCR is separate and uncalibrated; flattened image relationship unresolved.
- Genuine provider inference, semantic support certification and independent academic review remain pending.
- Source-sharing/spending approvals, actual provider-route qualification and approval issuers remain unavailable.
- The M2-G staff reservation SQL proposal remains unregistered and unapplied on configured environments; the new native locator proposal also needs independent review/install approval.
- Configured-target migration/RLS/role/security reconciliation, staging/production, legacy PPT qualification, full restart/recovery, storage/scanner and release gates remain open.
- Student-facing V2 routes, teaching/assessment authorization and M2-F-B/C remain disabled/deferred.

## R. M3 readiness

The implemented native-source pattern is suitable for **isolated M3 proposal engineering after user review**, with immutable source pins and honest unsupported channels. This is readiness to build reviewed proposals, not verified educational meaning, qualified teacher approval or release. M3–M8 were not started. Stop here and await review before M2-F-B, M2-F-C or M3.
