/**
 * Deterministic permission evaluation. Pure — no IO. Runs authoritatively in the API and is
 * mirrored to the client for UI gating only. Denies always win; the Platform Owner wildcard
 * grants everything.
 */
import { WILDCARD_PERMISSION } from './catalogue';
import type { RoleDef } from './roles';

export interface EmployeePermissionInput {
  /** Role keys assigned to the employee. */
  roleKeys: string[];
  /** Explicit additional grants (beyond roles). */
  directGrants?: string[];
  /** Explicit denies — override any grant, including roles. */
  directDenies?: string[];
}

export interface EvaluatedPermissions {
  /** Final effective permission keys (may contain the wildcard). */
  keys: Set<string>;
  hasWildcard: boolean;
}

/**
 * Compute the effective permission set.
 *
 * order: roles ∪ directGrants, then subtract directDenies. Wildcard short-circuits `can`.
 */
export function evaluatePermissions(
  input: EmployeePermissionInput,
  roleDefs: readonly RoleDef[],
): EvaluatedPermissions {
  const roleMap = new Map(roleDefs.map((r) => [r.key, r]));
  const granted = new Set<string>();

  for (const roleKey of input.roleKeys) {
    const role = roleMap.get(roleKey);
    if (!role) continue;
    for (const p of role.permissions) granted.add(p);
  }
  for (const g of input.directGrants ?? []) granted.add(g);

  const denies = new Set(input.directDenies ?? []);
  for (const d of denies) granted.delete(d);

  return { keys: granted, hasWildcard: granted.has(WILDCARD_PERMISSION) };
}

/** Does this evaluated set permit a key? Wildcard wins unless explicitly denied earlier. */
export function can(evaluated: EvaluatedPermissions, key: string): boolean {
  if (evaluated.keys.has(key)) return true;
  return evaluated.hasWildcard;
}

/** True only if every key is permitted. */
export function canAll(evaluated: EvaluatedPermissions, keys: string[]): boolean {
  return keys.every((k) => can(evaluated, k));
}

/** True if any key is permitted. */
export function canAny(evaluated: EvaluatedPermissions, keys: string[]): boolean {
  return keys.some((k) => can(evaluated, k));
}

/**
 * Expand to the concrete list of keys an actor effectively holds, given the full catalogue.
 * Used for "effective access preview" screens. Wildcard expands to every catalogue key.
 */
export function expandEffectiveKeys(
  evaluated: EvaluatedPermissions,
  allKeys: readonly string[],
): string[] {
  if (evaluated.hasWildcard) return [...allKeys];
  return [...evaluated.keys].filter((k) => k !== WILDCARD_PERMISSION);
}
