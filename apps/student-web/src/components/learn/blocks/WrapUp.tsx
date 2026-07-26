import type { ReflectionSummaryBlock } from '@edrion/schemas';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { BlockCard } from '../BlockCard';
import { PillButton } from '@/components/ui/pill-button';

export function WrapUp({
  content,
  sessionId,
  onFinish,
}: {
  content: ReflectionSummaryBlock;
  sessionId?: string;
  onFinish?: () => void;
}) {
  return (
    <BlockCard eyebrow="WRAP UP" tone="wrap" icon={Sparkles}>
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 animate-st-pop-in place-items-center rounded-2xl bg-st-accent text-2xl text-white">
          ✓
        </div>
        <h2 className="font-display text-2xl font-semibold text-st-ink">Session complete</h2>
      </div>
      <ul className="mx-auto mt-5 max-w-md space-y-2">
        {content.takeaways.map((t, i) => (
          <li
            key={i}
            className="rounded-xl border border-st-accentBd bg-st-card px-4 py-3 font-display text-sm text-st-ink"
          >
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col items-center gap-3">
        {sessionId ? (
          <Link
            href={`/lab/visual?session_id=${sessionId}`}
            className="text-sm font-semibold text-st-accent"
          >
            See this as a map →
          </Link>
        ) : null}
        {onFinish && <PillButton onClick={onFinish}>Finish session →</PillButton>}
      </div>
    </BlockCard>
  );
}
