# EDRION — PETROS WORLD V2
## Critical UI Correction, High-Fidelity 3D Environment and Real Teaching Experience

**Project:** Edrion / Petros YC Showcase  
**Repository:** `/Volumes/Chris/Edrion Labs`  
**Primary implementation directory:** `prototype/`  
**Priority:** Critical  
**Target demonstration:** November 2, 2026

---

# 1. Objective

The current Petros World implementation is not acceptable in its present form.

The product owner has reviewed five screenshots and identified serious visual, spatial and functional problems.

We need to correct the experience substantially.

This is NOT a request to change a few margins, add furniture and declare completion.

The intended experience is:

**The student teleports into an attractive, detailed 3D learning environment, encounters Petros as a teaching companion, selects a real uploaded module, watches Petros retrieve the lesson material, and learns through explanations, animated visual demonstrations and meaningful interactions.**

Petros must lead the teaching.

The world must not be a conventional web lesson decorated with a 3D room.

## Five mandatory corrections

1. Reposition Petros's thought and speech clouds.
2. Replace the simplistic room with a substantially more realistic and detailed 3D learning environment.
3. Eliminate overlapping headers, labels, floating cards and navigation.
4. Correct all whiteboard layout, clipping and text-overlap problems.
5. Make Petros actively teach rather than merely displaying content and asking students to read sources or click through the lesson themselves.

Preserve the working Classic Mode. Do not redesign it.

---

# 2. Inspect the current implementation first

Inspect the actual existing `prototype/` code before editing.

Identify:

- World renderer and scene entry.
- Current geometry and environmental assets.
- Camera positions and controls.
- Teleportation lifecycle.
- Book-selection and source-selection flow.
- Petros character rendering.
- Current cloud positioning.
- Whiteboard content renderer.
- Experiment rendering.
- Teaching-step controller.
- Lesson checkpoint state.
- Natural-language question integration.
- Classic/World shared state.
- Responsive CSS.
- Existing lesson scripts and question banks.

Determine exactly why the provided screenshots contain overlapping elements.

Do not merely adjust arbitrary z-index values until the screenshot looks slightly better.

Fix the underlying ownership and positioning problems.

Preserve all existing functioning lesson logic, uploaded-document recognition, checkpoint records and source references.

---

# 3. HIGH-FIDELITY 3D ROOM — COMPLETE ART DIRECTION

## 3.1 Replace the existing dollhouse presentation

The current room looks like a small open-sided model.

It contains basic furniture, simple geometric shapes, sparse bookshelves and a relatively empty environment.

The viewing angle makes the student feel like they are observing a miniature set from outside.

That is not the intended atmosphere.

**Replace the existing scene with a detailed, believable 3D study/library environment.**

The target is a premium, realistic-looking educational space rather than a low-poly classroom demonstration.

Use physically based materials, carefully designed geometry, realistic object proportions, textured surfaces, believable shadows and coherent lighting.

The room must still use Edrion's cream, sage and warm-green aesthetic.

Do not make the room excessively dark, neon-colored, industrial or game-like.

## 3.2 Room proportions

Use approximate real-world proportions:

- Room width: 9–10 meters.
- Room depth: 7–8 meters.
- Ceiling height: approximately 3.2 meters.
- Normal-sized furniture.
- Petros appropriately scaled relative to furnishings.
- Human-eye-level viewing positions.

These are coordinate targets, not a demand to change an already suitable coordinate system.

The room should have proper walls, architectural depth and believable spatial separation.

Stop presenting it as an elevated open-sided box surrounded by empty background.

Use an enclosed interior with camera-safe wall hiding only where necessary to avoid obstructing views.

## 3.3 Library

The bookshelf must become a major visual feature.

Build an actual study library containing:

- Tall wood or wood-and-painted bookcases.
- Multiple shelving sections.
- At least 80–120 visually varied book spines across the library.
- Books with varied dimensions, thickness and colors.
- Grouped collections rather than uniform repeated blocks.
- Warm shelf lighting.
- A few horizontally stacked books.
- Clearly identifiable uploaded-course books.
- Readable selected-book labels when the camera focuses on them.

