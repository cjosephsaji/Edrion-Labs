'use client';
import { useState } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { Badge, Button, Combobox, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useGuardianMutations, useGuardians, useParentOptions } from '@/lib/people';
import { PortalClientError } from '@/lib/portal-client';

const RELATIONSHIPS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
];

/** Inline guardians editor — used inside the student edit drawer. */
export function StudentGuardiansPanel({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const { can } = usePermissions();
  const canManage = can('students.update');
  const { data: guardians, isLoading } = useGuardians(studentId);
  const { data: parents } = useParentOptions();
  const { assign, remove } = useGuardianMutations(studentId);
  const [parentId, setParentId] = useState('');
  const [relationship, setRelationship] = useState('guardian');
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = new Set((guardians ?? []).map((g) => g.parentId));
  const available = (parents?.items ?? []).filter((p) => !linkedIds.has(p.id));

  async function add() {
    if (!parentId) return;
    setError(null);
    try {
      await assign.mutateAsync({ parentId, relationship, isPrimary });
      setParentId('');
      setRelationship('guardian');
      setIsPrimary(false);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not link guardian.');
    }
  }

  async function drop(linkId: string) {
    setError(null);
    try {
      await remove.mutateAsync(linkId);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove guardian.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Guardians</h3>
      <p className="text-xs text-text-muted">Parents and guardians linked to {studentName}.</p>
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Combobox
            value={parentId || null}
            onChange={setParentId}
            placeholder={available.length ? 'Choose a parent…' : 'All parents linked'}
            searchPlaceholder="Search parents by name, email or phone…"
            emptyText="No matching parents"
            disabled={available.length === 0}
            aria-label="Parent"
            options={available.map((p) => ({
              value: p.id,
              label: `${p.firstName} ${p.lastName}`,
              hint: p.phone ?? p.email ?? undefined,
              keywords: [p.email, p.phone].filter((v): v is string => !!v),
            }))}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={relationship} onChange={(e) => setRelationship(e.target.value)} options={RELATIONSHIPS} />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
              Primary
            </label>
            <Button onClick={add} loading={assign.isPending} disabled={!parentId}>
              Link
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (guardians ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">No guardians linked yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(guardians ?? []).map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text-primary">
                  {g.parentName ?? 'Parent'}
                  {g.isPrimary && (
                    <Badge tone="primary">
                      <Star className="mr-0.5 h-3 w-3" /> Primary
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs capitalize text-text-muted">
                  {g.relationship}
                  {g.parentPhone ? ` · ${g.parentPhone}` : g.parentEmail ? ` · ${g.parentEmail}` : ''}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  aria-label="Remove guardian"
                  onClick={() => drop(g.id)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
