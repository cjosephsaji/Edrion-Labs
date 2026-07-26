'use client';
import { useMemo } from 'react';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';
import { useRolesList } from './roles';
import type { RoleRow } from './admin-types';

const DEFAULT_LABELS = Object.fromEntries(INSTITUTION_DEFAULT_ROLES.map((r) => [r.key, r.name])) as Record<
  string,
  string
>;

/** Fallback when a role key has no catalogue entry: `department_head` → `Department Head`. */
export function humanizeRoleKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Resolve a role key to its display name (built-in catalogue, API roles, then humanized fallback). */
export function roleLabel(key: string, labels?: Record<string, string>): string {
  return labels?.[key] ?? DEFAULT_LABELS[key] ?? humanizeRoleKey(key);
}

/** Merges built-in role names with institution-specific roles from the API. */
export function useRoleLabelMap(): Record<string, string> {
  const { data } = useRolesList<RoleRow>('roles', { page: 1, pageSize: 100, sortDir: 'asc' });
  return useMemo(() => {
    const map = { ...DEFAULT_LABELS };
    for (const r of data?.items ?? []) map[r.key] = r.name;
    return map;
  }, [data]);
}
