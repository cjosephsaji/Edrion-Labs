# EDRION / PETROS — YC SHOWCASE PROTOTYPE: CODEX BUILD CONTRACT

**Date:** 27 October 2026. **Target recording:** before 2 November 2026.  **Project root:** `/Volumes/Chris/Edrion Labs`. **Scope root:** `<project-root>/prototype/`.

## 0. Read this first; these are already-decided product requirements

Build a genuinely clickable, uploadable, source-grounded Petros teaching SHOWCASE **inside the current Edrion student application**. Its name is **Petros Showcase**. It has two selectable interfaces over one per-session showcase lesson state:

1. **Classic** — the already-approved Edrion Outfit/sage/cream instructional system, original Petros image, styled popup speech/thought clouds, full-size accessible lesson canvas.
2. **Petros World** — one genuine browser-rendered 3D learning room with desk, bookshelf, whiteboard and experiment station; the same lesson and interactive DOM canvas is presented via camera/station modes, with the unchanged original Petros 2D artwork composited as a character in the scene until a faithful 3D rig is approved.

The experience must show **actual student interaction**, not a video, slideshow or a one/two-question demo. The four uploaded module PDFs are real source inputs. Provide 10–12 meaningful prepared checks per featured module with contextual branching/feedback, plus real open-ended interruption/questions through existing configured AI integration when available. There must also be two curated general-topic lessons ("How does AI work?", "Is time travel possible?") and an input for arbitrary topics.

**NO** new academic engine, second academic evaluator, schema migration, unapproved alternate Petros, fabricated AI response, fake assessment grade, PNG sliding masquerading as walking, automatic 3D import into normal Classic routes, global backend state, uncontrolled code cleanup, or unreviewed production rollout. The demo is **explicitly a showcase/prototype**, not a claim of fully validated independent adaptive mastery. Keep normal Petros / M4–M8 untouched. We approve precise UI behaviors below; engineering should discover API/file integrations only, not re-invent product design.

### Nonnegotiable folder boundary

All new showcase-specific components, manifests, question banks, source PDFs, fixture data, room scene, tests, notes and recordings live **under `prototype/` at repository root**. The only normal-app exception is the minimum route registration needed to expose **`/prototype`** in the existing Next student web app (typically a thin `apps/student-web/src/app/prototype/page.tsx` adapter), plus minimal documented build/workspace wiring if absolutely required. Do not scatter demo logic into production feature folders. Inspect actual current route architecture before writing the adapter. No modifications to existing `/petros/v2/session` behavior are authorized. If root-level imports require Next configuration, document the smallest tested accommodation.

### Directory contract

```text
prototype/
  README.md
  CODEX_IMPLEMENTATION.md
  assets/source-pdfs/{AI_Module_3.pdf,AI_Module_4.pdf,EHS_Module_3.pdf,EHS_Module_5.pdf}
  assets/source-manifest.json
  lessons/             # four source-linked lesson manifests + 2 open-topic manifests
  teaching/            # showcase-only state model, commands, source extraction adapter, conversational context
  components/          # common teaching board, media, dialogs, Petros clouds, actions
  classic/             # responsive Classic renderer; reuse approved existing UI primitives
  world/               # lazy client-only 3D scene, stations, camera & original character presentation
  tests/               # deterministic scenario/UI/integration tests
  evidence/            # screenshots, traces, demo capture verification; no secrets
```

Use these as canonical module ownership boundaries; choose idiomatic `.ts/.tsx/.module.css` names and keep each feature in the specified directory. You may add smaller files within these directories.

## 1. Preparatory repository checks — do this before edits

1. Record `git status`, modified/untracked work, current student app package versions, routes, existing M2 PDF extraction pipeline, configured LLM/voice connector, approved Classic components, source viewer, M5 canvas and current original Petros asset manifest. Do not reset/checkout/overwrite unrelated changes.
2. Verify the four source PDFs and their hashes in `prototype/assets/source-manifest.json` against actual bytes; stop if a source is missing or cannot be read. Never substitute generic tutorial text for missing source content.
3. Record a focused baseline test and existing build; do not require unrelated historical global suites to complete before beginning.
4. Add an opt-in toggle such as `PETROS_SHOWCASE_ENABLED` and ensure the prototype route is unavailable or appropriately protected when disabled. No automatic public indexing, no real students enrolled, and no production source/assessment writes.
5. Reuse existing auth/session and AI/provider capability where possible. If the safe existing provider path is unavailable, show a truthfully labeled demo limitation rather than silently generating a fixed response.
6. Verify existing Petros original artwork path, currently reported as `apps/student-web/public/petros/states/petros-idle.png`; never use the rejected alternate artwork. Copy of image may be referenced, but not regenerated.

## 2. Showcase home — exact screen and interactions

`/prototype` landing screen, using approved sage/cream Outfit visual identity, no new corporate branding:

