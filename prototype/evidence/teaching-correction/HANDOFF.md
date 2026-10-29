# Student-paced teaching correction — 29 October 2026

The active route is http://127.0.0.1:3021/prototype. All authored changes for this correction are under `prototype/`; no production M4/M5 rules, route adapters, database schemas, or academic stores were edited. Existing unrelated changes in the checkout were preserved.

## What changed

Both modes render `components/teaching-cycle.tsx` and dispatch `teaching/use-lesson-controller.ts` commands into the same ShowcaseState. `teaching/checkpoint.ts` owns INTRODUCING, DEMONSTRATING, CHECKING_UNDERSTANDING, AWAITING_RESPONSE, RETEACHING and READY_TO_CONTINUE transitions. `controller.ts` owns response validation and interruption/resume. INTERRUPTED and RESUMING retain the checkpoint, diagram, draft and next teaching action. There is no timing command that can choose another checkpoint or answer a question.

A student selects Show me, sees a worked demonstration, selects Let me try, reads a check, then chooses to answer. Correct practice produces its actual reasoning and waits for Continue. Incorrect practice holds the checkpoint and chooses a simpler worked example followed by another check. Partial multi-selections retain their supported selections and ask about the unresolved pathways. Invalid numerical input requests clarification. Own-word explanations are recorded as unverified. I understand, continue, Skip this concept and reviewed checkpoint navigation have distinct observation reasons; none creates validated practice evidence.

There are 12 primary checkpoints per source-linked module and 8 per prepared open topic (64 total), with prepared follow-ups. AI3 now checks MAX on 4/7 before MIN on 3/5. After the specific wrong MIN answer 5, Petros demonstrates 2/6 and checks the new pair 1/7. Repeated difficulty can use the smaller prepared 1/2 example and 0/3 check. Each checkpoint has separate primary, simpler and second-example teaching copy. More practice retains its concept and uses an approved prepared check; it does not fabricate a live generated question.

The World-only automatic timeline and its script were removed. Scene/book/camera animation remains presentational. Model picking inspects the current concept instead of selecting a new hazard question. Switching modes no longer changes the leaf order or correct pruning answer. A fresh session uses A=(3,5), B=(2,9), C=(1,4) consistently in either mode: root 3, branch A, four evaluated leaves, two skips. The historical V2 ordering remains supported by the deterministic tree adapter and its tests if supplied as an existing state, but a mode switch does not impose it.

The focused MAX/MIN diagrams conceal the student's prediction until response feedback. Diagrams, the current teaching statement and all response controls stay in separate reserved areas. The World response area is measured and scrollable; it does not overlay the active scene. Original Petros assets and Outfit remain in use.

The new panel initially used the literal family name `Outfit`, which fell back to a system font because Next registers the self-hosted font under an internal family name. It now inherits the approved loaded face from the route. `typography-results.json` confirms that Classic's title, the teaching panel, its controls and the rasterized 3D board use the same Outfit family. Loaded font faces and measured glyph widths distinguish the actual font from a generic sans-serif fallback. The corrected font is present in the delivered recordings.

The legacy step-number fallback that opened the excavation example during an unrelated scaffold check was removed; the excavation scene opens at its own checkpoint. Model highlight positions follow the changed objects in the safer scaffold illustration, and its rotation is kept in shared visual state.

## Observation boundary

Per-question browser-memory observations contain lesson/concept/question IDs, every submitted response and qualification, supported misconception category, requested assistance, explanation variants, retries, skip flag, and explicit continuation reason. These are ephemeral prototype practice observations. No official grade, certification, durable academic record, or mastery result is produced. Reload clears the session.

## Conversation and voice

Contextual responses use `teaching/contextual-explanations.ts` in both modes. The input includes the actual selected diagram/model state. A numeric why-question is answered using the supplied values. Ambiguous targets request clarification. Simpler/example/practice requests select a prepared resumable teaching action; resuming does not advance the concept.

Live tutor inspection confirmed production writes: `apps/api/src/modules/student/petros-companion/petros-companion.service.ts` persists replies with repo.insertMessage and touches threads. This isolated prototype does not call that path. General live questions and arbitrary topic generation retain the truthful unavailable response. Explanations are labeled prepared/source-linked or prepared general knowledge. Speech remains text-led; no unrelated prerecorded voice or fabricated TTS is used.

## Browser evidence

`tests/teaching-browser.mts` drives the actual application with installed Brave/Playwright, captures native 1440×900 WebM recordings, and saves traces and screenshots here. It does not inject lesson state or replace application behavior with a mock. Recordings are continuous, silent, and include actual UI actions.

