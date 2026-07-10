'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useFinishExam,
  useMockExam,
  usePauseExam,
  useSaveExamAnswer,
  useStartExam,
} from '@/lib/hooks';
import { examTemplateAllowsPause } from '@edrion/schemas';
import { ExamTimer } from '@/components/lab/exam/ExamTimer';
import { QuestionPalette, type PaletteItem } from '@/components/lab/exam/QuestionPalette';
import { QuestionInput } from '@/components/lab/exam/inputs/QuestionInput';
import { useExamAttemptStore } from '@/components/lab/exam/useExamAttemptStore';
import { OfflineAnswerQueue } from '@/components/lab/exam/OfflineAnswerQueue';
import {
  buildAnswerBody,
  isAnswered,
  normalizeQuestionType,
  type LocalAnswer,
} from '@/components/lab/exam/answer-model';
import { MathText } from '@/components/learn/MathText';

const AUTOSAVE_MS = 600;

export default function ExamAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: exam, refetch } = useMockExam(id, { pollWhileGenerating: false });
  const start = useStartExam();
  const save = useSaveExamAnswer();
  const finish = useFinishExam();
  const pauseMut = usePauseExam();
  const [warning, setWarning] = useState<string | null>(null);
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
    if (!exam.attempt && exam.status === 'ready') {
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

  const current = questions[store.state.currentIndex];

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

  const onAnswer = (patch: Partial<LocalAnswer>) => {
    if (!current) return;
    store.setAnswer(current.id, patch);
    const next = { ...store.state.answers[current.id], ...patch };
    scheduleSave(current.id, next, !!store.state.flags[current.id]);
  };

  const onToggleFlag = () => {
    if (!current) return;
    const nextFlag = !store.state.flags[current.id];
    store.setFlag(current.id, nextFlag);
    scheduleSave(current.id, store.state.answers[current.id] ?? {}, nextFlag);
  };

  const submit = async () => {
    await finish.mutateAsync(id);
    router.push(`/lab/mock-exams/${id}/results`);
  };

  const canPause = useMemo(() => {
    const t = exam?.blueprint?.template ?? 'chapter_test';
    return examTemplateAllowsPause(t);
  }, [exam?.blueprint?.template]);

  const durationMs = (exam?.context?.durationMin ?? 60) * 60_000;

  const paletteItems: PaletteItem[] = questions.map((q, index) => ({
    index,
    sequence: q.sequence,
    sectionName: q.sectionId,
    answered: isAnswered(normalizeQuestionType(String(q.qtype)), store.state.answers[q.id]),
    flagged: !!store.state.flags[q.id],
  }));
  const answeredCount = paletteItems.filter((p) => p.answered).length;

  if (!exam || !current) {
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-sm text-st-muted">
        Loading exam room…
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-st-bg text-st-ink">
      <header className="flex items-center justify-between gap-3 border-b border-st-bd2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{exam.title}</p>
          <p className="font-mono text-xs text-st-muted">
            Q{store.state.currentIndex + 1}/{questions.length}
            {current.sectionId ? ` · ${current.sectionId}` : ''}
          </p>
        </div>
        {exam.attempt?.endsAt && (
          <ExamTimer
            endsAt={exam.attempt.endsAt}
            durationMs={durationMs}
            onWarning={(kind) =>
              setWarning(kind === 'half' ? 'Halfway through time.' : 'Five minutes left.')
            }
            onExpire={() => void submit()}
          />
        )}
        <div className="flex shrink-0 gap-2">
          {canPause && (
            <button
              type="button"
              className="rounded-full border border-st-bd2 px-3 py-1 text-xs"
              onClick={() => void pauseMut.mutateAsync(id).then(() => router.push('/lab/mock-exams'))}
            >
              Pause
            </button>
          )}
          <button
            type="button"
            className="rounded-full bg-st-accent px-3 py-1 text-xs font-semibold text-white"
            onClick={() => void submit()}
          >
            Submit
          </button>
        </div>
      </header>

      {warning && (
        <div className="animate-st-fade-up bg-st-amberSoft px-4 py-2 text-center text-sm text-st-amber">
          {warning}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <QuestionPalette
          items={paletteItems}
          currentIndex={store.state.currentIndex}
          answeredCount={answeredCount}
          onSelect={store.goTo}
          onFinish={() => void submit()}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
          <p className="font-mono text-xs text-st-muted">
            {current.topic} · {current.marks} mark{current.marks === 1 ? '' : 's'}
          </p>
          <div className="mt-3 text-lg leading-relaxed">
            <MathText>{current.prompt}</MathText>
          </div>
          <div className="mt-6">
            <QuestionInput
              question={current}
              value={store.state.answers[current.id] ?? {}}
              onChange={onAnswer}
            />
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 pb-24">
            <button
              type="button"
              className="rounded-full border border-st-bd2 px-4 py-2 text-sm"
              disabled={store.state.currentIndex === 0}
              onClick={store.prev}
            >
              Previous
            </button>
            <button type="button" className="text-sm text-st-muted" onClick={onToggleFlag}>
              {store.state.flags[current.id] ? 'Unflag' : 'Flag'}
            </button>
            <button
              type="button"
              className="rounded-full border border-st-bd2 px-4 py-2 text-sm"
              disabled={store.state.currentIndex >= questions.length - 1}
              onClick={store.next}
            >
              Next
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
