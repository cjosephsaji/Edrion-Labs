# Complete Petros walkthrough

One continuous, silent native browser recording at 1920 × 1080. No cuts, speed changes, frame stitching or substituted application answers. Duration: **01:18:23**. Student choices and questions are scripted and paced for reading.

Open [the chapter player](WATCH.html), or [the original WebM](capture/petros-complete-classic-and-world.webm). The player uses the same single video.

| Start | Mode | Module |
| --- | --- | --- |
| 00:38 | Classic | AI3 — Minimax & Alpha–Beta Pruning |
| 09:09 | Classic | AI4 — How an AI Reasons with Knowledge |
| 17:40 | Classic | EHS3 — Find the Construction Hazards |
| 26:31 | Classic | EHS5 — Protecting Water Resources |
| 35:46 | Petros World | AI3 — Minimax & Alpha–Beta Pruning |
| 47:37 | Petros World | AI4 — How an AI Reasons with Knowledge |
| 57:43 | Petros World | EHS3 — Find the Construction Hazards |
| 01:08:00 | Petros World | EHS5 — Protecting Water Resources |

## How to understand the session

- Teaching steps and checkpoints are separate. Moving the diagram does not complete a question; checking an answer does.
- Classic uses manual teaching steps. World presents an automatic explanation and then waits at a student question. In this recording, Pause and Resume are used to leave time to read.
- World AI Module 3 starts with the first-move prediction (Q07), then the pruning explanation, then returns to unanswered checkpoints. That jump in numbering is the current application flow.
- The fresh Classic tree orders C as (1, 4); World uses (4, 1), as specified in World V2. Both choose A and return 3. Pruning evaluates four leaves in Classic and five in World because the traversal order differs.
- Classic live questions currently return Model unavailable. The recording shows that response, resumes the same step, then opens the prepared Full explanation. World source-linked answers are explicitly labelled prepared.
- The final written explanations are recorded without an automatic grade. The recaps report explored practice, not academic mastery.
- The safety and pollution scenes are educational illustrations. The World scaffold remains the earlier procedural model, pending the room approval gate.
- This is one uninterrupted, silent capture of the actual browser. Student actions and written responses were scripted and paced for inspection. The application’s responses were not replaced or edited.

## Coverage

- Classic / ai3: 12 checkpoints completed.
- Classic / ai4: 12 checkpoints completed.
- Classic / ehs3: 12 checkpoints completed.
- Classic / ehs5: 12 checkpoints completed.
- Petros World / ai3: 12 checkpoints completed.
- Petros World / ai4: 12 checkpoints completed.
- Petros World / ehs3: 12 checkpoints completed.
- Petros World / ehs5: 12 checkpoints completed.

All **96** module checkpoints were completed through the real UI. The capture includes real uploads and recognition, source reading, wrong answers and hints, corrected answers, typed questions, visible replies, interactive diagrams, safety comparisons, pollution controls, free explanations and practice recaps. There were 0 browser JavaScript errors and 0 production mutation requests.

[Observed timestamps and results](capture/recording.json). Reproduce with `pnpm --filter @edrion/petros-showcase exec tsx tests/record-complete-walkthrough.mts`. The trial files are preflight checks and are not the delivered recording.
