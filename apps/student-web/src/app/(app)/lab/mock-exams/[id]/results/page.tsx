'use client';
import Link from 'next/link';
import { useMockExam } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function MockExamResultsPage({ params }: { params: { id: string } }) {
  const { data: exam, isLoading } = useMockExam(params.id);

  if (isLoading || !exam) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  const results = exam.results;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in text-center">
      <Link href="/lab" className="text-sm text-st-muted hover:text-st-accent">← The Lab</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Results</h1>
      <p className="mt-2 font-display text-4xl font-semibold text-st-accent">
        {results?.correct ?? 0}/{results?.total ?? 0}
      </p>
      <p className="mt-2 text-sm text-st-muted">
        Private rehearsal — mock marks stay with you and are never shared with your institution.
      </p>

      {results?.byTopic && (
        <div className="mt-8 space-y-2 text-left">
          {results.byTopic.map((t) => (
            <Card key={t.topic}>
              <div className="flex justify-between text-sm">
                <span className="font-medium text-st-ink">{t.topic}</span>
                <span className="text-st-muted">{t.correct}/{t.total}</span>
              </div>
              {t.note && <p className="mt-1 text-xs text-st-muted">{t.note}</p>}
            </Card>
          ))}
        </div>
      )}

      {results?.suggestion && (
        <p className="mt-6 text-sm text-st-muted">{results.suggestion}</p>
      )}
    </div>
  );
}
