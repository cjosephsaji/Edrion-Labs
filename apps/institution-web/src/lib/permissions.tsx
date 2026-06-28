'use client';
import { useMemo, type ReactNode } from 'react';
import { usePortalMe } from './hooks';

/**
 * Client-side permission gating. Convenience only — the API re-checks every action
 * authoritatively. Hiding a button never grants or protects anything by itself.
 */
export function usePermissions() {
  const { data: me } = usePortalMe();
  return useMemo(() => {
    const keys = new Set(me?.permissions ?? []);
    const wildcard = keys.has('*');
    const can = (key: string) => wildcard || keys.has(key);
    return {
      can,
      canAny: (...k: string[]) => k.some(can),
      roleKeys: me?.roleKeys ?? [],
      ready: !!me,
    };
  }, [me]);
}

/** Render children only when the user holds the given permission. */
export function PermissionGate({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = usePermissions();
  return can(perm) ? <>{children}</> : null;
}
