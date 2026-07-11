'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttemptAnswerUpdateInput } from '@edrion/schemas';
import { useStudentClient } from '../student-client';

export type QuizPaperQuestion = {
  id: string;
  sequence: number;
  qtype: string;
  prompt: string;
  promptImageUrl: string | null;
  options?: Array<{ key: string; label: string; imageUrl: string | null }>;
  marks: number;
};

export type QuizPaperDto = {
  id: string;
  title: string;
  durationMin: number | null;
  questions: QuizPaperQuestion[];
  attempt?: {
    id: string;
    startedAt: string;
    endsAt: string;
    finishedAt: string | null;
  };
  results?: {
    autoScore: number;
    maxScore: number;
    totalQuestions: number;
  };
  status: 'ready' | 'in_progress' | 'completed';
};

type StartAttemptResult = { attemptId: string; endsAt: string };

const examPaperKey = (scheduleId: string) => ['student', 'exam-paper', scheduleId] as const;
const assignmentQuizKey = (id: string) => ['student', 'assignment-quiz', id] as const;

export function useExamPaper(scheduleId: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: examPaperKey(scheduleId ?? ''),
    queryFn: () => client.get<QuizPaperDto>(`/exam-papers/${scheduleId}`),
    enabled: !!scheduleId,
  });
}

export function useStartExamAttempt() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      client.post<StartAttemptResult>(`/exam-papers/${scheduleId}/start`),
    onSuccess: (_, scheduleId) => qc.invalidateQueries({ queryKey: examPaperKey(scheduleId) }),
  });
}

export function useSaveExamAttemptAnswer() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: ({
      scheduleId,
      questionId,
      body,
    }: {
      scheduleId: string;
      questionId: string;
      body: AttemptAnswerUpdateInput;
    }) =>
      client.request(`/exam-papers/${scheduleId}/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  });
}

export function useFinishExamAttempt() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) =>
      client.post<QuizPaperDto['results']>(`/exam-papers/${scheduleId}/finish`),
    onSuccess: (_, scheduleId) => qc.invalidateQueries({ queryKey: examPaperKey(scheduleId) }),
  });
}

export function useAssignmentQuiz(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: assignmentQuizKey(id ?? ''),
    queryFn: () => client.get<QuizPaperDto>(`/assignments/${id}/quiz`),
    enabled: !!id,
  });
}

export function useStartAssignmentQuiz() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<StartAttemptResult>(`/assignments/${id}/quiz/start`),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: assignmentQuizKey(id) }),
  });
}

export function useSaveAssignmentQuizAnswer() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      questionId,
      body,
    }: {
      assignmentId: string;
      questionId: string;
      body: AttemptAnswerUpdateInput;
    }) =>
      client.request(`/assignments/${assignmentId}/quiz/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  });
}

export function useFinishAssignmentQuiz() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<QuizPaperDto['results']>(`/assignments/${id}/quiz/finish`),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: assignmentQuizKey(id) }),
  });
}

export function useUploadAnswerPhoto() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (file: File) => client.upload<{ id: string }>('practice_photo', file),
  });
}
