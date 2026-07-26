export type HomeworkStatus = 'draft' | 'assigned' | 'closed';
export type HomeworkAiPolicy = 'off' | 'hints_only' | 'full';

export interface HomeworkRow {
  id: string;
  version: number;
  classId: string;
  subjectId: string | null;
  title: string;
  instructions: string | null;
  dueAt: string;
  aiPolicy: HomeworkAiPolicy;
  status: HomeworkStatus;
  assignedAt: string | null;
  createdAt: string;
}

export interface HomeworkQuestionInput {
  promptText?: string | null;
  promptImageObjectId?: string | null;
  maxMarks?: number | null;
}

export interface HomeworkSubmissionRow {
  id: string;
  homeworkId: string;
  studentId: string;
  status: string;
  submittedAt: string | null;
  returnedAt: string | null;
  totalMarks: number | null;
  totalMax: number | null;
  teacherNote: string | null;
}

export interface HomeworkQuestionRow {
  id: string;
  sequence: number;
  promptText: string | null;
  maxMarks: number | null;
}

export interface HomeworkDetailRow extends HomeworkRow {
  questions: HomeworkQuestionRow[];
}

export interface HomeworkAnswerRow {
  id: string;
  questionId: string;
  answerText: string | null;
  teacherMarks: number | null;
  teacherFeedback: string | null;
}

export interface HomeworkSubmissionDetailRow {
  submission: HomeworkSubmissionRow;
  questions: (HomeworkQuestionRow & { answer: HomeworkAnswerRow | null })[];
}

export interface Paged<T> {
  items: T[];
  total: number;
}
