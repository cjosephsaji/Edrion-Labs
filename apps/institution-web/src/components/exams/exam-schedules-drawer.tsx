'use client';
import { Drawer } from '@edrion/ui';
import type { ExamRow } from '@/lib/exams-types';
import { ExamSchedulesPanel } from './exam-schedules-panel';

/** @deprecated Prefer `ExamSchedulesPanel` inside the exam edit form. */
export function ExamSchedulesDrawer({
  exam,
  open,
  onClose,
}: {
  exam: ExamRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Exam papers" description={exam?.name ?? ''}>
      {exam && <ExamSchedulesPanel examId={exam.id} examName={exam.name} />}
    </Drawer>
  );
}

export { ExamSchedulesPanel } from './exam-schedules-panel';
