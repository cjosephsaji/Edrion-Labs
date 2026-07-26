export function CountdownCard({
  days,
  dateLabel,
  title,
  sub,
}: {
  days: number;
  dateLabel: string;
  title: string;
  sub?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-st-red/20 bg-gradient-to-br from-st-redSoft/40 to-st-card p-5">
      <p className="text-[10px] font-semibold tracking-wide text-st-red">NEXT EXAM</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold text-st-ink">{days}</span>
        <span className="text-sm text-st-muted">days</span>
      </div>
      <p className="mt-2 font-display text-lg font-semibold text-st-ink">{title}</p>
      <p className="text-xs text-st-muted">{dateLabel}</p>
      {sub && <p className="mt-1 text-xs text-st-muted">{sub}</p>}
    </div>
  );
}
