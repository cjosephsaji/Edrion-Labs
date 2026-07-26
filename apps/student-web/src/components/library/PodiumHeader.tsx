export function PodiumHeader({
  earnedCount,
  total,
}: {
  earnedCount: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-st-bd1 bg-gradient-to-br from-st-accentSoft to-st-card p-6 text-center">
      <p className="text-[10px] font-semibold tracking-[0.14em] text-st-accent">ACHIEVEMENTS</p>
      <p className="mt-2 font-display text-4xl font-semibold text-st-ink">
        {earnedCount}
        <span className="text-lg text-st-muted">/{total}</span>
      </p>
      <div className="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-st-surface2">
        <div className="h-full rounded-full bg-st-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-st-muted">{pct}% unlocked</p>
    </div>
  );
}
