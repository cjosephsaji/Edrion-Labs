'use client';
import { useMemo, type ReactNode } from 'react';
import {
  derivePersonas,
  hasAllRoles,
  hasAnyRole,
  hasRole,
  type PersonaKey,
} from '@edrion/permissions/institution';
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
    const roleKeys = me?.roleKeys ?? [];

    return {
      can,
      canAny: (...k: string[]) => k.some(can),
      roleKeys,
      ready: !!me,

      // Role predicates — for PRESENTATION only (labels, ordering, empty states). To decide what a
      // user may see, gate on `can`: a role name is not an authorisation check, and a custom tenant
      // role will never match one.
      hasRole: (key: string) => hasRole(roleKeys, key),
      hasAnyRole: (...keys: string[]) => hasAnyRole(roleKeys, ...keys),
      hasAllRoles: (...keys: string[]) => hasAllRoles(roleKeys, ...keys),
      /** Every persona this user's roles imply. Users hold many roles, so this is a list. */
      personas: derivePersonas(roleKeys) as PersonaKey[],
    };
  }, [me]);
}

/** Render children only when the user holds the given permission. */
export function PermissionGate({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = usePermissions();
  return can(perm) ? <>{children}</> : null;
}

/**
 * Render children only when the user holds one of the given roles.
 *
 * Prefer PermissionGate. Role gating is the exception — use it only when the condition is genuinely
 * about identity (e.g. wording addressed to teachers) rather than access to data. Anything guarding
 * data must gate on a permission, or custom tenant roles will silently fall through it.
 */
export function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { hasAnyRole } = usePermissions();
  return hasAnyRole(...roles) ? <>{children}</> : null;
}
