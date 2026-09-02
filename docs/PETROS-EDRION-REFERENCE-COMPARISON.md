# Petros teaching-session comparison

This note records the useful interaction lessons taken from the earlier Edrion implementation in `/Volumes/Chris/Edrion` and how they are expressed in Edrion Labs. It is an architectural comparison, not a request to copy the earlier interface or its prompt-driven widget system.

## What the earlier Edrion experience did well

- It began academic conversations with a small lesson plan and retained the plan and progress in chat metadata.
- Petros taught in short turns, asked one question at a time, and accepted interruptions as ordinary conversation turns.
- Interactive diagrams exposed individual nodes, edges, highlights, and pointing actions. Petros could therefore refer to a visible part instead of describing an unseen picture.
- The session history made a learner's question feel contextual: an answer was part of the current teaching conversation rather than a separate help workflow.

The earlier implementation also had structural limits. Lesson control depended heavily on a large system prompt, text tags, and client-side parsing. Progress was comparatively coarse, and the model could choose or format UI indirectly. Those mechanics are intentionally not carried into Labs.

## What Labs already provides

Labs has the stronger foundation: typed teaching moves, server-owned session state, checkpoints, answer evaluation, repair ladders, source citations, document-outline caching, learner evidence, persisted detours, explicit completion, and a governed voice path. Uploaded documents are scoped to the selected topic's pages rather than repeatedly sending the whole file.

The experience gap was in delivery. The companion reduced a rich teaching block to a flattened summary and sent that text to speech. Questions paused a block, but audio resumed from the block summary's beginning. The avatar usually targeted the whole block or its own speech bubble, while document citations displayed labels without their source excerpt.

## Labs teaching contract

The session UI now publishes an ordered list of visible, typed narration segments. Each segment contains a stable block id, semantic segment id, human label, spoken text, and exact `data-petros-target`. Hidden reveals and locked explanations are excluded. A worked example therefore becomes problem → currently revealed step(s) → final check, while a layered explanation becomes visible layer(s) → key idea.

Petros plays those segments in sequence. The browser audio clock drives the active sentence and word in both Petros's transcript and the corresponding lesson-page text, while the semantic segment drives page highlighting, scrolling, avatar placement, and pointing. Interactive diagrams retain their more precise node-and-edge narration path and resume at the next step after a question detour.

When the learner asks a question, the client captures the active block, segment, target, full segment text, and word index. The API accepts that coordinate only when its block matches the server-owned current block; the transcript supplies conversational location while the server-owned lesson and source remain the factual authority. The detour records a human-readable return point. Follow-up questions remain attached to the original pause; all resulting detours are rejoined before Petros resumes at the captured word instead of restarting the lesson.

For uploaded-document sessions, selected citation excerpts remain visible in the lesson and are narration targets. Petros can point to the source passage, explain it, and then move into the generated teaching block without presenting the generated explanation as though it were the document.

## Deliberate limits

- Word timing is duration-weighted because the current speech response does not contain phoneme or viseme timestamps.
- Exact source grounding depends on extracted citation excerpts. Petros must not invent a course-specific claim when the selected source cannot verify it.
- The structured narration layer coordinates delivery; it does not replace the server's planning policy, checkpoint state, or answer evaluation.
- Student-visible resume position is precise within the current audio segment. It is not represented as a new database column; existing detour and observation records retain the validated coordinate.

## Verification

Focused tests cover visible-only narration, stable targets, synchronized lesson-page sentence/word highlighting, source excerpts, target-aware questions, stacked follow-ups, word-level resume, diagram narration, and server-side pause validation. Run:

```bash
pnpm --filter student-web exec vitest run src/components/petros/petros-narrated-text.spec.tsx src/components/petros/petros-lesson-narration.spec.ts src/components/petros/petros-mentor.spec.tsx src/components/petros/petros-repair-session.spec.tsx
pnpm --filter api exec vitest run src/modules/student/petros-loop/petros-loop.service.spec.ts
pnpm --filter @edrion/schemas typecheck
pnpm --filter student-web typecheck
pnpm --filter api typecheck
```