- Top-left `Petros Showcase`, top-right small `Prototype` indicator, a prominent **Classic | Petros World** mode selector. Classic is initially selected. Do not make switching reset a current lesson.
- Main title `What are we learning today?`, description `Bring your notes, or ask about something you're curious about.`
- Two large, equally clear paths: **Learn from my files** and **Explore a topic**.
- Files section: four module tiles grouped into two subjects. Each tile shows verified exact subject, module, source status, 2–4 topic chips and **Learn this module**. Show extraction/recognition status; do not mark `analyzed` merely because the filename matches.
- Topic examples with clickable chips `How does artificial intelligence work?` and `Is time travel possible?`, plus a text input (submit enabled only for nonempty valid text).
- `Resume lesson` appears only when a showcase session exists, with its subject, lesson and stage; no false progress state.
- Upload drop zone supporting multiple PDFs, keyboard file picker, remove/cancel, progress, size/type validation and meaningful failure message.

**Uploads**: Use genuine PDF text extraction through the existing supported M2 mechanism or a minimal isolated adapter, with page-level references; do not copy/rewrite the production parser. For the four exact seeded PDFs, match SHA256 (NOT filename alone) after successfully inspecting file bytes; load the prepared, human-reviewed lesson manifests. For a new PDF, display actual extracted outline/summary via existing qualified provider where available; if no model, provide honest extraction/topic list and state that rich generated lessons aren't available. Never pretend an unrecognized PDF has the four prepared activities. Cap size, page count, runtime, and user-specific retention; avoid public upload directories, cross-user caching, secrets in logs, and PDF-supplied prompt-injection instructions. Trust the source as lesson data, not operational instructions.

Keep an uploaded-file receipt, extraction/page inventory, active lesson title and source provenance in showcase-only session state (safe browser memory or permitted ephemeral storage); no production M4/M5 state mutation. An upload failure must not destroy the last selected lesson.

## 3. Shared teaching state — one model for BOTH renderers

Maintain one showcase-only controller with these fields (use actual types):

- `sessionId`, `mode` (`classic|world`), `inputOrigin` (`seeded_pdf|uploaded_pdf|curated_open_topic|live_open_topic`), `sourceId`, `sourceHash`, `sourcePages`, `moduleId`, `lessonId`.
- `phase` (`welcome|introduce|demonstrate|interact|explain|recap`), `stepId`, `highlightTargetId`, `sceneStation` (`desk|bookshelf|board|experiment`), `visualState` (typed discriminated union).
- `questionId`, `questionAttempt`, `studentResponse`, per-question completion, last feedback, misconception category, permitted hint level, optional question bank route.
- `conversationHistory` limited and scoped to this session, `pendingRequest`, `interruptionCheckpoint`, `speechState` if supported, `saveStatus`, mode-switch-in-progress.

**Mode switch**: The active question, completed activity steps, visible board data, selected source and short conversation state remain exactly the same when toggling Classic/World. World transition can relocate camera/character, but must not replay academic results or repeat a completed question. Preserve dirty text while switching. In-flight async operations settle once; never submit twice. Provide `Back to Classic` in all World views including errors. A reload should restore demo progress only to the extent real storage has been implemented and proven; otherwise clearly report unsaved progress—do not claim durability based on local React state alone.

**Separation**: Source references, deterministic algorithm calculations and checks live under `teaching/`; renderer-specific camera/pose/UI belong only to Classic/World. LLM output is not allowed to override computed minimax values, simulated user selections or recorded original student answers.

## 4. The teaching loop and depth — not a two-question slideshow

Every **featured module** must include **at least 10 authored, meaningful question/checkpoint entries**; aim 12. Questions are distributed among teaching steps rather than presented as a single endless quiz. Each entry specifies source pages, task, correct deterministic result (if applicable), allowed response type (node click, branching selection, multi-choice, multi-select, structured fill-in, free explanation), misconception mapping, hint #1, hint #2, retry/skip policy and next step.

For every featured lesson:

1. **Introduce**: One curiosity-based question, then compact sourced concept; user can request a simpler explanation.
2. **Demonstrate**: Petros points out actual labeled/visible entities, step-by-step. No 5-second wall of text.
3. **Predict**: Student makes at least one real choice before the system reveals a result.
4. **Experiment**: Student changes something; visualization visibly updates with deterministic outcome.
5. **Explain**: At least one response in the student's own words, optionally ungraded or model-assisted with clear uncertainty.
6. **Transfer**: A similar-but-different scenario proves the student can apply the concept rather than memorize the demonstration.
7. **Recap**: Cite covered source pages, show explored concepts, help exposure, and recommend another lesson. Never claim academic mastery/graded certification from prototype interactions.

Use a mixture of questions instead of 12 generic radio inputs. Students can interrupt at ANY teaching/demo step; show `Pause`, `Repeat this step`, `Go deeper`, `Give me another example`, `I understand, continue`. The controls must perform their stated effect. Never force everyone through all 12 questions to demonstrate completeness: label the guided checkpoints, allow a later user to continue, and show real progress `x/12 explored` only for counted interactions.

