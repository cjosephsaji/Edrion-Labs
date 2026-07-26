export function TransparencyPanel({
  sharedWith,
  neverShared,
}: {
  sharedWith: string[];
  neverShared: string[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-st-bd1 bg-st-card p-4">
        <p className="text-[10px] font-semibold tracking-wide text-st-faint">SHARED WITH TEACHERS</p>
        <ul className="mt-2 space-y-1 text-sm text-st-ink">
          {sharedWith.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-st-bd1 bg-st-card p-4">
        <p className="text-[10px] font-semibold tracking-wide text-st-faint">NEVER SHARED</p>
        <ul className="mt-2 space-y-1 text-sm text-st-muted">
          {neverShared.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
