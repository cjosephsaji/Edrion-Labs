'use client';

import { notFound } from 'next/navigation';
import {
  CheckpointDivider,
  ExplanationBlock,
  ProbeBlock,
  QuestionBlock,
  SystemNotice,
  WorkedExampleBlock,
} from '@/components/learn/session/blocks';
import { GraphPlot } from '@/components/learn/session/GraphPlot';
import { FIXTURE_FRENCH_REV, FIXTURE_FUNCTIONS } from '@/components/learn/session/fixtures';
import { Eyebrow } from '@/components/ui/primitives';

/**
 * Dev-only contract gallery for Learn block surfaces.
 * Hard-gated — never ships to production.
 */
export default function LearnFixturesPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main className="mx-auto max-w-[720px] px-5 py-10 pb-24 md:px-8">
      <Eyebrow color="accent">DEV · FIXTURES</Eyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-st-ink">
        Learn block gallery
      </h1>
      <p className="mt-2 text-sm text-st-muted">
        Hand-written fixtures only — no model calls. Compare calculus vs French Revolution rhythm.
      </p>

      <section className="mt-12 space-y-8">
        <Eyebrow>FUNCTIONS AND GRAPHS</Eyebrow>
        <ExplanationBlock {...FIXTURE_FUNCTIONS.explanation} />
        <GraphPlot
          expression="x^2+k"
          param={{ name: 'k', min: -3, max: 5, value: 0 }}
          caption="Drag k and watch the parabola move."
        />
        <WorkedExampleBlock {...FIXTURE_FUNCTIONS.worked} />
        <QuestionBlock {...FIXTURE_FUNCTIONS.question} />
        <ProbeBlock {...FIXTURE_FUNCTIONS.probe} />
        <CheckpointDivider name={FIXTURE_FUNCTIONS.checkpointName} />
        <SystemNotice
          message={FIXTURE_FUNCTIONS.systemMessage}
          actionLabel="Take a break"
          onAction={() => undefined}
        />
      </section>

      <section className="mt-16 space-y-8 border-t border-st-divider pt-12">
        <Eyebrow>CAUSES OF THE FRENCH REVOLUTION</Eyebrow>
        <ExplanationBlock {...FIXTURE_FRENCH_REV.explanation} />
        <QuestionBlock {...FIXTURE_FRENCH_REV.question} />
        <CheckpointDivider name={FIXTURE_FRENCH_REV.checkpointName} />
        <ExplanationBlock
          heading="Loading state"
          bodyMd=""
          whyHere="Skeleton communicates shape while content streams."
          state="loading"
        />
        <QuestionBlock
          promptMd=""
          options={[]}
          whyHere="Question skeleton"
          state="loading"
        />
      </section>
    </main>
  );
}
