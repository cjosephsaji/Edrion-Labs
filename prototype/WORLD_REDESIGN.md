# PETROS WORLD — COMPLETE IMMERSIVE LEARNING EXPERIENCE REDESIGN
## Replace the Current Classic-Mode-in-3D Presentation with a Real Virtual Teaching Experience

**Project:** Edrion / Petros YC Showcase Prototype  
**Repository:** `/Volumes/Chris/Edrion Labs`  
**Primary scope:** `prototype/`  
**Priority:** High — YC Demonstration  
**Deadline:** November 2, 2026

## 1. What is wrong with the current implementation?

The current Petros World implementation does not match the intended experience.

Right now, the user enters a 3D environment, but the teaching experience still resembles Classic Mode.

The existing system appears to reuse the same lesson text and teaching board from Classic Mode, merely displaying them inside or alongside a 3D scene.

This is not what I want.

**Petros World must feel like entering an entirely different environment where Petros personally teaches the student.**

The student should not feel like they're looking at the original website with a 3D room added in the background.

I want the experience to be immersive, visually engaging, interactive and believable.

The correct concept is:

**Student selects Petros World → teleportation → arrival inside Petros's study room → Petros welcomes the student → selected subject and module are retrieved from the bookshelf → Petros moves to the appropriate teaching station → Petros demonstrates the concept visually → student asks questions and interacts → Petros adapts and continues teaching.**

Implement this exact direction.

Do not redesign Classic Mode, which should remain a simple and fast alternative.

---

# 2. Fundamental design principles

Petros World is a spatial learning experience, not a conventional educational webpage.

### Classic Mode

- Normal web interface.
- Structured lesson content.
- Conventional interactive controls.
- Petros avatar and contextual thought clouds.
- Fast navigation and minimal animation.

### Petros World

- Full immersive virtual study room.
- Meaningful camera positioning and movement.
- Real spatial locations for books, explanations and experiments.
- Petros physically represented inside the environment.
- Teaching content appears naturally on whiteboards, worktables and learning objects.
- Concepts demonstrated through diagrams, animations, object manipulation and experiments.
- Students can interrupt and ask questions.
- Petros responds using the actual current lesson context.

These modes must share lesson content and learning progress, but **their visual presentations must be meaningfully different**.

Do not reuse the Classic Mode page layout inside Petros World.

Reuse the underlying educational state, source references, validated activities and interaction logic where appropriate.

---

# 3. Entering Petros World — teleportation sequence

## Trigger

The student clicks:

**Enter Petros World**

This may appear on the lesson-selection screen or as a switch from Classic Mode.

## Stage A — Prepare the transition

When clicked:

1. Save the current lesson checkpoint and in-progress local demo state.
2. Preserve the selected subject, module, topic and current teaching step.
3. Begin loading the necessary 3D room assets.
4. Avoid reloading the entire browser page where possible.
5. Prevent duplicate transition requests.

The transition must not begin by revealing an empty or partially loaded room.

If loading takes longer than expected, show a polished loading state with progress messaging.

## Stage B — Teleportation

Once the destination scene is ready, begin a short cinematic transition.

Target duration: approximately 1.5–2.2 seconds.

Visual sequence:

**0–350ms:**

- The Classic learning environment gently darkens.
- The center of the screen develops a soft sage-green glow.
- The interface starts fading away.

**350–950ms:**

- Soft particles and curved light streaks move toward the center.
- A circular portal expands from the center of the screen.
- The background blurs and becomes obscured.
- The visual impression should be of traveling into another space.

**950–1550ms:**

- The portal fills the viewport.
- The old interface is no longer visible.
- The destination room is revealed through the portal.
- Camera perspective changes from flat UI to the three-quarter 3D room view.

**1550–2200ms:**

- The portal glow dissipates.
- The room lighting settles.
- Petros becomes clearly visible at his starting location.
- The transition ends without a bright flash or abrupt layout jump.

### Teleportation requirements

- Use actual smooth animations, not an instant route switch disguised as teleportation.
- No heavy full-screen video is required.
- No excessive motion blur that makes the student uncomfortable.
- No loud or startling effects.
- The room must be interactive after the transition.
- Support a Skip transition action.
- Respect reduced-motion preferences by using a short crossfade rather than zooming or particle travel.
- If 3D fails to initialize, provide a clear way back to Classic Mode.

Do not play this animation every time the student changes topics inside the room.

