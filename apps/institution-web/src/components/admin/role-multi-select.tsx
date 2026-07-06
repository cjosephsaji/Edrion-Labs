'use client';
import { useMemo } from 'react';
import { Skeleton } from '@edrion/ui';
import { useRolesList } from '@/lib/roles';
import type { RoleRow } from '@/lib/admin-types';

/** Shared multiselect for institution role keys (staff create, user invite). */
export function RoleMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const { data, isLoading } = useRolesList<RoleRow>('roles', { page: 1, pageSize: 100, sortDir: 'asc' });
  const selected = useMemo(() => new Set(value), [value]);
  const roles = data?.items ?? [];

  function toggle(key: string) {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  }

  if (isLoading) return <Skeleton className="h-24 w-full rounded-md" />;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {roles.map((r) => (
        <li key={r.key} className="flex items-start gap-2.5 px-3 py-2">
          <input
            type="checkbox"
            checked={selected.has(r.key)}
            onChange={() => toggle(r.key)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{r.name}</p>
            <p className="text-xs text-text-muted">{r.description ?? r.key}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
