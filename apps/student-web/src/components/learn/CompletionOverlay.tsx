import { PillButton } from '@/components/ui/pill-button';
import { PetrosMark } from '@/components/ui/primitives';

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
    <div className="fixed inset-0 z-40 grid place-items-center bg-st-page/85 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-[18px] border border-st-accentBd bg-st-card p-6 text-center shadow-lg animate-st-sheet-in">
        <div className="mx-auto mb-4 grid h-14 w-14 animate-st-pop-in place-items-center rounded-2xl bg-st-accent text-2xl text-white">
          ✓
        </div>
        <div className="flex items-center justify-center gap-1">
          <PetrosMark />
          <p className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">SESSION DONE</p>
        </div>
        <h2 className="mt-2 font-display text-xl font-semibold text-st-ink">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-st-muted">{subtitle}</p>}
        <PillButton onClick={onContinue} className="mt-6 w-full">
          Continue
        </PillButton>
      </div>
    </div>
  );
}
