'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MockExamDto } from '@edrion/schemas';
import {
  useFinishMockExam,
  useMockExam,
  useRetakeWeakMockExam,
  useSaveMockAnswer,
  useStartMockExam,
} from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

export default function MockExamPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading, refetch } = useMockExam(params.id);
  const start = useStartMockExam();
  const saveAnswer = useSaveMockAnswer();
  const finish = useFinishMockExam();
  const retakeWeak = useRetakeWeakMockExam();
  const [currentIdx, setCurrentIdx] = useState(0);
  const exam = data as MockExamDto | undefined;

  useEffect(() => {
    const timer = setInterval(() => void refetch(), exam?.status === 'generating' ? 2000 : 60_000);
    return () => clearInterval(timer);
  }, [exam?.status, refetch]);

  const handleStart = () => void start.mutateAsync(params.id).then(() => refetch());

  if (isLoading || !exam) {
    return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;
  }

  if (exam.status === 'ready') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 text-center animate-st-block-in">
        <p className="text-4xl">📝</p>
        <p className="mt-4 font-display text-lg font-semibold text-st-ink">{exam.title}</p>
        <p className="mt-2 text-sm text-st-muted">
          {exam.questions?.length ?? 0} questions · {exam.context.durationMin} minutes
        </p>
        <PillButton className="mt-6" onClick={handleStart} disabled={start.isPending}>
          Start exam
        </PillButton>
      </div>
    );
  }

  if (exam.status === 'generating' || exam.status === 'draft') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 text-center">
        <p className="text-4xl">⏳</p>
        <p className="mt-4 font-display text-lg font-semibold text-st-ink">Petros is writing your questions…</p>
        <p className="mt-2 text-sm text-st-muted">This usually takes under a minute.</p>
      </div>
    );
  }

  if (exam.status === 'completed' && exam.results) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
        <Link href="/lab" className="text-sm text-st-accent">← The Lab</Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Results</h1>
        <Card className="mt-6 text-center">
          <p className="text-4xl font-display font-semibold text-st-accentDeep">
            {exam.results.correct} / {exam.results.total}
          </p>
          <p className="mt-2 text-sm text-st-muted">correct — counts only, no grade</p>
        </Card>
        <p className="mt-6 text-sm text-st-muted">{exam.results.suggestion}</p>
        <div className="mt-6 space-y-2">
          {exam.results.byTopic.map((row) => (
            <Card key={row.topic} className="flex justify-between text-sm">
              <span className="text-st-ink">{row.topic}</span>
              <span className="text-st-muted">{row.correct}/{row.total}</span>
            </Card>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillButton
            variant="soft"
            disabled={retakeWeak.isPending}
            onClick={() =>
              void retakeWeak.mutateAsync(params.id).then((next) => router.push(`/lab/mock-exams/${next.id}`))
            }
          >
            Retake weak areas
          </PillButton>
          <PillButton onClick={() => router.push('/lab/mock-exams/new')}>
            Build another mock
          </PillButton>
        </div>
      </div>
    );
  }

  const questions = exam.questions ?? [];
  const q = questions[currentIdx];
  if (!q) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">No questions available.</p>
      </div>
    );
  }

  const handleChoice = (choiceKey: string) => {
    void saveAnswer.mutateAsync({
      examId: params.id,
      questionId: q.id,
      body: { choiceKey },
    });
    if (currentIdx < questions.length - 1) setCurrentIdx((i) => i + 1);
  };

  const handleFinish = async () => {
    await finish.mutateAsync(params.id);
    void refetch();
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <div className="flex items-center justify-between text-xs text-st-muted">
        <span>Question {currentIdx + 1} of {questions.length}</span>
        <span>{exam.title}</span>
      </div>

      <Card className="mt-6">
        <p className="text-[10px] font-semibold text-st-faint">{q.topic.toUpperCase()}</p>
        <p className="mt-2 text-st-ink">{q.prompt}</p>
        {q.options && (
          <div className="mt-4 space-y-2">
            {q.options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleChoice(opt.key)}
                className="w-full rounded-xl border border-st-bd1 bg-st-surface2 px-4 py-3 text-left text-sm transition hover:border-st-accent"
              >
                <span className="font-semibold text-st-accent">{opt.key}.</span> {opt.label}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6 flex justify-between">
        <PillButton
          variant="ghost"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx((i) => i - 1)}
        >
          Previous
        </PillButton>
        {currentIdx === questions.length - 1 ? (
          <PillButton onClick={() => void handleFinish()} disabled={finish.isPending}>
            Finish exam
          </PillButton>
        ) : (
          <PillButton onClick={() => setCurrentIdx((i) => i + 1)}>Next</PillButton>
        )}
      </div>
    </div>
  );
}
