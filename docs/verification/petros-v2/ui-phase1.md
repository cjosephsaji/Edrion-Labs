# Petros V2 — M0-P UI Refinement Phase 1

Implemented and verified on 10 October 2026. **Phase 1 is ready for visual approval. Phase 2 and M1–M8 have not begun.**

Working preview: [localhost:3011/petros/companion-playground](http://localhost:3011/petros/companion-playground), using the existing local student login and tester gate. The user's signed-in browser was checked after reauthentication: the sidebar shows the current account's permitted display name and academic details from `useStudentMe`, and its profile link remains intact. Automated screenshot identities are explicitly synthetic and belong only to the disposable QA server.

## Implemented behavior

- **Direct diagram editing:** “Build a diagram” supports double-click/Enter/F2 rename inside a native input, Enter save, Escape cancel, pointer drag, draggable connection handles, tap-to-connect, and an inline relationship selector. A small selection toolbar exposes rename, connect, directional movement and permitted deletion. Large editing forms are removed. Keyboard shortcuts and the secondary text disclosure provide alternatives.
- **Diagram navigation:** fit-to-content, zoom, pointer/keyboard pan and fit/reset controls. Connectors track moved nodes, use arrowheads and route around intervening nodes; short or parallel connections curve to make room for labels. Dragging resolves overlap only for the moved node; directional moves that would overlap another node are rejected. Semantic coordinates stay bounded and persist. Editing preserves the current view, and fresh teaching examples reframe.
- **Bounded undo/redo:** up to 32 acknowledged practice states, recorded as revisioned receipts in the existing versioned local checkpoint. New edits clear redo. History cannot cross teaching/submission boundaries or alter protected fields. Editable student relationships join the invitation's allowed region; protected teaching connections remain protected.
- **Inline math:** existing trusted mathematical rendering shows progressive checked transformations. The designated final value is a native input inside `m = […]`; compact reasoning and demonstration feedback sit beside that step. Selecting previous steps preserves input. Arithmetic, denominator constraints and public fixture validation remain in place.
- **Compact learning shell:** a 60px route-scoped header, small lesson title, segmented scenario selector, collapsible 64px navigation rail, dominant teaching canvas, simultaneous conversation/source context, pinned playback and Focus Mode. Interrupt exits Focus Mode and brings the question input into reach.
- **Profile:** the expanded sidebar wraps the authenticated display name and permitted academic details; collapsed mode shows the account avatar with an accessible profile label. Existing authentication, permissions and profile navigation continue to own the identity.
- **Responsive scrolling:** desktop has independent lesson and right-panel scroll areas, with pinned playback. Mobile/tablet keep the main content scrollport and a bounded conversation/source panel that scrolls independently. The diagram has touch controls without requiring hover. Source highlighting, existing artwork, reduced motion, interruptions and old checkpoint recovery are retained.

## Follow-up UI corrections — 10 October 2026

Implemented the requested corrections from the supplied screenshots:

1. **Independent right-panel scrolling.** Conversation, source preview and capability disclosures share their own bounded scroll area. Wheel scrolling there preserves the lesson's scroll position and does not scroll the page. Teaching-step reveal follows the lesson column; conversation/source updates follow the panel. Mobile Interrupt first brings the panel into view, then reveals the question above pinned playback.
2. **Floating, movable Petros.** The avatar and its speech/status bubble move together with a transparent, borderless overlay: there is no outer white card, surrounding frame or shadow. Drag Petros itself or the bubble heading/background. The transparent Move Petros keyboard target covers the avatar. Touch dragging also works. Focus Move Petros and use arrows (Shift for larger moves); Home/Escape or the Park button returns it beside the lesson. Small Park and Minimize/Expand controls appear on hover, keyboard focus or touching Petros; the normal resting view contains only the avatar and bubble. The bubble opens to the left when Petros is on the right of the workspace, and to the right when Petros is on the left. Its tail meets the static artwork at head height. Switching sides preserves the avatar position under the drag pointer. Placement is bounded to the learning UI and does not modify canvas operations, drafts or checkpoints.
3. **Automatic placement during generation.** Starting a new teaching step or progressive reveal parks Petros in reserved space outside the generated content. Desktop parks above the independently scrolling reference panel; mobile and Focus Mode use a compact avatar in the reserved lesson-heading space. Resizing and scrolling update that position. Starting generation cancels an in-progress drag and parks Petros immediately. During active generation, manual dragging waits until pause, so the output stays clear. On small screens the bubble can be expanded once playback is paused. Sticky-heading-aware reveal keeps mathematical steps visible below the parked avatar.
4. **Transparent relationship labels.** Display labels have no opaque card background, so their rectangular hit areas no longer erase parts of curved or parallel connections. Native relationship editing retains its compact readable select control. Connector routing, arrow direction, selection, semantic IDs and edit validation remain unchanged.

5. **Flush playback footer.** Removed the learning shell’s bottom padding and the sticky footer’s negative bottom offset, which exposed a strip of underlying lesson content above mobile navigation. The footer background and top border now extend to both UI edges, while the controls retain the lesson’s inset. Mobile and short-height layouts fill the available workspace even when Focus Mode has only a short teaching step. The footer meets navigation directly, or the viewport edge when navigation is hidden. Existing navigation safe-area padding remains in place.

The shared companion rig and its existing cue/pose policy remain the source of the floating artwork. No second avatar controller, provider route, database change or production activation was introduced.

## Exact implementation and test files

These are the **19 implementation/test files changed across Phase 1 and this follow-up**. The follow-up touches nine of these files (the playground component/styles/test, canvas styles, scroll helper/test, learning-shell styles and two new floating companion files). Most M0-P files were already untracked in the supplied checkout; Git status alone does not distinguish them from new work. The [starting hashes](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/starting-hashes.json>), [follow-up starting hashes](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/followup-starting-hashes.json>), [bubble-correction starting hashes](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/bubble-correction-starting-hashes.json>), [footer-correction starting hashes](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/footer-correction-starting-hashes.json>) and [file manifest](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/file-manifest.json>) document the inspected baseline and final source hashes. Existing unrelated checkout changes were left in place.

| File | Change |
| --- | --- |
| [canvas.ts](</Volumes/Chris/Edrion Labs/packages/schemas/src/petros-v2/canvas.ts>) | Permit bounded erase operations at an explicitly editable checkpoint. |
| [canvas-reducer.ts](</Volumes/Chris/Edrion Labs/packages/schemas/src/petros-v2/canvas-reducer.ts>) | Validate edge labels, source pins, editable regions and protected history restoration; clean references when deleting. |
| [presentation-controller.ts](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/presentation-controller.ts>) | Revisioned undo/redo, replay, history boundaries and atomic demonstration submission. |
| [teaching-fixtures.ts](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/teaching-fixtures.ts>) | Rename activity; describe inline math; explicitly allow permitted diagram deletion. |
| [diagram-editor.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/canvas/diagram-editor.tsx>) | Direct editing, routing, navigation, selection toolbar, touch and keyboard controls. |
| [equation-board.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/canvas/equation-board.tsx>) | Prominent trusted math and designated native inline answer slot. |
| [teaching-canvas.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/canvas/teaching-canvas.tsx>) | Progressive cards, step selection and adjacent participation controls. |
| [teaching-canvas.module.css](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/canvas/teaching-canvas.module.css>) | Canvas sizing, diagram controls, inline editors, mathematical layout and transparent relationship labels. |
| [companion-playground.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/companion-playground.tsx>) | Unified workspace, separate scroll ownership, floating companion integration, reasoning and interruption focus. |
| [companion-playground.module.css](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/companion-playground.module.css>) | Learning grid, independent panel scrolling, reserved companion placement, flush playback footer and responsive layout. |
| [floating-companion.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/floating-companion.tsx>) **new** | Viewport overlay, pointer/touch/keyboard movement, bounded placement, automatic parking, head-anchored bubble side switching and contextual bubble controls. |
| [floating-companion.module.css](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/floating-companion.module.css>) **new** | Transparent avatar/bubble pair, mirrored head-height tail, avatar drag target, contextual controls and small-screen sizing. |
| [workspace-scroll.ts](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/workspace-scroll.ts>) | Respect the sticky lesson heading when revealing generated content. |
| [workspace-scroll.spec.ts](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/workspace-scroll.spec.ts>) | Regression for keeping generated content below the mobile avatar/heading. |
| [app-shell.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/components/app-shell/app-shell.tsx>) | Playground-only sidebar/Focus controls, navigation icons and account profile presentation. |
| [playground-shell.module.css](</Volumes/Chris/Edrion Labs/apps/student-web/src/components/app-shell/playground-shell.module.css>) | Route-scoped 60px header, collapsed/expanded sidebar, profile wrapping, viewport containment and removal of the footer gap. |
| [app-shell.spec.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/components/app-shell/app-shell.spec.tsx>) | Authenticated account switching, long-name profile and collapsed presentation regression. |
| [teaching-playground.spec.tsx](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/teaching-playground.spec.tsx>) | Unified workspace, inline edits/math, teaching preservation, gates and existing assets regression. |
| [practice-history.spec.ts](</Volumes/Chris/Edrion Labs/apps/student-web/src/features/petros-v2/playground/practice-history.spec.ts>) **new** | Revisioned history/reload, protected edits, deletion consistency, stale receipts and failed submission atomicity. |

Additional deliverables: this report, [verify-ui-phase1.mjs](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/verify-ui-phase1.mjs>), and the screenshots/results/manifest listed in `ui-phase1/`. No dependency manifest, lockfile, API implementation, database migration or production flag was changed by this request.

## Verification results

| Check | Result |
| --- | --- |
| Frontend, route, shell, V1 compatibility and Learning Studio regression tests | **56 passed, 0 failed**, 9 files. |
| V2 schema/reducer/timeline plus existing engine/presentation/compatibility tests | **48 passed, 0 failed**, 7 files. |
| Chromium browser interactions | **28 checks passed**, zero runtime errors. Includes the follow-up interactions described below. |
| Student frontend and schemas typechecks | **PASS**, Node 24.21.0. |
| Targeted ESLint | **PASS**; existing workspace-root Next pages-directory discovery warning only. |
| Isolated Next production build | **PASS** with production playground activation disabled. |
| Targeted whitespace validation | **PASS**. |
| Current account in the normal port-3011 preview | **Verified in the user's signed-in browser**, including expanded profile layout. |

[Frontend results](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/frontend-tests.json>), [schema results](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/schema-tests.json>), [browser results](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/browser-results.json>), and [verification metadata](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/verification-results.json>) accompany this report.

### Requested actual-browser scenarios

| # | Scenario | Observed result |
| --- | --- | --- |
| 1 | Rename inline | Double-click opens the node input; Enter commits; Escape retains the old text. |
| 2 | Drag node | Pointer drag changes coordinates; the connected SVG path follows. |
| 3 | Create relationship | Drag a source handle to a destination; a validated student edge appears. |
| 4 | Edit arrow label | Click the label, choose `supports`, press Enter; relation and displayed label agree. |
| 5 | Refresh | Replayed receipts preserve edited coordinates, labels, reasoning and undo/redo history. |
| 6 | Interrupt and resume construction | Partial arrow reveal freezes during a typed detour; resume continues with one stable edge ID. |
| 7 | Inline equation | Enter `2` inside the final equation; inspect a previous step and reload; input persists and adjacent demo feedback appears on submission. |
| 8 | Keyboard-only editing | Actual Tab navigation, Enter rename, arrows move, C plus Tab/Enter connects; keyboard pan and zoom work. |
| 9 | Touch/mobile editing | 360px touch emulation: tap toolbar rename, tap-to-connect, directional movement and fit. |
| 10 | Compact workspace | Browser measurements: 60px header, 64px collapsed rail, 1376px main area at 1440px width; Focus removes the rail. |
| 11 | Correct profile | Disposable QA metadata matches the rendered name/programme; separately checked the actual signed-in local account. |
| 12 | 360px reachability | No horizontal page overflow; mobile diagram and equation controls operated successfully. Width containment also passed at 768, 920, 1000 and 1440px. |

Additional browser coverage includes allowed deletion/undo, protected teaching edges, view preservation during edits, Focus/Interrupt behavior and no-cookie/invalid-session rejection. The disposable API received only `GET /v1/student/me`; the harness blocks external browser requests. Tests do not produce learning evidence or invoke providers.

Follow-up browser coverage verifies mouse and keyboard movement of the floating avatar/bubble without changing checkpoint receipts, absence of an outer card, a head-height tail on both bubble sides without an avatar jump, cancellation of an active drag and automatic parking outside newly generated output, independent wheel scrolling in both desktop columns, transparent labels on parallel relationships, real touch-protocol avatar dragging at 360px, compact parking inside the reserved heading after scrolling, and mobile Interrupt/question reachability. Footer geometry checks also cover 360/768/920/1000/1440px widths, mobile top/middle/end scroll positions, and Focus Mode with both equation and short first-step content. Both side edges and the footer/navigation join have no gap. The original twelve scenarios continue to pass.

## Screenshots

Desktop images are 1440×900; mobile images are 360×800. The original interface's normal step scrolling moved the diagram out of view toward its large forms; the baseline records that behavior. Mobile diagram evidence scrolls the single content area to the diagram controls so the fitted graph and pinned playback can be inspected together.

| View | Before | After |
| --- | --- | --- |
| Desktop diagram workspace | [Before](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/before-desktop.png>) | [After](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop.png>) |
| Mobile diagram | [Before](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/before-mobile.png>) | [After](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-mobile-diagram.png>) |
| Mobile footer gap | [Before](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/before-mobile-footer.png>) | [After](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-mobile-footer.png>) |

Additional views: [inline node input](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-inline-rename.png>), [initial diagram](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-initial.png>), [desktop equation/feedback](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-equation.png>), [Focus Mode](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-focus.png>), [expanded QA profile](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-profile.png>), [mobile movement toolbar](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-mobile-context.png>), [mobile equation](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-mobile-equation.png>).

Follow-up views: [floating Petros moved by the student while paused](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-floating-petros.png>), [independently scrolled right panel](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-independent-scroll.png>), [transparent parallel relationship labels](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-transparent-labels.png>), [bubble opening left from Petros’s head](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-petros-bubble-left.png>), [bubble opening right from Petros’s head](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-desktop-petros-bubble-right.png>), and [mobile conversation panel](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-mobile-petros-panel.png>). Also see the [flush footer in short-content Focus Mode](</Volumes/Chris/Edrion Labs/docs/verification/petros-v2/ui-phase1/after-mobile-footer-focus.png>). The After images above show the follow-up implementation.

## Reproduction

Use Node **24.21.0**. The browser harness creates and shuts down its own isolated Next server on 3041 and metadata-only fixture API on 3042. It uses a disposable browser cookie, separate Next output directories and an explicit synthetic tester allowlist. It does not replace the normal signed-in preview on 3011. The existing local environment configuration for that preview was retained.

```sh
PETROS_PLAYWRIGHT_MODULE=/tmp/petros-m0p-browser/node_modules/playwright \
PETROS_CHROMIUM_PATH='/Users/macbook/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
node docs/verification/petros-v2/verify-ui-phase1.mjs
```

The two environment paths refer to this machine's existing temporary QA installation and browser. On another machine, supply an installed Playwright module and compatible Chromium executable, or omit the executable override when Playwright's own browser is available.

## Remaining limits and Phase 1 boundary

- Feedback and typed dialogue remain fixture demonstrations; explanation text is not semantically evaluated. This phase adds no real teaching engine, assessment, provider calls or production activation.
- The diagram remains within the existing public-fixture coordinate/edit-region limits. It allows at most eight editable IDs in a checkpoint and 32 undo states, with the existing 256-receipt checkpoint budget. It is a bounded learning activity rather than a general drawing application.
- Mobile verification used Chromium touch emulation, including touch-protocol avatar dragging. Physical-device keyboards, Safari/iOS behavior and assistive-technology sessions have not been separately tested. On mobile the source and conversation remain below the canvas in their independently scrolling panel.
- Floating placement is temporary view state. A new example/reload restores the safe default; it does not become a teaching operation or alter the student's checkpoint. During active generation Petros stays parked; after pausing the student can move it freely within the learning UI.
- Voice/microphone remain disabled without approved local narration. Existing static artwork and its declared gesture limitations remain unchanged.
- Account identity comes from permitted authenticated metadata; automated screenshot names are synthetic. No other student's records or credentials were copied into artifacts.

**Stop here for the user's visual approval.**
