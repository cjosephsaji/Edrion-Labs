'use client';

import type { ExamSkin, MockExamDto } from '@edrion/schemas';
import { isReservedNtaSkin, resolveRenderSkin } from '@edrion/schemas';
import type { ExamAttemptStore } from '@/components/lab/exam/useExamAttemptStore';
import type { LocalAnswer } from '@/components/lab/exam/answer-model';
import type { OfflineAnswerQueue } from '@/components/lab/exam/OfflineAnswerQueue';
import { StandardPlayer } from './standard/StandardPlayer';
import { PaperPlayer } from './paper/PaperPlayer';

export type MockExamPlayerProps = {
  examId: string;
  exam: MockExamDto;
  /** Declared blueprint/snapshot skin — may be reserved `nta`. */
  declaredSkin: ExamSkin | string | null | undefined;
  store: ExamAttemptStore;
  queue: OfflineAnswerQueue;
  onAnswerPatch: (patch: Partial<LocalAnswer>) => void;
  onToggleFlag: () => void;
  onSubmit: () => void;
  onLeave: () => void;
  onExpire: () => void;
  scheduleSave: (questionId: string, answer: LocalAnswer, flagged: boolean) => void;
};

/**
 * Skin shell (D6 amended).
 * - `paper` → PaperPlayer
 * - `standard` / reserved `nta` → StandardPlayer (nta shows coming-soon note)
 * Never imports a bespoke NTA component — nta remains a future component swap.
 */
export function MockExamPlayer(props: MockExamPlayerProps) {
  const renderSkin = resolveRenderSkin(props.declaredSkin);
  const showNtaNote = isReservedNtaSkin(props.declaredSkin);

  const shared = {
    examId: props.examId,
    exam: props.exam,
    store: props.store,
    queue: props.queue,
    showNtaNote,
    onAnswerPatch: props.onAnswerPatch,
    onToggleFlag: props.onToggleFlag,
    onSubmit: props.onSubmit,
    onLeave: props.onLeave,
    onExpire: props.onExpire,
    scheduleSave: props.scheduleSave,
  };

  if (renderSkin === 'paper') {
    return <PaperPlayer {...shared} />;
  }
  return <StandardPlayer {...shared} />;
}
