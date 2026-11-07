# Attention Stage — discovery and decisions

## Discovery before implementation

Read the existing Stage lesson contract, shell, HUD, projected labels, camera, studio and quality paths; Neural/Rocket adapters and navigation; Attention foundation/runtime; prepared answers and guided lesson; route and session integration. Preserve all uncommitted work from the approved earlier lessons. Read the installed Next 16 lazy-loading guidance required by AGENTS.md.

- `simulations/foundations/attention.ts` computes actual scaled dot-product attention. Four-dimensional deterministic toy vectors; Q = K = V; stable softmax; future logits masked before normalization; mixed contexts are weighted value sums. Unknown words use deterministic hash vectors, not semantic embeddings. No new attention math in the view.
- `simulations/runtime.ts` exposes `attentionOf`, `observe`, and worker `sim_set_params`. Default sentence is “the cat chased the ball”, selected query index 4, causal mask on. Runtime supports 1–12 tokens (foundation up to 24); changing tokens clamps query to the last remaining token. Query indices are zero-based internally.
- Existing semantic IDs are `token-N`, `attention-matrix`, and `context`. Keep them. Aliases for query, mask, vector inspection and share-total map to those at the tutor boundary.
- Prepared teaching explicitly covers computed beam shares, normalized row total, Q/K/V, cat→dog substitution, the first query blocked from future words, and second-query transfer with exactly two eligible words. Do not imply grammatical understanding, real ChatGPT internals, or that attention shares are Neural's trained dial.

## Integration plan

1. Enable `?view=stage&lesson=attention` and its lesson pill. Preserve independent saved Neural/Rocket/Attention sessions and original World.
2. Typed state adapter consuming the engine's matrices, selected row and four-value context. No change to the engine or existing prepared copy.
3. Glass word tablets on the same green/ivory/copper studio plinth; gold query, weighted curved beams flowing toward it, explicit blocked future cards, and a separate context mixer. Actual words/shares are printed on the tablets; hover and keyboard query controls expose full words.
4. Small generic shell extensions for state-dependent choices/actions, boolean controls, sentence input, text-valued labels and optional metric history. Attention changes query/mask/sentence; it does not invent a training or physics step.
5. Nine static question cards with authored shots and engine-backed demonstrations. Reuse full captions, glossary, prepared narration, intro, cancelable focus, reduced motion and Low phone quality.
6. Unit/browser/regression checks, fresh DPR2 stills and transition frames, production performance measurement, and honest limits. No installs or paid calls.


## Implementation decisions

- The Stage keeps the website's shared forest-green/ivory tokens, DM Serif/Outfit/JetBrains Mono, copper trim, studio lights and current postprocessing presets. Attention has its own typed adapter, lesson content factory and one specimen. The generic `StagePlinth` can also serve future lessons without changing the approved Neural/Rocket meshes.
- All matrices and context values come from `attentionOf(sim)`. The view selects the current row, sums its shares for a readout and maps numbers into geometry; it never computes embeddings, logits or softmax. No numerical engine or existing prepared teaching copy changed.
- Up to six tablets occupy one row; seven to twelve use two rows. A tablet prints its actual word, ordinal/role and computed percentage. Words longer than ten characters are shortened on the 3D face, with the full word in the keyboard query selector, part heading and sentence editor. These are local canvas print textures, not external images or troika labels.
- Gold marks the query. Beam width is monotonic in share (square-root scale keeps small shares visible); moving dots and direction markers flow from the allowed source values toward the query. The query's self-attention uses a loop. A masked future word has zero beam, an explicit LOCKED / MASKED 0.0% face and a crossbar.
- The separate glass context mixer shows the actual four signed context values, a copper zero line and printed 0. Positive bars rise above zero; negative bars extend below it. Its segmented base ring accounts for the same normalized row. The number label always shows all four signed values.
- Query selection, Next word and Scan sentence use the original `sim_set_params` worker tool. The scan cycles queries every 1.4 seconds and advances no artificial simulation time. Inspection/settings/Escape/backgrounding/navigation stop it. Clicking a word first selects it in the engine, then focuses and explains that exact semantic token.
- The main control capsule adds an accessible query selector and Causal mask on/off button. The existing lesson panel exposes sentence editing with the runtime's 1–12 words, ≤20 characters each, ≤240 total characters validation. Neural/Rocket keep their original sliders and actions.
- Nine prepared cards explain query, vectors, beams, normalization, masking, Q/K/V, context, word replacement and the model's limits. They distinguish computed attention shares from Neural's learned dial and do not claim grammatical understanding, language generation or real ChatGPT weights. The cat→dog demonstration explicitly starts from the existing default sentence.
- Focus shots and DOM label bounds now leave space for the actual phone explainer height. These small shared-shell extensions also cover state-dependent actions, text-valued pills, selectable parameters, optional history and generic measurement readouts; no attention-specific math is in the shell.
- Repeated Attention actions suppress automatic speech observations, as Rocket does. Read aloud, captions, glossary and the original prepared voice/tutor remain connected. `liveAI=false` requires no provider call.
- Attention now has an active pill and `?view=stage&lesson=attention`. Neural, Rocket and Attention keep independent saved sessions; default Stage remains Neural. Original World and the last two lessons retain their current behavior.