Teleportation happens when entering or leaving the world.

---

# 4. The student's arrival inside Petros's world

Once teleportation finishes, the student should see the actual 3D study environment.

The environment should occupy the main viewport.

Avoid wrapping it inside a small card, dashboard panel or conventional web-page section.

## Room layout

Design one consistent study room containing:

### Left side — Library

- A bookshelf with recognizable books or study materials.
- Dedicated sections for subjects.
- The four uploaded modules visibly represented as study books.
- A readable selected-book title when focused.

### Center — Teaching whiteboard

- Large wall-mounted whiteboard.
- Appropriate lighting and readable teaching content.
- Petros teaching position beside it.
- Space for mathematical expressions, diagrams, visual explanations and animations.

### Right side — Experiment station

- Worktable or demonstration surface.
- Space for interactive models.
- Example: game trees, knowledge-base interactions, construction hazards or environmental demonstrations.

### Secondary area — Petros's desk

- Desk and chair.
- A few personal study objects.
- Books, stationery and a lamp.
- Petros's default rest or greeting location.

Use warm, attractive lighting and a coherent cream/sage aesthetic.

The room should feel welcoming and carefully designed, not like an empty room assembled from primitive cubes.

Maintain readable proportions and clean spatial organization.

---

# 5. Camera system

Use three predefined camera states.

Do not introduce unrestricted first-person game controls.

## Camera 1 — Room Overview

Used when the student arrives or chooses what to study.

Shows:

- Petros.
- Bookshelf.
- Desk.
- Whiteboard.
- Experiment station.

The camera uses a stable three-quarter perspective.

## Camera 2 — Teaching Focus

Used when Petros begins explaining a topic.

The camera moves toward the whiteboard.

It must clearly frame:

- Petros at the teaching anchor.
- The active diagram or explanation.
- The relevant section of the board.

Petros should not block the content.

## Camera 3 — Interactive Focus

Used when the student needs to interact with a diagram or answer a question.

The camera transitions toward the experiment area or teaching board.

The actual interactive workspace expands to a readable size.

Use accessible React controls when needed, but style them as part of Petros World rather than reproducing the entire Classic Mode layout.

The student must never struggle to read or select small controls embedded in a distant 3D surface.

### Camera transition behavior

- Camera transitions should generally last 650–1100ms.
- Use smooth easing.
- Do not move the camera while the student types, drags or makes a precise selection.
- Do not interrupt an active activity with automatic camera movement.
- Students must be able to skip a camera transition.
- Reduced-motion mode uses direct camera changes or short fades.

---

# 6. Selecting a subject and retrieving a book

This is an important part of the experience.

## Example

The student has chosen:

**Artificial Intelligence → Module 3 → Minimax**

Upon entering Petros World, Petros should recognize that this is the selected material.

## Expected sequence

### Step 1 — Greeting

Petros is initially positioned at his desk.

Show a speech cloud:

"Welcome! Looks like we're learning about minimax today."

The greeting should use the actual selected topic.

Do not use a generic, unrelated greeting if the topic is already known.

### Step 2 — Direct attention to the bookshelf

The bookshelf section for Artificial Intelligence receives a subtle highlight.

The camera turns toward the bookshelf while maintaining spatial context.

Petros says:

"Let's grab your AI module first."

### Step 3 — Select the corresponding book

The correct book becomes highlighted.

For this example, its spine or cover should clearly indicate:

**Artificial Intelligence — Module 3**

Do not display an unrelated book.

The selected book moves from the bookshelf to a presentation stand or reading position through an actual 3D object animation.

Target animation: approximately 700–1000ms.

The student should understand that the lesson comes from the uploaded material.

### Step 4 — Present the topic

A compact book detail presentation appears:

- Subject name.
- Module number.
- Selected topic.
- Source document.
- Relevant page references where available.

Avoid displaying the entire PDF as a wall of text.

Petros should say something like:

"Minimax helps an AI decide which move to make when another player is trying to beat it. Let me show you."

### Step 5 — Transition to teaching

The book closes or moves onto the reading stand.

Camera shifts to the whiteboard.

Petros changes to the designated teaching position.

The lesson begins.

### Critical character-animation constraint

The actual approved Petros character currently consists of flattened image poses.

Do not animate him walking by sliding his PNG across the floor.

Do not simulate grabbing objects with hands that aren't articulated.

For the YC prototype:

