'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Skeleton, Select, cn } from '@edrion/ui';
import { useScope } from '@/lib/scope';
import { usePortalMe } from '@/lib/hooks';
import { usePermissions } from '@/lib/permissions';
import { useRoleCatalogue, useRolesList } from '@/lib/roles';
import { useSetUserAccess } from '@/lib/users';
import type { PermissionDef, RoleRow, UserRow } from '@/lib/admin-types';
import { PortalClientError } from '@/lib/portal-client';
import { filterPermissionGroups } from '@/lib/permission-search';
import type { ResourceFormExtraApi } from '@/components/academics/resource-form';
import { RoleCheckboxList } from './role-checkbox-list';

type OverrideState = 'inherit' | 'grant' | 'deny';
type GroupOverrideState = OverrideState | 'mixed';

const OVERRIDE_OPTIONS = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'grant', label: 'Grant' },
  { value: 'deny', label: 'Deny' },
] as const;

const CANNOT_EDIT_OWN_ROLES_MESSAGE =
  'You cannot change your own roles or access. Ask another administrator.';

/** Inline roles, campus access, and permission overrides — used inside the user edit drawer. */
export function UserAccessPanel({
  user,
  canManage,
  embedded = false,
  setSubmitPayload,
}: {
  user: UserRow;
  canManage: boolean;
  /** When true, roles/access ride the parent form Save button instead of a separate action. */
  embedded?: boolean;
  setSubmitPayload?: ResourceFormExtraApi['setSubmitPayload'];
}) {
  const { campuses } = useScope();
  const { data: me } = usePortalMe();
  const { can } = usePermissions();
  const isSelf = Boolean(me?.institutionUserId && user.id === me.institutionUserId);
  const canEditAccess = canManage && !isSelf;
  const canSetOverrides = Boolean(me?.isInstitutionWide || can('users.manage_roles'));
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
  const [overrideSearch, setOverrideSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoleKeys(new Set(user.roleKeys));
    setCampusIds(new Set(user.campusIds));
    const next = new Map<string, OverrideState>();
    for (const key of user.directGrants) next.set(key, 'grant');
    for (const key of user.directDenies) next.set(key, 'deny');
    setOverrides(next);
    setOverrideSearch('');
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

  const filteredGroups = useMemo(
    () => filterPermissionGroups(groups, overrideSearch),
    [groups, overrideSearch],
  );

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

  function getGroupOverrideState(defs: PermissionDef[]): GroupOverrideState {
    if (defs.length === 0) return 'inherit';
    const states = defs.map((p) => overrides.get(p.key) ?? 'inherit');
    const first = states[0];
    return states.every((s) => s === first) ? first : 'mixed';
  }

  function setGroupOverride(defs: PermissionDef[], state: OverrideState) {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const p of defs) {
        if (state === 'inherit') next.delete(p.key);
        else next.set(p.key, state);
      }
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

  const accessPayload = useMemo(() => {
    const { directGrants, directDenies } = canSetOverrides
      ? directFromOverrides()
      : { directGrants: user.directGrants, directDenies: user.directDenies };
    return {
      roleKeys: [...roleKeys],
      campusIds: [...campusIds],
      ...(canSetOverrides ? { directGrants, directDenies } : {}),
      ...(embedded ? { userVersion: user.version } : {}),
    };
  }, [roleKeys, campusIds, overrides, embedded, user.version, canSetOverrides, user.directGrants, user.directDenies]);

  useEffect(() => {
    if (embedded && setSubmitPayload) {
      // Self-edits cannot change access; skip access fields on profile-only saves too.
      if (isSelf || accessPayload.roleKeys.length === 0) {
        setSubmitPayload({});
      } else {
        setSubmitPayload(accessPayload);
      }
    }
  }, [embedded, setSubmitPayload, accessPayload, isSelf]);

  async function save() {
    if (!canEditAccess) return;
    setError(null);
    const { directGrants, directDenies } = canSetOverrides
      ? directFromOverrides()
      : { directGrants: user.directGrants, directDenies: user.directDenies };
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
          <p className="text-xs text-text-muted">
            {embedded ? 'Saved together with the account fields above.' : `Assign roles and campus scope for ${user.fullName}.`}
          </p>
        </div>
        {canEditAccess && !embedded && (
          <Button size="sm" onClick={save} loading={setAccess.isPending}>
            Save access
          </Button>
        )}
      </div>
      {isSelf && (
        <div
          role="status"
          className="rounded-md border border-border bg-background-secondary/60 px-3 py-2 text-sm text-text-muted"
        >
          {CANNOT_EDIT_OWN_ROLES_MESSAGE}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className={cn('flex flex-col gap-4', isSelf && 'pointer-events-none opacity-50')}>
      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Roles</h4>
        {rolesLoading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : (
          <RoleCheckboxList
            roles={roles}
            selected={roleKeys}
            onToggle={(key) => toggle(roleKeys, key, setRoleKeys)}
            disabled={!canEditAccess}
          />
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
                  disabled={!canEditAccess}
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

      {canSetOverrides && (
      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Permission overrides</h4>
        <p className="mb-2 text-xs text-text-muted">
          Grant or deny permissions on top of role assignments. Use the category control to apply inherit, grant, or deny to
          an entire group, or adjust individual permissions below. Inherit uses the role default.
        </p>
        {catalogueLoading ? (
          <Skeleton className="h-32 w-full rounded-md" />
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-background-secondary/40 px-2.5">
              <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <input
                type="search"
                value={overrideSearch}
                onChange={(e) => setOverrideSearch(e.target.value)}
                placeholder="Search permissions — try fees, students, or User Management"
                aria-label="Search permission overrides"
                className="h-10 w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
            <div className="max-h-96 overflow-y-auto overscroll-contain p-3">
              {filteredGroups.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">No permissions match your search.</p>
              ) : (
                filteredGroups.map(([group, defs]) => {
                  const groupState = getGroupOverrideState(defs);
                  return (
                    <div key={group} className="mb-3 last:mb-0">
                      <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <h5 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{group}</h5>
                        <div className="w-full shrink-0 sm:w-36">
                          <Select
                            value={groupState === 'mixed' ? '' : groupState}
                            placeholder="Mixed"
                            disabled={!canEditAccess}
                            onChange={(e) => setGroupOverride(defs, e.target.value as OverrideState)}
                            className="h-8 text-xs"
                            aria-label={`Set all ${group} permissions`}
                            options={[...OVERRIDE_OPTIONS]}
                          />
                        </div>
                      </div>
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {defs.map((p) => {
                          const state = overrides.get(p.key) ?? 'inherit';
                          return (
                            <li key={p.key} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-text-primary">{p.key}</p>
                                <p className="text-xs text-text-muted">{p.description}</p>
                              </div>
                              <div className="w-full shrink-0 sm:w-28">
                                <Select
                                  value={state}
                                  disabled={!canEditAccess}
                                  onChange={(e) => setOverride(p.key, e.target.value as OverrideState)}
                                  className="h-8 text-xs"
                                  options={[...OVERRIDE_OPTIONS]}
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>
      )}
      </div>
    </div>
  );
}
