'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Skeleton } from '@edrion/ui';
import { useScope } from '@/lib/scope';
import { useRoleCatalogue, useRolesList } from '@/lib/roles';
import { useSetUserAccess } from '@/lib/users';
import type { PermissionDef, RoleRow, UserRow } from '@/lib/admin-types';
import { PortalClientError } from '@/lib/portal-client';

type OverrideState = 'inherit' | 'grant' | 'deny';

/** Inline roles, campus access, and permission overrides — used inside the user edit drawer. */
export function UserAccessPanel({ user, canManage }: { user: UserRow; canManage: boolean }) {
  const { campuses } = useScope();
  const { data: roleData, isLoading: rolesLoading } = useRolesList<RoleRow>('roles', {
    page: 1,
    pageSize: 100,
    sortDir: 'asc',
  });
  const { data: catalogue, isLoading: catalogueLoading } = useRoleCatalogue();
  const setAccess = useSetUserAccess();
  const [roleKeys, setRoleKeys] = useState<Set<string>>(new Set());
  const [campusIds, setCampusIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, OverrideState>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoleKeys(new Set(user.roleKeys));
    setCampusIds(new Set(user.campusIds));
    const next = new Map<string, OverrideState>();
    for (const key of user.directGrants) next.set(key, 'grant');
    for (const key of user.directDenies) next.set(key, 'deny');
    setOverrides(next);
    setError(null);
  }, [user]);

  const roles = roleData?.items ?? [];

  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionDef[]>();
    for (const p of catalogue?.permissions ?? []) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }
    return [...byGroup.entries()];
  }, [catalogue]);

  function toggle(set: Set<string>, key: string, update: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  }

  function setOverride(key: string, state: OverrideState) {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (state === 'inherit') next.delete(key);
      else next.set(key, state);
      return next;
    });
  }

  function directFromOverrides() {
    const directGrants: string[] = [];
    const directDenies: string[] = [];
    for (const [key, state] of overrides) {
      if (state === 'grant') directGrants.push(key);
      else if (state === 'deny') directDenies.push(key);
    }
    return { directGrants, directDenies };
  }

  async function save() {
    if (!canManage) return;
    setError(null);
    const { directGrants, directDenies } = directFromOverrides();
    try {
      await setAccess.mutateAsync({
        id: user.id,
        roleKeys: [...roleKeys],
        campusIds: [...campusIds],
        directGrants,
        directDenies,
        version: user.version,
      });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save access.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Roles & access</h3>
          <p className="text-xs text-text-muted">Assign roles and campus scope for {user.fullName}.</p>
        </div>
        {canManage && (
          <Button size="sm" onClick={save} loading={setAccess.isPending}>
            Save access
          </Button>
        )}
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Roles</h4>
        {rolesLoading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {roles.map((r) => (
              <li key={r.key} className="flex items-start gap-2.5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={roleKeys.has(r.key)}
                  onChange={() => toggle(roleKeys, r.key, setRoleKeys)}
                  disabled={!canManage}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{r.name}</p>
                  <p className="text-xs text-text-muted">{r.description ?? r.key}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Campus access</h4>
        {campuses.length === 0 ? (
          <p className="text-xs text-text-muted">No campuses available in this scope.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {campuses.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={campusIds.has(c.id)}
                  onChange={() => toggle(campusIds, c.id, setCampusIds)}
                  disabled={!canManage}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
                />
                <span className="text-sm text-text-primary">{c.name}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-xs text-text-muted">
          Leave campuses empty for institution-wide roles (Owner / Admin reach every campus).
        </p>
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Permission overrides</h4>
        <p className="mb-2 text-xs text-text-muted">
          Grant or deny individual permissions on top of role assignments. Inherit uses the role default.
        </p>
        {catalogueLoading ? (
          <Skeleton className="h-32 w-full rounded-md" />
        ) : (
          groups.map(([group, defs]) => (
            <div key={group} className="mb-3">
              <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{group}</h5>
              <ul className="divide-y divide-border rounded-md border border-border">
                {defs.map((p) => {
                  const state = overrides.get(p.key) ?? 'inherit';
                  return (
                    <li key={p.key} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary">{p.key}</p>
                        <p className="text-xs text-text-muted">{p.description}</p>
                      </div>
                      <select
                        value={state}
                        disabled={!canManage}
                        onChange={(e) => setOverride(p.key, e.target.value as OverrideState)}
                        className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-xs text-text-primary outline-none focus:border-border-strong disabled:opacity-50"
                      >
                        <option value="inherit">Inherit</option>
                        <option value="grant">Grant</option>
                        <option value="deny">Deny</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