- Animate the selected 3D book independently.
- Use a deliberate scene transition or camera cut when changing Petros's location if no approved locomotion rig exists.
- Use genuine available Petros poses only.
- Keep Petros grounded and correctly scaled in each station.
- Do not claim real walking, sitting or grabbing is implemented unless suitable reviewed animation assets actually exist.

The longer-term design should support genuine walking and object manipulation once approved character assets become available.

---

# 7. Teaching must happen inside the world

This is the single most important requirement.

**Do not display the same Classic Mode lesson text inside a giant whiteboard panel.**

That defeats the entire purpose of Petros World.

Instead, translate each concept into a spatial and interactive teaching demonstration.

The teaching board is a presentation surface, not an embedded Classic Mode webpage.

Petros should demonstrate concepts incrementally.

Do not render the complete lesson immediately.

## Example: AI Module 3 — Minimax

### Scene A — Introduction

Camera focuses on the whiteboard.

Text appears:

**How does AI choose the best move?**

Petros introduces MAX and MIN.

Two simple player indicators appear.

### Scene B — Construct the decision tree

The board starts with one root node.

Petros says:

"Imagine these are the moves our AI can make."

Child branches appear one after another.

Do not reveal the entire completed tree immediately.

### Scene C — Explain MAX and MIN

MAX nodes receive one visual treatment.

MIN nodes receive a different treatment.

Petros explains:

"MAX wants the highest score. MIN tries to make that score as small as possible."

The currently discussed node receives a subtle glow.

### Scene D — Demonstrate the algorithm

Leaf values appear.

The system calculates actual minimax values.

Animate the selected value moving upward to its parent.

Repeat through the tree until the root result is obtained.

### Scene E — Student interaction

Petros asks:

"Which move would you choose?"

The camera enters interactive focus.

The student selects a branch.

The actual deterministic evaluator checks the choice.

Petros responds according to the actual result.

### Scene F — Alpha-beta pruning

Petros says:

"Now, what if we didn't have to inspect every branch?"

A second traversal begins.

Visited nodes highlight sequentially.

When alpha-beta bounds establish a cutoff, the relevant branches visibly fade.

Show:

**Branches skipped: [actual count]**

Never fabricate the pruning count.

---

# 8. AI Module 4 — Knowledge representation

This lesson should use a different visualization.

Do not reuse the minimax animation for everything.

## Scene

The whiteboard displays a knowledge-base system with three regions:

1. Facts.
2. Rules.
3. Conclusions.

Petros introduces a knowledge-based agent.

The student can:

- Add a permitted fact.
- Select a rule.
- Ask the knowledge base a question.
- Observe the derived conclusion.

### Example sequence

Petros explains that the knowledge base stores information.

The student adds a fact.

That fact appears as a new item in the visual knowledge base.

Petros explains how a rule applies to the fact.

The relevant connection becomes highlighted.

A new conclusion appears.

Then Petros asks the student to predict whether another conclusion follows.

The visualization must reflect actual rule application rather than an arbitrary animated answer.

---

# 9. EHS Module 3 — Construction safety

For this lesson, Petros should move the teaching focus to the experiment station.

## Scene

A miniature illustrated construction site appears on the experiment table.

It includes a scaffold and several recognizable construction hazards.

Petros introduces the scenario:

"Let's inspect this construction site. Can you spot anything unsafe?"

The student clicks a hazard.

The selected location highlights.

An explanation appears beside the model.

Petros explains the risk in simple terms.

### Example

The student selects a platform with missing edge protection.

The system identifies the fall hazard.

Petros explains why suitable protective measures are required.

The student chooses:

**Show safer setup**

The model changes to demonstrate the relevant protection.

The student can rotate or inspect the model within constrained angles.

Avoid unrestricted navigation that makes hazard selection difficult.

Use reviewed instructional examples, not unverified professional safety certification claims.

---

# 10. EHS Module 5 — Environmental protection

This should feel different again.

## Scene

A miniature river ecosystem appears on the experiment station.

It includes:

- A river.
- A nearby industrial area.
- A possible pollution source.
- A treatment or prevention intervention.

Petros introduces water pollution.

The student can select an intervention.

The corresponding part of the illustration changes.

For example:

- Untreated discharge is shown as a conceptual pollution source.
- Selecting wastewater treatment changes the diagram to show treatment before discharge.
- Petros explains the difference.