Avoid rendering the entire bookshelf as a few extruded rectangles.

If suitable licensed GLB/GLTF assets are already available, reuse them.

Do not fetch questionable or unlicensed models.

Use instancing and reusable geometry for large numbers of decorative books.

The four source modules must appear as the recognizable selected learning resources:

- AI Module 3.
- AI Module 4.
- EHS Module 3.
- EHS Module 5.

The selected module should become visibly identifiable when Petros retrieves it.

## 3.4 Teaching area

Create a large, properly proportioned whiteboard mounted to the wall.

Include:

- A realistic frame.
- A matte, readable board surface.
- Proper thickness and wall positioning.
- Small marker tray.
- Appropriate directional lighting.
- Space beside the board for Petros.
- No furniture or decorative elements obscuring educational content.

The board must be visually important.

It should dominate the teaching camera view, not become a small background object hidden by interface panels.

## 3.5 Study desk

Build a believable desk area with:

- Well-proportioned desk and chair.
- Desk lamp.
- A few notebooks.
- One or two stationery objects.
- A small plant or appropriate personal item.
- Subtle material variation and lighting.

These should be actual scene objects, not oversized flat labels.

## 3.6 Experiment station

The experiment table must have sufficient space for topic-specific models.

For example:

- A construction scaffold model.
- A conceptual environmental demonstration.
- A knowledge representation model where appropriate.

The table should look like furniture in a real learning studio.

It must not resemble a plain rectangular box with three colored spheres pasted on top.

Replace meaningless generic props with topic-relevant objects.

## 3.7 Lighting and rendering

Use a coherent lighting arrangement:

- Soft daylight entering through a window.
- Warm local lighting near the library or desk.
- Controlled ambient fill.
- Grounded contact shadows.
- Soft object shadows.
- Realistic material roughness and texture.

Avoid the pale, washed-out appearance visible in the current screenshots.

Maintain enough contrast to distinguish the board, books, character and controls.

Use an environment and material setup appropriate to the existing renderer. Prefer a small number of quality lighting sources rather than adding many expensive dynamic lights.

Use ambient occlusion or baked detail when supported without unreasonable cost.

### Performance

Target smooth rendering on the actual recording machine.

Cap device pixel ratio sensibly.

Reuse geometry and textures.

Avoid excessive draw calls.

A detailed room must not cause input delays or freeze lesson interaction.

Do not describe the room as photorealistic unless actual browser captures substantiate that claim.

---

# 4. CAMERA — MAKE THE STUDENT FEEL PRESENT IN THE ROOM

The current camera is too elevated and distant.

It makes the environment appear miniature.

## Camera A — Arrival

Use a human-scale perspective.

Suggested targets:

- Camera height approximately 1.5–1.8 meters.
- Perspective field of view approximately 45–55 degrees.
- Camera directed toward Petros and the room's major teaching locations.

Show enough of the room to establish where the bookshelf, desk, board and experiment area are.

The room should occupy most of the screen.

Do not leave enormous empty margins around a small floating model.

## Camera B — Library

Frame the correct bookshelf and selected book.

The selected book should be readable.

Petros must remain recognizable when present at the library anchor.

Do not crop Petros's head or place a cloud behind a shelf.

## Camera C — Whiteboard teaching

The whiteboard should occupy approximately 60–75% of the usable scene width.

Petros should appear beside the board, ideally on the left or right edge without blocking the diagram.

Use a stable frontal or mildly angled view.

Do not use an extreme perspective that makes board text difficult to read.

## Camera D — Experiment

Frame the experiment model clearly.

Petros should appear nearby but not obscure interactive hazards or controls.

Camera movement should stop once the student begins interacting.

## Transitions

Use approximately 700–1100ms for ordinary camera transitions.

Smooth easing; no random orbiting or cinematic spins.

Maintain reduced-motion support.

The camera must never move while the student is typing, dragging or performing precision interaction.

---

# 5. FIX THE ENTIRE UI LAYERING SYSTEM

The screenshots show multiple independent elements competing for the same areas of the viewport.

Examples:

- Main lesson title overlapping other scene labels.
- Petros's cloud overlapping the header.
- Whiteboard teaching text appearing behind the page header.
- Source cards covering part of the room.
- Station navigation competing with instructional content.
- Large practice question panels covering the experiment model.

Reorganize the UI into explicit layers.

## Layer 1 — 3D Environment

Contains only the actual scene and world objects.

This includes furniture, 3D books, whiteboard and physical experiment objects.

## Layer 2 — In-world teaching

Contains the instructional content displayed on the actual whiteboard and experiment surfaces.

Do not place unrelated page headings in this layer.

## Layer 3 — Companion communication

Contains the approved Petros speech/thought cloud.

Position it relative to Petros's actual visible character location.

## Layer 4 — Application controls

Contains persistent navigation and essential actions.

This layer must be bounded and separate from the primary teaching area.

## Layer 5 — Focused interactions

Used only when students must answer questions, read lengthy explanations, use the full interactive workspace or enter text.

This layer is temporary and intentional.

It should not remain permanently over the room.

---

# 6. EXACT HUD LAYOUT

At desktop viewports of approximately 1440×900 and larger:

## Top-left

Display:

**Exit Petros World**

Keep it within a safe margin of roughly 24px.

Do not duplicate navigation elsewhere unnecessarily.

## Top-center

Display the current lesson title once.

Example:

**Minimax & Alpha-Beta Pruning**

Smaller subtitle:

**Artificial Intelligence · Module 3**

Do not show another large duplicate title floating above the whiteboard.

Provide a compact top-header area of approximately 64–76px.

The title must not overlap room-rendered text.

## Top-right

Display an accessible settings/preferences control.

Keep this separate from source-reading actions.

## Station navigation

The current left-side Desk / Library / Whiteboard / Experiment control should become significantly quieter.

Prefer a compact vertical navigation, approximately 108–125px wide on large desktop screens.

It should not cover the teaching board or Petros.

Hide or collapse nonessential labels while the teaching camera is active.

Station navigation is secondary to the lesson.

It must never appear more important than the current teaching interaction.

## Bottom controls

Reserve one consistent control strip containing:

- Pause/resume.
- Ask Petros.
- Room overview.
- Exit or switch mode where appropriate.

Use approximately 64–76px of reserved height.

Keep it unobtrusive and visually consistent.

Do not overlap activity cards or the experiment table.

## Side cards

Do not permanently show a large source book card on the right.

When the student selects a book, show the selected resource briefly.

After teaching begins, reduce it to a compact source indicator.

The complete source should be available through a secondary interaction, not occupy the main teaching space.

---

# 7. FIX PETROS'S SPEECH AND THOUGHT CLOUDS

The current bubbles appear far above Petros and sometimes overlap navigation or extend beyond the viewport.

That is unacceptable.

## 7.1 Position cloud relative to the character

The cloud anchor must follow Petros's current screen-space position.

Use the existing world-to-screen projection to calculate the avatar's visible location.

Attach the cloud to the projected position near Petros's head, rather than using fixed viewport offsets.

## 7.2 Cloud placement

Preferred placement:

- Above and slightly to the right or left of Petros.
- Approximately 10–18px visual gap from the character.
- Tail clearly oriented toward the character.
- Maximum width approximately 240–280px on desktop.
- Smaller responsive width on narrow viewports.
- Sufficient text padding.
- Close button always visible.

## 7.3 Collision avoidance

Before displaying, calculate the cloud's bounding rectangle.

Check for collisions with:

- Top navigation.
- Lesson title.
- Screen boundaries.
- Current educational board content.
- Important buttons.
- Active response controls.

If the preferred position does not fit, switch to an alternate location on the opposite side of Petros.

If necessary, use a small safe companion caption dock beside the teaching view.

Do not clip the cloud or place it on top of the title.

## 7.4 Content and duration

Automatic messages should usually be one or two concise sentences.

Long source explanations must not overflow a cloud.

For longer explanations, keep Petros's active teaching caption short and present the full worked lesson on the board or focused reading surface.

When Petros is teaching, the bubble complements the explanation; it is not supposed to contain the entire lesson.

Do not show an oversized cloud containing several paragraphs during active demonstrations.

## 7.5 Continuity

When the camera changes:

