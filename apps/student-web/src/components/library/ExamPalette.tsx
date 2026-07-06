export function ExamPalette({
  subjects,
  selected,
  onSelect,
}: {
  subjects: string[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {subjects.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(s)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            selected === s ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted hover:text-st-ink'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
