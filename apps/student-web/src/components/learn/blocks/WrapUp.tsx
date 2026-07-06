import type { ReflectionSummaryBlock } from '@edrion/schemas';
import { PillButton } from '@/components/ui/pill-button';

export function WrapUp({
  content,
  onFinish,
}: {
  content: ReflectionSummaryBlock;
  onFinish?: () => void;
}) {
  return (
    <article className="space-y-4 animate-st-block-in text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-st-accentSoft text-2xl text-st-accent">
        ✓
      </div>
      <h2 className="font-display text-2xl font-semibold text-st-ink">Session complete</h2>
      <ul className="mx-auto max-w-md space-y-2 text-left">
        {content.takeaways.map((t, i) => (
          <li key={i} className="rounded-xl border border-st-bd1 bg-st-card px-4 py-3 text-sm text-st-ink">
            {t}
          </li>
        ))}
      </ul>
      {onFinish && (
        <PillButton onClick={onFinish} className="mt-4">
          Done
        </PillButton>
      )}
    </article>
  );
}
