# Petros prototype — recording and test playbook

Main recording: http://127.0.0.1:3022/prototype

Current demo configuration: live AI and the 3D world are deliberately paused. The regular tutor is the default, and no world option or AI activation control is displayed. Select any lesson to see four prepared questions immediately. Click a question, or type a listed question or supported phrase such as “explain simply”, for an authored answer grounded in the existing simulation. “TRY IT” questions change the live model; “WONDER WHY” questions explain it. Questions outside the prepared set show a helpful limitation message. Do not describe these as generated AI responses.

On a laptop, controls and measurements are on the left, the live model is in the centre, and questions, text input and answers stay on the right. New answers begin at the top of their reading area without moving the page. Full explanations are shown directly. Long content scrolls within its own area. On smaller screens, controls open in a side drawer; phones have **Ask & learn** and **Live model** tabs so the tutor is never buried below the model. Close the controls with the close button or Escape.

No API credit is needed for this mode. Optional **Listen with device voice** / **Read aloud** uses browser/device narration, without calling the provider. The saved key remains intact. Reactivate only when requested by the owner, using `core/prototype-features.ts`; the original AI, voice and world implementations are preserved.

The strongest story is one learning loop: Petros asks a question → explains through a live model → asks for a prediction → responds to a mistake with a comparison → checks a fresh example. Show the model changing as part of the explanation.

## 1. Future live-AI setup (currently paused; skip for this recording)

The key is already saved in `/Volumes/Chris/Edrion Labs/prototype/v2/.env.local`; keep it there while AI is paused. For a future credential change, keep exactly one `OPENAI_API_KEY` definition. Never put the key in this document, the browser, a recording, or a NEXT_PUBLIC variable.

```env
OPENAI_API_KEY=your-key-here
```

After the owner requests reactivation, enable the live-AI feature and restart the prototype's dev process. Its launcher reads this file and passes the value into the server environment. Start it from the prototype folder with `npm run dev` after stopping the existing process. Refresh the browser afterward.

Open `/prototype/api/status` to check configuration. The teacher/voice booleans only report configuration; verify one successful text response and one audible explanation before recording. Official OpenAI guidance requires keeping API keys secret and loading them server-side: https://developers.openai.com/api/reference/overview#authentication

Guided prediction/correction/transfer buttons, prepared questions, SVG models and experiment controls work locally. Free-form AI questions and realtime conversation require reactivation and a working provider connection. A device voice is not evidence of working provider speech. The free-form and microphone prompts below are for a future live-AI rehearsal; use the visible prepared questions for the current recording.

## 2. Rehearse the recording setup

- Use the regular 2D tutor at 100% browser zoom on the laptop. A 1440×900 viewport is a useful baseline.
- Pick `Restart lesson` if that topic was already started, or `Start learning with captions` / `Start with voice` for a fresh topic. Restart lesson resets that topic's guided example.
- With voice enabled, wait for the spoken opening to reach its prediction question. With captions, Continue three times reaches prediction: explanation → computed demonstration → question.
- Complete the button-based prediction/transfer sequence before typing free-form questions. An AI question switches that topic into exploration.
- Make and replay a 10-second test recording. Confirm Petros's audio and your own narration are audible in the saved file.
- Keep the key file, developer tools and terminal outside the recording. Leave a short pause before and after important visual changes.

Suggested opening sentence: “Petros teaches through a live model. It asks me to predict what happens, shows the result, and helps me try the idea in a new case.”

## 3. Main take: approximately 6–8 minutes

### A. Neural learning — demonstrate the complete tutor loop

1. Start/restart this lesson with its default guided example.
2. Point out input 2, weight 0.5, target 4: prediction 1 and loss 4.5.
3. Let Petros demonstrate one gradient step. Expected: weight 1.1, prediction 2.2, loss 1.62.
4. At the prediction question, deliberately choose **Farther from 4**. Petros should compare your prediction with the computed result and change the visual representation. It should explain the mistake.
5. Click **Try a fresh example →**. This introduces input −2, weight 0.5, target 4.
6. Choose **Farther away**. Increasing the weight to 0.7 produces −1.4, farther from positive 4. The useful distinction is the sign of the input.
7. Optional AI follow-up: “I thought increasing a weight always improves the prediction. What did I miss?” Ask it to demonstrate the distinction in the model.

This is the most useful segment to linger on: the viewer sees an actual misconception, an evidence-based correction and a new prediction.

### B. Rocket landing — show motion versus acceleration