Do not invent precise water-quality improvements without an actual validated model.

This is an educational conceptual demonstration.

---

# 11. Petros should behave like a teaching buddy

Petros must not simply narrate a prepared slideshow.

He should respond to meaningful events and remain aware of the current topic and activity.

## Required behavior

### When starting a lesson

Petros greets the student and introduces the actual selected topic.

### When demonstrating

Petros focuses attention on the currently discussed visual element.

Use board highlights and authentic available poses.

### When asking a question

Pause the instructional sequence.

Show the question clearly.

Wait for the student's response.

Do not continue while the student is answering.

### When the student answers correctly

Respond specifically to what they understood.

Do not always use the same generic praise.

### When the student answers incorrectly

Explain the specific misconception using the actual lesson state.

Offer a relevant hint or another example.

### When the student requests help

Pause the current activity.

Answer the question using the current topic, source material and active visual state.

### When the student asks for a simpler explanation

Provide an authorized simpler explanation and a different example where possible.

Do not merely repeat the same sentence.

### When the student wants to continue

Resume from the same instructional checkpoint.

Do not restart the lesson unnecessarily.

### When the student switches modes

Preserve the selected topic, question, completed interactions and active step.

---

# 12. More than five meaningful questions

Each featured lesson must support the previously specified 8–12 meaningful instructional questions.

These must be distributed throughout the lesson, not displayed as one conventional quiz at the end.

Include:

- Predictions.
- Diagram selections.
- Explanations.
- Comparison questions.
- Applications.
- Correction opportunities.
- Follow-up questions.

Questions should be tied to the current visual demonstration.

Petros should not ask unrelated questions just to satisfy a numerical requirement.

The student should also be able to request additional practice without losing lesson progress.

---

# 13. Natural conversation and interruption

Provide a clearly accessible input:

**Ask Petros anything**

When the student asks a question:

1. Preserve the current lesson step.
2. Pause the active teaching sequence.
3. Record the current visual target and relevant concept.
4. Retrieve the appropriate authorized context.
5. Generate or retrieve the response using the existing available teaching/AI system.
6. Display the response through Petros's communication UI.
7. Highlight the relevant visual element if the response references it.
8. Offer **Continue lesson** when appropriate.
9. Resume from the saved teaching checkpoint.

### Example

The student asks during minimax:

"Why did you choose 3 instead of 9?"

Petros should know which MIN node is being discussed.

The selected node remains highlighted.

Petros explains the actual comparison.

Do not respond with a generic definition of minimax while ignoring the active node.

If a live model cannot safely resolve the reference, it must ask for clarification rather than invent the node.

The question must not restart the lesson.

---

# 14. Open-topic learning

The prototype must also support topics not found in uploaded modules.

Examples:

- "How does artificial intelligence work?"
- "Is time travel possible?"

These open-topic lessons should be available in both modes.

For prepared showcase topics:

- Display an actual relevant visual.
- Teach progressively.
- Ask meaningful questions.
- Support interruption.

For arbitrary topics without a prepared custom visualization:

- Use existing AI integration for explanatory content when available.
- Present content with general-purpose diagrams, timelines or comparison visuals where supported.
- Do not fabricate a complex custom 3D simulation.
- Explain the actual limitation when an interactive demonstration is unavailable.

---

# 15. In-world controls and visual presentation

Do not import the entire Classic dashboard into the 3D scene.

Keep in-world controls minimal.

### Persistent controls

- Exit Petros World.
- Pause/resume.
- Ask Petros.
- Current topic.
- Accessibility/preferences.

### Contextual controls

Only when relevant:

- Continue explanation.
- Try it yourself.
- Repeat demonstration.
- Previous step.
- Next step.
- Read source.
- Change lesson.

Use small, polished, legible controls.

Do not cover the character, whiteboard or experiment station with giant panels.

For long text, document reading or precise editing, enter a focused readable overlay or workspace, then return to the room afterward.

The immersive mode should not sacrifice usability merely to keep every control inside 3D.

---

# 16. Visual polish

The environment needs to look like a premium educational product.

Requirements:

- Cohesive cream and sage color scheme.
- Warm ambient lighting.
- Soft shadows.
- Well-designed furniture.
- Books with readable selected labels.
- Correctly scaled original Petros.
- Clear foreground/background depth.
- Carefully positioned cameras.
- Smooth but restrained transitions.
- No empty floating text boxes.
- No excessive decorative particles.
- No visibly broken object intersections.
- No unreadable teaching board.

