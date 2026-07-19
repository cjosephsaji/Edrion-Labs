'use client';
import { useMemo } from 'react';
import { Skeleton } from '@edrion/ui';
import { useRolesList } from '@/lib/roles';
import type { RoleRow } from '@/lib/admin-types';
import { RoleCheckboxList } from './role-checkbox-list';

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
    <RoleCheckboxList
      roles={roles}
      selected={selected}
      onToggle={toggle}
      disabled={disabled}
    />
  );
}