**Free text**: Do not grade via brittle keyword matching or regex. Use a real available authorized AI feedback call if configured; if unavailable, save the text as an explanation and say `Recorded — not automatically evaluated`. Structured numerical/selection questions are checked by a deterministic local demonstrator and described as `Practice feedback`, NOT a formal school grade. Interpret a wrong answer as a specific misconception, show one scaffolded hint, allow retry, and on repeated struggle show the worked step and mark help exposure in demo state. Avoid praise for every click.

## 5. AUTHORED FEATURED LESSON 1 — AI MODULE 3

**Display:** `Artificial Intelligence / Module 3 / Minimax & Alpha–Beta Pruning`.
**Source:** `AI_Module_3.pdf`: syllabus p1; minimax/game trees pp2–6; alpha–beta pp7–10; CSP examples pp11–12 and later relevant pages.

### Interactive tree fixture (explicit, deterministic)

Use the following illustrative game tree, marked `Worked teaching example adapted to the module concepts` (do not falsely claim the exact tree appears in the PDF):

```text
                      MAX (root)
                /        |         \
             MIN A     MIN B      MIN C
            /    \     /    \      /    \
           3      5   2      9    1      4
```

Evaluation: `A=min(3,5)=3; B=min(2,9)=2; C=min(1,4)=1; root=max(3,2,1)=3; optimal child A`.
Alpha-beta with the fixed traversal `A→B→C`, leaves left→right: visit 3 and 5 at A, root alpha=3; visit 2 at B -> beta=2 <= alpha=3 -> skip B's 9; visit 1 at C -> beta=1 <= alpha=3 -> skip C's 4. **Four leaf evaluations, two leaf skips**, same final decision. Compute this in code, do not fake the counters in display. `Show all leaves` and `Step pruning` controls are working and linked.

### Exactly authored question bank (minimum these 12)

| ID | Question/action | Correct practice outcome / feedback contract |
|---|---|---|
| AI3-Q01 | "Why must a game-playing AI consider the opponent?" choose among `Opponent responds strategically / Environment never changes / AI knows the future` | First; if wrong, relate to adversarial goals. |
| AI3-Q02 | Highlight which tree layers belong to MAX versus MIN | Root MAX and three child MIN nodes; highlight actual nodes. |
| AI3-Q03 | "At MIN A, choose between 3 and 5" click a leaf | `3`; if `5`, explain MIN minimizes MAX utility. |
| AI3-Q04 | "What value does MIN B return?" choose 2 or 9 | `2`; update B only after selection. |
| AI3-Q05 | "What value does MIN C return?" choose 1 or 4 | `1`. |
| AI3-Q06 | "What is the root value?" numeric/branch selection | `3`; show max of 3,2,1. |
| AI3-Q07 | "Which first move should MAX choose?" click A/B/C | `A`; keep all branch values visible. |
| AI3-Q08 | "Do we need to inspect every leaf to make the same decision?" predict yes/no | `No`; introduce alpha-beta. |
| AI3-Q09 | After A sets alpha=3 and B yields 2, "Can we skip B's second leaf?" | `Yes`, because MIN B cannot improve MAX's 3. Highlight skipped 9 without treating it as visited. |
| AI3-Q10 | After A sets alpha=3 and C yields 1, "Which node can be skipped?" | `4`; show bound/decision. |
| AI3-Q11 | "How many leaf values did pruning evaluate?" numeric | `4`, versus `6` without pruning for this fixture/traversal; show real counter. |
| AI3-Q12 | Student describes why pruning keeps the same answer; free text | Save; optional real AI explanation review with uncertainty, or ungraded. Then offer new small tree or CSP map-coloring practice. |

**Optional CSP mini activity** if core four lessons are complete: small adjacency map from module's map-coloring X/D/C example; selection updates region colors, rejects adjacent same-color conflicts, shows MRV/least-constraining hints. Don't promise this before the flagship is working.

### Visual animation sequence

`Explain players` (highlight root MAX, then children MIN) → `Reveal leaves` (250ms node reveal per group) → `Backup values` (highlight 3/2/1) → `Root decision` (A highlighted) → `Alpha-beta pass` (visited edges green, skipped leaf edges dashed/low-opacity amber) → `Student picks first move`. All step transitions manually advanceable, `Back one step` restores the previous visualization without mutating question answer history. If reduced motion, no timed tweening; render each step fully.

## 6. AUTHORED FEATURED LESSON 2 — AI MODULE 4

**Display:** `Artificial Intelligence / Module 4 / How an AI Reasons with Knowledge`.
**Source:** `AI_Module_4.pdf`: knowledge-based agents and TELL/ASK p1–2; propositional concepts p3–6; inference, unification, resolution later, forward/backward chaining pp27–29.

### Exact demo knowledge base

Show three aligned sections `Facts | Rules | What follows`. Use an illustrative logically valid toy KB:

