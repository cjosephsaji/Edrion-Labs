export function MarkDotPlot({
  dots,
}: {
  dots: { label: string; marks: number; maxMarks: number; pct: number }[];
}) {
  return (
    <div className="space-y-3">
      {dots.map((dot) => (
        <div key={dot.label}>
          <div className="flex justify-between text-xs">
            <span className="font-medium text-st-ink">{dot.label}</span>
            <span className="text-st-muted">
              {dot.marks}/{dot.maxMarks}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-st-surface2">
            <div
              className="h-full rounded-full bg-st-accent"
              style={{ width: `${Math.min(100, dot.pct)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