## Verification and evidence

Completed against the current implementation on 6 November 2026:

- All **167 unit tests across 13 files pass**, including nine new Attention tests: actual matrix/context binding, masked zeros and normalization, unmasking future keys, cat→dog replacement, one-word clamping, signed unknown vectors, 1–12-token layout, real Next word actions and content/semantic validity. Answers stay within 50 words.
- TypeScript and the optimized Next production build pass. Scoped repository ESLint passes with zero warnings/errors; `git diff --check` passes. No packages were installed.
- `npm run test:stage:attention` passes at both 1440×900 and 390×844, DPR2. All nine camera/card paths finish; Escape returns to overview. Projected pills do not collide with each other or the explainer; the explainer avoids each selected part's projected bounds.
- Browser tests verify worker query changes without invented simulation time, exact zero future shares with masking, all-positive eligibility without masking, tablet click selection, sentence scan/pause, cancellation of stale demo changes, cat→dog, signed contexts, twelve tokens and a single token, independent lesson switching, reload and blocked storage/reduced motion. No page errors, console errors or paid routes.
- The original prepared guided lesson passes its first-query correction and second-query transfer (exactly two eligible words), Q/K/V question, full-caption glossary, cancellation, reload and restoration in the original World. Existing engine and prepared copy were not changed.
- Existing Neural smoke/prepared teaching and Rocket smoke/prepared teaching pass after the generic shell changes. Their result references and run times are saved in `regression-results.json`. World restoration is checked by all three teaching paths; no original World logic or assets were removed.

There are **56 fresh PNGs** in root `audit-screenshots/stage-attention/`: overview, three query changes, nine focus cards, first-query mask on/off, cat→dog, signed context, twelve-token and single-token views at both DPR2 viewport sizes; plus 12 intro frames and 10 focus-transition frames. Each sequence stores its actual timing. These are irregular PNG frames, not a fixed-rate video. The final cleanup removed a redundant Three geometry conversion warning; final captures were regenerated after it.

Cross-runtime observation comparisons use a 1e−12 tolerance because Node and Chromium can differ by one ulp in `Math.exp`. Masked zero shares are checked exactly. This does not alter the engine or relax existing tests.

### Known limits

1. The twelve-token stress layout has smaller tablet text and more beam crossings. The five-word lesson is the intended recording view. Long words are shortened on the tablet face and remain complete in the selector and part heading.
2. Physical iPhone/Android hardware, Safari/WebKit, human narration and a novice study were not tested. The phone capture/Low timings come from a phone-size viewport on the Mac.
3. This is the existing deterministic toy head: four numbers, Q = K = V, no learned language representations, multiple-head calculation or language generation. The three ghost heads are a labelled visual hint only.
4. Screenshot checks cover the requested sizes, saved states and every focus card; arbitrary orbit angles and every possible custom sentence were not exhaustively reviewed.

### Run and regenerate

From `prototype/v2`:

```sh
npm run dev
# http://127.0.0.1:3022/prototype?view=stage&lesson=attention
npm run test:stage:attention
npm run capture:stage:attention
npm run build
npm run test:stage:attention:performance
```

`PETROS_BASE_URL` selects a running server for captures/tests. `PETROS_BROWSER` points to an installed Chromium browser. The performance runner starts isolated port 3024 with temporary local authentication and an empty provider key. The development server remains available on 3022. No deployment, provider calls, new network dependencies or telemetry were introduced.

### Production performance

Measured on the actual local Apple M4, headless Chromium 156.0.8078.80, ANGLE Metal, optimized Next build, DPR2, with no other browser tests running. Values are medians of reported per-window medians; p95 is the worst sampled window. Draw calls and triangles include all render passes, including shadow refresh.

| View / preset | Median frame | Approx. fps | Worst window p95 | Peak calls | Peak triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1440×900 Balanced overview | 16.7 ms | 59.9 | 18.3 ms | 80 | 39,255 |
| Balanced sentence scan | 16.7 ms | 59.9 | 17.4 ms | 84 | 39,255 |
| Balanced twelve-token stress view | 16.7 ms | 59.9 | 17.8 ms | 122 | 62,101 |
| Balanced query / beams / context focus | 16.7 ms | 59.9 | ≤17.8 ms | ≤80 | ≤39,255 |
| 1440×900 High | 30.55 ms | 32.7 | 31.9 ms | 88 | 39,263 |
| 1440×900 Low | 16.7 ms | 59.9 | 18.6 ms | 35 | 19,984 |
| 390×844 Low (Mac viewport) | 16.7 ms | 59.9 | 18.5 ms | 35 | 19,984 |

Balanced meets the target on this hardware, including the twelve-token case. High is an optional visual preset at about 33 fps here; use Balanced for recording. The phone viewport is not physical-phone hardware evidence. Full samples are in `performance-production.json`; the aggregation is in `performance-summary.json`.
