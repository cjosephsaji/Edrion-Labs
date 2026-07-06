'use client';
import Link from 'next/link';
import { useAddToLearningList, useQuick } from '@/lib/hooks';
import { GraphCanvas } from '@/components/learn/GraphCanvas';
import { PillButton } from '@/components/ui/pill-button';

export default function QuickAnswerPage({ params }: { params: { id: string } }) {
  const { data: quick, isLoading } = useQuick(params.id);
  const addToList = useAddToLearningList();

  if (isLoading || !quick) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/learn" className="text-sm text-st-muted hover:text-st-accent">
        ← Learn home
      </Link>
      <p className="mt-4 text-[10px] font-semibold tracking-wide text-st-faint">QUICK ANSWER</p>
      <h1 className="mt-1 font-display text-xl font-semibold text-st-ink">{quick.question}</h1>
      <p className="mt-4 text-sm font-medium text-st-ink">{quick.answerShort}</p>
      <p className="mt-2 text-sm text-st-muted">{quick.answerDetail}</p>
      {quick.visual && (
        <div className="mt-4">
          <GraphCanvas viewBox={quick.visual.viewBox} elements={quick.visual.elements} />
        </div>
      )}
      <Link
        href={`/lab/visual?topic=${encodeURIComponent(quick.question)}`}
        className="mt-4 inline-block text-sm font-semibold text-st-accent"
      >
        See a visual version →
      </Link>
      {!quick.onLearningList && (
        <PillButton
          variant="soft"
          className="mt-6"
          onClick={() => addToList.mutate(params.id)}
          disabled={addToList.isPending}
        >
          Add to learning list
        </PillButton>
      )}
    </div>
  );
}
