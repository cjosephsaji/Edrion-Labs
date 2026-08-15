export type ExamOption = { key: string; label: string };

export type ExamQuestion = {
  id: string;
  sequence: number;
  qtype: string;
  prompt: string;
  promptImageUrl: string | null;
  options: ExamOption[] | null;
  marks: number;
  config: Record<string, unknown> | null;
};

export type ExamAnswer = {
  choiceKey?: string | null;
  answerText?: string | null;
  answerObjectId?: string | null;
  answerJson?: Record<string, unknown> | null;
};

export type ExamResult = {
  autoScore: number;
  maxScore: number;
  totalQuestions: number;
  answeredQuestions: number;
  pendingReview: number;
  submittedAt: string;
};

export type ExamPaper = {
  id: string;
  title: string;
  subjectName: string;
  examType: string;
  description: string | null;
  instructions: string | null;
  durationMin: number;
  maxMarks: number;
  startsAt: string | null;
  endsAt: string | null;
  room: string | null;
  seatInfo: string | null;
  questions: ExamQuestion[];
  answers: Array<ExamAnswer & { questionId: string; updatedAt: string }>;
  attempt: { id: string; startedAt: string; endsAt: string; finishedAt: string | null } | null;
  results: ExamResult | null;
  status: 'ready' | 'in_progress' | 'completed';
  canStart: boolean;
  blockedReason: string | null;
  availability: 'available' | 'upcoming' | 'in_progress' | 'completed';
  availableFrom: string | null;
  availableUntil: string | null;
};

export function isAnswered(answer: ExamAnswer | undefined) {
  if (!answer) return false;
  if (answer.choiceKey || answer.answerText || answer.answerObjectId) return true;
  return Boolean(answer.answerJson && Object.keys(answer.answerJson).some((key) => key !== '_flagged'));
}

export function questionTypeLabel(value: string) {
  const labels: Record<string, string> = {
    mcq_single: 'Single choice',
    mcq_multi: 'Multiple choice',
    true_false: 'True or false',
    assertion_reason: 'Assertion and reason',
    fill_blank: 'Fill in the blank',
    numeric: 'Numerical answer',
    numerical: 'Numerical answer',
    matching: 'Match the following',
    match_following: 'Match the following',
    short_answer: 'Short answer',
    long_answer: 'Long answer',
    case_based: 'Case-based question',
    file_upload: 'File response',
    code: 'Code response',
  };
  return labels[value] ?? value.replaceAll('_', ' ');
}
