# Companion visibility follow-up — 11 October 2026

The user reported that Petros did nothing in the Companion Playground, despite movement on other pages. Inspection used their existing in-app browser tab at `http://localhost:3011/petros/companion-playground`, with an actual viewport of 688 × 849.

## Causes and changes

- The rig rejected directional gestures below a hard-coded 1000px viewport width. It now uses target geometry and visibility at every width. Missing, clipped, obscured, disabled, reduced-motion and assessment-safe targets still fall back safely.
- The compact layout hid both the speech cloud and its expand control until hover, and shrank Petros to 58 × 70px. Its avatar is now 70 × 94px, with a visible current state and a 44px-high **Show text** control. The reserved heading remains independent of caption size.
- Teaching actions automatically collapsed the compact bubble. An explicitly expanded bubble now stays open during teaching and across replay; the companion still parks outside the teaching content.
- Replaying could scroll to the empty conversation prompt and hide the new teaching target behind the sticky header. Empty conversation prompts no longer request scrolling, and changing the companion reserve reveals the active target again.
- Gesture history could survive replacement of the presentation controller on Replay. Its pose governor now follows the identity of the existing presentation owner, so a fresh run admits gestures again. Continue within the same run retains repeat suppression.
- The rig now checks the sticky heading and playback boundary as well as scrollport clipping before pointing.

## Verification

- Final targeted Vitest run: **35 passed** across companion naturalness/fallback, teaching playground and workspace scrolling. New regression coverage verifies a visible target at 688px, immediate revocation when clipped, no repeated gesture in the same presentation, admission in a fresh replay, and rejection behind the sticky harbor.
- Student web TypeScript check: passed.
- ESLint on the four changed TypeScript files: passed without warnings or errors.
- Actual 688px browser: Replay reached `point-left` for `library-passage` while the target top was 288.78px and the sticky heading bottom was 281px. Pause immediately returned to `neutral`, with `data-suspended=true` and pose transitions disabled.
- Actual 688px browser: expanded cloud persisted during playback and replay. The lesson target settled below the expanded heading. A clean reload restored the paused checkpoint, and **Show text** opened its explanation. No fresh browser warnings/errors followed that reload.
- 320 × 568 responsive view: avatar, current-state label and Show text control stayed inside the reserved header; playback controls remained visible; no document horizontal overflow.
- 1440 × 900 DOM placement check: dock and avatar returned to their desktop dimensions without horizontal overflow. This was a structural check; the in-app screenshot after that temporary viewport override contained a surface-size artifact and was not retained as desktop visual evidence.
- The viewport override was reset to the user's original 688 × 849 pane, and the tab was left paused with its explanation expanded.

Evidence: [compact phone view](compact-320.jpg), [actual teaching gesture](teaching-688.jpg), [clean final expanded view](expanded-688.jpg).

## Remaining limitation

**Idle remains static.** The home page uses a separate legacy renderer with a looping whole-image translation/rotation, and its speaking renderer has a timed mouth overlay. Those are not the independent blinking, gaze and facial rig requested in the original brief. This fix exposes and repairs supported authored pose changes; it does not claim natural idle or facial animation. Those still require compatible layered artwork described by the existing art handoff.

Only the existing frontend playground and pose renderer were changed. The shared presentation controller remains authoritative. No provider calls, production data changes, feature-flag changes or deployment occurred.

The earlier `expressive-v2-20261011` artifacts describe the prior implementation at its verification time; their source hashes do not describe this follow-up. See this directory's source manifest for the six changed frontend files.