1. Start/restart the rocket lesson. Expected initial state: altitude 120 m, velocity −12 m/s.
2. Open **Experiment controls**. Set **Thrust · %** to 80%, then click **Step +** once.
3. Observe that velocity can remain negative while acceleration is upward. The rocket is still descending while slowing its descent. The displayed forces and local explanation should agree.
4. Ask: “How can the rocket be falling while its acceleration is upward? Show me using the current numbers.”
5. For an additional comparison, reset before each run and try 0% and 100% thrust. With no burn it hits the ground; full power initially brakes the fall and can send it upward. Do not describe full power as an automatic landing solution.

Optional guided wrong answer: choose “Yes, maximum thrust is always safer.” The correction compares no burn, a timed burn and full burn. The fresh mass question's correct answer is **Smaller**. That built-in transfer doubles total mass; doubling only the dry-mass slider does not double total mass when fuel is present.

### C. Attention — show what the mask actually does

1. Use the default sentence: “the cat chased the ball”.
2. Open controls. Choose query token 0, the first “the”, and enable **Causal mask**.
3. Expected: the first word's weight on itself is 1; later words have zero weight. The row sum is 1.
4. Turn the mask off. Later words become eligible; the engine recomputes the shares.
5. Ask: “Why can the first word not use ‘ball’ with the causal mask on? Show the difference when you remove it.”

Describe this as a toy attention model with Q=K=V, not a view of ChatGPT's internal weights or proof that the model understands grammar.

### D. Traffic waves — follow the pattern between cars

1. Start the traffic lesson and let the cars move.
2. Open controls and use **Brake a car**. If the experiment pauses after this action, press **Run experiment** again.
3. Follow the slowed region while individual cars continue forward and enter/leave it. The wave front need not stay attached to the gold car.
4. Ask: “Is the traffic jam travelling with one car, or passing backward between different cars? Show me.”
5. For a controlled parameter request, ask: “Set following time to 2.5 seconds and run the traffic for 10 seconds.” Check the following-time control reads 2.5, not 10.

The effect depends on density, headway and observation time. Do not promise one monotonic improvement in mean speed for every parameter change. Reset/restart to compare the same initial conditions.

### E. Time dilation — make a new numerical prediction

1. Start/restart at 0.8c with a 10-second Earth interval.
2. Expected: gamma ≈1.6667 and ship proper time 6 seconds.
3. Predict that the ship accumulates less than 6 seconds at 0.99c.
4. Set **Speed · v/c** to 0.990, or ask: “Try 0.99c with the same 10 Earth seconds. Calculate the ship's proper time and show the comparison.”
5. Expected: gamma ≈7.0888 and ship proper time ≈1.41 seconds.
6. Optional conceptual question: “Does this mean there is one universally slower clock?” Petros should explain the reference frame and proper-time distinction.

Keep the model's assumptions clear: constant velocity, no gravity, no turnaround. This is not a complete twin-paradox trip or travel into the past.

### F. Finish with interaction and continuity

- Ask one short follow-up by microphone if realtime voice is working.
- Interrupt during a long explanation: “Stop. Just show me the calculation.” Check old speech stops and the new explanation matches the graphics.
- Change topic and return. Then reload. Parameters and the lesson step should be preserved; do not intentionally reset first.
- The 3D world is currently disabled and its option is hidden. Keep this recording in the regular tutor.

## 4. Question bank for an AI-enabled test take

Start each topic from its default example when a prompt refers to that example. Ask one question at a time and watch whether the model is actually updated.

| Topic | Probe | What to look for |
|---|---|---|
| Neural | “What happens if the input becomes negative?” | Input changes, prediction/loss update, explanation accounts for the sign. |
| Neural | “Set the connection weight to 2.” | With input 2 and target 4, output becomes 4 and loss becomes 0. |
| Neural | “The model got this example right, so it will get every example right. Is that correct?” | Rejects the generalization claim; one training example is insufficient evidence. |
| Rocket | “Double the mass and show how the landing changes.” | A real mass change and new observations, with thrust/mass distinguished from gravity. |
| Rocket | “Maximum thrust always gives the safest landing. Is that correct?” | Corrects the misconception with a comparison and a new question. |
| Attention | “Replace cat with dog; keep the rest of the sentence.” | Only the requested word changes and weights are recomputed. |
| Attention | “Turn off the causal mask and show which words become eligible.” | Future-token eligibility changes, with normalized computed weights. |
| Traffic | “Set following time to 2.5 seconds and run the traffic for 10 seconds.” | Headway and simulation duration remain distinct. |
| Traffic | “The same car must remain at the front of the jam. Is that correct?” | Explains the moving pattern using cars entering/leaving the boundary. |
| Time | “Try 0.99c for the same 10 Earth seconds.” | Actual beta change; gamma ≈7.0888; ship time ≈1.41 s. |
| Time | “The ship also measures 10 seconds at 0.8c. Is that correct?” | Distinguishes Earth coordinate time from the ship's 6 seconds of proper time. |
| Any | “I don't understand that. Use a different representation and ask me one smaller question.” | Changes representation and asks a focused check. |
| Any | “I don't know.” | Offers a hint or smaller step instead of inventing understanding. |
| Any | “Show the maths.” | Opens the calculation/experiment area and grounds it in the current model. |
| Any | “Go back.” | Restores the prior committed experiment where an undo state exists. |
| Any | “Just let me explore.” | Stops the guided sequence and leaves controls usable. |

