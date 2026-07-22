import type { ExamQuestionType, MockExamDto, SaveExamAnswerInput } from '@edrion/schemas';

/** Question shape as delivered by the exam DTO (keys stripped for in-progress). */
export type ExamRoomQuestion = NonNullable<MockExamDto['questions']>[number];

/** Local, per-question answer value held in the attempt store. */
export type LocalAnswer = {
  choiceKey?: string | null;
  choiceKeys?: string[] | null;
  text?: string | null;
  value?: number | null;
  unit?: string | null;
  workingText?: string | null;
  pairs?: Record<string, string> | null;
  subAnswers?: Array<{ subQuestionId: string; payload: Record<string, unknown> }> | null;
  answerMode?: 'type' | 'photo' | 'on_paper' | null;
  photoRefs?: string[] | null;
  photoObjectId?: string | null;
};

const LEGACY_TYPE_MAP: Record<string, ExamQuestionType> = {
  mcq: 'mcq_single',
  short: 'short_answer',
  long: 'long_answer',
};

/** Normalize legacy question types to the exam-engine question type union. */
export function normalizeQuestionType(qtype: string): ExamQuestionType {
  return (LEGACY_TYPE_MAP[qtype] ?? qtype) as ExamQuestionType;
}

/** True when the student has committed any content for this question. */
export function isAnswered(type: ExamQuestionType, a: LocalAnswer | undefined): boolean {
  if (!a) return false;
  if (a.answerMode === 'on_paper') return true;
  if (a.answerMode === 'photo' && ((a.photoRefs?.length ?? 0) > 0 || !!a.photoObjectId)) return true;
  switch (type) {
    case 'mcq_single':
    case 'assertion_reason':
      return !!a.choiceKey;
    case 'mcq_multi':
      return !!a.choiceKeys && a.choiceKeys.length > 0;
    case 'fill_blank':
    case 'short_answer':
    case 'long_answer':
      return !!a.text && a.text.trim().length > 0;
    case 'numerical':
      return a.value != null && Number.isFinite(a.value);
    case 'match_following':
      return !!a.pairs && Object.keys(a.pairs).length > 0;
    case 'case_based':
      return !!a.subAnswers && a.subAnswers.length > 0;
    default:
      return false;
  }
}

/** Build the PUT wire body for a save. */
export function buildAnswerBody(
  type: ExamQuestionType,
  a: LocalAnswer,
  flagged: boolean,
): SaveExamAnswerInput {
  const body: SaveExamAnswerInput = {
    type,
    flagged,
    clientUpdatedAt: new Date().toISOString(),
  };
  switch (type) {
    case 'mcq_single':
    case 'assertion_reason':
      body.choiceKey = a.choiceKey ?? null;
      break;
    case 'mcq_multi':
      body.choiceKeys = a.choiceKeys ?? null;
      break;
    case 'fill_blank':
    case 'short_answer':
    case 'long_answer':
      body.text = a.text ?? null;
      break;
    case 'numerical':
      body.value = a.value ?? null;
      body.unit = a.unit ?? null;
      body.workingText = a.workingText ?? null;
      break;
    case 'match_following':
      body.pairs = a.pairs ?? null;
      break;
    case 'case_based':
      body.subAnswers = a.subAnswers ?? null;
      break;
  }
  if (a.answerMode) body.answerMode = a.answerMode;
  if (a.photoRefs?.length) body.photoRefs = a.photoRefs;
  if (a.photoObjectId) body.photoObjectId = a.photoObjectId;
  return body;
}

/** Hydrate a local answer from a resumed answer row (defensive against partial payloads). */
export function hydrateLocalAnswer(row: {
  payload?: Record<string, unknown> | null;
  choiceKey?: string | null;
  answerText?: string | null;
}): LocalAnswer {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  return {
    choiceKey: (p.choiceKey as string) ?? row.choiceKey ?? null,
    choiceKeys: (p.choiceKeys as string[]) ?? null,
    text: (p.text as string) ?? row.answerText ?? null,
    value: typeof p.value === 'number' ? (p.value as number) : null,
    unit: (p.unit as string) ?? null,
    workingText: (p.workingText as string) ?? null,
    pairs: (p.pairs as Record<string, string>) ?? null,
    subAnswers:
      (p.subAnswers as Array<{ subQuestionId: string; payload: Record<string, unknown> }>) ?? null,
    answerMode: (p.answerMode as LocalAnswer['answerMode']) ?? null,
    photoRefs: (p.photoRefs as string[]) ?? null,
    photoObjectId: (p.photoObjectId as string) ?? null,
  };
}
