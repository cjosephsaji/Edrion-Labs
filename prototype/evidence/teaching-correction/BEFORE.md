# Teaching-flow audit — before behavior changes (29 October 2026)

Scope is prototype/. Existing unrelated working-tree edits are retained. No production M4/M5 evaluator, API, assessment or persistence code is part of this correction.

## Paths that advance without acknowledgment

- world/room.tsx:236–240: a 2400 ms book-card timeout calls beginTeaching. Reading the source is optional, but beginning teaching depends on elapsed time.
- world/room.tsx:242–282: each timeline key writes the beat's narration, highlight, pages and model changes. This is World-only teaching state.
- world/room.tsx:283–334: a 200 ms interval increments elapsedMs and advances beat when durationMs expires. MINIMAX_INTRO in world/teaching-script.ts autoplays opponent → MAX → MIN → all branches → backups → root, without any response at MAX or MIN.
- world/room.tsx:291–298: the intro's final input beat calls c.question(6), bypassing questions 1–6. Completion of animations is effectively treated as readiness for the full-tree decision.
- world/room.tsx:335–346: timeline.done automatically selects the first uncompleted question after pruning and switches to practice.
- world/room.tsx:439–499: nextQuestion starts minimax-pruning when Q07 has any completion, then searches the remaining bank. This differs from Classic's sequential next().
- world/room.tsx:641–661: Skip explanation also jumps to Q07 for the intro and finishes pruning visually.
- world/room.tsx:528–559: selecting a hazard can change the active checkpoint and expose its explanation without checking the student's response.
- components/workspace.tsx:221–247 and teaching/use-lesson-controller.ts:98–124: Classic's independent Show next step can reach pruning while still on a MIN question. I understand, continue advances without recording whether understanding was demonstrated.

## Answer/completion paths

- teaching/controller.ts:87–155: deterministic option, set and numeric equality; free text is recorded without grading. After two incorrect submissions a `worked` completion is written. Both renderers then allow Continue based on any completion, so repeated error can masquerade as checkpoint completion. Multi-select has no partial result. The original answer/retries/assistance are not retained as a response history.
- teaching/use-lesson-controller.ts:46–97: selecting some correct options mutates the model even before validation (KB derivation, weight, clock). check() then reveals tree values according to question index.
- lessons/{ai3,ai4,ehs3,ehs5}.ts: 12 questions each; topics.ts: 8 each. helpers.ts defaults hints to restatements of the answer, without a distinct second example/follow-up.
- teaching/algorithms.ts: trusted local minimax, alpha-beta event trace, permitted KB entailment, hazard/pollution inventories, toy multiplication and relativity clock calculation. Retain these as practice demonstrators.

## Interruption, presentation and shared state

- teaching/controller.ts interrupt/resume saves question/step/highlight and pause only. World askWorld has a separate previous-beat command. Prepared contextual retrieval is restricted to World in components/showcase.tsx; Classic falls through to unavailable live AI.
- teaching/contextual-explanations.ts reads actual visual values and asks for a node if ambiguous; some alternate explanations merely append prose. The World spoken selector favors the timeline over the interruption cue.
- Classic and World share ShowcaseState in components/showcase.tsx, but World has a separate timeline plus local scene phase. Entering World changes treeOrder to v2, changing C ordering and pruning answers mid-session.
- Speech is truthfully text-led. No isolated approved TTS is available. classic/companion.tsx's 500 ms greeting timer only displays a cue. showcase.tsx portal timers (180–2200 ms) and 30 s load fallback affect presentation only. scene.tsx useFrame animates camera/book/avatar/guardrails; book arrival switches to book card. These must never establish comprehension.
- teaching/server.ts exposes 503 for ask/topic: existing live tutor endpoints persist production conversation/academic state. Keep this isolation; prepared contextual teaching must be labeled. Extraction/upload timers only bound input processing.

## Correction direction

One logical checkpoint cycle in the existing shared state; both renderers consume the same authored explanation, deterministic validation, response observations and explicit continuation commands. No elapsed-time command may change concept or record a response. Wrong/partial responses retain the checkpoint and select a distinct worked example plus follow-up. Mode changes preserve values and in-flight teaching state. Observations remain ephemeral prototype practice, never academic evidence.
