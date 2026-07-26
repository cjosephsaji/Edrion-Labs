'use client';

type State = Record<string, unknown> | null | undefined;

interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
}

function render(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function buildDiff(before: State, after: State): DiffRow[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  return keys.map((key) => {
    const b = before?.[key];
    const a = after?.[key];
    const hasB = before != null && key in before;
    const hasA = after != null && key in after;
    let kind: DiffRow['kind'] = 'unchanged';
    if (!hasB && hasA) kind = 'added';
    else if (hasB && !hasA) kind = 'removed';
    else if (JSON.stringify(b) !== JSON.stringify(a)) kind = 'changed';
    return { key, before: b, after: a, kind };
  });
}

const KIND_CLASS: Record<DiffRow['kind'], string> = {
  added: 'text-success',
  removed: 'text-danger',
  changed: 'text-warning',
  unchanged: 'text-text-secondary',
};

/** Before/after diff for an audit event's previousState/newState JSONB. */
export function StateDiff({ before, after }: { before: State; after: State }) {
  if (!before && !after) {
    return <p className="text-sm text-text-muted">No state captured for this event.</p>;
  }
  const rows = buildDiff(before, after);
  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No fields recorded.</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-background-secondary text-left text-text-muted">
            <th className="px-3 py-1.5 font-medium">Field</th>
            <th className="px-3 py-1.5 font-medium">Before</th>
            <th className="px-3 py-1.5 font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key} className={r.kind !== 'unchanged' ? 'bg-surface' : ''}>
              <td className="px-3 py-1.5 font-medium text-text-primary">{r.key}</td>
              <td className="px-3 py-1.5 font-mono text-text-muted">{render(r.before)}</td>
              <td className={`px-3 py-1.5 font-mono ${KIND_CLASS[r.kind]}`}>{render(r.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
