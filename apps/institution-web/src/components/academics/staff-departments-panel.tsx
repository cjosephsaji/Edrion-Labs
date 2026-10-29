'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Input, Label } from '@edrion/ui';
import {
  useOnboardingRecordMutations,
  useOnboardingStepSubmit,
  useStepList,
} from '@/lib/onboarding';
import { formatPortalError } from '@/lib/portal-client';
import type { DepartmentRow } from '@/lib/academics';

/** Optional organisational departments, managed without leaving staff onboarding. */
export function StaffDepartmentsPanel({
  canManage,
  onDraftChange,
  onCreated,
}: {
  canManage: boolean;
  onDraftChange: (dirty: boolean) => void;
  onCreated?: (department: DepartmentRow) => void;
}) {
  const [page, setPage] = useState(1);
  const list = useStepList<DepartmentRow>('academics/departments', {
    unitKind: 'department',
    page: String(page),
    pageSize: '20',
  });
  const create = useOnboardingStepSubmit('departments', 'academics/departments');
  const { update, remove } = useOnboardingRecordMutations('academics/departments');
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [removing, setRemoving] = useState<DepartmentRow | null>(null);
  const [pendingEdit, setPendingEdit] = useState<DepartmentRow | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const dirty = editing
    ? name !== editing.name || code !== editing.code
    : !!name.trim() || !!code.trim();
  const busy = create.isPending || update.isPending || remove.isPending;
  useEffect(() => {
    onDraftChange(dirty);
  }, [dirty, onDraftChange]);
  function openEditor(row: DepartmentRow | null) {
    setEditing(row);
    setName(row?.name ?? '');
    setCode(row?.code ?? '');
    create.reset();
    update.reset();
  }
  function chooseEditor(row: DepartmentRow | null) {
    if (dirty) {
      setPendingEdit(row);
      setDiscardOpen(true);
    } else openEditor(row);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const body = { name: name.trim(), ...(code.trim() ? { code: code.trim() } : {}) };
    if (editing)
      update.mutate(
        { id: editing.id, body: { ...body, version: editing.version } },
        { onSuccess: () => openEditor(null) },
      );
    else
      create.mutate(
        { body: { ...body, unitKind: 'department' }, values: {} },
        {
          onSuccess: (department) => {
            openEditor(null);
            onCreated?.(department as DepartmentRow);
          },
        },
      );
  }
  return (
    <section className="mt-6 rounded-lg border border-border p-4" aria-label="Staff departments">
      <h3 className="text-sm font-semibold text-text-primary">Staff departments</h3>
      <p className="mt-1 text-sm text-text-secondary">
        Create departments such as Mathematics, Science, or Administration. These are separate from
        student courses and streams. Department assignment is optional.
      </p>
      {canManage && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="staff-department-name">Department name</Label>
              <Input
                id="staff-department-name"
                value={name}
                maxLength={160}
                required
                disabled={busy}
                placeholder="e.g. Mathematics"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="staff-department-code">Code (optional)</Label>
              <Input
                id="staff-department-code"
                value={code}
                maxLength={32}
                disabled={busy}
                placeholder="e.g. MATH"
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !name.trim()}
              loading={create.isPending || update.isPending}
            >
              {editing ? (
                'Save department'
              ) : (
                <>
                  <Plus className="mr-1 h-3 w-3" />
                  Add department
                </>
              )}
            </Button>
            {(editing || dirty) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => chooseEditor(null)}
              >
                Cancel
              </Button>
            )}
          </div>
          {(create.isError || update.isError) && (
            <p role="alert" className="text-sm text-danger">
              {formatPortalError(update.error ?? create.error, 'Could not save department.')}
            </p>
          )}
        </form>
      )}
      {list.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {formatPortalError(list.error, 'Could not load departments.')}{' '}
          <button type="button" className="underline" onClick={() => list.refetch()}>
            Retry
          </button>
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {(list.data?.items ?? []).map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 rounded-md bg-background-secondary px-3 py-2 text-sm"
          >
            <span>{row.name}</span>
            {canManage && (
              <span className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Edit department ${row.name}`}
                  onClick={() => chooseEditor(row)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Delete department ${row.name}`}
                  onClick={() => {
                    remove.reset();
                    setRemoving(row);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {(page > 1 || list.data?.hasMore) && (
        <div className="mt-3 flex justify-between">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page === 1 || list.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous departments
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!list.data?.hasMore || list.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            More departments
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={discardOpen}
        title="Discard department changes?"
        description="Your saved departments will remain. The unsaved department form will be cleared."
        danger={false}
        confirmLabel="Discard changes"
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => {
          openEditor(pendingEdit);
          setDiscardOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title={`Delete department ${removing?.name ?? ''}?`}
        description={
          <>
            Staff assigned to this department will become unassigned. Courses and streams remain
            unchanged.
            {remove.isError && (
              <span role="alert" className="mt-2 block text-danger">
                {formatPortalError(remove.error, 'Could not delete department.')}
              </span>
            )}
          </>
        }
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { id: removing.id, version: removing.version },
            {
              onSuccess: () => {
                if (editing?.id === removing.id) openEditor(null);
                setRemoving(null);
                if (list.data?.items.length === 1 && page > 1) setPage((value) => value - 1);
              },
            },
          );
        }}
      />
    </section>
  );
}