- Initial fact `Bird(Tweety)`.
- Initial rule `∀x Bird(x) → HasWings(x)`.
- When `Apply rule` is selected, derive `HasWings(Tweety)` via substitution `x := Tweety`.
- `ASK HasWings(Tweety)?` => entailed by KB, with visible reasoning path.
- `ASK CanFly(Tweety)?` => **not entailed by this KB**, NOT "false". Do not add a made-up `all birds fly` rule.

Allow choosing a second entity (`Bird(Rio)`) and deriving `HasWings(Rio)` with the same rule. Show difference between forward chaining (facts→conclusion) and backward chaining (query→supporting facts). Use source references for the mechanism, label the example as illustrative.

### Twelve authored checkpoints

| ID | Task | Expected logic / handling |
|---|---|---|
| AI4-Q01 | What does a knowledge-based agent store? | Facts/rules represented in a knowledge base; not only pictures. |
| AI4-Q02 | Student clicks `TELL Bird(Tweety)` | Add exactly this fact, visible in Facts. |
| AI4-Q03 | Where does `Bird(x)→HasWings(x)` belong? | Rules column. |
| AI4-Q04 | Which substitution matches rule to Tweety? | `x = Tweety`. |
| AI4-Q05 | Click `Apply rule`: what conclusion appears? | `HasWings(Tweety)` and an explicit derivation arrow. |
| AI4-Q06 | Ask `HasWings(Tweety)?` is it supported? | Yes, entailed; show exact support. |
| AI4-Q07 | Ask `CanFly(Tweety)?` what can we conclude? | Unknown/not entailed, not false; diagnose conflation. |
| AI4-Q08 | Which order is forward chaining? | Facts→applicable rule→new fact. |
| AI4-Q09 | Which order is backward chaining? | Goal→required premise→stored fact. |
| AI4-Q10 | Add `Bird(Rio)`, request result | Derive `HasWings(Rio)` through same rule. |
| AI4-Q11 | Identify which of two conclusion arrows is unsupported | Any `CanFly` arrow is unsupported by this KB. |
| AI4-Q12 | Explain how TELL differs from ASK in own words | Save as ungraded or real AI-reviewed with uncertainty. |

Give corrections at the precise rule/fact node, not generic wrong-answer copy. No actual logic theorem prover is required outside these safe demonstrator rules.

## 7. AUTHORED FEATURED LESSON 3 — EHS MODULE 3

**Display:** `Environmental & Health Safety / Module 3 / Find the Construction Hazards`.
**Source:** `EHS_Module_3.pdf`: construction hazards p2, scaffold types p3, scaffold hazard list p7, assembly/use controls pp8–12; excavation p13 onwards; welding p26 onwards. Use user-provided source photos ONLY if usage/licensing permits; prefer original simple labeled illustrations for the showcase. Do not use actual dangerous site footage or depict injuries as entertainment.

### Exactly described safety scene

A static 2.5D/site-plan illustration composed of **five distinct labeled selectable hazard regions**, e.g. scaffold with missing top guardrail, loose/unsecured tool by edge, ladder/unsafe access, unsecured wheel/castor, and overhead power-line clearance. Show no fake hazard hotspot unrelated to visible artwork. Each hotspot has an invisible accessible hit target plus keyboard list alternative `Inspect hazard 1–5`. Selection adds an outline and opens an explanation. `Show safer setup` toggles an illustrative corrected state with a clear changed element; avoid implying site-specific engineering sign-off.

**Do not ask the student to perform real workplace operations.** Say educational illustration, not live safety advice. The module is a teaching input, not regulatory certification.

### Twelve authored checkpoints

| ID | Task | Correct outcome |
|---|---|---|
| EHS3-Q01 | Which main risk comes from an unguarded scaffold edge? | Fall from height. |
| EHS3-Q02 | Click the missing guardrail location | Highlight the exposed edge. |
| EHS3-Q03 | Why are loose tools near an elevated edge a hazard? | Objects may fall onto people below. |
| EHS3-Q04 | Click the overhead electrical hazard | Locate nearby power lines; do not invent exact clearance distances. |
| EHS3-Q05 | What can an improperly supported platform cause? | Instability/collapse or planking failure, per source. |
| EHS3-Q06 | Is it safe to place a ladder on an unsuitable mobile scaffold? | No; overturning/misuse risk. |
| EHS3-Q07 | Choose safe base condition | Firm, level ground and properly secured/locked support. |
| EHS3-Q08 | Should a tower be moved with people on it? | No, according to these module notes. |
| EHS3-Q09 | Which visual fix addresses the exposed edge? | Correctly depicted guardrail/barrier. |
| EHS3-Q10 | Distinguish scaffold assembly hazard from use hazard | Classify pictured assembly/access vs slipping/use examples. |
| EHS3-Q11 | Find one excavation risk illustrated in a second small scene | Unsupported sidewall/collapse hazard; stay conceptual. |
| EHS3-Q12 | Describe two hazards and controls from the scene | Ungraded explanation or qualified feedback only. |

Visual outcome: wrong hotspot shows gentle neutral `Not that one—look near the platform edge`, no red 'student failed' explosion; correct hotspot green check plus explanation. An illustrative `Before | Safer illustration` comparison must visibly change hazard features, not merely recolor a label. Provide a clear alt-text/list equivalent.