- Recompute the cloud anchor.
- Prevent jumping to a disconnected location.
- Close or move stale clouds cleanly.
- Preserve a student-requested response if still relevant.

When Petros is temporarily hidden by a scene transition, do not leave a floating, disconnected cloud behind.

---

# 8. COMPLETE WHITEBOARD CORRECTION

The screenshots show whiteboard text overlapping with itself and with the top-level interface.

Do not fix this by simply making the font smaller.

## 8.1 Single rendering owner

The 3D board must have one dedicated content system.

Remove or coordinate competing title, subtitle, teaching-text and diagram overlays that independently occupy the same board region.

For this prototype, use a dedicated high-resolution board canvas rendered as a texture on the whiteboard surface.

Keep educational content separate from decorative wall geometry.

Do not display the Classic Mode lesson card as a texture on the board.

## 8.2 Board content grid

Use a logical 1600×900 drawing space before applying the content to the board.

Define four internal zones:

**Header — top 12%**

Lesson concept title only.

Example:

"How does AI choose the best move?"

**Explanation — next 13%**

One concise explanation sentence, if needed.

**Demonstration — central 65%**

The actual tree, diagram, equation, animation or visual model.

**Footnote/source — bottom 10%**

Small source reference and optional concept label.

Do not place quiz navigation or application HUD text inside the board.

## 8.3 Text fitting

Text must be measured before drawing.

- Wrap headings within their assigned region.
- Limit instructional captions to an appropriate number of lines.
- Do not reduce critical text below readable size.
- If the content does not fit, divide it into additional teaching steps.
- Do not allow text to overlap another diagram node.
- Do not render outside the board surface.

Use an explicit internal layout function with bounds checking.

## 8.4 Readability

In whiteboard-focus mode:

- Educational text should remain comfortably readable at 1366×768.
- Important nodes and values must remain legible.
- No duplicate heading above the board.
- No clipping at the board frame.
- No text intersecting furniture, HUD or Petros.

For accessibility, expose an equivalent semantic text representation separate from the visual canvas.

## 8.5 Teaching progression

The whiteboard should start mostly empty.

It changes as Petros teaches.

Do not render the complete minimax tree and explanatory text immediately.

Each accepted teaching step should add or highlight a precise element.

---

# 9. CRITICAL — PETROS MUST ACTUALLY TEACH

This is the biggest functional failure.

The existing experience often shows a lesson title, a source-reading button and a next-step or practice button.

The student is expected to discover the lesson themselves.

That is not the Petros World concept.

**Petros should conduct the lesson.**

## 9.1 Teaching begins automatically

After the selected book is presented and the camera reaches the whiteboard, begin the authorized teaching sequence automatically.

Do not require the student to click "Read source" to discover the first explanation.

Do not require a separate manual click for every basic sentence.

The student may pause, interrupt, replay or advance.

## 9.2 Petros presentation system

Each lesson step should contain:

- Exact teaching statement.
- Active station.
- Current board/model target.
- Visual operation.
- Expected duration or speech completion.
- Whether student input is required.
- Context for natural questions.
- Optional source reference.
- Allowed continuation.

Use the current lesson package and teaching-state controller.

Do not generate arbitrary visual actions from raw LLM text.

## 9.3 Voice

If the existing voice/TTS integration is available and functioning, use it for Petros's spoken teaching.

Synchronize teaching captions and diagram changes with the active spoken step.

If natural voice is not available, show clear paced teaching captions and accurately report that the demonstration is text-led.

Do not claim voice teaching is implemented when only a silent speech bubble exists.

## 9.4 Student interruptions

At any teaching step, the student may ask:

- "Why did it choose that value?"
- "Can you explain it more simply?"
- "Give me another example."
- "I didn't understand."
- "Can we go back?"

When a student interrupts:

1. Pause the current teaching progression.
2. Preserve the current diagram state.
3. Preserve the highlighted node or active hazard.
4. Resolve the question against the correct activity context.
5. Provide the authorized response.
6. Highlight the relevant visual element.
7. Offer Continue lesson.
8. Resume from the correct checkpoint.

Never restart the entire lesson after a question.

---

