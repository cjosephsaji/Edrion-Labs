# Learning-flow verification — 5 November 2026

Implemented on `prototype`. Local route: `http://127.0.0.1:3022/prototype?view=2d`.

- **143 tests passed across 10 files**, including current-snapshot calculations, repeat practice, reflection persistence, bounded history retention and invalid saved-state rejection.
- **Production build passed**, including Next.js TypeScript, page generation and build finalization.
- Full browser journey: **18 checks passed**, covering all 15 cases, saved evidence, reduced motion and the preserved free lab.
- Resilience browser suite: **13 checks passed**, covering checkpoint accuracy, timer isolation during rapid topic changes, double submissions, remediation, repeated practice, reflections, denied/corrupt storage, completed-journey navigation, keyboard practice, and layout widths of 320, 360, 390, 768, 1024 and 1920 px.
- Deliberately enlarged SVG labels triggered the display fallback. Its table followed the selected snapshot and the diagram recovered after normal sizing returned.
- No recorded browser runtime errors in either suite. The local development route returned HTTP 200 after verification.

Added snapshot-specific coaching, observation checkpoints, half-speed playback, personal reflections and a clear next step after completing all topics. Topic changes isolate playback state. Field notes and restored histories reuse each case's calculations. Each topic keeps its first evidence for every explored case plus recent practice, within a 30-attempt limit.

A long-history test initially exceeded its time limit because restore rebuilt simulations for repeated attempts. Per-case calculation reuse resolved that overhead; the final complete test run passed without increasing the timeout. A practice-badge assertion was also corrected to account for its decorative icon.

`results.json` and `resilience.json` record the browser results. `flow-desktop.png` and `flow-mobile.png` are actual captures reviewed for layout. These checks cover the authored investigation flow and do not certify universal accessibility, classroom learning outcomes or arbitrary AI-generated diagrams. Live-provider teaching remains paused.

## Previous implementation verification — 4 November 2026

Implemented on `prototype`. Local route: `http://127.0.0.1:3022/prototype?view=2d`.

- Unit/reference/security suites: **132 tests passed across 9 files**.
- TypeScript: `tsc --noEmit -p tsconfig.check.json` passed.
- Production: `next build --webpack` passed, including TypeScript and route generation.
- Browser: `tests/investigation-browser.mts` passed **18 recorded checks**: all 15 investigation cases plus saved evidence/reload, reduced-motion behaviour, and navigation through the preserved free lab.
- All 15 final comparison diagrams passed actual text-size, clipping and overlap checks at **1440, 768 and 390 px**. The suite also checks horizontal overflow on smaller viewports.
- Initial screenshot review caught undersized neural labels at phone width after resize. Compact text sizes and the breakpoint were corrected; the browser test now waits for ResizeObserver/layout measurement before accepting a result.
- A reload assertion initially ran before hydration; it now waits for restored state. A free-lab navigation timeout during concurrent production compilation was resolved by waiting for the page and its required element instead of network idleness. The final complete browser run passed with no recorded page errors.

`results.json` is the final machine-readable browser result. The desktop and mobile screenshots here are actual browser captures, not design mockups.

The numerical and rendering checks cover the new authored investigation system. They do not certify learning effectiveness or approve arbitrary AI-generated content. Live-provider teaching, human classroom testing, and assistive-technology acceptance were not performed for this change. See `../../INVESTIGATIONS.md` for the learning contract, validation scope and remaining limitations.