## 8. AUTHORED FEATURED LESSON 4 — EHS MODULE 5

**Display:** `Environmental & Health Safety / Module 5 / Protecting Water Resources`.
**Source:** `EHS_Module_5.pdf`: module scope p2, safety-inspection purposes pp3–5, first-aid supplies pp6–13, PPE pp25–26, conservation pp38–39, water pollution control pp44–48, individual prevention pp50–53. For YC flagship teach environmental prevention, not procedural CPR; existing first-aid notes may be dated and must not be presented as up-to-date emergency protocol without review.

### Exact simplified environmental visualization

Illustrated upstream→town→farm→river flow. Four independently selectable pollution sources: untreated wastewater outfall, farm runoff from excessive chemicals, dumped solid waste, oil/grease into drains. Control choices: treat wastewater before discharge, reduce agrochemical runoff, dispose/recycle solid waste correctly, prevent grease/oil entering drains. Toggling an intervention changes a descriptive qualitative state (`Uncontrolled source` → `Source controlled in illustration`). **Do not invent percentages, water-quality metrics, scientific simulations or 'river now safe to drink' outcomes**. Each intervention must be paired with a textual reason sourced to pages 44–48.

### Twelve authored checkpoints

| ID | Task | Expected teaching response |
|---|---|---|
| EHS5-Q01 | Identify why safety inspections are performed | Recognize hazards and corrective actions (pp3–5). |
| EHS5-Q02 | Click an untreated wastewater outfall in the diagram | Locate direct discharge. |
| EHS5-Q03 | Choose best response for untreated sewage | Treat before discharge (p44). |
| EHS5-Q04 | Click runoff area from fertilized farmland | Recognize agricultural runoff source (pp45–46). |
| EHS5-Q05 | Pick an appropriate runoff-reduction idea | Reduce excessive fertilizer/pesticide use. |
| EHS5-Q06 | Why should solid wastes not go into waterways? | Contamination; proper collection/disposal (pp46–48). |
| EHS5-Q07 | Does oil/grease belong down the drain? | No (p48). |
| EHS5-Q08 | Is treated wastewater always safe for any purpose? | No; appropriate reuse depends on treatment/standards; do not claim drinking safety. |
| EHS5-Q09 | Choose individual conservation action | Save water/energy or responsibly dispose hazardous products (pp38,50–52). |
| EHS5-Q10 | Match an inspection to its purpose | Spot hazard → recommend corrective action. |
| EHS5-Q11 | Which combination controls most shown pollution pathways? | Treat wastewater, reduce runoff and prevent solid waste/oil dumping (all shown controls). |
| EHS5-Q12 | Explain a pollution-prevention plan in own words | Record or real contextual feedback with uncertainty. |

Possible small second scene after Q10: `PPE check` using two source-grounded PPE selection examples, but do not delay flagship to implement extra PPE graphics. Do not fabricate medical training outcomes.

## 9. TWO OPEN-TOPIC SHOWCASES AND ARBITRARY TOPICS

Provide exactly two polished curated entries, each with **at least eight meaningful checkpoint options** and one targeted visual experiment:

**"How does artificial intelligence work?"**: (1) AI task distinction, (2) examples/data, (3) input vs output, (4) model prediction, (5) error vs target, (6) change a labeled toy connection weight (illustrative), (7) repeat prediction, (8) why training needs examples / limitations. Use a tiny *illustrative* simple perceptron or network; do not claim it accurately depicts a real large language model's internals. If a deterministic tiny model is shown, compute its values consistently.

**"Is time travel possible?"**: (1) distinguish fiction from testable physics, (2) compare observer clocks, (3) forward time dilation, (4) two hypothetical speed settings, (5) calculate/display consistent illustrative relative elapsed time with a genuine formula and units, (6) identify frame/reference caveat, (7) discuss why backward travel is not established, (8) recap evidence vs speculation. Explicitly label the clock demonstration a *simplified relativity model*. If a formula is not actually implemented/tested, remove numerical claims and display a qualitative comparison instead.

For arbitrary typed topics: create a real request through the existing configured model interface if available. Ask for a safe, age-appropriate outline plus 5–8 brief teaching prompts, then render generic `concept card / comparison / sequence / diagram / Q&A` components. If model unavailable, show helpful error and keep typed prompt. **Do not pretend arbitrary topics automatically generate custom true 3D simulations or pass source-qualified academic review.** Clearly distinguish `From uploaded module` versus `General knowledge lesson (AI-generated)`.

## 10. Classic Mode: exact rendering

Reuse the approved existing Outfit variable font, sage/cream tokens and recently implemented Classic Learning components where possible. The prototype's Classic should feel like the reviewed interface, not a second design system.

