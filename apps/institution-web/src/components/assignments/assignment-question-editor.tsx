'use client';
import { QuestionEditorBody } from '@/components/questions/question-editor-body';
import { useAssignmentQuestionMutations, useAssignmentQuestions } from '@/lib/assignments';

/** Question authoring for a quiz-mode assignment. */
export function AssignmentQuestionEditor({ assignmentId }: { assignmentId: string }) {
  const { data: questions, isLoading } = useAssignmentQuestions(assignmentId);
  const mutations = useAssignmentQuestionMutations(assignmentId);

  return (
    <QuestionEditorBody
      questions={questions}
      isLoading={isLoading}
      uploadPath="/portal/assignments/uploads"
      mutations={mutations}
    />
  );
}
