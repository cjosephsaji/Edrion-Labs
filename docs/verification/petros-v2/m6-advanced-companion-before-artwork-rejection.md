# M6 — advanced companion integration

Engineering run: 20–21 October 2026 (Asia/Kolkata). **Human visual acceptance and M6 completion remain pending. Stop after M6; M7 has not started.**

## A. Executive summary

The existing Companion Playground/controller/target registry and M5 Studio are extended with a genuine hand-authored layered SVG candidate, five facial states, clipped pupil gaze, independent eyelid/blink controls, bounded head motion, authored arm/hand clips, a deterministic public-event controller and backend cue projection. Real saved prediction/experiment state and committed evaluator outcomes drive the Studio companion. Editing, dragging, interruption, hidden pages, pause and source revocation suppress instructional motion. Captions remain available after motion settles, can be dismissed and have transcript access.

This is an engineering candidate, not completed visual acceptance. Front and separately authored three-quarter studies are provided, while identity/directional/gesture art needs human review, and the 12-learner experience study has not been conducted. Broader regression failures and measured latency remain disclosed below. No production voice qualification, semantic-inference qualification, deployment, configured-target migration or M7 implementation occurred.

## B. Baseline comparison

[Original Studio screenshot](m6-20261020/baseline/studio.png) and [original manifest](m6-20261020/baseline/manifest.json) preserve the actual baseline. The old renderer selects whole PNGs, with painted facial features and explicitly unavailable gaze/lids/head/mouth articulation. The new renderer composes a clean shell/head with independent features and locally authored clips; it never masks the old raster face with replacement eyes/mouths. The sampler shows both at the same declared canvas size and with the same public caption. Actual lesson recordings compare the same M5 source, operations and private evaluator contracts.

The new finish is flatter than the original raster. That identity/style decision requires the user's review; engineering screenshots are not a declaration that the new appearance is preferable.

## C. Artwork inventory

[Editable master and five vector studies](avatar-art/m6/art-handoff.md), [runtime/source inventory](avatar-art/m6/inventory.json), and the unchanged original `/petros/states` PNGs. The master is native SVG authored for this implementation. Five transparent PNG exports share a 384×512 canvas and baseline. The native rasterizer initially required `xlink:href` for export; the empty first diagnostic export was replaced and the actual revised exports were inspected. The browser renderer uses the trusted SVG group library directly.

An [authored three-quarter study](avatar-art/m6/three-quarter-study.svg) is provided as unapproved reference art. Reviewed runtime turning layers, writing/contact assets and human art approval remain unavailable. These are explicitly listed in the handoff and manifest. No artist approval is fabricated.

## D. Rig architecture

`apps/student-web/public/petros/v2/rig/manifest.json` records asset version, SHA-256 pins, coordinate system, viewBox, origin, baseline, group names/order, pivots, eye/mouth/hand anchors, authored clips, directions, gaze/head/arm limits, expressions, mouth shapes, callout anchors and fallbacks. V1 pose paths remain available unchanged for legacy renderers and comparison.

The M6 loader verifies the local SVG hash, required groups, exact facial/shoulder anchor metadata and absence of script/event/foreignObject markup. It never inserts arbitrary model-authored SVG. Missing/mismatched art falls back to the aligned neutral PNG, then an accessible text label if that export also fails.

## E. Facial animation

Neutral, attentive, thoughtful, mildly pleased and uncertain are actual feature combinations in the shared head group. Pupils move within ±4 horizontal/±3 vertical SVG units and are clipped by the eye apertures. Brows move independently; head rotation is bounded to ±4°. The twelve-second blink uses the authored eye and lid groups. Expressions remain subtle; there is no sad/disappointed pose. Reduced motion keeps a settled expression without eyelid/head/mouth cycling.

## F. Gestures

Supported candidate clips: rest, slight head lean, nod/brief acknowledgment, open hand and four cardinal pointing directions. Arms overlap the shell rather than separating from the character; facial features move with the head. These are authored clips, not arbitrary reaching or finger articulation. No physical writing, pen contact, walking, breathing deformation or phoneme lip sync is claimed. Human gesture/identity review is pending.

## G. Companion controller

The existing companion subsystem remains the surface owner. M0-P's compatible presentation adapter and the M6 public-event admission live in the same controller module and renderer; no second tutor or academic decision loop is introduced. Lesson authority, local interaction, animation and existing media state remain separate inputs.