- Desktop max content width about 1260px, main learning canvas plus roughly 260px Petros rail and 24px gap; mobile single column at <=760px; 360px layout must not overflow.
- Heading 30–36px desktop / 27–30px mobile; explanatory text >=16px where practical; secondary >=14px except truly decorative micro-labels.
- Stable top `Subject / Module / Lesson`, `Mode: Classic | World`, progress `Teaching step 3/8` (actual). One primary CTA per active state: `Start lesson`, `Show next step`, `Try this`, `Check practice answer`, `Continue` as appropriate.
- Main learning canvas has actual interactive SVG/DOM visuals (numeric tree, KB, safety hotspots, environment), keyboard alternatives, focus rings, and live feedback. No endless nested cards or identical-looking actions.
- Original Petros character always visible in bounded companion space without permanent chat box. Speech cloud for direct intro/acknowledgment; thought cloud for permitted student-requested hints; amber notice for model refusals/educational caution; close button accessible; short content only, long authorized explanation in accessible reader.
- For an active source-backed passage, provide `View source` opening verified PDF/page references and `Full explanation` separately. Do not cram lengthy PDF text inside a tiny thought cloud.

### Specific Petros cue policy (not generic 'feel alive')

- New lesson ready: neutral original pose, after ~500ms cloud `We'll figure this out together. Ready?` once; no correctness implication.
- Student clicks a tree/diagram element: do NOT auto-chat every click. Highlight the chosen target; Petros follows with a short cue only if it is the current instructional checkpoint.
- Wrong deterministic practice response: after result acknowledgement, Petros says **which concept** matters (`This is a MIN node—it chooses the smaller value`) or shows tier-1 hint; no fake academic failure.
- Student explicitly requests a hint: authorized short text thought cloud remains until dismissed; mark showcase help exposure.
- Student types, drags, scrolls source or opens input: automatic cloud hides/yields immediately; no focus theft.
- User interrupts with question: pause current teaching progression, retain diagram node/step highlight, handle model request, display actual answer with clear citation/general-knowledge label, then offer `Resume explanation` (not restart).
- No model configured/request failure: display `I couldn't answer that right now. Your lesson is still here.` plus Retry; never use canned response secretly as if generated live.
- Student mode-switches: cancel presentation timers in old renderer, preserve activity and any pending model result; new renderer starts at current station/step, without resetting/duplicating question.

## 11. Petros World: exact room, positions, controls, accessibility

**Implement an actual GPU-rendered Three.js scene**, using a React Three Fiber version compatible with current React/Next dependencies, lazy-imported ONLY when World is selected, with SSR disabled for the canvas entry. Do not choose a CSS-only flat illustration and call it 3D. No new general scene/game engine or physics dependencies; prefer primitives and a few reusable meshes/materials. If adding Three/R3F changes global bundle critical path, restructure lazy loading.

### Room geometry / anchors

One room floor roughly `12 × 8` scene units, open front/ceiling viewpoint; three-quarter orthographic camera so text surfaces remain readable. Use pale warm walls, sage accents, light wood desk, diffuse shadows, a little warm sunlight. Make four interactive stations with stable semantic IDs and a readable accessible DOM station list:

- `desk`: left foreground around `(-3,0,2)`, chair, book/notebook; greet and talk here.
- `bookshelf`: left rear around `(-4,0,-2)`, four selectable module-book spines with AI/EHS/module labels; selecting a book switches source only after click.
- `whiteboard`: center-rear around `(0,1.6,-3)`, wide readable blank surface with lesson content overlay/DOM companion, not sole text source.
- `experiment`: right foreground around `(3,0,1)`, small work table and source-dependent interactive model prop.

Tune precise positions only to prevent collisions and occlusion; do not change station count, interaction semantics, or general visual style. Scene model should visibly contain mesh geometry from multiple viewpoints. No free WASD navigation; room camera has three presets: `wide`, `teaching`, `interaction`.

### Camera rules

- `wide`: show all four stations, initial fixed 3/4 orthographic view; frame stable for choosing book.
- `teaching`: pan/dolly approximately 550–750ms to clearly frame board + original Petros at the teaching anchor; show actual diagram on legible DOM/board companion layer, not tiny unreadable texture.
- `interaction`: camera becomes still; lesson tool expands into accessible full-width React DOM workspace, Petros appears smaller to side; keyboard/dragging always on DOM; no camera motion during interaction.
- `reduced motion`: immediate cuts, no interpolation; `Escape` / `Back to room` from interactions; camera must not capture scroll-wheel while text scrolls; never cover primary learning controls.

### Original Petros in room — honest visual fidelity

Use ONLY unchanged approved original 2D Petros assets via a camera-facing composited sprite/plane or DOM overlay anchored to scene station. Do not use unapproved 3D model. The accepted poses currently reported: neutral, listening, thinking, static talking, four pointing directions. Verify manifest and only use actual assets. If an approved pose aligns with content target, switch to it; if not, neutral pose with board highlight. **No sliding the flat PNG across the floor to pretend to walk.** When changing stations, do a scene-motivated brief fade/camera transition: old station Petros fades for ~150ms, board/book target focus transitions for ~500ms, Petros appears at destination anchor within ~150ms. This is an explicit 'scene transition', NOT a walking animation. Never present it to user/YC as a fully articulated walking character. If a faithful real rig approved by owner becomes available, it may be substituted separately after visual sign-off, not by this sprint.

