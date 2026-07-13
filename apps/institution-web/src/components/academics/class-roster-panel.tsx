'use client';
import { useMemo, useState } from 'react';
import { Search, UserMinus, UserPlus } from 'lucide-react';
import { Badge, Button, Dialog, Input, Skeleton } from '@edrion/ui';
import { useClassRosterMutation, useRosterCandidates } from '@/lib/academics';
import { useClassRoster } from '@/lib/people';
import { usePermissions } from '@/lib/permissions';
import { PortalClientError } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';

/**
 * Class roster with bulk enrolment. Adding students one-by-one from the student directory was the
 * only way in before; this pulls the whole "put these 40 students in this section" flow into the
 * class itself, which is where people look for it.
 */
export function ClassRosterPanel({
  classId,
  className,
  capacity,
}: {
  classId: string;
  className: string;
  capacity?: number | null;
}) {
  const { can } = usePermissions();
  const canManage = can('academics.manage');
  const { data, isLoading, isError } = useClassRoster(classId);
  const rosterMut = useClassRosterMutation(classId);

  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roster = useMemo(() => data ?? [], [data]);

  async function removeStudent(studentId: string) {
    setError(null);
    try {
      await rosterMut.mutateAsync({ remove: [studentId] });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the student.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-text-muted">Couldn’t load the roster for {className}.</p>;
  }

  const full = capacity != null && roster.length >= capacity;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Roster ({roster.length}
          {capacity != null ? ` / ${capacity}` : ''})
        </h3>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setPicking(true)} disabled={full}>
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            {full ? 'Class full' : 'Add students'}
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {roster.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted">
          No students enrolled in this class.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {roster.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-text-primary">
                  {formatPersonName(s)}
                </span>
                <span className="ml-1.5 font-mono text-xs text-text-muted">{s.admissionNo}</span>
              </span>
              <span className="tabular-nums text-text-secondary">{s.rollNo ?? '—'}</span>
              {canManage && (
                <button
                  type="button"
                  aria-label={`Remove ${formatPersonName(s)} from ${className}`}
                  onClick={() => removeStudent(s.id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                >
                  <UserMinus className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddStudentsDialog
        open={picking}
        onClose={() => setPicking(false)}
        classId={classId}
        className={className}
        seatsLeft={capacity == null ? null : capacity - roster.length}
      />
    </section>
  );
}

/** Multi-select student picker: search, tick, add in one write. */
function AddStudentsDialog({
  open,
  onClose,
  classId,
  className,
  seatsLeft,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  seatsLeft: number | null;
}) {
  const [search, setSearch] = useState('');
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useRosterCandidates(open ? classId : null, {
    search: search.trim() || undefined,
    includeAssigned,
  });
  const rosterMut = useClassRosterMutation(classId);

  const candidates = data ?? [];
  const overCapacity = seatsLeft != null && selected.size > seatsLeft;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function close() {
    setSelected(new Set());
    setSearch('');
    setError(null);
    onClose();
  }

  async function save() {
    if (selected.size === 0) return;
    setError(null);
    try {
      await rosterMut.mutateAsync({ add: [...selected] });
      close();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add the students.');
    }
  }

  return (
    <Dialog open={open} onClose={close} title={`Add students to ${className}`}>
      <div className="flex max-h-[70vh] flex-col gap-3 p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, roll number, or admission number…"
            className="pl-9"
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={includeAssigned}
            onChange={(e) => setIncludeAssigned(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Also show students already in another class (moves them)
        </label>

        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">
              {includeAssigned
                ? 'No students match.'
                : 'No unassigned students. Tick the box above to move students out of another class.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-background-secondary/50">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium text-text-primary">
                        {formatPersonName(c)}
                      </span>
                      <span className="ml-1.5 font-mono text-xs text-text-muted">{c.admissionNo}</span>
                    </span>
                    {c.currentClassName && <Badge tone="warning">in {c.currentClassName}</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-text-muted">
            {selected.size} selected
            {overCapacity && (
              <span className="ml-1 text-danger">— only {seatsLeft} seat(s) left</span>
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={save}
              loading={rosterMut.isPending}
              disabled={selected.size === 0 || overCapacity}
            >
              Add {selected.size > 0 ? selected.size : ''}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
