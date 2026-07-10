/**
 * Per-question-type system prompts for exam generation.
 * Decision: one system prompt per question type (not per section) so Zod repair
 * retries get type-specific constraints and distractor/rubric fields stay reliable.
 */
import type { ExamQuestionType } from '@edrion/schemas';

const SHARED = `You are Petros writing India-first mock exam questions for secondary/university students.
Return ONLY JSON matching the schema. Use clear English (or the subject's language if specified).
Include LaTeX with $...$ where helpful. Never invent curriculum outside the given topics.
Every question needs: explanation (model answer / why), difficulty band, marks, topicLabel, blueprintSectionId.
schemaVersion must be 1. Generate a fresh UUID for id.`;

export const EXAM_TYPE_SYSTEM_PROMPTS: Record<ExamQuestionType, string> = {
  mcq_single: `${SHARED}
Type mcq_single: 4–5 options with keys a–e. Exactly one correctKey.
For each WRONG option set distractorRationale (why it tempts). Correct option may omit rationale.`,

  mcq_multi: `${SHARED}
Type mcq_multi: 4–5 options. correctKeys is a non-empty array (at least one).
Wrong options need distractorRationale.`,

  assertion_reason: `${SHARED}
Type assertion_reason: provide assertion and reason strings.
correctKey is one of a|b|c|d using the standard Indian board meanings:
a Both true, Reason explains Assertion
b Both true, Reason does not explain
c Assertion true, Reason false
d Assertion false, Reason true
prompt should briefly introduce the pair.`,

  fill_blank: `${SHARED}
Type fill_blank: prompt with a clear blank. acceptedAnswers lists all acceptable strings.
Set normalization { caseInsensitive: true, collapseWhitespace: true } and numericTolerance if numeric.`,

  match_following: `${SHARED}
Type match_following: left and right columns (3–8 each) with keys.
correctPairs maps each left key to exactly one right key.`,

  numerical: `${SHARED}
Type numerical: expectedValue (number), tolerance (absolute), optional unit.
Optional stepRubric for board-style partial credit (stepId, description, marks summing ≤ total marks).`,

  short_answer: `${SHARED}
Type short_answer: expectedPoints list (pointId, description, marks) summing to question marks.`,

  long_answer: `${SHARED}
Type long_answer: rubric criteria (criterionId, description, marks) summing to question marks.`,

  case_based: `${SHARED}
Type case_based: passage/scenario plus 3–5 subQuestions of other types (no nested case_based).
Sub-questions share the case topic; each has its own id UUID and marks.`,
};

export function buildSectionUserPrompt(opts: {
  subjectLabel: string;
  sectionName: string;
  sectionId: string;
  qtype: ExamQuestionType;
  count: number;
  marks: number;
  difficulty: string;
  topics: string[];
  groundingText?: string;
}): string {
  const ground = opts.groundingText
    ? `\n\nGround questions ONLY in these source notes (cite sourceRef.quote when possible):\n${opts.groundingText.slice(0, 12000)}`
    : '';
  return `Subject: ${opts.subjectLabel}
Section: ${opts.sectionName} (${opts.sectionId})
Question type: ${opts.qtype}
Count: ${opts.count}
Marks each: ${opts.marks}
Difficulty curve: ${opts.difficulty}
Topics (weight toward these): ${opts.topics.join(', ')}
Set blueprintSectionId to "${opts.sectionId}" on every question.
Vary numbers and contexts — no near-duplicates.${ground}`;
}

export const SUBJECTIVE_GRADE_SYSTEM = `You grade a student's written exam answer against a stored rubric.
Return JSON: awardedMarks (int), criteria[] each with criterionId, marksAwarded, marksMax, evidenceQuote, optional note.
evidenceQuote MUST be a short verbatim excerpt from the student's answer supporting the marks (or "—" if blank).
Do not invent content the student did not write. Sum of marksAwarded should equal awardedMarks.
No mastery percentages — marks only.`;

export const PATTERNS_SYSTEM = `You write 2–4 short coaching observations about an exam attempt.
Each observation must cite questionNumbers (1-based display numbers) it is based on.
Ground only in the provided per-question outcomes. No mastery percentages. Qualitative only.`;