### Detailed station storyboard with triggers

| Trigger | Scene/camera/character | On-screen content and control |
|---|---|---|
| Enter World | Wide, Petros original neutral at desk; 450ms reveal | `What are we learning?` cloud and selectable books. |
| Choose AI Module 3 | Highlight selected bookshelf spine; scene-cut Petros desk→bookshelf, 150/500/150ms sequence | Source title, `Open this module`; do not start lesson before student requests it. |
| Start minimax | Camera teaching; Petros at board-left anchor and approved left/right point only if aligned | Whiteboard shows labeled game-tree root, text `MAX chooses high values; MIN chooses low values`. |
| Click `Show next step` | Keep teaching camera stable; advance actual teaching visual step | Highlight child/leaf or value; one synchronized short speech cloud at relevant checkpoint, no invented gesture. |
| Student asks `Why did MIN choose 2?` | Freeze current tree step, no camera move during typed input; pose listening if approved | Provide actual current node + numeric values to LLM; answer; offer Resume. |
| Click `Try it` | Transition to interaction focus and full accessible diagram | Same tree/checkpoint as Classic; one primary practice action. |
| Complete/continue | Return to wide room; Petros fades into desk/rest station | Recap actual explored concepts and source pages. |
| Select EHS | Scene focus at experiment table; highlight conceptual construction model or river diagram | Use same stateful safety hotspot/water intervention UI in focused DOM. |
| Change Classic/World | Dispose old renderer timers and audio/selection ownership | Preserve all inputs, task state, current diagram/feedback, and source identity. |

**Functional 3D requirement:** Each station must be clickable/pickable and produce a real camera/UI state change. Book selection changes the selected module; whiteboard moves to teaching; experiment moves to activity; desk moves to welcome/recap. Do not add 3D objects that have no meaningful action beyond decoration as substitutes for required interactions.

### Performance and fallback

Provide initial-loading progress, WebGL/support detection, context-loss recovery or graceful fallback, and a `Switch to Classic` action at every World failure. No giant texture maps, no infinite animation render loop unrelated to need, no full-page flashing. On a midrange desktop target 30+ FPS in observed demo conditions; **measure**, do not simply claim. Test interaction focus at 1366×768 and 390×844; small screen may offer static room overview with full DOM activity focus rather than shrinking the interactive board into unreadable 3D. Keep a reduced-motion route.

## 12. Context-aware conversation & voice

Petros is a tutor, not a transcript of hardcoded lecture messages. When a real model provider is enabled, send the latest **authorized source excerpt and page reference**, current lesson ID/step, diagram node/selected control, source type, bounded prior turns, current question and current demonstrated model values. Never send entire raw PDF when 1–2 relevant excerpts suffice. No arbitrary code execution from model output; no hallucinated event/state changes.

Available user actions: `Ask Petros` (free-form input), `Explain more simply`, `Another example`, `Why this step?`, `Go deeper`, `Repeat`, `Pause/Resume`. Each must target current state and either produce a genuine contextual response or clearly report unavailable support. Source-backed Q&A should cite source module/page where supported; general questions must be visibly marked as general-knowledge rather than claimed from uploaded course files. Store only permitted ephemeral conversation data; no undisclosed third-party handling.

Voice is optional for demo reliability: reuse existing stable TTS/STT only if verifiably working; show captions and manual text interruption at minimum. Audio must obey browser autoplay and stop when mode/lesson changes. Never pretend prerecorded sample audio was generated live. If narration is recorded specifically for the YC video, label scripted paths internally so reviewers know which parts are prepared. Do not deliver video with voice synthesis broken.

## 13. Visual quality: concrete acceptance checklist

- Maintains approved Outfit and sage palette, correct responsive spacing, no giant empty Petros textbox, thought clouds with proper trailing bubbles and bounded length.
- AI3 tree arrows/node labels and min/max states legible, correct branch/prune outcomes; CSP optional.
- AI4 Facts/Rules/Derived sections and arrows animate only after logically validated action.
- EHS3 selectable hotspot accurately overlaps a visible hazard; compare mode **changes scene elements**, not a recolored text label.
- EHS5 interventions visibly change conceptual discharge/controls, with no fabricated quantitative claims.
- In World, room proportions and lighting attractive, real scene depth, no z-fighting, readable book titles/DOM overlay, four working station clicks, Petros never rendered as a different mascot.
- Petros original artwork is not re-generated and is no more animated than the actual approved poses allow. Cloud motion is okay; fake walking is not.
- Students can always return to previous explanation, exit World, recover after failure, use keyboard navigation and reduced motion.

## 14. Verification — perform actual implementation and report only observed outcomes

