# Guided 2D investigations

The default 2D route now uses a controlled experiment as the unit of teaching. Open `/prototype?view=2d`. The original tutor and full parameter controls remain available at `/prototype?view=2d&mode=explore`.

## Learning contract

Each investigation asks the student to commit a prediction before revealing a comparison. Reference and changed runs share the same starting conditions except for the stated intervention. Students can pause, replay and scrub computed snapshots, then choose the causal explanation. Feedback addresses the selected explanation, and the next case changes the conditions that made the previous answer correct.

Five subjects each have three authored cases:

| Subject         | Contrasts                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Neural learning | Positive input, negative input, prediction already beyond the target                           |
| Rocket          | Upward acceleration while falling, enough time to reverse, insufficient thrust at greater mass |
| Attention       | Mask on, mask off, last query with no future positions                                         |
| Traffic         | Local following response, different density, car ahead rather than behind                      |
| Relativity      | Increased speed, decreased speed, stationary reference and longer Earth interval               |

Answers come from the existing numerical simulations. Neural weight sweeps are explicitly manual interventions, not automatically claimed training. Traffic comparisons use a settled reference road rather than attributing its natural transient to the brake tap. Playback speed is a presentation choice; labels specify simulated time or identify non-temporal parameter sweeps.

The state machine rejects out-of-order transitions and duplicate submissions. It records the initial prediction, causal choice and hint usage separately. Field notes distinguish an unassisted correct response, an assisted response, a revised misconception and an explanation that needs revisiting. No playback, elapsed time or completion count certifies mastery. Refresh recovery validates stored states and recomputes scores from the actual choices.

Playback now includes selectable observation checkpoints, half-speed replay, and coaching and measurements calculated from the displayed snapshot. Topic changes isolate the frame and timer, and hiding the tab pauses playback. Reduced-motion users move between static snapshots. Hidden field notes do not rebuild simulations on each playback tick.

After explaining a case, students can write an optional reflection, return to a cause they missed, or practise an explored case again. Repeated practice is labelled separately from the first attempt. Each topic retains up to 30 attempts, preserving the first attempt at each case plus recent practice. Completing all subjects opens the learning record. Browser-storage failures show a notice while the current investigation remains usable.

## Visual publication contract

`composeVisual` generates a bounded semantic specification from a computed experiment. `reviewVisual` verifies objective/case identity, numerical values, units, comparison domains, permitted parameter differences, matched snapshot times and simulation invariants. The renderer draws authored SVG representations from the numerical snapshots; it does not execute arbitrary SVG or HTML from a provider.

After fonts load and after viewport changes, a second check measures actual SVG text bounds and rejects clipped, overlapping or undersized labels. A failed check replaces the visual with an accessible measurements table. The on-screen review explains the checks and their limits.

This is a deterministic quality gate for the guided investigations, **not** a general semantic approval system for arbitrary AI-generated diagrams. Existing free-lab AI scene compilation is separate. Live AI and the 3D world remain paused by the existing feature settings. The next useful extension would be a provider that proposes bounded experiment specifications and teaching goals, with independent calculation checks and teacher-reviewed cases before publication.

Automated checks establish specific structural, numerical and display properties. They do not prove educational effectiveness, universal scientific correctness, accessibility for every assistive technology, or historical novelty. Student observation and teacher review are still needed: can learners explain the cause without the multiple-choice options, transfer it to unfamiliar values, and identify the model's assumptions?

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. With the development server on port 3022, run `npm run test:investigations` and `npm run test:resilience` (or set `SHOWCASE_TEST_URL`). The browser suites exercise all 15 cases, incorrect-answer remediation, assistance tracking, snapshot accuracy, rapid topic switching, double submissions, repeated practice, reflections, saved evidence, denied/corrupt storage, reduced-motion playback, and navigation to the preserved free lab. Layout checks cover 320–1920 px; all 15 diagrams are checked at desktop, tablet and phone sizes. Screenshots and the latest result are in `evidence/investigations/`.

The implementation uses a separate local-storage key, `petros.investigations.v1`, so existing free-lab experiments are preserved. All progress stays in the browser; there is no teacher dashboard or server-side learning record yet.
