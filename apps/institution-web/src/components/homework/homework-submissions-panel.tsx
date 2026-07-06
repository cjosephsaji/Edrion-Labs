'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Label, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { usePeopleList, type StudentRow } from '@/lib/people';
import {
  useHomeworkSubmissionDetail,
  useHomeworkSubmissions,
  useReturnHomeworkSubmission,
} from '@/lib/homework';
import { PortalClientError } from '@/lib/portal-client';

const ROSTER_PARAMS = { page: 1, pageSize: 200, sortDir: 'asc' as const, sortBy: 'lastName' };

type QuestionGrade = { questionId: string; teacherMarks: string; teacherFeedback: string };

export function HomeworkSubmissionsPanel({
  homeworkId,
  classId,
  title,
}: {
  homeworkId: string;
  classId: string;
  title: string;
}) {
  const { can } = usePermissions();
  const canGrade = can('homework.grade');
  const { data: submissions, isLoading: subsLoading } = useHomeworkSubmissions(homeworkId);
  const { data: students, isLoading: studentsLoading } = usePeopleList<StudentRow>('students', ROSTER_PARAMS);
  const returnSubmission = useReturnHomeworkSubmission(homeworkId);
  const [note, setNote] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [grades, setGrades] = useState<QuestionGrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: detail, isLoading: detailLoading } = useHomeworkSubmissionDetail(homeworkId, selectedId);

  const roster = useMemo(
    () => (students?.items ?? []).filter((s) => s.classId === classId),
    [students, classId],
  );

  const byStudent = useMemo(
    () => new Map((submissions ?? []).map((s) => [s.studentId, s])),
    [submissions],
  );

  useEffect(() => {
    setNote('');
    setSelectedId(null);
    setGrades([]);
    setError(null);
    setSaved(false);
  }, [homeworkId]);

  useEffect(() => {
    if (!detail) {
      setGrades([]);
      return;
    }
    setGrades(
      detail.questions.map((q) => ({
        questionId: q.id,
        teacherMarks: q.answer?.teacherMarks != null ? String(q.answer.teacherMarks) : '',
        teacherFeedback: q.answer?.teacherFeedback ?? '',
      })),
    );
    setNote(detail.submission.teacherNote ?? '');
  }, [detail]);

  const selected = submissions?.find((s) => s.id === selectedId);

  function updateGrade(questionId: string, patch: Partial<QuestionGrade>) {
    setGrades((prev) => prev.map((g) => (g.questionId === questionId ? { ...g, ...patch } : g)));
  }

  async function returnWork() {
    if (!selectedId || !detail) return;
    setError(null);
    setSaved(false);
    const answers = grades.map((g) => ({
      questionId: g.questionId,
      teacherMarks: g.teacherMarks === '' ? undefined : Number(g.teacherMarks),
      teacherFeedback: g.teacherFeedback.trim() || undefined,
    }));
    const totalMarks = answers.reduce((sum, a) => sum + (a.teacherMarks ?? 0), 0);
    const totalMax = detail.questions.reduce((sum, q) => sum + (q.maxMarks ?? 0), 0);
    try {
      await returnSubmission.mutateAsync({
        submissionId: selectedId,
        body: {
          answers,
          totalMarks: totalMax > 0 ? totalMarks : undefined,
          totalMax: totalMax > 0 ? totalMax : undefined,
          teacherNote: note.trim() || undefined,
        },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not return this submission.');
    }
  }

  const loading = subsLoading || studentsLoading;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Submissions</h3>
        <p className="text-xs text-text-muted">{title}</p>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : roster.length === 0 ? (
        <p className="text-sm text-text-muted">No students in this class.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background-secondary/50 text-left text-xs text-text-secondary">
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Marks</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const sub = byStudent.get(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-border/60 cursor-pointer hover:bg-background-secondary/30 ${
                      selectedId === sub?.id ? 'bg-accent/5' : ''
                    }`}
                    onClick={() => sub && setSelectedId(sub.id)}
                  >
                    <td className="px-3 py-2">{s.firstName} {s.lastName}</td>
                    <td className="px-3 py-2 capitalize">{sub?.status ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {sub?.totalMarks != null ? sub.totalMarks : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canGrade && selected && (selected.status === 'submitted' || selected.status === 'in_progress') && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-text-secondary">Return to student</p>
          {detailLoading ? (
            <Skeleton className="mt-3 h-24 w-full" />
          ) : detail ? (
            <div className="mt-3 space-y-4">
              {detail.questions.map((q, idx) => {
                const grade = grades.find((g) => g.questionId === q.id);
                return (
                  <div key={q.id} className="rounded-md border border-border/60 p-3">
                    <p className="text-xs font-semibold text-text-muted">
                      Q{idx + 1}
                      {q.maxMarks != null && ` · max ${q.maxMarks}`}
                    </p>
                    <p className="mt-1 text-sm text-text-primary">{q.promptText ?? '—'}</p>
                    {q.answer?.answerText && (
                      <p className="mt-2 rounded bg-background-secondary/50 px-2 py-1.5 text-sm text-text-secondary">
                        {q.answer.answerText}
                      </p>
                    )}
                    <div className="mt-2 grid gap-2 sm:grid-cols-[6rem_1fr]">
                      <div>
                        <Label className="text-xs">Marks</Label>
                        <Input
                          type="number"
                          min={0}
                          max={q.maxMarks ?? undefined}
                          value={grade?.teacherMarks ?? ''}
                          onChange={(e) => updateGrade(q.id, { teacherMarks: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Feedback</Label>
                        <Input
                          value={grade?.teacherFeedback ?? ''}
                          onChange={(e) => updateGrade(q.id, { teacherFeedback: e.target.value })}
                          placeholder="Optional per-question note"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div>
                <Label className="text-xs">Overall note</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Summary feedback for the student"
                  className="mt-1"
                />
              </div>
              <Button size="sm" onClick={() => void returnWork()} disabled={returnSubmission.isPending}>
                Return
              </Button>
            </div>
          ) : null}
          {saved && <p className="mt-2 text-xs text-success">Returned.</p>}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