Focused unit tests for 4 question banks (minimum 12 per module), alpha-beta deterministic values + pruning count, KB unknown-versus-false, hazard list/hotspots, pollution intervention state, source hash association, page provenance, mode-switch state, interrupt/resume and cue priority. Test different upload filename with same content hash; unmatched PDF must not get prepared lessons. Test malformed and oversized PDF rejection. Test PDF text prompt injection cannot cause tool/privilege instructions.

Browser evidence for **real application** at 1440×900, 1366×768, 390×844 and 360×800:

1. `/prototype` gated route loads, Classic default, four PDF cards available.
2. Upload same four PDFs; show real parse/recognition receipt then four source-labeled modules.
3. Open AI3: answer some questions, demonstrate tree A=3, B=2, C=1, root=3, alpha-beta visits four leaves and prunes two.
4. Ask an interruption about highlighted MIN node, verify live contextual response or explicit unavailable state; resume exact step.
5. Mode-switch at midlesson and midway through text input; confirm same question/tree state and draft.
6. World room loads, all four stations selectable; bookshelf selects an actual module; teaching focus and experiment focus work; original character correct.
7. Open EHS3 and use at least three hotspots; open EHS5 and apply at least two pollution controls.
8. Open AI4 and derive `HasWings(Tweety)`; `CanFly(Tweety)` reported not established by KB.
9. Launch both open topics; demonstrate AI illustrative model and relativity clock/qualitative comparison.
10. Submit an arbitrary open topic; verify genuine generation or honest failure, not a secretly canned response.
11. Keyboard focus, accessibility alternative, reduced motion, 360px no horizontal overflow, source reader open/close, WebGL failure fallback.
12. No access to production assessment writes or production academic mutation; no inadvertent import of 3D into non-prototype student routes.

Do not fabricate browser captures, user-study results, test counts or model-output evidence. If there is no live model, document exactly which asks are prepared vs which are unavailable. If only three featured lessons are finished, explicitly say which one is incomplete and do not claim four.

## 15. YC recording path: camera-ready, not faked

Prepare a repeatable screen-recording walkthrough stored as `prototype/evidence/recording-script.md` and a **manual route** for the user to follow. Optional capture automation may record the actual app with real UI actions; do not replace failed product behavior with edited mockups. Target ~90–120 seconds, with no guarantee of finishing everything in two minutes.

- `00–15s`: open Petros Showcase, upload one of the four real PDFs (or show verified prepared ones already imported), select AI3.
- `15–40s`: Classic visual minimax and user node choice; real values propagate.
- `40–55s`: Student asks why MIN chose smaller number; contextual reply with exact highlighted values.
- `55–85s`: switch to World midlesson; same tree on board; move from desk/bookshelf to board via honest scene transitions and then interaction focus.
- `85–105s`: switch to EHS3 hazard scene OR EHS5 river activity and perform a meaningful selection.
- `105–120s`: show an open topic chip or module recap and explicit next-step option.

**YC honesty:** Prepared lesson scripts and demo-specific visualizations are allowed, but do not claim that all lessons, all arbitrary uploads, all evaluations or fully articulated character locomotion are currently generated/performed live. A founder introduction video is separate from any optional product demo; do not put demonstration footage into a founder-introduction-only submission requirement.

## 16. Cut order and time protection (high priority)

Do these checkpoints sequentially and retain a working demo at each checkpoint:

1. **Checkpoint A:** Root `prototype/` scaffold, gated route, four real PDFs/extraction receipts, seeded source-backed manifests, fully working Classic AI3 minimax with >=12 questions, real source references, contextual interruption. This already creates a credible demo.
2. **Checkpoint B:** AI4 KB, EHS3 hazard, EHS5 river lessons with >=12 meaningful practice checkpoints EACH. Add two curated topic flows plus arbitrary prompt fallback. This makes the showcase broad but believable.
3. **Checkpoint C:** Real 3D room, four station interactions, Petros original artwork, camera presets, state sharing/switching, mobile/fallback, World lesson presentation.
4. **Checkpoint D:** Polish, performance evidence, recording script, actual video trial and regressions.

If room work delays a functioning prototype, keep Checkpoint A+B usable; but **do not substitute a static room screenshot and claim Petros World works**. If some quality feature is blocked (no original rig, no live voice, unavailable provider), disclose and proceed with truthful fallback. Do not start full platform refactor, dependency pruning or new persistence architecture in this sprint.

## 17. Handoff report

When complete, return: a route URL; exact demo toggle instructions; file/change list noting every edit outside `prototype/`; source recognition receipts; each module's actual number of questions and practice modes; implementation-vs-canned matrix; exact Petros art asset; real 3D rendering proof; representative browser screenshots and one unedited walkthrough recording; deterministic validation outputs; relevant focused tests; errors and missing dependencies; verified privacy/feature flag boundaries; 2-minute founder/demo recording notes; next steps after November 2 for genuine 3D character rig/production rollout.

**Do not conclude with a vague `Done`. The goal is an attractive, credible and functional YC showcase in the isolated `prototype/` folder with a compelling one-minute teaching interaction, significant depth behind it, and an honestly presented 3D learning room.**
