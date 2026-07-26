export function HeatMap({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const intensity = day.count / max;
        return (
          <div
            key={day.date}
            title={`${day.date}: ${day.count}`}
            className="aspect-square rounded-sm"
            style={{
              backgroundColor: intensity > 0 ? `color-mix(in srgb, var(--st-accent) ${Math.round(intensity * 100)}%, var(--st-surface2))` : 'var(--st-surface2)',
            }}
          />
        );
      })}
    </div>
  );
}
