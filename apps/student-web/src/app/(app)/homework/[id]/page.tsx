'use client';
import Link from 'next/link';
import { useHomework } from '@/lib/hooks';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import { Card } from '@/components/ui/card';

export default function HomeworkDetailPage({ params }: { params: { id: string } }) {
  const { data: hw, isLoading } = useHomework(params.id);

  if (isLoading || !hw) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/homework" className="text-sm text-st-muted hover:text-st-accent">← Homework</Link>
      <div className="mt-4 flex items-start justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold text-st-ink">{hw.title}</h1>
        <GovernancePill label={hw.status} tone="info" />
      </div>
      {hw.instructions && <p className="mt-2 text-sm text-st-muted">{hw.instructions}</p>}
      <p className="mt-1 text-xs text-st-faint">Due {new Date(hw.dueAt).toLocaleString()}</p>

      <div className="mt-8 space-y-4">
        {hw.questions.map((q) => {
          const answer = hw.answers.find((a) => a.questionId === q.id);
          return (
            <Card key={q.id}>
              <p className="text-xs font-semibold text-st-faint">Q{q.sequence}</p>
              <p className="mt-1 text-sm text-st-ink">{q.promptText}</p>
              {answer?.answerText && (
                <p className="mt-2 rounded-lg bg-st-surface2 p-2 text-sm text-st-muted">{answer.answerText}</p>
              )}
              {answer?.teacherFeedback && (
                <p className="mt-2 text-xs text-st-accent">Feedback: {answer.teacherFeedback}</p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
