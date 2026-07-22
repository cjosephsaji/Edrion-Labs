'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useFinishExam,
  useMockExam,
  useSaveExamAnswer,
  useStartExam,
} from '@/lib/hooks';
import { useExamAttemptStore } from '@/components/lab/exam/useExamAttemptStore';
import { OfflineAnswerQueue } from '@/components/lab/exam/OfflineAnswerQueue';
import {
  buildAnswerBody,
  isAnswered,
  normalizeQuestionType,
  type LocalAnswer,
} from '@/components/lab/exam/answer-model';
import { MockExamPlayer } from '@/components/mock-exams/players/MockExamPlayer';
import type { ExamSkin } from '@edrion/schemas';

const AUTOSAVE_MS = 600;

export default function ExamAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: exam, refetch } = useMockExam(id, { pollWhileGenerating: false });
  const start = useStartExam();
  const save = useSaveExamAnswer();
  const finish = useFinishExam();
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const questions = exam?.questions ?? [];
  const store = useExamAttemptStore(questions.length);

  const queueRef = useRef<OfflineAnswerQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new OfflineAnswerQueue(id, async (questionId, body) => {
      await save.mutateAsync({ examId: id, questionId, body });
    });
  }

  useEffect(() => {
    if (!exam) return;
    if (
      !exam.attempt &&
      (exam.status === 'ready' || exam.status === 'scheduled' || exam.status === 'in_progress')
    ) {
      void start.mutateAsync(id).then(() => refetch());
    }
  }, [exam, id, start, refetch]);

  useEffect(() => {
    if (exam?.answers) store.hydrate(exam.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per answers payload
  }, [exam?.answers]);

  useEffect(() => {
    const onOnline = () => void queueRef.current?.flush();
    window.addEventListener('online', onOnline);
    void queueRef.current?.flush();
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!(exam as { strictMode?: boolean } | undefined)?.strictMode) return;
    const onVis = () => {
      if (document.visibilityState !== 'hidden') return;
      void fetch(`/api/proxy/lab/mock-exams/${id}/attempt/tab-switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEventId: `${Date.now()}-${Math.random()}` }),
      }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [exam, id]);

  const scheduleSave = useCallback(
    (questionId: string, answer: LocalAnswer, flagged: boolean) => {
      if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
      saveTimers.current[questionId] = setTimeout(() => {
        const q = questions.find((x) => x.id === questionId);
        const type = normalizeQuestionType(String(q?.qtype ?? 'short_answer'));
        const body = buildAnswerBody(type, answer, flagged);
        if (!navigator.onLine) {
          queueRef.current?.enqueue(questionId, body);
          return;
        }
        void save.mutateAsync({ examId: id, questionId, body }).catch(() => {
          queueRef.current?.enqueue(questionId, body);
        });
      }, AUTOSAVE_MS);
    },
    [id, save, questions],
  );

  const onAnswerPatch = (patch: Partial<LocalAnswer>) => {
    const current = questions[store.state.currentIndex];
    if (!current) return;
    store.setAnswer(current.id, patch);
    const next = { ...store.state.answers[current.id], ...patch };
    scheduleSave(current.id, next, !!store.state.flags[current.id]);
  };

  const onToggleFlag = () => {
    const current = questions[store.state.currentIndex];
    if (!current) return;
    const nextFlag = !store.state.flags[current.id];
    store.setFlag(current.id, nextFlag);
    scheduleSave(current.id, store.state.answers[current.id] ?? {}, nextFlag);
  };

  const submit = async () => {
    const unanswered = questions.filter(
      (q) => !isAnswered(normalizeQuestionType(String(q.qtype)), store.state.answers[q.id]),
    ).length;
    const marked = Object.values(store.state.flags).filter(Boolean).length;
    if (!window.confirm(`${unanswered} unanswered · ${marked} marked — submit?`)) return;
    await finish.mutateAsync(id);
    router.push(`/lab/mock-exams/${id}/results`);
  };

  const declaredSkin = useMemo((): ExamSkin | string | null => {
    if (!exam) return null;
    if (exam.skin) return exam.skin;
    const snap = exam.blueprintSnapshot as { skin?: string } | undefined;
    if (snap?.skin) return snap.skin;
    if (exam.blueprint?.skin) return exam.blueprint.skin;
    return 'standard';
  }, [exam]);

  if (!exam || !questions.length || !queueRef.current) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-sm text-st-muted">
        Loading exam room…
      </div>
    );
  }

  return (
    <MockExamPlayer
      examId={id}
      exam={exam}
      declaredSkin={declaredSkin}
      store={store}
      queue={queueRef.current}
      onAnswerPatch={onAnswerPatch}
      onToggleFlag={onToggleFlag}
      onSubmit={() => void submit()}
      onLeave={() => router.push('/lab/mock-exams')}
      onExpire={() =>
        void finish.mutateAsync(id).then(() => router.push(`/lab/mock-exams/${id}/results`))
      }
      scheduleSave={scheduleSave}
    />
  );
}