These are test prompts and expected behaviors, not a claim that each has passed with your newly configured provider. Rehearse the ones you plan to include.

## 5. Longer QA take — check before choosing the clean demo

1. **Both answer branches:** wrong then correct after restarting. A mistake should prompt a changed explanation/comparison; a correct answer should still lead to a fresh example.
2. **Transfer:** answer a genuinely new case, not just repeat the previous choice. Answer key below.
3. **Grounding:** change a slider and check the displayed numbers, graphic and explanation agree. No claim about a parameter that stayed unchanged.
4. **Voice:** speech is audible, agrees with the caption, pauses/mutes immediately, and does not resume an old answer later.
5. **Realtime mic:** transcript matches what was said; the response addresses it; talking while Petros speaks interrupts cleanly. Test actual hardware in the intended room.
6. **Interruption:** ask a second question while the first is generating; the first must not overwrite the later model/caption. Switch topics during speech and check the old narration stops.
7. **Persistence:** change a parameter, navigate away/back, reload, and switch 2D↔3D. Check both parameter values and lesson step.
8. **Reset/undo:** Reset experiment returns that experiment to its initial state with its current parameter settings; Restart lesson restores the guided example. Go back should restore a prior committed experiment when available.
9. **Limits:** try an unsupported speed such as 1.2c, or ask to replace a word absent from the sentence. Expect an understandable rejection and a usable existing scene, with no NaN or broken layout.
10. **Rendering:** check desktop and phone width, readable labels, no clipped controls or horizontal page overflow, stable guide head and no giant 3D halo. Use Balanced for the world; High has a higher rendering cost.
11. **Failure recovery:** if the provider becomes unavailable, the UI should explain it and preserve usable local experiments. Treat this as an error-recovery test, not a staged live-AI demonstration.
12. **Actual learning:** have an unfamiliar learner explain one concept in their own words and predict a new case without you pointing at the answer. Record the distinction between what they inferred and what Petros explicitly told them.

## 6. Guided answer key

| Topic | First prediction — correct | Fresh-example answer — correct |
|---|---|---|
| Neural | Closer to 4 | Farther away with negative input |
| Rocket | No, the timing matters too | Smaller acceleration for doubled total mass |
| Attention | No, future words are masked | Two eligible words for query token 1 |
| Traffic | Yes, extra following time can help | Different cars enter and leave the wave |
| Time dilation | 6 seconds at 0.8c | Less than 6 seconds at 0.99c |

## 7. Pick the final clip

Use a take that clearly contains one incorrect prediction, a model-grounded correction, a fresh transfer answer, one real what-if mutation, and a clean interruption. Leave enough time to see the changed numbers. Preserve natural errors you want to report in the QA take; avoid describing an unsuccessful API interaction as a successful live demonstration.

## Neural Stage — Phase 1 (6 November 2026)

Open `http://127.0.0.1:3022/prototype?view=stage` for the new website-themed studio. Original World remains at `?view=world`. This was the initial Neural phase. Rocket is now available through its pill or the route below; restored tanh models still use World. The Stage route without a lesson selects Neural without clearing other topic sessions.

For a short clip: click the Neural learning pill to replay assembly; inspect “What is a weight?” and use Try it; return to overview; Reset; Train one step three times; Auto-train to convergence. “Lesson & settings” retains the prepared guided lesson, prediction choices and negative transfer. Story units are on by default; the negative example is labeled abstract numbers. Read aloud uses the existing optional device narration while live AI is paused. No provider call is needed.

