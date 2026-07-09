'use client';
import {
  useAssignmentQuiz,
  useFinishAssignmentQuiz,
  useSaveAssignmentQuizAnswer,
  useStartAssignmentQuiz,
} from '@/lib/hooks';
import { QuizAttemptView } from '@/components/institutional/quiz-attempt-view';

export default function AssignmentQuizPage({ params }: { params: { id: string } }) {
  const { data, isLoading, refetch } = useAssignmentQuiz(params.id);
  const start = useStartAssignmentQuiz();
  const saveAnswer = useSaveAssignmentQuizAnswer();
  const finish = useFinishAssignmentQuiz();

  return (
    <QuizAttemptView
      paper={data}
      isLoading={isLoading}
      backHref={`/assignments/${params.id}`}
      backLabel="Assignment"
      eyebrowLabel="QUIZ"
      startPending={start.isPending}
      finishPending={finish.isPending}
      onStart={async () => {
        await start.mutateAsync(params.id);
        await refetch();
      }}
      onSaveAnswer={async (questionId, body) => {
        await saveAnswer.mutateAsync({ assignmentId: params.id, questionId, body });
      }}
      onFinish={async () => {
        await finish.mutateAsync(params.id);
      }}
      onRefetch={() => void refetch()}
    />
  );
}
