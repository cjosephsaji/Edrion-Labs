import type { PermissionDef } from './admin-types';
import { normalizeRoleSearchText } from './role-search';

export function permissionMatchesSearch(permission: PermissionDef, group: string, query: string): boolean {
  const term = normalizeRoleSearchText(query);
  if (!term) return true;

  const key = normalizeRoleSearchText(permission.key);
  const keySpaced = key.replace(/\./g, ' ').replace(/_/g, ' ');
  const description = normalizeRoleSearchText(permission.description);
  const groupName = normalizeRoleSearchText(group);

  return (
    key.includes(term) ||
    keySpaced.includes(term) ||
    description.includes(term) ||
    groupName.includes(term)
  );
}

/** Filter grouped permissions for the override picker. Matching a group name shows the whole group. */
export function filterPermissionGroups(
  groups: readonly [string, PermissionDef[]][],
  query: string,
): [string, PermissionDef[]][] {
  const trimmed = query.trim();
  if (!trimmed) return [...groups];

  const groupTerm = normalizeRoleSearchText(trimmed);
  return groups
    .map(([group, defs]) => {
      const groupMatches = normalizeRoleSearchText(group).includes(groupTerm);
      const filtered = groupMatches ? defs : defs.filter((p) => permissionMatchesSearch(p, group, trimmed));
      return [group, filtered] as [string, PermissionDef[]];
    })
    .filter(([, defs]) => defs.length > 0);
}
