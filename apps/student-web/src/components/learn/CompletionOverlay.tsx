import { PillButton } from '@/components/ui/pill-button';

export function CompletionOverlay({
  title,
  subtitle,
  onContinue,
}: {
  title: string;
  subtitle?: string;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-st-page/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-st-bd1 bg-st-card p-6 text-center shadow-lg animate-st-block-in">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-st-accentSoft text-2xl text-st-accent">
          ✓
        </div>
        <h2 className="font-display text-xl font-semibold text-st-ink">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-st-muted">{subtitle}</p>}
        <PillButton onClick={onContinue} className="mt-6 w-full">
          Continue
        </PillButton>
      </div>
    </div>
  );
}
