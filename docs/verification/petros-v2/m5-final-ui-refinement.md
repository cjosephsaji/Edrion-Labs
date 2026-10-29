# Petros V2 — M5 final UI refinement

Completed 2026-10-19T16:01:32.364557+05:30 (India Standard Time). **Isolated engineering verification only. Stop at M5; M6 requires explicit manual approval.**

Evidence: [`m5-final-ui-20261019T100410Z/`](m5-final-ui-20261019T100410Z/). Historical verification artifacts were preserved. The existing working checkout contained extensive prior changes; this task preserved a scoped before-copy and recorded its own [file inventory](m5-final-ui-20261019T100410Z/files-modified.json), [source hashes](m5-final-ui-20261019T100410Z/source-sha256.json), and [changes against that baseline](m5-final-ui-20261019T100410Z/changes-from-baseline.patch). Nothing was deployed, staged, or committed.

## Result and defects corrected

The existing forest-green identity, type, learning surface, companion placement and Explore → Your turn → Reflect structure remain. The changes address the remaining behavior and density problems:

- Selected choices previously received green styling before evaluation. Selection, saved work and evaluation pending now use neutral slate. Only a current authorized criterion result can produce a correct result.
- The feedback wrapper previously stayed green regardless of mixed or failed outcomes. It now uses correct/green, incorrect/rose, partial/amber, review/blue or pending/slate semantics. The Cloud responsibility error produces **Partially correct — 2 of 3 checked parts passed**, with a rose responsibility response and two green numeric responses.
- Criterion messages now sit directly under their corresponding answer or saved canvas element. A concise overall summary replaces the duplicate oversized criterion card; the qualification explanation expands on demand.
- The same element IDs can survive into a new teaching scaffold. Earlier evaluated work is no longer painted onto that newly editable scaffold. Instructional highlights are cleared in the presentation of committed diagram review.
- The diagram previously offered a direct replacement operation excluded by its reviewed invitation. The session adapter now translates an invited edge-label change into one atomic accepted **disconnect + connect** command. Protected node renaming remains unavailable when the invitation excludes it. No invitation or backend permission was broadened.
- Text alternatives now use a native modal reader with a single scroll surface, explicit close/Escape, background scroll restoration, focus return and keyboard wrapping. A preferred text presentation stays in the main page. No educational content is truncated.
- The registered resource simulation now renders a memory reservation bar and whole-VM blocks from the **server receipt**, including the validated parameters that produced it. Changes request a debounced checked update after a prediction. Draft inputs never calculate correctness or fabricate model output in the client.

## Semantic feedback architecture

`feedback-state.ts`, `feedback.tsx`, and `feedback.module.css` form the shared presentation system. They implement nine legitimate UI states: not selected, selected, saved, pending, correct, incorrect, partially correct, review required and assisted practice. Assistance is a separate qualification status; an assisted result never becomes independent verification.

The private deterministic evaluator publishes optional **response locations** (`target.fieldId` / `target.elementIds`) alongside each public criterion. These contain student field/element IDs only. Reference values, accepted alternatives, private checkers and rubrics remain private. Old projections without locations remain supported and retain their criterion list. There is no field-order inference, label comparison or client-side answer scoring.

An evaluation must match the current immutable submission, complete successfully, and have an authorized public origin/status before it admits correctness. Invalidated, unavailable, mismatched and incomplete evaluations stay uncertain. Review-required work retains its individually checked factual results while its overall interpretation stays unverified. A teaching scaffold cannot inherit an earlier submission's feedback merely because it uses the same element IDs.

Text labels and icons accompany colors. Controls remain labelled, feedback is associated with response fields, and the overall result announces changes politely.

## Density and reader behavior

Inputs and regular actions retain 44px interaction heights. Numeric response fields sit together on desktop and stack on narrow screens. Related controls use roughly 8–12px gaps; the action workspace uses 12–20px padding. Optional step explanations/annotations collapse into details; diagram annotations remain available for a selected element. Duplicate raw node cards were removed in favor of the existing diagram, equivalent node controls and complete text reader. Standalone registered tables remain available.

The graph's equivalent table opens in the reader when the visual presentation is primary. Text mode places it in normal page flow. Source citation, authorized source content, relationships, equations, annotations, graph data and process states remain available. Opening the teaching reader stops local demonstration playback and preserves current edits. The modal restores focus on both Escape and its close button, including React development Strict Mode. Keyboard wrapping also covers a long reader with only one focusable button.