- `recordings/path-a-understands.webm`: source-book selection, primary explanations, correct MAX/MIN responses, confirmed continuations, full-tree reasoning, pruning and transfer. It includes the 31-second unattended MIN check.
- `recordings/path-b-struggles.webm`: wrong MIN response, held checkpoint, simpler example, different follow-up, response-specific result, explicit continuation, contextual numeric interruption, simpler explanation and exact checkpoint resume, then a draft and feedback preserved through both mode changes.
- `browser-results.json` and `browser-run.txt`: observed browser results and failures, if any. Read the result's `passed` field rather than assuming that a recording implies success.
- Traces are retained alongside the recordings; screenshots include MAX teaching, MIN misconception/follow-up, interruption, resumed example, mode continuity and responsive layouts.

## Verification

Observed final results:

- 63 focused tests pass across seven test files. The obsolete autoplay contract test was replaced by checks for student-controlled instructional decisions.
- TypeScript checking passes, and the isolated optimized Next production build succeeds.
- The browser suite completes all 64 primary checkpoints in both modes (128 checked interactions). It separately passes both recorded minimax paths, 31-second no-response checks in both modes, partial → correct and unclear-response behavior, and 1366×768, 390×844 and 360×800 layouts. Neither browser exceptions nor production mutations were observed.
- The additional edge suite passes wrong → targeted reteaching → qualified follow-up paths for AI4, EHS3, EHS5, open AI and Time Travel; More practice; closing a conversation then resuming in either mode; natural previous-checkpoint/source-context recovery; concealed transfer guarantees; honest arbitrary-topic unavailability; and concept-specific excavation visibility.
- Typography checks pass for both UI modes and the 3D board using the loaded Outfit face.
- Browser playback QA decodes and seeks both delivered native videos: Path A is 107.20 seconds, Path B is 52.56 seconds, both at 1440×900. These are unedited silent browser captures, not a synthesized presentation.

`browser-results.json`, `edges-results.json`, `typography-results.json` and `playback-results.json` retain the observed details. The pre-change paths are documented in [BEFORE.md](BEFORE.md). Source hashes are independently checked in `source-integrity.json`. `baseline-tests.txt` records the initial 50-test baseline. `tests.txt`, `typecheck.txt`, `build.txt` and `browser-results.json` record actual command output.

## Run

From the repository root:

```sh
PETROS_SHOWCASE_ENABLED=1 PETROS_SHOWCASE_LOCAL_ONLY=1 PETROS_ISOLATED_VERIFICATION=1 pnpm --filter @edrion/student-web exec next dev --hostname 127.0.0.1 -p 3021
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
pnpm --filter @edrion/petros-showcase run verify:browser
pnpm --filter @edrion/petros-showcase run verify:edges
pnpm --filter @edrion/petros-showcase run verify:typography
```

Keep the route loopback-only and gated. No deployment is part of this correction. Earlier V2 scripts that expect automatic beats are historical and do not verify the new teaching controller.

## Authored file inventory

No authored file outside `prototype/` was changed by this correction. Builds generated their existing isolated output directories.

- Shared state and decisions: `teaching/types.ts`, `controller.ts`, `use-lesson-controller.ts`, `contextual-explanations.ts`; new `checkpoint.ts` and `curriculum.ts`.
- Teaching/UI: new `components/teaching-cycle.tsx` and `teaching-cycle.module.css`; updated `workspace.tsx`, `showcase.tsx`, `tree.tsx`, `topic-models.tsx`, `hazards.tsx`.
- World presentation: `world/room.tsx`, `scene.tsx`, `spatial-teaching.tsx`, `board-content.ts`, `board-surface.tsx`, `world.module.css`. Removed the obsolete `world/teaching-script.ts` autoplay implementation.
- Source-linked question updates: `lessons/ai3.ts` (dedicated MAX prediction and a new-tree application).
- Verification: updated `tests/core.spec.ts`, `v2.spec.ts`; new `teaching-controller.spec.ts`, `teaching-browser.mts`, `teaching-edges.mts`, `teaching-typography.mts`, `teaching-playback.mts` and the development `teaching-smoke.mts`.
- Entry points/documentation: `package.json`, `README.md`, and this evidence directory. Development captures before the font fix are explicitly separated under `development-captures/`.

The existing production M4/M5 evaluator, teaching APIs and assessment admission rules remain outside the correction. The room asset/rig limitations and pending visual asset approval are unchanged; this work concerns teaching behavior and its matching highlights.