Priority is revocation/pause/hidden → explicit input/listening → assessment neutrality → committed public feedback → accepted instruction → quiet waiting. Standalone client cues are not an API input. The Studio additionally binds the admitted event to the exact current authenticated snapshot cue. Foreign sessions, stale revisions/epochs/activity/source pins, malformed/expired/future events and unsupported controls fail closed. Semantic cue IDs remain stable across polling and revision-only reads. Dedupe history is bounded; reload marks the last displayed event settled rather than replaying applause.

A point is admitted once per public event, with a 30-second cooldown (at most two per minute). Acknowledgment variants use public identity/history and settle when no sufficiently novel variant is available. There are no unsolicited help timers, idle speech loops, emotional-history tables or extra model calls.

## H. Source-grounded cues

`petros-companion-cues.ts` reads the already sanitized M4/M5 public projection after current authorization checks. It emits session/revision/epoch/activity/source/action/beat identity, intent, supported expression/gesture, registered target ID, utterance reference, bounded caption, assistance/result policy, priority, two-minute expiry and presentation-only acknowledgment semantics.

Before submission, the event is neutral and procedural regardless of the draft. A saved prediction is acknowledged without correctness. A refusal observation is joined to its actual current attempt and model/source pins. A saved explanation is explicitly unevaluated. Pending submission uses genuine checking status. Incorrect and partial results remain attentive; only an actual completed, matching, trusted successful evaluation permits a mild pleased expression/acknowledgment. Review-required, unavailable, invalidated and foreign evaluation results remain uncertain. No rubric, private reference answer, student response text or evaluator narrative is copied into a cue.

## I. Canvas coordination

The existing target registry now carries optional session/activity/revision scope and instance-safe unregistration. Geometry checks require connected, visible, current targets with finite dimensions, current accepted focus/highlight and source provenance. Ancestor clipping, sticky chrome, viewport/visualViewport bounds, hidden/inert state and center-point occlusion are checked. Removed, obscured or off-screen targets get a docked caption and no target gesture.

The companion attention envelope is look → gesture → companion highlight → settle (160ms/420ms/1,120ms boundaries). Existing academic canvas operations and their authoritative highlights are never delayed, replayed or altered to suit animation. The companion only decorates already accepted content. Its local envelope/expiry timers do not advance the lesson or admit evidence. There is no new automatic scrolling or avatar relocation. Existing pause/accepted-prefix persistence remains with M5.

## J. Speech and status clouds

Short public captions wrap inside the reserved dock, remain after gesture completion and have explicit dismissal/show-caption and transcript controls. A polite atomic status announces text changes; no animation frame is announced. Operational status never exposes hidden reasoning. The Studio's existing feedback palette remains in use. Cloud height is bounded with scrolling for longer text. Help controls wait for an active save to avoid losing an async source/preferences request.

## K. Voice boundary

The Studio still has no qualified production narration or live microphone route. Existing offline M0-P narration is available explicitly in the sampler through the existing `PresentationController`, with stop and mute. Passive decoded RMS analysis changes only the leaf mouth renderer; it neither creates a second player nor reroutes audio. Silence/stop/mute/missing analysis/reduced motion closes the mouth. The actual sampler browser test observed opening from decoded media and immediate closure on stop.

The recording's synthetic fixture voice is the existing offline macOS narration, not a paid provider audition. Browser video recordings are visual evidence; they do not certify voice quality or a production audio track. No M7 production STT/TTS, realtime route, phoneme alignment or new provider was added.

## L. Assessment privacy

The cue builder uses a closed projection and fixed procedural/feedback wording, not arbitrary evaluator feedback. Tests poison private labels, rubric/answer fields and student text, and verify they do not enter captions. The frontend checks current authority, commitment and assessment policy again; typing in an issued check also remains facially neutral. Positive expressions require a completed matching evaluation; neither saving nor a successful allocation implies learning or mastery. Companion acknowledgments are presentation-only and cannot become learning evidence.

## M. Interruption and recovery

Local input removes instructional targets and motion immediately; page hiding, source blocking and pause settle the character. The sole existing media owner handles audio stop/stall. CSS eyelid animation changes no lesson state. Reload restores the server-owned draft/task/accepted prefix, while local presentation history suppresses replay of a previously displayed reaction. Browser recordings and controller tests cover stopping and resuming without duplicating operations.