## Petros integration

The existing rig, presentation governor, visibility checks and authored PNG poses remain in use. No new animation engine or dependency was added.

- Teaching cues reference accepted current targets; geometry and clipping still govern whether a pointing pose is admitted.
- During participation Petros yields with a quiet caption and neutral pose.
- While a submission is unconfirmed Petros acknowledges sending and waits for the actual saved evaluation.
- Correct results receive a restrained acknowledgement; failed results use the supported thinking pose and constructive wording; partial results name the checked count; review/pending results remain uncertain.
- Companion captions and status styling use the same public evaluation projection as the work.

Independent eye gaze, facial layers, articulated hands/writing, walking and lip synchronization remain unsupported. No such capabilities are claimed.

## Actual interactions verified

| Experience | Browser and server evidence |
|---|---|
| Cloud relationship | Source-backed progressive construction, node selection, keyboard movement, mouse dragging, undo/redo, connection-port dragging, edge selection and semantic change, wrong committed edge/rose result, separate corrected submission/correct result |
| Cloud mathematics | Reviewed equation steps, incorrect saved numerical work actually evaluated, rose step feedback, corrected saved value, separate immutable retry, verified bounded feedback and a less-supported next action |
| English argument | Extracted survey/claim passages, evidence → supports → claim relationship, saved warrant/uncertainty annotation, committed explanation and continued teacher-review requirement |
| Experiment | Prediction, actual registered memory kernel, six → eight checked VM blocks after total memory changes 64 → 80 GB, observation table and local comparison reflection |
| Process / graph | Accepted progressive trace steps, inspected current process state, previous/next navigation, pause/reload/resume, checked constant-rate graph and equivalent table reader |
| Input methods | A keyboard-only response/draft/reload/edit/commit flow, desktop mouse node and port dragging, actual undo/redo, and 360px Chromium touch-event node dragging |
| Recovery | Submission persistence after reconnect/reload at every required width; M4 regressions additionally cover actual queue loss, duplicate delivery, durable recovery and unavailable evaluation |

The default demo previously had only one reviewed practice candidate. The **isolated launcher only** now enables a second synthetically reviewed practice instance for the error → correction demonstration. It shares the same equivalence family, is always assisted, and preserves the first immutable submission. A dedicated database test verifies repeated/assisted exposure and unchanged first-response hash. The normal fixture default remains unchanged. The publication size/security bound remains intact; no database constraint was relaxed. Fresh independent verification remains unavailable in this demo release.

## Screenshots and recordings