# 10. EXACT MINIMAX TEACHING SEQUENCE

Implement this as the required reference-quality lesson.

Use the actual prepared AI Module 3 lesson and its supporting page references.

The steps below describe one specific demonstration tree.

## Step 1 — Introduce the problem

Camera frames Petros and a mostly empty whiteboard.

Petros explains:

"Imagine an AI playing a game against an opponent. The AI wants the best outcome, but its opponent is also making decisions."

Board writes:

**How does AI choose the best move?**

Show MAX and MIN as two participants.

Wait approximately one short spoken/captioned beat before advancing.

## Step 2 — Explain MAX

Display the root MAX node.

Add three branches.

Petros explains:

"MAX is the player trying to achieve the highest possible score."

Highlight the MAX label.

## Step 3 — Explain MIN

Display one MIN node below the root.

Petros explains:

"MIN is the opponent. It chooses the result that is least favorable to MAX."

Highlight MIN in a contrasting instructional color.

## Step 4 — Build the actual tree

Construct this simple demonstration:

- Root: MAX.
- Left child: MIN with leaf values 3 and 5.
- Middle child: MIN with leaf values 2 and 9.
- Right child: MIN with leaf values 4 and 1.

Build it incrementally.

Do not draw the entire tree and explanation at once.

## Step 5 — Evaluate MIN

Petros explains:

"Each MIN node chooses the smaller value beneath it."

Animate these comparisons:

- MIN(3,5) = 3.
- MIN(2,9) = 2.
- MIN(4,1) = 1.

Highlight each selected value and propagate it to the corresponding parent.

## Step 6 — Evaluate MAX

Display the backed-up root choices:

3, 2, 1.

Petros explains:

"MAX now chooses the highest of these guaranteed outcomes."

Highlight:

MAX(3,2,1) = 3.

Emphasize the selected left branch.

## Step 7 — Student predicts a move

Petros asks:

"Which move should MAX choose?"

Pause the narration.

Show three clearly selectable root branches.

The choice must be verified against the deterministic tree evaluator.

Provide response-specific feedback.

Do not claim the answer is correct solely because it matches a hardcoded frontend label.

## Step 8 — Alpha-beta demonstration

Reset visual traversal state without discarding the student's progress.

Retain the same tree structure.

Petros explains:

"Alpha-beta pruning lets us skip branches that cannot change the final decision."

Traverse the children in the prescribed left-to-right order.

After evaluating the left subtree, the root has alpha = 3.

In the middle MIN subtree, the first observed leaf is 2.

Its beta becomes 2.

Because beta ≤ alpha, the remaining leaf with value 9 does not need to be visited.

Visually mark that leaf as skipped.

The right subtree is then evaluated according to the algorithm.

For this fixed ordering, show:

- Final minimax value: 3.
- Leaf values actually examined: 5.
- Leaf values skipped: 1.

Use a deterministic implementation to confirm the values and counts; do not animate an unsupported result.

## Step 9 — Student asks for an explanation

At the pruned branch, support the question:

"Why didn't you check the 9?"

Petros must explain that MIN already has an option worth 2, which is no better for MAX than the previously established 3.

The current pruned branch stays highlighted.

Do not show a generic definition disconnected from the diagram.

## Step 10 — Continue practice

Provide the remaining prepared questions/checkpoints from the module lesson.

The student must be able to complete at least 8 meaningful interactions across the lesson.

Do not reduce it to a two-question demo.

---

# 11. EHS CONSTRUCTION HAZARD EXPERIENCE

The existing hazard illustration is useful, but the current immersive layout is cluttered.

The large question panel covers too much of the environment.

The right-side inspection controls compete with the 3D model.

Petros's cloud is too high and can be disconnected from the active hazard.

## 11.1 Experiment framing

Move the camera toward the experiment table.

Make the scaffold the main object.

Remove unnecessary floating decorative text around the scene.

## 11.2 Teaching introduction

Petros explains:

"Scaffolds help people work at height, but missing protection or unstable structures can make them dangerous. Let's inspect this model."

Highlight the complete scaffold.

## 11.3 Guided identification

Petros asks:

"Can you spot a place where someone could fall?"