## N. Mobile and accessibility

The existing reserved Studio band is preserved; mobile keeps a compact dock with captions. The companion does not move over inputs or chase scrolling content. VisualViewport geometry accounts for keyboard-reduced space; active editing suppresses targeting. Existing preferences retain compact, hidden, reduced-motion and text-only modes. The sampler checks 360px, and Studio runs check 1440/1280/768/390/360px. Keyboard controls, stable image alternatives, atomic captions and transcript/dismissal focus are tested.

Physical-device, human screen-reader, enlarged text, contrast-tool and assistive-device acceptance remain pending. Emulated touch and DOM assertions are not human accessibility certification.

## O. Performance

[Subsystem microbenchmark](m6-20261020/subsystem-performance.json): 2,000 builds and 2,000 admissions from an actual loopback public snapshot. Build p50 0.051ms/p95 1.742ms; admission p50 0.047ms/p95 2.053ms. Large maximum outliers occurred on the loaded development machine; these are not realtime guarantees. The observed heap delta (~21MB) includes transient allocations and GC behavior, not a stable resident-memory qualification.

[Actual sampler rendering](m6-20261020/sampler-reviewed-take/render-timing.json): 90 frame intervals, p50 16.7ms, p95 17.5ms; 26 SVG elements in the character instance. Blink uses CSS and does not rerender the learning canvas. Audio sampling is confined to the mouth leaf at 80ms intervals. There are no requests per animation frame or model calls to choose expressions.

M5's previous loaded-local POST response-start p50/p95 were 951.3/2,092.4ms. M6's 254 successful session POSTs measured 867.0/2,193.7ms (maximum 4,368.9ms); 307 GETs measured 816.8/2,281.8ms. Eleven public-response-to-observed-frame samples measured p50 15.5ms/p95 40.1ms. Twelve real desktop/360px input-to-next-frame samples measured p50 4.1ms/p95 13.5ms, retained every field value, issued zero POSTs during typing and kept the verification face neutral. One actual audio stop-to-observed-closed-mouth sample measured 210ms including automation click dispatch and observation. These are local DOM/frame measurements, not photons, hardware guarantees or a production SLA. Builds/tests/recordings overlapped during diagnostics, so noisy measurements cannot establish a production regression or improvement. Existing acknowledgment latency has not been solved or qualified by M6. Low-end hardware, physical mobile memory/GPU and production load remain unmeasured.

## P. Test results

Latest per-file union: **315 UI passed / 0 failed / 0 skipped**; **301 API passed / 7 failed / 14 skipped**; **164 schema passed / 0 failed / 0 skipped**. The 231-case focused API retry (including 203 private/public HTTP cases), 75-case companion suite and 17 cue cases passed. The final M1 and M3 selected suites passed; M2 retains six failures rooted in a missing expected visual receipt, followed by dependent unavailable fixture fields. One M4 assessment case still fails source preparation with `PETROS_M2_VALIDATION_OR_INFRASTRUCTURE`. Fourteen optional M2 extension cases were not enabled. No failures were removed or relabelled as passes.

API/student production builds and API/student/schema typechecks passed. Focused student lint has zero errors/warnings; focused API lint has zero errors and five existing runtime-DI import-type warnings. Root formatter configuration requires an unavailable Tailwind plugin; formatting used the same explicit style settings without installing a plugin. `git diff --check` passed. These are selected checks, not a full repository pass.

Exact machine-readable results and commands are in [the verification command inventory](m6-20261020/commands.md) and [final result summary](m6-20261020/final-results.json). Failed/aborted diagnostics are preserved separately and never added to pass counts. Per-file unions count each test once. Selected suites are not proof of a full repository pass. Broad source/DB regression failures, infrastructure skips and compiler/lint outcomes remain explicit in that summary.

## Q. Browser evidence

