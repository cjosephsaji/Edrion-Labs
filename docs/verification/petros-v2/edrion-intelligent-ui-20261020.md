# Edrion Labs Intelligent UI

20 October 2026. Local Petros V2 presentation work following the approved question/context refinement. Existing assessment, source authority, teaching execution, and immutable-submission mechanisms remain the authority. No deployment or M6 rollout was performed.

## Automatic composition

The learning service now generates an optional, validated `learningUI` plan on each public session snapshot. The plan is versioned as `edrion.learning-ui.v1`, identifies its origin as `structured_content_composer`, and binds to the current session, revision, epoch, and canvas revision.

The composer selects the layout from the declared teaching capability and the structure already acknowledged on the public canvas. It uses the current strategy for the rationale and next move. Subject names and response strings are not layout selection features. A renamed subject or a new instance of a supported activity therefore uses the same design without a new page or custom lesson CSS.

| Learning structure | Automatically assembled presentation |
| --- | --- |
| Source reading | Purpose and rationale cards, exact passage excerpts, source comparisons, and existing reading controls |
| Independent question | Question card, supplied passage, authorized response fields, and submission feedback |
| Checked equations | Worked example, quantity or part/whole visualization, units, and separately saved student work |
| Relationships and arguments | Shared diagram editor, explicit connection sentences, editable reasoning, source context, and prior criterion feedback |
| Tables | Scrollable source data, selectable row comparisons, and editors restricted to declared writable cells |
| Graphs | Labeled axes and points, selectable observations, exact coordinate cards, and equivalent text data |
| Processes and code traces | A finite step sequence, recorded-state cards, previous/next controls, and a full text table |
| Registered experiments | Predict/change/observe/explain stages, readable parameter controls, checked result visualization, and local reflection |

The shared canvas preview also renders tables, graphs, and traces through these components. Its editable equation presentation no longer assumes a slope variable or a specific six-divided-by-three example.

Explorations get their own focus. The previous question and feedback remain available in disclosures, preventing an unrelated earlier question from being presented as the current graph or experiment task. Repair activities keep the question and “Already correct”/“Let’s revisit” groups visible.

The Edrion Labs Intelligent UI name appears quietly in About this demo and on the isolated format showcase.

## Content and result integrity

- The component plan is a closed typed contract. Unknown components, executable attributes, raw HTML fields, and duplicated element mappings are rejected.
- Blocks reference only currently visible public canvas elements. The client rejects stale or structurally inconsistent plans and recomposes compatible historical snapshots.
- Existing accepted-prefix rules still govern equation reveals. The UI plan cannot reveal a later worked step or create a fresh academic result.
- Source wording remains exact. Source text and labels render as text rather than executable markup.
- A table cell must be editable in both its content declaration and the current canvas invitation before the existing edit operation is offered.
- Experiment draft parameters never calculate a model result in the browser. The figures use checked server receipts, including the receipt’s inputs. Older receipts without inputs are labeled as earlier observations and are not drawn as current settings.
- Zero-memory results have an explicit empty state instead of a misleading proportional bar. Predictions, point selection, row comparison, and process navigation do not become assessment evidence.
- Genuine source citations and teaching limitations remain available outside preview mode. Qualitative interpretation continues to require qualified review.

## Meaning of “generated automatically”

This is an implemented content-aware UI composition layer. It assembles reusable, interactive components from structured lesson/activity data produced by the existing learning pipeline. It does not require a manually designed screen for each supported lesson.

It is not a new live model inference service or a generator of arbitrary frontend programs. New scientific models, activity types, or semantic structures still need the appropriate validated content/kernel contract. Unsupported material retains the readable source fallback. Source interpretation, academic qualification, and genuine-provider gates are unchanged.

## Verification

**361 checks passed: 205 frontend, 103 schema, and 53 API checks. No failed or skipped tests.** Three type checks and changed frontend source lint passed.

Evidence is in `edrion-intelligent-ui-20261020/`:

- `frontend-tests-complete.json`: the full Petros V2 frontend suites plus avatar regressions, including every supported format, protected cells, old receipts, and zero-memory behavior.
- `schema-tests.json`: all Petros V2 schema suites, including capability selection, renamed topics, accepted structure, stale-plan recovery, independent-task behavior, and unsafe plan rejection.
- `api-tests.json`: actual disposable-PostgreSQL integration and contract suites. These verify public plan bindings and staging, all registered demonstration families, original question retention, assisted repetition, and immutable wrong/corrected submissions.
- Frontend, API, and schema type checks; changed frontend source lint.
- `http-verification.json`: seven actual demo entries, authenticated public snapshots, frontend pages, and each page’s CSS files returned successfully. The experiment produced six VMs for 64 GB total and eight VMs for 80 GB total through real server commands.
- `*-preview-snapshot.json`: actual public snapshots. No authentication cookies are stored in these artifacts.
- `changes.patch`, `files-modified.json`, and `verification-summary.json`: scoped source changes, hashes, and final counts.

Browser automation previously rejected navigation of the local browser tab. This work did not bypass that restriction or use an alternate browser surface. These are component, integration, schema, type, lint, and HTTP checks; no new browser screenshots, visual viewport qualification, or screen-reader qualification are claimed.

## Review the formats

Open the [learning format showcase](http://127.0.0.1:4944/verification/petros-v2/learning-formats). Each card enters the actual isolated learning workflow with a synthetic example ready to inspect. Source reading, math, relationships, argument analysis, graph/table comparison, process tracing, and experiments are available.

Use the showcase links to sign into each synthetic learner. Work with one format at a time. The API restart replaced the disposable demo database, so previous session URLs require a new demo entry.

During manual visual review, check 1440, 1280, 768, 390, and 360 px widths; source and About dialogs; keyboard focus; table and graph inspection; process navigation; text-only mode; and enlarged text. Recheck the original memory lesson to confirm its accepted visual style remains intact.

All services remain bound to loopback. No production database, external model call, branch, commit, or publication was used.
