'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Skeleton } from '@edrion/ui';
import { useRoleCatalogue, useSetRolePermissions } from '@/lib/roles';
import type { PermissionDef, RoleRow } from '@/lib/admin-types';
import { PortalClientError } from '@/lib/portal-client';

/**
 * The permission picker for a role. Built-in (system) roles are shown read-only; custom roles can be
 * toggled and saved via the version-guarded PUT. Permissions are grouped by catalogue group.
 */
export function RolePermissionsDrawer({
  role,
  open,
  onClose,
  canManage,
}: {
  role: RoleRow | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
}) {
  const { data, isLoading } = useRoleCatalogue();
  const setPerms = useSetRolePermissions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const editable = canManage && role !== null && !role.isSystem;

  useEffect(() => {
    if (open && role) setSelected(new Set(role.permissions));
    if (open) setError(null);
  }, [open, role]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionDef[]>();
    for (const p of data?.permissions ?? []) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }
    return [...byGroup.entries()];
  }, [data]);

  function toggle(key: string) {
    if (!editable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!role || !editable) return;
    setError(null);
    try {
      await setPerms.mutateAsync({ id: role.id, permissions: [...selected], version: role.version });
      onClose();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save permissions.');
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Permissions"
      description={role ? `${role.name}${role.isSystem ? ' (built-in, read-only)' : ''}` : undefined}
      footer={
        editable ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={setPerms.isPending}>
                Cancel
              </Button>
              <Button onClick={save} loading={setPerms.isPending}>
                Save
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        ) : (
          groups.map(([group, defs]) => (
            <div key={group}>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{group}</h4>
              <ul className="divide-y divide-border rounded-md border border-border">
                {defs.map((p) => (
                  <li key={p.key} className="flex items-start gap-2.5 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.key)}
                      onChange={() => toggle(p.key)}
                      disabled={!editable}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:opacity-50"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">
                        {p.key}
                        {p.sensitive && <span className="ml-1.5 text-xs font-normal text-warning">sensitive</span>}
                      </p>
                      <p className="text-xs text-text-muted">{p.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
}