Do not build a generic game environment unrelated to Edrion's current visual identity.

The room should be memorable but should not distract from the lesson.

---

# 17. Technical implementation boundaries

Keep the work inside the existing YC showcase architecture.

Primary folder:

`prototype/`

Reuse existing application routing and infrastructure where practical.

Do not rebuild the academic engine.

Do not replace the existing Classic learning experience.

Do not create a second independent lesson state.

Do not duplicate assessment or source authorization.

The 3D environment should render the same underlying lesson state used by Classic Mode.

However, the 3D renderer must present that state using its own room, teaching stations, spatial demonstrations and camera transitions.

### Separate these responsibilities

**Teaching state:** Current lesson, activity, question, answer, relevant source and step.

**Scene state:** Current station, camera mode, active board element and visible demonstration.

**Character presentation:** Petros pose, location anchor, permitted gesture and communication cue.

**Interaction state:** Student selections, input focus, interruption and resume.

These should remain coordinated without being duplicated across unrelated components.

---

# 18. Performance

Petros World should be loaded only when selected.

Do not load 3D rendering dependencies into Classic Mode unnecessarily.

Use:

- Lazy loading.
- Reusable scene assets.
- Reasonable texture sizes.
- Preloaded core room geometry.
- Limited particle counts.
- Controlled animation scheduling.
- Graceful graphics failure recovery.

Avoid making a separate AI request for each animation frame or camera movement.

Teaching actions and graphics rendering must remain independently responsive.

---

# 19. Verification requirements

Do not claim completion after simply rendering a 3D room.

Verify the following complete browser scenario:

1. Open the existing showcase.
2. Select Artificial Intelligence.
3. Select Module 3.
4. Select Minimax.
5. Enter Petros World.
6. See the teleportation animation.
7. Arrive inside the study room.
8. See Petros welcome the student.
9. Observe the correct module selected from the bookshelf.
10. Observe the source book presented.
11. Watch the camera move to the whiteboard.
12. See the minimax tree built progressively.
13. Answer a question about a node.
14. Ask Petros an unexpected contextual follow-up.
15. See the lesson pause and the relevant node remain highlighted.
16. Receive a contextual response.
17. Resume the lesson without restarting.
18. Enter interactive focus.
19. Perform an actual deterministic activity.
20. Return to the room overview.
21. Switch to Classic Mode.
22. Verify the same topic and lesson progress are preserved.

Also verify at least one lesson from each of the other three uploaded modules.

Check reduced motion, slow loading, session recovery and unsupported-device fallback.

Capture actual browser recordings of both the full arrival sequence and a complete interactive teaching example.

---

# 20. Completion criteria

This development task is complete only when:

- Entering Petros World feels like entering a separate environment.
- A real teleportation transition occurs.
- The actual 3D room is visually present.
- The correct subject/module book is selected from the library.
- Petros is visible at meaningful teaching locations.
- The whiteboard displays incremental visual teaching, not the copied Classic lesson page.
- Each featured topic has a different appropriate demonstration.
- Students can answer questions and manipulate supported teaching objects.
- Petros responds to interruptions using the current context.
- Lesson continuation works.
- Switching between Classic and World preserves progress.
- The original Petros design is respected.
- No unavailable body animations are fabricated.
- The existing application remains functional.

---

# 21. Required final report

After implementation, provide:

1. Exact files changed.
2. How teleportation was implemented.
3. Final 3D room layout.
4. Camera states and transition behavior.
5. Book-selection interaction.
6. Character poses and actually supported animation capabilities.
7. How the teaching board differs from Classic Mode.
8. How each subject is taught spatially.
9. How interruption and resumption work.
10. How both modes share lesson state.
11. Tests performed and actual results.
12. Screenshots and browser recordings.
13. Missing features and limitations.
14. Any visual or functional deviations from this specification.

**Do not describe a feature as implemented unless it is observable in the running prototype.**

## Final product direction

The goal is not to make Classic Mode look three-dimensional.

The goal is to create a second learning experience where the student enters Petros's world and watches a teaching companion actively demonstrate concepts in his own environment.

The library should feel like a library.

The whiteboard should feel like a teaching board.

The experiment station should feel like a place to discover things.

Petros should be visibly connected to all of them.

**Build the immersive teaching experience, not another text-based learning page placed inside a 3D room.**