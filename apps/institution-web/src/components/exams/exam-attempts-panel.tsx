'use client';
import { useState } from 'react';
import { Button, Input, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PortalClientError } from '@/lib/portal-client';

interface AttemptRow {
  id: string;
  studentName: string | null;
  status: string;
  autoScore: number | null;
  maxScore: number | null;
  finishedAt: string | null;
}

interface AnswerRow {
  id: string;
  choiceKey: string | null;
  answerText: string | null;
  autoCorrect: boolean | null;
  awardedMarks: number | null;
  teacherMarks: number | null;
  teacherFeedback: string | null;
  aiNote: string | null;
  needsReview: boolean;
  question: { prompt: string; qtype: string; marks: number };
}

function useExamAttempts(examId: string, scheduleId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', examId, scheduleId, 'attempts'],
    queryFn: () => client.get<AttemptRow[]>(`/portal/exams/${examId}/schedules/${scheduleId}/attempts`, scope),
    enabled: !!examId && !!scheduleId,
  });
}

function useExamAttemptDetail(examId: string, scheduleId: string, attemptId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', examId, scheduleId, 'attempts', attemptId],
    queryFn: () =>
      client.get<AnswerRow[]>(`/portal/exams/${examId}/schedules/${scheduleId}/attempts/${attemptId}`, scope),
    enabled: !!attemptId,
  });
}

/** Lists student attempts for an exam paper and allows teacher grading overrides. */
export function ExamAttemptsPanel({ examId, scheduleId }: { examId: string; scheduleId: string }) {
  const { can } = usePermissions();
  const canManage = can('exams.manage');
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const { data: attempts, isLoading } = useExamAttempts(examId, scheduleId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: answers, isLoading: answersLoading } = useExamAttemptDetail(examId, scheduleId, selectedId);
  const [marks, setMarks] = useState<Record<string, { marks: string; feedback: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const grade = useMutation({
    mutationFn: async ({ answerId, teacherMarks, teacherFeedback }: { answerId: string; teacherMarks: number | null; teacherFeedback: string | null }) =>
      client.patch(
        `/portal/exams/${examId}/schedules/${scheduleId}/attempts/${selectedId}/answers/${answerId}`,
        scope,
        { teacherMarks, teacherFeedback },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams', examId, scheduleId, 'attempts'] });
      if (selectedId) qc.invalidateQueries({ queryKey: ['exams', examId, scheduleId, 'attempts', selectedId] });
    },
  });

  async function saveAnswer(answerId: string) {
    const m = marks[answerId];
    if (!m || !selectedId) return;
    setError(null);
    try {
      await grade.mutateAsync({
        answerId,
        teacherMarks: m.marks === '' ? null : Number(m.marks),
        teacherFeedback: m.feedback || null,
      });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save grade.');
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-background-secondary/30 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Student attempts</h4>
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (attempts ?? []).length === 0 ? (
        <p className="text-xs text-text-muted">No attempts yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border">
          {(attempts ?? []).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${selectedId === a.id ? 'bg-background-secondary' : ''}`}
                onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}
              >
                <span className="font-medium">{a.studentName ?? 'Student'}</span>
                <span className="text-xs text-text-muted">
                  {a.autoScore != null ? `${a.autoScore}/${a.maxScore ?? '?'}` : a.status}
                </span>
              </button>
              {selectedId === a.id && (
                <div className="border-t border-border px-3 py-2">
                  {answersLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {(answers ?? []).map((ans) => (
                        <li key={ans.id} className="rounded border border-border p-2 text-sm">
                          <p className="font-medium">{ans.question.prompt}</p>
                          <p className="text-xs text-text-muted">
                            {ans.question.qtype} · max {ans.question.marks} · auto: {ans.awardedMarks ?? '—'}
                            {ans.needsReview && ' · needs review'}
                          </p>
                          {ans.aiNote && <p className="mt-1 text-xs italic text-text-muted">AI: {ans.aiNote}</p>}
                          <p className="mt-1 text-xs">
                            Answer: {ans.choiceKey ?? ans.answerText ?? '(no text)'}
                          </p>
                          {canManage && (
                            <div className="mt-2 flex gap-2">
                              <Input
                                type="number"
                                placeholder="Marks"
                                className="w-20"
                                value={marks[ans.id]?.marks ?? (ans.teacherMarks != null ? String(ans.teacherMarks) : '')}
                                onChange={(e) =>
                                  setMarks((prev) => ({
                                    ...prev,
                                    [ans.id]: { marks: e.target.value, feedback: prev[ans.id]?.feedback ?? ans.teacherFeedback ?? '' },
                                  }))
                                }
                              />
                              <Input
                                placeholder="Feedback"
                                className="flex-1"
                                value={marks[ans.id]?.feedback ?? ans.teacherFeedback ?? ''}
                                onChange={(e) =>
                                  setMarks((prev) => ({
                                    ...prev,
                                    [ans.id]: { marks: prev[ans.id]?.marks ?? '', feedback: e.target.value },
                                  }))
                                }
                              />
                              <Button size="sm" onClick={() => saveAnswer(ans.id)} loading={grade.isPending}>
                                Save
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
