type CalendarEvent = { kind: string; label: string; sourceLine: string };

const kindColors: Record<string, string> = {
  exam: 'bg-st-dangerSoft text-st-danger',
  holiday: 'bg-st-accentSoft text-st-accentDeep',
  event: 'bg-st-blueSoft text-st-blue',
  due: 'bg-st-amberSoft text-st-amber',
  cls: 'bg-st-surface2 text-st-ink',
  learn: 'bg-st-accentSoft text-st-accent',
};

export function MonthGrid({
  days,
}: {
  days: { date: string; events: CalendarEvent[] }[];
}) {
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <span key={i} className="text-[10px] font-semibold text-st-faint py-1">
          {d}
        </span>
      ))}
      {days.map((day) => {
        const dateNum = new Date(day.date).getDate();
        const hasEvents = day.events.length > 0;
        return (
          <div
            key={day.date}
            className={`rounded-lg py-2 text-xs ${
              hasEvents ? 'bg-st-accentSoft font-semibold text-st-accentDeep' : 'text-st-muted'
            }`}
          >
            {dateNum}
          </div>
        );
      })}
    </div>
  );
}

export function AgendaList({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-st-muted">Nothing scheduled.</p>;
  }
  return (
    <ul className="space-y-2">
      {events.map((ev, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl border border-st-bd1 bg-st-card p-3">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${kindColors[ev.kind] ?? kindColors.event}`}>
            {ev.kind}
          </span>
          <div>
            <p className="text-sm font-medium text-st-ink">{ev.label}</p>
            <p className="text-xs text-st-muted">{ev.sourceLine}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