[Open the recording review gallery](http://127.0.0.1:4945/review.html). All eight videos were captured continuously from the actual local application; the named files are exact copies of Playwright's recorded WebM outputs. No evaluation responses were mocked or stitched. H is explicitly identified as isolated typed UI fixtures.

| Recording | Content | Evidence |
|---|---|---|
| A | Incorrect responsibility → wrong relationship → corrected relationship and real feedback | [Video](m5-final-ui-20261019T100410Z/browser-final/A-cloud-diagram.webm), [mixed result](m5-final-ui-20261019T100410Z/browser-final/A-initial-partial.png), [wrong edge](m5-final-ui-20261019T100410Z/browser-final/A-incorrect-edge.png), [corrected edge](m5-final-ui-20261019T100410Z/browser-final/A-corrected-edge.png) |
| B | Equation error → separate corrected assisted retry → next instructional action | [Video](m5-final-ui-20261019T100410Z/browser-final/B-cloud-equation.webm), [wrong step](m5-final-ui-20261019T100410Z/browser-final/B-incorrect-step.png), [corrected step](m5-final-ui-20261019T100410Z/browser-final/B-corrected-step.png) |
| C | English evidence, warrant and review uncertainty | [Video](m5-final-ui-20261019T100410Z/browser-final/C-english-argument.webm), [screenshot](m5-final-ui-20261019T100410Z/browser-final/C-english-argument.png) |
| D | Bounded simulation, changed parameters and checked visual model | [Video](m5-final-ui-20261019T100410Z/browser-final/D-bounded-experiment.webm), [six VMs](m5-final-ui-20261019T100410Z/browser-final/D-model-six.png), [eight VMs](m5-final-ui-20261019T100410Z/browser-final/D-bounded-experiment.png) |
| E | Process navigation, pause/resume and graph/table | [Video](m5-final-ui-20261019T100410Z/browser-final/E-process-graph.webm), [process](m5-final-ui-20261019T100410Z/browser-final/E-process.png), [graph](m5-final-ui-20261019T100410Z/browser-final/E-process-graph.png) |
| F | Petros during teaching, editing and actual incorrect evaluation | [Video](m5-final-ui-20261019T100410Z/browser-final/F-petros-context.webm), [teaching target](m5-final-ui-20261019T100410Z/browser-final/F-teaching-target.png), [thinking reaction](m5-final-ui-20261019T100410Z/browser-final/F-evaluated-reaction.png) |
| G | 360px touch equation interaction and reader | [Video](m5-final-ui-20261019T100410Z/browser-final/G-mobile-360.webm), [screenshot](m5-final-ui-20261019T100410Z/browser-final/G-mobile-360.png) |
| H | All nine semantic feedback states | [Video](m5-final-ui-20261019T100410Z/browser-final/H-feedback-comparison.webm), [comparison](m5-final-ui-20261019T100410Z/browser-final/H-gallery.png) |

Additional real input recordings: [keyboard](m5-final-ui-20261019T100410Z/input-methods/keyboard.webm), [connection-port dragging](m5-final-ui-20261019T100410Z/input-methods/ports.webm), [360px touch dragging](m5-final-ui-20261019T100410Z/input-methods/touch.webm).

Desktop/mobile reflow screenshots: [1440](m5-final-ui-20261019T100410Z/browser-final/width-1440.png), [1280](m5-final-ui-20261019T100410Z/browser-final/width-1280.png), [768](m5-final-ui-20261019T100410Z/browser-final/width-768.png), [390](m5-final-ui-20261019T100410Z/browser-final/width-390.png), [360](m5-final-ui-20261019T100410Z/browser-final/width-360.png). Reader screenshots include [360px enlarged text](m5-final-ui-20261019T100410Z/accessibility-final/long-reader-360.png) and [primary long reader](m5-final-ui-20261019T100410Z/accessibility-final/primary-reader-360.png).

## Automated verification and performance

| Verification | Result | Raw evidence |
|---|---:|---|
| M4/M5 API session, assessment, canvas, privacy, ownership, migration/V1, reliability, queue and retry integration | **1320 passed, no skipped tests** | [JSON](m5-final-ui-20261019T100410Z/regressions-complete/api.json), [log](m5-final-ui-20261019T100410Z/regressions-complete/api.log) |
| Frontend Petros V2, Learning Studio and avatar regression | **182 passed** | [JSON](m5-final-ui-20261019T100410Z/frontend-verified.json), [log](m5-final-ui-20261019T100410Z/frontend-verified.log) |
| V2 public schemas, canvas reducer, timeline and safe feedback projections | **87 passed** | [JSON](m5-final-ui-20261019T100410Z/schemas.json), [log](m5-final-ui-20261019T100410Z/schemas.log) |
| Main browser scenarios and five-width matrix | **103 passed; zero runtime errors** | [Results](m5-final-ui-20261019T100410Z/browser-final/results.json), [public snapshots](m5-final-ui-20261019T100410Z/browser-final/public-snapshots.json) |
| Long content, selectable text, native modal focus, 200% root text enlargement, primary reader, five widths | **45 passed** | [Results](m5-final-ui-20261019T100410Z/accessibility-final/results.json) |
| Keyboard, saved draft recovery, mouse connection ports, undo/redo, mobile touch drag and private evaluation | **9 passed** | [Results](m5-final-ui-20261019T100410Z/input-methods/results.json) |
| Eight playable recording files | **8/8 decoded in the browser** | [Metadata](m5-final-ui-20261019T100410Z/media-check.json) |

API, frontend and schema TypeScript checks completed without errors. Changed frontend TypeScript files passed ESLint; the root Next rule emitted the existing missing-pages-directory advisory. The deliberate Redis-loss test logs connection-refused/crash messages while its recovery assertions pass. Frontend tests retain existing development warnings about React act/reduced motion. These are not hidden test failures.

Measured **389** successful loopback API request timings: median TTFB **109.5ms**, p95 **303.2ms**, maximum **1084.9ms**. [Raw measurement summary](m5-final-ui-20261019T100410Z/performance.json). This is a Next development build with disposable services and concurrent regressions, not a production load/FPS benchmark. Parameter geometry is drawn from checked receipts after a 450ms request debounce; it never runs a second client simulation kernel.

Initial browser attempts and the initial long-reader focus failure remain under `browser-1`, `browser-2`, and `accessibility`. The first opt-in retry fixture exceeded the existing publication bound; it was narrowed and reverified without relaxing that bound. **Use `browser-final`, `accessibility-final`, `input-methods`, and `regressions-complete` for final acceptance.**

## Exact local URLs and manual review

Services are left running on loopback. Use **127.0.0.1** consistently for the synthetic session cookie.

- [Cloud responsibility](http://127.0.0.1:4943/demo/cloud-a?fresh=1)
- [Cloud mathematics](http://127.0.0.1:4943/demo/cloud-b?fresh=1)
- [English argument](http://127.0.0.1:4943/demo/english?fresh=1)
- [Mobile](http://127.0.0.1:4943/demo/mobile?fresh=1)
- [Reduced motion/text presentation](http://127.0.0.1:4943/demo/reduced?fresh=1)
- [Petros contextual behavior](http://127.0.0.1:4943/demo/companion?fresh=1)
- [Isolated feedback gallery](http://127.0.0.1:4944/verification/petros-v2/feedback-gallery)
- [Long reader fixture](http://127.0.0.1:4944/verification/petros-v2/feedback-gallery?reader=long)
- [Recording gallery](http://127.0.0.1:4945/review.html)

The gallery routes return 404 unless both isolated verification and synthetic-demo flags are enabled. They do not bypass real student authentication or create production result pages.

1. Open Cloud responsibility. Choose **Provider**, enter **48** and **6**, and submit. Confirm the rose selected option, two green criteria, amber 2-of-3 summary and thoughtful Petros caption.
2. Select **Work on this with Petros** and reveal the accepted steps. Select/drag a node, use Undo/Redo, and connect guest OS to Provider. Select its edge and change its relationship. Commit through the reviewed practice task and submit an explanation. Confirm rose edge feedback. Ask Petros to revisit it, connect guest OS to Consumer using **connects**, and commit the separate corrected practice instance.
3. Open Cloud mathematics. Choose **Consumer**, enter **48** and **7**. After feedback choose **Work on this with Petros**. Commit the incorrect practice value to see rose step feedback. Revisit, save **6**, and commit the separate assisted retry. Confirm green bounded criteria and the less-supported next action. Independent verification remains explicitly unavailable when no eligible reviewed task exists.
4. Open English. Select the survey observation and explain its warrant/uncertainty. In the teaching workspace connect evidence to claim using **supports**; select a node to annotate the warrant, then commit an explanation. Qualitative review must remain required.
5. After a correct Cloud practice result, follow **Try with less support** to completion. Open **Explore a bounded experiment**, predict, run, then change totalGB to **80**. Confirm six → eight checked VM blocks. Open **Inspect a process trace** and **Compare a graph and table** to inspect process states and the equivalent table. Pause midway, reload and continue.
6. Try 1440, 1280, 768, 390 and 360px. Use keyboard controls/native selects, the complete reader, enlarged text, reduced motion and primary text mode. Closing a reader must restore opening focus. On the long fixture, verify paragraph 80 and the final paragraph are selectable and available. Reconnect/reload after saving or submitting and confirm the same persisted work.

`?fresh=1` closes only that synthetic actor's current session and starts another. Past submissions remain in the disposable database while the API is running. Restarting the API creates a new disposable cluster; it does not restore that old cluster.

### Restart if services have stopped

Use Node 24.21.0 and the existing local PostgreSQL 17 tools. Never load the workspace `.env`, use a hosted database, run the migration installer against a configured target or use real students. The launcher refuses configured DB/PG target variables and migrates only its newly allocated private cluster.

```sh
cd '/Volumes/Chris/Edrion Labs/apps/api'
export PATH='/Users/macbook/.local/bin:/private/tmp/verdine-pg-tools-045/Postgres.app/Contents/Versions/17/bin:/Volumes/Chris/Development/Toolchains/node-v24.21.0-darwin-arm64/bin:'"$PATH"
export PETROS_M5_EVIDENCE_DIR="/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m5-manual-$(date -u +%Y%m%dT%H%M%SZ)"
export PETROS_M4_EVIDENCE_DIR="$PETROS_M5_EVIDENCE_DIR"
export PETROS_VERIFICATION_EVIDENCE_DIR="$PETROS_M5_EVIDENCE_DIR"
node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/serve-petros-m5.ts
```

In a second terminal:

```sh
cd '/Volumes/Chris/Edrion Labs/apps/student-web'
PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 PETROS_STUDIO_INSTANCE=m5-final-ui NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4943 node node_modules/next/dist/bin/next dev -p 4944 -H 127.0.0.1
```

Recording gallery, if needed:

```sh
python3 -m http.server 4945 --bind 127.0.0.1 --directory '/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m5-final-ui-20261019T100410Z/browser-final'
```

## Preserved boundaries and limitations

M4 durable sessions, M5 decisions, source pins, current student authorization, server-accepted canvas operations/checkpoints, immutable submissions, private assessment, criterion outcomes, evidence admission, assistance/exposure rules, uncertainty, pause/resume and V1 compatibility remain in place and pass regression. No production database, deployment, unauthorized inference or M6 work occurred.

The sources are engineering CC0 fixtures and institutional review records are synthetic. Broad semantic tutoring, genuine provider receipts, independent academic qualification, the unresolved expert/source-quality gates, and production security/operational approval remain restricted. Deterministic canvas relations and numbers do not qualify the student's prose reasoning. English interpretation still requires a human. The experiment comparison is an explicitly local reflection, not an assessed submission. Process navigation inspects a finite reviewed trace; no student/model code executes.

Browser checks use Brave Chromium headless and mobile touch emulation. They establish labels, keyboard/focus behavior, reflow and selectable/full content; **physical phones, human screen-reader use, real browser zoom/assistive technology combinations and educational suitability remain for manual qualification**. The 200% check enlarges the root text size and is not claimed as a physical-device zoom test. No unsupported avatar capability is implied.

**Ready for manual M5 review. Do not begin M6 without explicit approval.**

## Files changed

The complete machine-readable list is in [files-modified.json](m5-final-ui-20261019T100410Z/files-modified.json). Source files:

- `apps/student-web/src/features/petros-v2/assessment-panel.tsx`
- `apps/student-web/src/features/petros-v2/petros-session-shell.tsx`
- `apps/student-web/src/features/petros-v2/petros-v2.module.css`
- `apps/student-web/src/features/petros-v2/studio-presentation.ts`
- `apps/student-web/src/features/petros-v2/studio-dialog.tsx`
- `apps/student-web/src/features/petros-v2/learning-stage.tsx`
- `apps/student-web/src/features/petros-v2/companion/companion.module.css`
- `apps/student-web/src/features/petros-v2/canvas/diagram-editor.tsx`
- `apps/student-web/src/features/petros-v2/canvas/teaching-canvas.module.css`
- `apps/student-web/src/features/petros-v2/canvas/code-trace.tsx`
- `apps/student-web/src/features/petros-v2/canvas/session-teaching-canvas.tsx`
- `apps/student-web/src/features/petros-v2/canvas/session-diagram-editor.tsx`
- `apps/student-web/src/features/petros-v2/canvas/session-teaching.module.css`
- `apps/student-web/src/features/petros-v2/canvas/graph-table.tsx`
- `apps/student-web/src/features/petros-v2/experiences/prediction-explanation.tsx`
- `apps/api/src/modules/student/petros-v2/petros-v2-assessment.service.ts`
- `apps/api/src/modules/student/petros-v2/petros-m5.fixture.ts`
- `packages/schemas/src/petros-v2/student-session.ts`
- `packages/schemas/src/petros-v2/teaching-engine.ts`
- `apps/student-web/src/features/petros-v2/feedback-state.ts`
- `apps/student-web/src/features/petros-v2/feedback.module.css`
- `apps/student-web/src/features/petros-v2/feedback.tsx`
- `apps/student-web/src/features/petros-v2/text-alternative.tsx`
- `apps/student-web/src/features/petros-v2/feedback-fixtures.ts`
- `apps/student-web/src/features/petros-v2/feedback-gallery.tsx`
- `apps/student-web/src/features/petros-v2/feedback.spec.tsx`
- `packages/schemas/src/petros-v2/feedback-projection.spec.ts`
- `apps/student-web/src/app/verification/petros-v2/feedback-gallery/page.tsx`
- `apps/api/scripts/verify-petros-m5-final-ui.mjs`
- `apps/api/scripts/verify-petros-m5-refinement-accessibility.mjs`
- `apps/api/scripts/verify-petros-m5-input-methods.mjs`
- `apps/api/src/modules/student/petros-v2/petros-m5-refinement.integration.spec.ts`
- `apps/api/src/modules/student/petros-v2/petros-v2-session.service.ts`
- `apps/api/src/modules/student/petros-v2/petros-v2-assessment.integration.spec.ts`
- `apps/api/scripts/serve-petros-m5.ts`
