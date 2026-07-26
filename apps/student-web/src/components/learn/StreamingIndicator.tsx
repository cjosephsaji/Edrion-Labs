export function StreamingIndicator({ label = 'PETROS IS BUILDING…' }: { label?: string }) {
  return (
    <div className="rounded-[15px] border border-st-bd1 bg-st-card p-5">
      <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint animate-st-blink">
        {label}
      </p>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-3/4 rounded-md bg-gradient-to-r from-st-surface2 via-st-bd1 to-st-surface2 bg-[length:520px_100%] animate-st-shimmer" />
        <div className="h-3 w-full rounded-md bg-gradient-to-r from-st-surface2 via-st-bd1 to-st-surface2 bg-[length:520px_100%] animate-st-shimmer" />
        <div className="h-3 w-5/6 rounded-md bg-gradient-to-r from-st-surface2 via-st-bd1 to-st-surface2 bg-[length:520px_100%] animate-st-shimmer" />
      </div>
    </div>
  );
}
