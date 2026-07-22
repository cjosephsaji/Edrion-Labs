'use client';

import type { MockExamDto } from '@edrion/schemas';
import type { ExamAttemptStore } from '@/components/lab/exam/useExamAttemptStore';
import type { LocalAnswer } from '@/components/lab/exam/answer-model';
import type { OfflineAnswerQueue } from '@/components/lab/exam/OfflineAnswerQueue';

export type MockPlayerSharedProps = {
  examId: string;
  exam: MockExamDto;
  store: ExamAttemptStore;
  queue: OfflineAnswerQueue;
  showNtaNote: boolean;
  onAnswerPatch: (patch: Partial<LocalAnswer>) => void;
  onToggleFlag: () => void;
  onSubmit: () => void;
  onLeave: () => void;
  onExpire: () => void;
  scheduleSave: (questionId: string, answer: LocalAnswer, flagged: boolean) => void;
};