Regenerate DPR2 stills and the intro/focus frame sequences with `npm run capture:stage` from `prototype/v2`. Build first and run `npm run test:stage:performance` for optimized local GPU measurements. Detailed decisions and verification limits are in `STAGE_NOTES.md`.

## Rocket landing Stage — Lesson 02 (6 November 2026)

Open `http://127.0.0.1:3022/prototype?view=stage&lesson=rocket`. Neural and Rocket now share the website-themed Stage; the other three lessons remain in World. The lesson pill replays the assembly, while switching pills preserves each lesson's state.

For a 20–30 second clip: Reset; replay assembly; set Throttle to 80%; Step ½ s. The craft is descending (negative velocity) while upward acceleration slows it. Inspect “Falling with the engine on?” or “What does thrust do?”, then return to the whole thing. Inspect “How do I land gently?” and choose Try it: the existing prepared burn plays over eight seconds, labelled accelerated playback, and touches down at about 1.2 m/s. After contact the HUD shows recorded contact velocity, not ongoing motion.

For a failure comparison, inspect “What if fuel runs out?”, Try it, Escape, then Run flight. It has zero thrust even at 100% throttle and ends in a hard impact. Reset before the next recording. Manual controls, inspection, Escape, backgrounding and topic changes cancel a pending prepared replay.

The accessible throttle slider and the 3D lever stay synchronized. Run flight accepts throttle changes while running. “Lesson & settings” retains the original prepared lesson, full caption transcript, prediction and doubled-mass transfer. Captions have glossary links; Read aloud uses the existing optional local narration when live AI is paused. The safe flight is a prepared demonstration, not a general autopilot.

From `prototype/v2`:

```sh
npm run dev
npm run test:stage:rocket
npm run capture:stage:rocket
npm run build
npm run test:stage:rocket:performance
```

Evidence: root `audit-screenshots/stage-rocket/`, including DPR2 stills at 1440×900 and 390×844, intro/focus/landing PNG frame sequences with actual timing JSON, browser results and optimized GPU samples. Regeneration requires an installed Chromium browser; override `PETROS_BROWSER` if needed. The performance runner starts an isolated production server on 3024 with ephemeral local test authentication and no provider key. See `ROCKET_STAGE_NOTES.md` for exact limits and results.


## Attention Stage — Lesson 03

Open `http://127.0.0.1:3022/prototype?view=stage&lesson=attention`. The first three lesson pills now work on Stage, with independent saved state.

For a short clip: Reset; click the Attention pill to replay assembly. Select query 1 · the: only its own share survives. Turn Causal mask off so later words contribute; turn it back on. Select 5 · ball to see the full mixture. Inspect “What do the beams mean?” and “What is the context?”; Try it changes the query while the actual context updates. Inspect “What if cat becomes dog?” and Try it for the prepared comparison. It resets the default sentence, changes only cat to dog and recomputes the engine output. Escape cancels a pending demonstration.

Scan sentence cycles the selected query without inventing training or changing simulation time. Click a 3D tablet to select and inspect that word. Lesson & settings retains the original guided prediction/correction, second-query transfer, Q/K/V explanation, full-caption glossary and sentence editor. The toy uses deterministic four-number vectors and Q = K = V; present it as a teaching calculation, not language understanding or real ChatGPT internals.

From `prototype/v2`:

```sh
npm run dev
npm run test:stage:attention
npm run capture:stage:attention
npm run build
npm run test:stage:attention:performance
```

DPR2 stills at 1440×900 and 390×844, intro/focus PNG frames, browser results and production GPU samples live at root `audit-screenshots/stage-attention/`. The phone viewport uses Low; physical-device coverage and final measurements are listed in `ATTENTION_STAGE_NOTES.md`. Existing Neural/Rocket evidence is preserved.

## Traffic waves Stage — Lesson 04

Open `http://127.0.0.1:3022/prototype?view=stage&lesson=traffic`. The fourth pill is active; Time dilation remains in World. Traffic uses the same website palette, fonts and studio as the earlier lessons.

For a short clip: Reset, click the Traffic waves pill to replay assembly, then Brake & watch. Gold stays with car 01; blue marks the computed slow-to-fast boundary while it exists. The outer speed ribbon shows slower amber and faster mint, using this snapshot's speed range when there is a clear spread. Absolute speeds remain in m/s. Pause after a few seconds; inspect “Why can the wave go backward?” and “Is the wave one slow car?”. Their Try it plays 30 simulated seconds after a 15-second settling period, at an explicitly labelled 2.5× rate. Actual vehicle and boundary positions leave gold and blue traces. The boundary can jump between cars or disappear; it is not animated at a fictional constant backward speed.

