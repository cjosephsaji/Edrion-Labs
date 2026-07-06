export function StreamingIndicator({ label = 'Generating…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-st-bd1 bg-st-surface2 px-4 py-3 text-sm text-st-muted">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-st-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-st-accent" />
      </span>
      {label}
    </div>
  );
}
