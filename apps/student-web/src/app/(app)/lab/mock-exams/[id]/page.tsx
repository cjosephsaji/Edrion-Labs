'use client';
import { useEffect, useState } from 'react';
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
import { Eyebrow, PageHeader, StatSlot } from '@/components/ui/primitives';
import { StreamingIndicator } from '@/components/learn/StreamingIndicator';

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
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref="/lab"
          eyebrow={<Eyebrow color="amber">MOCK EXAM</Eyebrow>}
          title={exam.title}
          subtitle={`${exam.questions?.length ?? 0} questions · ${exam.context.durationMin} minutes`}
        />
        <div className="mt-8 flex justify-center">
          <PillButton onClick={handleStart} disabled={start.isPending}>
            Start exam
          </PillButton>
        </div>
      </div>
    );
  }

  if (exam.status === 'generating' || exam.status === 'draft') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <PageHeader eyebrow={<Eyebrow color="amber">MOCK EXAM</Eyebrow>} title="Building your exam" />
        <div className="mt-6">
          <StreamingIndicator label="PETROS IS WRITING YOUR QUESTIONS…" />
        </div>
      </div>
    );
  }

  if (exam.status === 'completed' && exam.results) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref="/lab"
          eyebrow={<Eyebrow color="amber">RESULTS</Eyebrow>}
          title={exam.title}
          subtitle="Counts only — no letter grade."
        />
        <StatSlot
          className="mt-6"
          label="Score"
          value={`${exam.results.correct} / ${exam.results.total}`}
          from="Questions answered correctly"
        />
        <p className="mt-4 text-sm text-st-muted">{exam.results.suggestion}</p>
        <div className="mt-6 space-y-2">
          {exam.results.byTopic.map((row) => (
            <div key={row.topic} className="flex justify-between rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3 text-sm">
              <span className="text-st-ink">{row.topic}</span>
              <span className="font-mono-ui text-st-muted">{row.correct}/{row.total}</span>
            </div>
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
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <Eyebrow>
        QUESTION {currentIdx + 1} OF {questions.length}
      </Eyebrow>
      <p className="mt-1 text-sm text-st-muted">{exam.title}</p>

      <Card className="mt-6" eyebrow={q.topic.toUpperCase()} noPadding>
        <div className="p-5">
          <p className="font-display text-lg text-st-ink">{q.prompt}</p>
          {q.options && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {q.options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleChoice(opt.key)}
                  className="rounded-xl border border-st-bd2 bg-st-card px-4 py-3 text-left text-sm transition hover:border-st-accent"
                >
                  <span className="font-mono-ui font-semibold text-st-accent">{opt.key}.</span> {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
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
