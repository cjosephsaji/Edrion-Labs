export function TrendBars({ bars }: { bars: { label: string; value: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-2 h-32">
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md bg-st-accent"
            style={{ height: `${(bar.value / max) * 100}%`, minHeight: bar.value > 0 ? 4 : 0 }}
          />
          <span className="text-[9px] text-st-faint">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}
