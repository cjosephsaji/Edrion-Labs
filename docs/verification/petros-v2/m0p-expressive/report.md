# Petros M0-P expressive companion implementation

11 October 2026, Asia/Kolkata. **Implemented and verified within the existing fixture playground. Ready for human visual review.** Current art supports whole authored PNG poses. This is not a completed articulated character rig. M1–M8, paid auditions, migrations and deployment were not started.

Open the existing [local playground](http://localhost:3011/petros/companion-playground) with the previously allowlisted student session. Refresh the page to load the changes. Authentication/allowlist gates remain unchanged. The independently verified browser uses synthetic authentication metadata and does not require or change a real student's learning records.

## What changed and what remains dependent

| Classification | Result |
| --- | --- |
| **Implemented** | Existing manifest/policy/controller admit four authored cardinal point poses. Live target geometry, clipping and current canvas IDs validate the gesture. One gesture per action, six-second cooldown, bounded 700/820/940 ms hold and a restrained 240 ms opacity transition. No independent avatar clock. |
| **Implemented** | Quiet neutral rest/student-edit states, typing-ready status, truthful source-check pose, immediate interruption, suppressed repeated gestures after resume, neutral public-feedback acknowledgment, and missing-image/unsupported-capability fallbacks. Saved feedback no longer overrides subsequent teaching. |
| **Implemented** | Larger avatar: 92 × 124 CSS px desktop; 58 × 70 compact mobile and 70 × 94 expanded mobile. Authored transparent margins mean the painted silhouette is smaller. A fixed 140 px bubble and 156 px desktop harbor preserve conversation button positions. Expanding on mobile reserves a 210 px harbor below the title; compact mode keeps its existing 78 px reservation. Specific card labels, Your turn as a state, and contextual Ask without a competing footer Ask when a target is selected. Technical controls are inside the collapsed internal inspector. |
| **Implemented preparation** | Existing presentation controller handles bound local audio segments, real playback events, currentTime/duration, loading/stalls/errors, immediate stop, stale callback fencing and text recovery. Caption synchronization is at the whole semantic beat. Speech pose requires real `playing`; ordinary text explanations remain neutral or use a supported point. No word/viseme/mouth timestamps. |
| **Fixture-driven** | Teaching content, dialogue, public demonstration feedback, local checkpoint ownership and source checks. No adaptive model, private assessment, verified mastery or production learning integration is claimed. Persona remains `petros.companion.mentor.v3`; local guidance reinforces specific acknowledgment, patience and truthful boundaries. |
| **Artwork-dependent** | Natural blink, independent gaze/brows/head/mouth, multiple mouth shapes, expression transitions, head nods, independent breathing/posture, articulated limbs, precise hand contact, writing and walking. There are no legitimate separable source layers. See the [character rig handoff](../avatar-art/character-rig-handoff.md). |
| **Voice-provider-dependent** | Natural speech quality, effective Cedar/Marin voice, STT device accuracy, live route qualification, provider cancellation and measured bill reconciliation. There is no approved narration fixture; the playground remains explicitly in text mode. See the [inventory and audition proposal](voice-audition-proposal.md). |

Nine existing PNGs were visually inspected together. Only complete transparent silhouettes are separable. Independent facial/limb parts would need repainting of occluded surfaces. The V1 timer-driven mouth overlay and unused articulation props were inspected and preserved; they are not adopted as a genuine rig. The shipped manifest has empty layers/pivots/contact anchors, inventory hashes, actual supported/unsupported capabilities and fallback policy. All PNG bytes are unchanged.

Every teaching reaction comes from the current authored public action, a real source lookup, a committed local response or a student discussion. Waiting generates no timers, praise or unsolicited dialogue. Public demonstration feedback stays specific and neutral whether the authored relationship matches or needs comparison. The internal assessment-safe preview neutralizes companion pose, target and caption regardless of other public events; it is a policy rehearsal, not a newly implemented production assessment mode. No hidden correctness fields are consumed.

## Playback details and limits

One existing presentation owner drives canvas reveal, cues and audio. The companion pose governor samples shared updates and owns no timer. Pause/question/typing/hidden/restart/dispose revoke pointing; returning to the same action does not repeat it. Targets that are clipped, absent, on mobile, disabled or reduced-motion settle to neutral while the actual canvas highlight remains.

`loadedmetadata` and `canplay` do not imply audible speech. Real `playing` admits the static speech pose; `timeupdate` supplies bounded reveal progress within the segment. Captions remain whole semantic phrases. Waiting/stalled freezes dependent reveal and pointing. Audio error, autoplay rejection or a 12-second load/stall timeout preserves semantic work and offers explicit text continuation. In-memory resume restores actual playback time once a seekable range is available. A non-seekable source recovers in text instead of silently replaying from zero. Reload preserves the existing journal/reveal checkpoint and restores paused text mode; audio position is not durably stored.

Actual browser media testing found and fixed early seek assignments that clamp to zero, and native `pause` firing just before natural `ended`. The controller now waits for seekability and keeps the end barrier attached for natural completion. Approved local segments can be supplied through `configureNarration`; it rejects arbitrary remote URLs, duplicate segments and unknown beat IDs. No narration is configured in the shipped playground. The media rehearsal's local silent PCM WAV is a QA test signal, never a narration/voice-quality fixture or production asset.

## Automated and browser verification

| Check | Final result | Evidence |
| --- | --- | --- |
| Frontend, companion, narration, route, V1 voice and shell compatibility | **90 passed, 0 failed; 14 files** | [Raw results](frontend-tests.json) |
| Strict schemas, reducer, timeline, V1 engine/model/presentation/compatibility | **48 passed, 0 failed; 7 files** | [Raw results](schema-tests.json) |
| Existing gateway, voice adapters and companion contracts; mocked provider transport | **86 passed, 0 failed; 3 files** | [Raw results](voice-contract-tests.json) |
| Student and schema typechecks | **Pass** | [Student](student-typecheck.log), [schemas](schema-typecheck.log) |
| Scoped frontend lint and diff whitespace | **Pass** | [Lint](lint.log); existing Next pages-directory discovery warning only |
| Isolated production build, activation flag false | **Pass** | [Build log](production-build.log) |
| Chromium interaction, target, cancellation, editing and responsive walkthrough | **39 grouped checks passed; zero runtime errors** | [Browser results](browser-results.json) |
| Expanded avatar and bubble containment | **5 grouped checks passed; zero runtime errors** | [Expanded results](mobile-expanded-results.json), [320 px expanded capture](expanded-avatar-320.png) |
| Real HTML Audio lifecycle with local silent test signal | **3 grouped checks passed; zero runtime errors** | [Media results](media-browser-results.json) |
| Actual idle observation | **180.051 seconds; six samples, neutral, zero running animations** | [Idle observation](idle-observation.json), [continuous recording](naturalness-walkthrough.mp4) |
| Existing working-tree preservation | **No missing baseline files; all changes confined to this implementation/documentation** | [Preservation audit](preservation-audit.json), [exact file inventory](file-manifest.json) |

Runtime: Node 24.21.0, pnpm 11.1.2, Chromium 151. The first frontend attempt accidentally used the host's Node 25 through its misleading `node@24` symlink; its JSDOM localStorage failures are retained as preliminary evidence. Final checks use the pinned Node binary. The build and final typecheck were run with the isolated browser harness stopped, avoiding a transient deletion race involving its generated Next type files. The initial walkthrough harness assumed Finish step after a completed beat; the corrected final harness passes. Preliminary logs are retained and not counted as final passes.

Browser regression covers playback cycles, partial reveal/question/resume, source and formula selection, diagram node/edge selection, real dragging and drag-to-connect, obstacle routing, multiple/reverse relationships, label edits, undo/redo, invalid/stale gesture cancellation, retained drafts, submission/reload, responsive containment and touch. Viewports: 1440 × 900, 1440 × 600, 768 × 800, 360 × 800 and 320 × 568. Footer/toolbar bounds were measured. This is Chromium/touch emulation; physical Safari/Android microphone and speaker qualification remains open.

The main browser harness recorded only disposable GET `/v1/student/me`. The separate media harness serves a local page/module/silent WAV and an intentional missing-file 404. External browser requests are blocked. No paid provider dispatch, production submission, learner/evidence write, new agent, migration, registry synchronization, staging or production deployment occurred. Stored voice routes were inspected in a separate read-only metadata transaction.

## Human review: scenarios A–H

1. **A — Idle:** watch the first three minutes of the [continuous walkthrough](naturalness-walkthrough.mp4). Rest is deliberately still. Natural blinking is visibly absent and remains artwork-dependent.
2. **B — Equation:** choose Build an equation, Play, then Pause/Continue. Inspect the [directional equation cue](equation-directional-pose.png), active card and progressive derivation. The gesture is a whole authored pose; mathematical content/highlighting is the precise target cue.
3. **C — Diagram:** choose Build a diagram. See the [real node cue](diagram-directional-pose.png); it settles after the brief gesture. Newly introduced nodes/relationships remain the diagram's source of truth.
4. **D — Discussion:** select a card/node/arrow and use its Ask control. [Typing state](typing-stable-conversation.png) says Ready for your question; send and Continue lesson to resume the existing prefix. The recording includes this detour.
5. **E — Participation:** reach Your turn, edit a node/arrow or final equation slot and explain it. [Waiting state](student-waiting.png) is quiet. Submit demonstration response; feedback refers to the actual public local result and does not celebrate unevaluated reasoning.
6. **F — Interruption:** pause a point or partial reveal, wait, then continue. The point stops immediately and does not repeat for the same action; shared canvas/action IDs remain intact. For actual audio lifecycle see the separate zero-cost media results.
7. **G — Reduced motion/mobile:** check Reduce motion and use complete manual steps. Review [360 px](after-360x800.png), [320 px](after-320x568.png) and [touch editing](after-mobile-touch.png). Mobile stays neutral and parked in the existing header harbor. [Expanded mobile](expanded-avatar-320.png) reserves space below the title and above the visible canvas and playback controls; its bounds were verified at 320 and 360 px.
8. **H — Capability fallback:** open Internal inspector and disable Enable supported directional poses, restart/play. [Fallback capture](capability-disabled-neutral.png) shows neutral plus canvas highlight. Unsupported facial/limb capabilities remain absent from the manifest; they cannot be enabled accidentally. The separate neutral preview demonstrates assessment-safe companion policy.

The [art handoff](../avatar-art/character-rig-handoff.md) specifies actual layers, authored pivots/anchors, z-order, clean occluded surfaces, rest/expression exports and acceptance checks. The [voice proposal](voice-audition-proposal.md) identifies effective Onyx, the two Groq STT candidates and a separately approvable **$0.75 maximum** diagnostic envelope. Cedar/Marin candidates are not configured and are excluded from that priced envelope. No audition was executed.

## Exact application files

Modified existing files (relative to `/Volumes/Chris/Edrion Labs`; all were pre-existing, including uncommitted files):

- `apps/student-web/public/petros/v2/rig/manifest.json`
- `apps/student-web/src/features/petros-v2/presentation-controller.ts`
- `apps/student-web/src/features/petros-v2/companion/companion-controller.ts`
- `apps/student-web/src/features/petros-v2/companion/companion-policy.ts`
- `apps/student-web/src/features/petros-v2/companion/companion-persona.ts`
- `apps/student-web/src/features/petros-v2/companion/companion-rig.tsx`
- `apps/student-web/src/features/petros-v2/companion/companion-cloud.tsx`
- `apps/student-web/src/features/petros-v2/companion/companion.module.css`
- `apps/student-web/src/features/petros-v2/playground/floating-companion.tsx`
- `apps/student-web/src/features/petros-v2/playground/floating-companion.module.css`
- `apps/student-web/src/features/petros-v2/playground/companion-playground.tsx`
- `apps/student-web/src/features/petros-v2/playground/companion-playground.module.css`
- `apps/student-web/src/features/petros-v2/playground/teaching-playground.spec.tsx`
- `apps/student-web/src/features/petros-v2/canvas/teaching-canvas.tsx`

Created source/tests: `apps/student-web/src/features/petros-v2/companion/companion-naturalness.spec.tsx` and `apps/student-web/src/features/petros-v2/playground/narration-playback.spec.ts`.

Created verification tools: `docs/verification/petros-v2/verify-m0p-expressive.mjs`, `docs/verification/petros-v2/verify-m0p-media.mjs`, `docs/verification/petros-v2/verify-m0p-expanded.mjs` and `docs/verification/petros-v2/m0p-expressive/inventory-voice-routes.mjs`. Created handoff: `docs/verification/petros-v2/avatar-art/character-rig-handoff.md`. Updated existing `docs/verification/petros-v2/companion-playground.md` and `docs/verification/petros-v2/m0p-final/report.md`. This report, audition proposal, raw logs/results, snapshots, recordings and manifests are inventoried by exact path in [file-manifest.json](file-manifest.json). No staging or commit operation was performed.

Stop point: implementation is complete within supported art and fixture boundaries. Human naturalness/identity preference review, delivered facial/limb layers, approved narration and separately authorized actual-route auditions remain dependencies. No M1–M8 work begins from this result.