The missing guardrail area receives no automatic answer highlight yet.

Wait for the student's click or selection.

When the student selects it:

- Highlight the corresponding model geometry.
- Show a small anchored hazard label.
- Petros explains the risk.
- Maintain the selected hazard ID in lesson state.

## 11.4 Safer setup

The student can choose:

**Show safer setup**

Animate the actual scaffold model changing to show the corresponding safer configuration.

For a missing top guardrail:

- Display the relevant guardrail geometry.
- Visually contrast the before and after states.
- Keep the model stationary during the change.
- Petros explains what was added and why.

Do not merely change an explanatory paragraph while leaving the physical scaffold unchanged.

## 11.5 Additional hazards

Use the existing defined hazard identifiers:

- Missing top guardrail.
- Loose tools at the edge.
- Ladder on a mobile tower.
- Unsecured castor / uneven base.
- Overhead power line.

Each hazard must connect to an appropriate visible object in the scene.

Selecting a hazard must not leave the previous hazard's Petros text active.

An overhead-power-line explanation must not remain visible when the active question is about an unguarded edge.

The model, question, explanation, Petros cue and selected hazard must refer to the same current hazard identifier.

## 11.6 Practice presentation

Replace the permanent oversized bottom quiz card with a compact contextual interaction surface.

For example:

Petros asks a question.

A small response panel appears below or beside the scene.

The student answers.

The model and Petros supply feedback.

The panel then collapses or transitions to the next teaching beat.

Do not simultaneously show:

- Full source passage.
- Large quiz card.
- Multiple hazard cards.
- Large speech cloud.
- Detailed inspector.
- Floating teaching title.

The current instructional task must have one clear focal point.

---

# 12. OTHER SUBJECTS — SAME TEACHING STANDARD

Apply the same presentation discipline to:

- AI Module 4 — Knowledge-base inference.
- EHS Module 5 — Pollution prevention.
- Open topic — Artificial Intelligence.
- Open topic — Time Travel.

Each must have:

1. Topic introduction by Petros.
2. A concept-specific visual demonstration.
3. Incremental changes to that visual.
4. At least one meaningful student interaction before the lesson concludes.
5. A context-aware answer to a follow-up question.
6. Further prepared questions and exercises.
7. Resume/repeat functionality.
8. Source access as an optional secondary tool.

Do not simply render paragraphs onto the board for these topics.

---

# 13. PRESERVE THE ORIGINAL PETROS CHARACTER

The current original Petros artwork is recognizable and should be preserved.

Do not regenerate his appearance.

Do not introduce a replacement character.

Do not fake locomotion with a sliding PNG.

For the showcase, use the approved available poses and deliberate camera/scene transitions between anchored stations.

The environment, animated lesson objects and camera can move independently.

If the current asset lacks a genuine gesture, use a board-target highlight as the teaching emphasis instead of fabricating hand animation.

A faithful, fully rigged 3D Petros remains a separate future art-production requirement.

---

# 14. RESPONSIVE DESIGN

The screenshots demonstrate serious clutter at varying aspect ratios.

Do not assume a layout that works at one width will work everywhere.

Test:

- 1920×1080.
- 1440×900.
- 1366×768.
- 1024×768.
- 768×1024.
- 390×844.

### Narrow viewport behavior

- Hide the expanded station navigation behind one accessible control.
- Shorten the title presentation where necessary.
- Avoid floating source cards.
- Preserve readable instructional text.
- Use one compact active response panel.
- Keep Petros identifiable.
- Reposition clouds within visible bounds.
- Avoid tiny whiteboard text.
- If needed, enter a focused full-size teaching view.

The 3D environment must remain navigable and understandable rather than shrinking all desktop HUD elements into the phone.

---

# 15. ACCEPTANCE TESTS — MUST PASS

A visually improved room with the same broken teaching interaction is a failure.

## Layout acceptance

At every required viewport:

- No overlapping page titles.
- No duplicate lesson headings.
- No clipped clouds.
- No cloud disconnected from Petros.
- No whiteboard text overlapping itself.
- No educational content hidden by header controls.
- No experiment model hidden by a permanently expanded quiz.
- No horizontal page overflow.

