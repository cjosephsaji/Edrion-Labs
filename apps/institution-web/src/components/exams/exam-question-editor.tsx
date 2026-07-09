'use client';
import { QuestionEditorBody } from '@/components/questions/question-editor-body';
import { useExamQuestionMutations, useExamQuestions } from '@/lib/exams';

/** Question authoring for one exam paper (schedule). */
export function ExamQuestionEditor({ examId, scheduleId }: { examId: string; scheduleId: string }) {
  const { data: questions, isLoading } = useExamQuestions(examId, scheduleId);
  const mutations = useExamQuestionMutations(examId, scheduleId);

  return (
    <QuestionEditorBody
      questions={questions}
      isLoading={isLoading}
      uploadPath="/portal/exams/uploads"
      mutations={mutations}
    />
  );
}
