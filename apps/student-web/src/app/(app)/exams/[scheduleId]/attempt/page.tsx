'use client';
import {
  useExamPaper,
  useFinishExamAttempt,
  useSaveExamAnswer,
  useStartExamAttempt,
} from '@/lib/hooks';
import { QuizAttemptView } from '@/components/institutional/quiz-attempt-view';

export default function ExamAttemptPage({ params }: { params: { scheduleId: string } }) {
  const { data, isLoading, refetch } = useExamPaper(params.scheduleId);
  const start = useStartExamAttempt();
  const saveAnswer = useSaveExamAnswer();
  const finish = useFinishExamAttempt();

  return (
    <QuizAttemptView
      paper={data}
      isLoading={isLoading}
      backHref="/exams"
      backLabel="Exams"
      eyebrowLabel="ONLINE EXAM"
      startPending={start.isPending}
      finishPending={finish.isPending}
      onStart={async () => {
        await start.mutateAsync(params.scheduleId);
        await refetch();
      }}
      onSaveAnswer={async (questionId, body) => {
        await saveAnswer.mutateAsync({ scheduleId: params.scheduleId, questionId, body });
      }}
      onFinish={async () => {
        await finish.mutateAsync(params.scheduleId);
      }}
      onRefetch={() => void refetch()}
    />
  );
}
