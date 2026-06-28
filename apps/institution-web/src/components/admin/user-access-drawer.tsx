'use client';
import { useEffect, useState } from 'react';
import { Button, Drawer, Skeleton } from '@edrion/ui';
import { useScope } from '@/lib/scope';
import { useRolesList } from '@/lib/roles';
import { useSetUserAccess } from '@/lib/users';
import type { RoleRow, UserRow } from '@/lib/admin-types';
import { PortalClientError } from '@/lib/portal-client';

/**
 * Assign a user's roles + campus access in one version-guarded save (requires users.manage_roles).
 * Direct permission overrides on the row are preserved as-is. Roles come from the roles directory
 * (built-in ∪ custom); campuses from the scope's campus list.
 */
export function UserAccessDrawer({
  user,
  open,
  onClose,
  canManage,
}: {
  user: UserRow | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
}) {
  const { campuses } = useScope();
  const { data: roleData, isLoading } = useRolesList<RoleRow>('roles', { page: 1, pageSize: 100, sortDir: 'asc' });
  const setAccess = useSetUserAccess();
  const [roleKeys, setRoleKeys] = useState<Set<string>>(new Set());
  const [campusIds, setCampusIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setRoleKeys(new Set(user.roleKeys));
      setCampusIds(new Set(user.campusIds));
      setError(null);
    }
  }, [open, user]);

  const roles = roleData?.items ?? [];

  function toggle(set: Set<string>, key: string, update: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  }

  async function save() {
    if (!user || !canManage) return;
    setError(null);
    try {
      await setAccess.mutateAsync({
        id: user.id,
        roleKeys: [...roleKeys],
        campusIds: [...campusIds],
        directGrants: user.directGrants,
        directDenies: user.directDenies,
        version: user.version,
      });
      onClose();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save access.');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Roles & access"
      description={user ? user.fullName : undefined}
      footer={
        canManage ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={setAccess.isPending}>
              Cancel
            </Button>
            <Button onClick={save} loading={setAccess.isPending}>
              Save
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Roles</h4>
          {isLoading ? (
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
      </div>
    </Drawer>
  );
}