Inspect “Does more room help?” and Try it for the original prepared comparison: identical initial conditions, 40-second settling, one brake, then eight seconds at current following time versus 2.4 seconds. Both actual speed spreads are shown. More following time also changes mean speed; avoid claiming every denser or tighter configuration inevitably jams. Direct Run road / Brake & watch is 2× model time. Original guided teaching retains its own shared clock. Escape, parameter edits, backgrounding and lesson switches cancel pending prepared playback.

The copper dial and keyboard slider set the same following time. Lesson & settings adds 5–45 cars and desired speed controls; changing the number of cars resets the road, while headway and desired-speed changes preserve current cars. The original prepared prediction/correction, transfer and glossary remain available there.

From `prototype/v2`:

```sh
npm run dev
npm run test:stage:traffic
npm run capture:stage:traffic
npm run build
npm run test:stage:traffic:performance
```

On the 7 November local Apple M4/DPR2 production run, Balanced averaged 60 fps across overview, three focus shots, playback and 45 cars, using test-side RAF windows that include every interval and stall. At a 1440×900 page size, its hero canvas is 1140×620 CSS pixels (2280×1240 buffer): the full-window virtual camera and subject pixel scale are preserved while pixels beneath the edge HUD are omitted. Phone uses full-canvas Low. High overview is measured separately; its close-up performance is not benchmarked. Balanced is the verified recording preset. Whole-ring phone focus uses a small complete view above its card.

Captures and measurements: root `audit-screenshots/stage-traffic/`. The capture command uses a running server on 3022 (`PETROS_BASE_URL` overrides it); `PETROS_BROWSER` can select an installed Chromium executable. The performance runner starts isolated production port 3024 with temporary local test authentication and an empty provider key. See `TRAFFIC_STAGE_NOTES.md` for results and verification limits.

## Time dilation Stage — Lesson 05

All five lesson pills now work on Stage. Open `http://127.0.0.1:3022/prototype?view=stage&lesson=relativity`.

For a short clip: Reset, replay the Time dilation pill assembly, then Run clocks. At 0.8c the identical clocks end at 10 Earth seconds and 6 ship seconds. The round Earth marker and diamond ship marker share one seconds scale. Bright markers show elapsed readings; faint rings preview the selected interval. Pause, inspect “Why does it tick slower?” and “Elapsed or selected time?”. Read aloud reuses optional local narration; no live provider is needed.

Inspect “What is gamma?” and Try it for three **separate** 10-Earth-second coasting examples: 0c, 0.8c and 0.99c. The speed dial/slider selects a new constant-speed example; it does not integrate acceleration or a round trip. “Can we reach light speed?” uses 0.999c, never c.

“Which clock is really slow?” and its Try it switch diagram coordinates while keeping the same endpoint events and clock readings. The diagram uses the existing Lorentz transform, with position in light-seconds and time in seconds. Earth-coordinate simultaneous endpoints need not remain simultaneous in ship coordinates. The ship's own clock feels normal aboard. The model has no gravity, turnaround or reunion.

Lesson & settings keeps the original guided prediction/correction, 0.99c transfer, prepared questions and full caption glossary. It also exposes a 1–120 s selected interval and coordinate choices. Changing the selected interval does not advance elapsed clocks. Step 1 s and Run clocks advance actual worker state; prepared playback is explicitly labelled with its playback factor. Escape, edits, reset, backgrounding and topic switches cancel pending playback.

From `prototype/v2`:

```sh
npm run dev
npm run test:stage:relativity
npm run capture:stage:relativity
npm run build
npm run test:stage:relativity:performance
```

Evidence and measurement limits: root `audit-screenshots/stage-relativity/README.md` and `TIME_DILATION_STAGE_NOTES.md`. Phone uses Low; a browser viewport is not physical-phone hardware evidence.

Time dilation recording measurement (7 November, actual Apple M4 / Chromium / ANGLE Metal, DPR2): Balanced averaged 60 fps (16.67 ms mean interval) across the tested views, running clocks, 0.999c/120 s case, assembly and three focus transitions. Peak sampled totals were 84 calls / 41,193 triangles. High overview averaged 34.1 fps and its native refraction obscures fine face print; choose Balanced for the clip. The phone-sized Low viewport averaged 60 fps on this Mac, not on physical-phone hardware. Detailed buffers, timing windows and limitations are in the Time dilation evidence report.
