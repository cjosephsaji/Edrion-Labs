# Authored learning experience upgrade

Implemented in the existing prototype, preserving its controller, sources, room assets, character and main-platform boundary. [Behaviour, scope and manual journey](../../LEARNING_EXPERIENCE.md) describe how to use it.

## Architecture

Inspection found working shared checkpoints, deterministic practice, authored alternative teaching, contextual interruption and tab recovery. Missing pieces were independent assessments, prerequisite diagnostics, exposure-aware questions and concept achievement evidence.

The upgrade extends those owners. The existing controller evaluates submitted responses; checkpoint transitions select the new assessment tasks; the shared controller hook dispatches both renderers. A pure response validator serves practice, diagnostics and assessment. No second controller or main-platform integration was introduced.

Navigation and evidence are separate. Verification requires a fresh authored question, no assistance or previous submission of that variant, and a correct validated response. Skips, unclear answers, written explanations and navigation cannot create verification. Question banks exhaust gracefully.

The knowledge showcase adds twelve objectives, two diagnostic questions, twenty-four independent variants and five mixed questions including a two-rule inference. Recognized prerequisite, wrong-rule, unsupported-conclusion, partial and repeated errors change feedback and teaching. Unknown errors do not produce invented diagnoses.

World canvas hits, Focus Board keyboard buttons and Classic candidates use the same response gate. Supplied one-way rules are never inferred in reverse. Missing support is distinguished from falsity.

Desktop teaching has a stable reading column. Canvas resizing refits the board. Narrow screens retain the room and a scrollable task area. The Classic opening action remains reachable at 360 px.

## Browser evidence

- [World desktop](world-1366.png), [World phone](world-390.png).
- [Unsupported conclusion feedback](unsupported-feedback.png).
- [Classic verification after switching and refresh](classic-verified.png).
- [Actual mixed-check results](mixed-results.png), [360 px Classic review](classic-360.png).
- [Assertions, submitted evidence, layouts and runtime errors](results.json).

The journey uses real UI actions and saved application state. It does not inject scores or mock the authored teaching loop. The authored journey made no live model calls or production mutations. A separate opt-in live topic check is recorded below.

## Model connection check

The running server detects the saved key. One live photosynthesis topic request was made through the actual form and connector. The provider rejected authentication/permissions, exposed as the sanitized MODEL_AUTH_FAILED result. The current lesson and entered question remained intact. No further live retry was made.

See the [sanitized result](live-topic-result.json) and [actual inline message](live-topic-result.png). This is a failed provider connection check, not a live-generation success. The opt-in browser script requires PETROS_LIVE_TOPIC_TEST=1; normal acceptance scripts use authored content or explicit fixtures and do not spend API credits.

## Verification

- **127 unit tests passed**, including 26 focused evidence/assessment tests. These cover independent correctness, assisted attempts, skips, unvalidated writing, partial/invalid responses, duplicate gates, fresh variants, diagnostic branching, repeated/unknown errors, concept grouping, mixed-question counting, contextual assessment help and recovery.
- **Six complete learning-journey browser scenarios passed.** The real World library/diagnostic path, all twelve concepts through Learn/Apply/Test, unsupported board selection, help during Test, independent verification, Classic switching, refresh, five mixed outcomes and weak-area review are covered.
- **Nine topic browser scenarios passed**, including integrals, generation/answer fixtures, cancellation and responsive layout. Because a key is now configured, the missing-connection form case uses an explicit fixture. No live provider calls occur in this suite.
- Existing regressions passed **64 Classic tasks** and **30 World tasks** across six lessons: [Classic assertions](../learning-redesign/browser-results.json), [World assertions](../learning-redesign/world-results.json).
- Keyboard, focus, reduced-motion and layout checks passed at **1366×768, 1440×900, 390×844 and 360×800**: [accessibility assertions](../learning-redesign/accessibility-results.json). The new showcase separately checks complete board and task-panel bounds at 1366×900 and 390×844, plus a 360 px Classic review. Desktop and phone screenshots were visually inspected.
- The isolated student-web **production build and standalone TypeScript check passed** with exit code 0. [Actual build/type-check log](verification.txt). Targeted ESLint returned **0 errors** and four existing explicit-any warnings in World projection/debug code. Whitespace checks passed.
- The local preview at [localhost:3022/prototype](http://localhost:3022/prototype) returned **HTTP 200**. The original generated type entry was preserved. The environment file remains ignored by Git.

The one opt-in live provider check **failed with MODEL_AUTH_FAILED**, as recorded above. This is an outstanding connection issue, separate from the passing authored learning experience. The authored and fixture browser reports contain no runtime errors or production mutations.

## Files changed for this upgrade

Paths are relative to prototype/. Earlier uncommitted redesign, motion and topic work was retained.

| Purpose                                                                                                     | Files                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| State, validation and evidence                                                                              | teaching/types.ts, teaching/validation.ts, teaching/learning-evidence.ts                                                                                                       |
| Existing controller, transitions, dispatch and recovery                                                     | teaching/controller.ts, teaching/checkpoint.ts, teaching/use-lesson-controller.ts, teaching/persistence.ts, teaching/curriculum.ts, teaching/contextual-explanations.ts        |
| Authored showcase                                                                                           | lessons/ai4.ts, lessons/knowledge-experience.ts                                                                                                                                |
| Shared stages, reasoning and progress                                                                       | components/teaching-cycle.tsx, components/teaching-cycle.module.css, components/reasoning-board.tsx, components/learning-progress.tsx, components/learning-evidence.module.css |
| Classic and selection                                                                                       | components/workspace.tsx, components/knowledge.tsx, components/showcase.tsx, components/showcase.module.css                                                                    |
| World integration and board                                                                                 | world/room.tsx, world/world.module.css, world/board-content.ts, world/board-surface.tsx, world/board-motion.ts, world/scene.tsx                                                |
| Focused tests, complete journey and opt-in provider check                                                   | tests/learning-evidence.spec.ts, tests/learning-experience-browser.mts, tests/topic-live-browser.mts                                                                           |
| Existing regressions adapted to real entry, board controls, duplicate gating and configured-key fixture use | tests/core.spec.ts, tests/learning-redesign-browser.mts, tests/learning-world-browser.mts, tests/topic-workflow-browser.mts                                                    |
| Commands/docs                                                                                               | package.json, README.md, TOPIC_SETUP.md, LEARNING_EXPERIENCE.md, this directory                                                                                                |

## Limits

- Full diagnostics, independent Test and mixed checks are authored for the knowledge showcase. Other lessons retain practice without invented verification.
- Verification concerns immediate application. Delayed assessment scheduling and Retained awards are deferred.
- Banks are finite; exposed questions are not recycled as fresh.
- Storage is tab-scoped. Older envelopes reset gracefully. Uploaded contents are excluded.
- Written explanations remain unverified. This is a learning prototype, not a secure examination or mastery certification.
- The saved key is detected, but the opt-in live request returned MODEL_AUTH_FAILED. Authentication or provider permissions must be fixed before broader topic generation can be tested. Authored teaching does not depend on the connector; generated-content quality remains untested.
- Main Petros backend and original assets were unchanged. Existing voice and larger-viewport performance limits remain. No new performance benchmark is claimed.
