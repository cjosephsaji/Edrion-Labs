'use client';
import Link from 'next/link';
import { useAddToLearningList, useQuick } from '@/lib/hooks';
import { GraphCanvas } from '@/components/learn/GraphCanvas';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function QuickAnswerPage({ params }: { params: { id: string } }) {
  const { data: quick, isLoading } = useQuick(params.id);
  const addToList = useAddToLearningList();

  if (isLoading || !quick) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader backHref="/learn" eyebrow={<Eyebrow>QUICK ANSWER</Eyebrow>} title={quick.question} />

      <Card className="mt-6" noPadding>
        <div className="p-6">
          <p className="font-display text-lg font-semibold leading-relaxed text-st-ink">
            {quick.answerShort}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-st-muted">{quick.answerDetail}</p>
        </div>
      </Card>

      {quick.visual && (
        <div className="mt-4 rounded-[15px] border border-st-bd1 bg-st-card p-4">
          <GraphCanvas viewBox={quick.visual.viewBox} elements={quick.visual.elements} />
        </div>
      )}

      <div className="mt-6 rounded-[15px] border border-st-accentBd bg-st-accentSoft p-5">
        <p className="font-display text-base font-semibold text-st-accentDeep">Want the full topic?</p>
        <p className="mt-1 text-sm text-st-muted">
          Turn this quick answer into a guided session with Petros.
        </p>
        <Link
          href={`/learn?topic=${encodeURIComponent(quick.question)}`}
          className="mt-3 inline-block text-sm font-semibold text-st-accent"
        >
          Start a learn session →
        </Link>
      </div>

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