[Local recording review](http://127.0.0.1:4985/review.html) and [portable index](m6-20261020/review.html). Media are actual continuous Playwright browser recordings; successful selected takes are copied byte-for-byte, not edited or spliced. The sampler passed 14/14 checks with zero page errors, including all five expressions, actual amplitude/stop, missing art, 360px, reduced motion, minimized text and transcript access.

The final index maps A–I to character showcase, actual Cloud teaching, quiet interaction, actual evaluation states, English activity, interruption/recovery, 360px, accessibility preferences and a paced ten-minute run. Three failed diagnostic long takes and a reload-timeout take remain diagnostics. The final long run lasted 629.825 seconds, completed 17 cycles and passed 74/74 checks. A recorder barrier was strengthened to join the exact acknowledged attempt before typing; the lab also synchronizes attempt draft scope before paint. Neither change alters assessment criteria. No human participants or authentic conversational AI inference are implied by scripted UI interactions.

## R. Artwork quality and acceptance

Engineering inspection used actual browser screenshots of the SVG assembly, expression studies, clips and Studio, plus aligned transparent exports. Anchors/groups/hashes and fallback behavior are tested. The old/new sampler uses a shared canvas rather than varying PNG crops. The front/three-quarter studies and gesture clips still need human identity/perspective/quality acceptance. **The complete visual-art gate is not passed.**

## S. Human evaluation

Actual participants: **0**. Human ratings and task-success study results: **not collected**. [Reproducible counterbalanced 12-learner protocol](avatar-art/m6/human-evaluation-protocol.md) covers both subjects, keyboard/reduced-motion users, naturalness, supportiveness, clarity, distraction, repetition, interruptibility, dismissal, cue understanding and actual task completion. Automated tests/recordings do not replace it.

## T. Preservation

The baseline records Git HEAD/status, source hashes, original manifest and historical hashes. The captured historical audit initially verified 3,692/3,692 files unchanged; final audit details are included in the evidence directory. Original rasters, V1 pose maps, prior plans/reports and old demonstration instances are preserved. New verification writers use a new evidence root, isolated PostgreSQL fixtures and distinct ports/cookie/output directories. No commit, push, deployment, configured-target migration or paid provider call occurred. Generated Next type include paths are recorded, not silently reset.

## U. Known blockers

Human art acceptance; review of the authored three-quarter study and unavailable runtime turning layers; human accessibility/12-learner evaluation; broad regression failures described in the final summary; local acknowledgment latency and resource-sensitive diagnostic timeouts. Existing M2 source-semantic/format qualification, expert academic/instrument review, production security/load, configured roles/migration reconciliation, provider/voice qualification and actual educational effectiveness remain separate open gates. This implementation does not clear prior historical M0-R/M4 issues.

## V. M7 readiness

The capability manifest, event bridge, shared controller, passive amplitude adapter and accessible dock provide an integration base. **M7 is blocked on explicit human acceptance and unresolved qualification/regression work.** No new production voice transport or real-time synchronization milestone was started.

## W. Manual acceptance checklist and direct URLs

1. Open [the actual layered character comparison](http://127.0.0.1:4984/verification/petros-v2/companion). Inspect five expressions, all gaze directions, open hand, nod/acknowledgment, point directions, 48–360px sizes and neutral fallback. Decide whether the candidate preserves Petros's identity and whether its flatter finish is acceptable.
2. Play existing narration, stop it and mute it. Confirm the mouth rests on silence/stop. This is offline fixture audio, not qualified production voice.
3. Open [a fresh original Cloud question](http://127.0.0.1:4983/demo/cloud-a?fresh=1). Submit work, inspect actual criteria, then choose “Work on this with Petros”. Watch the accepted teaching steps; edit/predict/test, observe a genuine boundary refusal, save an explanation and commit a correction.
4. Open [a VM repair laboratory](http://127.0.0.1:4983/demo/method-preview?fresh=1) or [English argument activity](http://127.0.0.1:4983/demo/argument-preview?fresh=1). Compare the companion's response to the saved state and actual evaluation. A bare session URL in a different browser does not establish its synthetic cookie; use these bootstrap links.
5. Pause, reload, resume, type and manipulate. Verify quiet behavior, preserved work and no ghost pointing. At 360px, test inputs, reference dialogs and submit controls. Use reduced motion, hide/text-only, dismiss captions and retrieve the transcript.
6. Watch [the actual recordings](http://127.0.0.1:4985/review.html), review the disclosed failures/limits, and record explicit appearance/animation/contextual/student-experience acceptance or requested changes. Complete the separate human and academic gates before authorizing M7.

Local URLs depend on the running isolated processes. `fresh=1` resets only the selected disposable demo actor, not a configured student or database. **Stop here for review.**
