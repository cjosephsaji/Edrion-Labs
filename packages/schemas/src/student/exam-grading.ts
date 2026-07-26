import { z } from 'zod';
import { quizAttemptVerdictSchema } from './library';

/** Re-export Library verdicts — exams use the same qualitative bands (missed ≡ brief "incorrect"). */
export const examTopicVerdictSchema = quizAttemptVerdictSchema;
export type ExamTopicVerdict = z.infer<typeof examTopicVerdictSchema>;

export const examRubricEvidenceSchema = z.object({
  criterionId: z.string().min(1).max(32),
  marksAwarded: z.number().int().min(0).max(100),
  marksMax: z.number().int().min(0).max(100),
  /** Quoted excerpt from the student's answer as evidence. */
  evidenceQuote: z.string().trim().min(1).max(2000),
  note: z.string().max(1000).optional(),
});
export type ExamRubricEvidence = z.infer<typeof examRubricEvidenceSchema>;

export const examQuestionEvaluationSchema = z.object({
  questionId: z.string().uuid(),
  sequence: z.number().int().positive().optional(),
  awardedMarks: z.number().min(0),
  maxMarks: z.number().min(0),
  verdict: examTopicVerdictSchema,
  note: z.string().max(2000).optional(),
  /** Distractor rationale for the option the student picked (MCQ). */
  distractorRationale: z.string().max(1000).optional(),
  rubricEvidence: z.array(examRubricEvidenceSchema).optional(),
  objective: z.boolean().default(true),
});
export type ExamQuestionEvaluation = z.infer<typeof examQuestionEvaluationSchema>;

export const examTopicVerdictRowSchema = z.object({
  topicLabel: z.string(),
  topicId: z.string().uuid().nullable().optional(),
  verdict: examTopicVerdictSchema,
  awardedMarks: z.number(),
  maxMarks: z.number(),
  questionCount: z.number().int(),
  note: z.string().optional(),
});
export type ExamTopicVerdictRow = z.infer<typeof examTopicVerdictRowSchema>;

export const examPatternObservationSchema = z.object({
  text: z.string().trim().min(1).max(500),
  /** Question numbers (1-based display) this observation cites. */
  questionNumbers: z.array(z.number().int().positive()).min(1).max(20),
});
export type ExamPatternObservation = z.infer<typeof examPatternObservationSchema>;

export const examSectionBreakdownSchema = z.object({
  sectionId: z.string(),
  sectionName: z.string(),
  awardedMarks: z.number(),
  maxMarks: z.number(),
});

export const examResultsSchema = z.object({
  awardedMarks: z.number(),
  maxMarks: z.number(),
  bySection: z.array(examSectionBreakdownSchema),
  byTopic: z.array(examTopicVerdictRowSchema),
  patterns: z.array(examPatternObservationSchema).min(0).max(4),
  evaluations: z.array(examQuestionEvaluationSchema).optional(),
  suggestion: z.string().max(1000).optional(),
});
export type ExamResults = z.infer<typeof examResultsSchema>;

/** AI output for subjective grading of one question. */
export const examSubjectiveGradeOutputSchema = z.object({
  awardedMarks: z.number().int().min(0),
  criteria: z.array(examRubricEvidenceSchema).min(1),
  note: z.string().max(2000).optional(),
});
export type ExamSubjectiveGradeOutput = z.infer<typeof examSubjectiveGradeOutputSchema>;

/** AI output for patterns panel. */
export const examPatternsOutputSchema = z.object({
  observations: z.array(examPatternObservationSchema).min(2).max(4),
});

/**
 * Derive a qualitative topic verdict from marks ratio.
 * No mastery percentages exposed to UI — only the band.
 * - full marks → solid
 * - some marks → slipped
 * - zero → missed
 */
export function deriveVerdictFromMarks(awarded: number, max: number): ExamTopicVerdict {
  if (max <= 0) return 'missed';
  if (awarded <= 0) return 'missed';
  if (awarded >= max) return 'solid';
  return 'slipped';
}

/**
 * Aggregate per-question evaluations into per-topic qualitative rows.
 * Unifies Library quiz + exam review (same solid/slipped/missed bands).
 */
export function deriveTopicVerdicts(
  rows: Array<{
    topicLabel: string;
    topicId?: string | null;
    awardedMarks: number;
    maxMarks: number;
  }>,
): ExamTopicVerdictRow[] {
  const map = new Map<
    string,
    { topicLabel: string; topicId?: string | null; awarded: number; max: number; count: number }
  >();
  for (const r of rows) {
    const key = r.topicLabel.toLowerCase();
    const cur = map.get(key) ?? {
      topicLabel: r.topicLabel,
      topicId: r.topicId,
      awarded: 0,
      max: 0,
      count: 0,
    };
    cur.awarded += r.awardedMarks;
    cur.max += r.maxMarks;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].map((t) => ({
    topicLabel: t.topicLabel,
    topicId: t.topicId ?? null,
    verdict: deriveVerdictFromMarks(t.awarded, t.max),
    awardedMarks: t.awarded,
    maxMarks: t.max,
    questionCount: t.count,
  }));
}