## Room acceptance

Actual browser captures must show:

- A detailed library with numerous books.
- Believable furnishings.
- A properly mounted large whiteboard.
- Clear experiment station.
- Appropriate interior depth.
- Realistic materials and lighting.
- A human-scale camera perspective.

Do not accept only one distant dollhouse screenshot.

## Teaching acceptance

Starting AI Module 3 must demonstrate:

1. Enter world.
2. Show selected book.
3. Transition to the board.
4. Petros begins introducing minimax without asking the student to open the source.
5. Build the tree progressively.
6. Demonstrate MIN selections.
7. Demonstrate MAX selection.
8. Ask the student a meaningful question.
9. Respond to their actual choice.
10. Demonstrate alpha-beta pruning.
11. Allow contextual interruption.
12. Answer without losing diagram state.
13. Resume correctly.
14. Continue toward the remaining lesson checkpoints.

For EHS Module 3:

1. Petros introduces scaffold safety.
2. Student inspects the actual model.
3. Hazard selection highlights the correct geometry.
4. Petros explains the selected hazard.
5. Safer setup visibly changes the model.
6. The corresponding student question remains readable.
7. The scene does not become covered in competing cards.

## Timing

The teaching introduction should begin promptly after book retrieval and camera arrival.

Do not leave the student staring at a decorative whiteboard waiting for an unexplained button click.

Automated educational steps should proceed based on their actual teaching timeline, speech completion or explicit interaction gates.

The student must be able to pause, skip animation or interrupt at any appropriate moment.

## Regression

- Classic Mode still works.
- Existing uploads still work.
- All six showcase lessons remain selectable.
- Switching modes preserves lesson state.
- No production M4/M5 assessment modifications.
- No blind code cleanup.
- No fabricated evaluation results.
- Source references remain correct.

---

# 16. REQUIRED EVIDENCE

Before claiming completion, capture:

1. Room arrival after teleportation.
2. Wide interior overview.
3. Library camera with selected module.
4. Petros positioned correctly beside the board.
5. Speech cloud anchored correctly.
6. Minimax board before diagram construction.
7. Minimax board after tree construction.
8. Minimax alpha-beta pruning step.
9. Contextual question and response.
10. EHS scaffold before safer setup.
11. EHS scaffold after safer setup.
12. Desktop and mobile layout checks.

Provide a continuous recording of Petros conducting at least one complete demonstration without the developer manually clicking through every explanatory sentence.

Explain whether the teaching used actual configured TTS or text-only captions.

Report the exact source files changed, verification results and any art assets that could not be obtained or approved.

---

# 17. EXECUTION PRIORITY

Follow this order:

**Priority 1 — Stop the visual defects**

Fix HUD ownership, overlap, board layout and cloud anchoring.

Do not invest in decorative art while text remains unreadable.

**Priority 2 — Make Petros teach**

Implement the automatic incremental minimax explanation, valid visual operations and interruption/resume.

This is the most important functional gate.

**Priority 3 — Replace the simplistic room**

Upgrade the environment, library, furnishings, camera and rendering quality.

**Priority 4 — Refine all remaining lessons**

Apply the corrected spatial teaching pattern to the other showcase topics.

**Priority 5 — Polish and verify**

Capture actual browser recordings, inspect them, repair failures and report remaining limitations.

Keep each priority independently testable.

Do not stop after completing only the first two priorities and describe the entire request as done.

---

# 18. Final instruction

The product owner is not asking for a conventional dashboard with a 3D background.

The intended product is a teaching companion inhabiting a believable learning environment.

**The room must look and feel like a real place.**

**The whiteboard must demonstrate ideas instead of displaying walls of text.**

**Petros must teach the student instead of sending them to read a source document.**

**The student must be able to interrupt, question, interact, receive meaningful feedback and continue.**

Do not replace this specification with vague tasks such as "make the scene more immersive" or "improve the animations."

Implement the specified visual hierarchy, camera behavior, source-book interaction, character positioning, instructional sequence and actual teaching operations.

Report honestly where existing artwork, model access or graphics capabilities limit the requested result.

The finished product must be judged through the running browser experience and recording, not merely successful compilation or test counts.