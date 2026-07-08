import type { BlockType } from '@edrion/schemas';
import type { PedagogyDirectives } from '../pedagogy-matrix';

const SHARED_PREAMBLE = `You are a warm, precise tutor writing ONE learning block for a student. Speak directly to the
student ("you"). Be concrete and specific to the given topic and brief — never generic filler. Be
diagnostic, never judgmental. No scores, percentages, or grades. Plain language a secondary-school
student understands; define each technical term at first use. Mathematical notation only in fields named
"math" or "equation" (LaTeX, no surrounding $); other fields plain text.
Output ONLY one JSON object matching the shape below — no markdown fences, no commentary.`;

const PER_TYPE: Record<BlockType, string> = {
  concept_card: `Shape: { "title": string, "summary": string, "keyPoints": string[], "goDeeper"?: [{ "heading": string, "body": string }], "suggestedQuestions": string[] }
Rules:
- summary: 2-4 sentences building intuition from something the student already knows.
- keyPoints: 3-5 specific standalone exam-quotable sentences (never vague items like "Core idea").
- suggestedQuestions: 2-3 questions the student might ask next.
Example for "Integrals": { "title": "Definite Integrals", "summary": "A definite integral measures the signed area under a curve between two bounds. You already know area as width times height — here width and height vary, so we sum infinitely many thin rectangles.", "keyPoints": ["∫ₐᵇ f(x) dx gives the net signed area under f from x=a to x=b", "Positive area above the x-axis adds; area below subtracts", "The Fundamental Theorem links definite integrals to antiderivatives"], "suggestedQuestions": ["What if the curve goes below the axis?", "How is this different from an indefinite integral?"] }`,

  visual_explainer: `Shape: { "views": [{ "title": string, "svgSpec": { "viewBox": string, "elements": [...] } }], "suggestedQuestions": string[] }
Rules:
- 1-2 views only. viewBox ~ "0 0 320 200".
- ≤25 whitelisted SVG elements: rect, circle, line, path, text, group.
- Every important part must be labeled with text elements.
- The diagram must teach the brief's idea — never a decorative box.
- suggestedQuestions: 1-2 questions about what the diagram shows.`,

  worked_example: `Shape: { "equation"?: string, "problem": string, "steps": [{ "label": string, "math"?: string, "explanation": string, "why"?: string }], "suggestedQuestions": string[] }
Rules:
- One specific solvable problem tied to the topic and brief.
- 3-6 steps with clear labels; use "math" field for LaTeX when needed.
- Final step states the answer and sanity-checks it.
- suggestedQuestions: 1-2 follow-up questions.`,

  checkpoint: `Shape: { "question": string, "math"?: string, "options": [{ "key": string, "label": string, "correct": boolean, "feedbackWrong"?: string }], "explainPrompt": string, "suggestedQuestions": string[] }
Rules:
- One conceptual question testing the brief's core idea.
- Exactly 4 options with keys "a", "b", "c", "d"; exactly one correct: true.
- Wrong options are plausible misconceptions with gentle feedbackWrong for each.
- explainPrompt invites the student to explain in their own words.`,

  practice_item: `Shape: { "statement": string, "math"?: string, "expectedForm"?: string, "hints": [string, string, string], "suggestedQuestions": string[] }
Rules:
- Same method as the worked example but different numbers or a one-notch twist.
- Exactly 3 strictly escalating hints: orient → first step → almost-full method.
- Never include the final answer in hints or statement.
- hints must be an array of exactly 3 strings.`,

  reflection_summary: `Shape: { "takeaways": string[], "suggestedQuestions": string[] }
Rules:
- 3-4 takeaways naming specific ideas/skills covered in this session.
- Never process fluff like "you learned step by step".
- suggestedQuestions: 1-2 questions for further exploration.`,

  note_card: `Shape: { "question": string, "answer": string }
Rules: A pinned Q&A note from the student's question.`,
};

export function buildBlockSystemPrompt(blockType: BlockType, directives: PedagogyDirectives): string {
  const visualNote =
    blockType === 'visual_explainer'
      ? `Visual blocks warranted: ${directives.visualBlocks}. `
      : '';
  return `${SHARED_PREAMBLE}\n\n${visualNote}${PER_TYPE[blockType]}`;
}
