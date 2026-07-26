import { z } from 'zod';
import {
  ALL_INSTITUTION_PERMISSION_KEYS,
  getInstitutionPermission,
  INSTITUTION_DEFAULT_ROLES,
  isCampusAdminAssignableRole,
} from '@edrion/permissions/institution';
import type { RolesService } from '../../roles.service';
import type { UsersService } from '../../users.service';
import { params, type PetrosTool } from './types';

const VALID_KEYS = new Set<string>(ALL_INSTITUTION_PERMISSION_KEYS);

const inputSchema = z.object({
  key: z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullish(),
  permissions: z.array(z.string()).min(1).max(80),
  invite: z
    .object({
      email: z.string().email(),
      fullName: z.string().trim().min(2).max(160),
    })
    .nullish(),
});

/** Group a permission list by catalogue group, flagging sensitive keys. */
function groupPermissions(keys: string[]) {
  const groups: Record<string, { key: string; sensitive: boolean }[]> = {};
  for (const key of keys) {
    const def = getInstitutionPermission(key);
    if (!def) continue;
    (groups[def.group] ??= []).push({ key, sensitive: def.sensitive ?? false });
  }
  return groups;
}

/** The default preset with the highest overlap — the confirmation card shows a diff against it. */
function nearestPreset(keys: string[]) {
  const set = new Set(keys);
  let best: { key: string; name: string; overlap: number; added: string[]; missing: string[] } | null = null;
  for (const role of INSTITUTION_DEFAULT_ROLES) {
    const preset = new Set(role.permissions as readonly string[]);
    const overlap = [...set].filter((k) => preset.has(k)).length;
    if (!best || overlap > best.overlap) {
      best = {
        key: role.key,
        name: role.name,
        overlap,
        added: [...set].filter((k) => !preset.has(k)),
        missing: [...preset].filter((k) => !set.has(k) && k !== '*'),
      };
    }
  }
  return best;
}

/**
 * Phase 7: admin-assisted role creation. ONE run may bundle role creation + the first user's
 * invite; one confirmation authorises the run (existing semantics). Sensitive (`roles.manage`) →
 * recent-auth applies at confirm. Campus-admin actors are constrained by the assignable-roles
 * allowlist inside execute.
 */
export function buildRoleTools(roles: RolesService, users: UsersService): PetrosTool[] {
  return [
    {
      name: 'role_create_draft',
      description:
        'Create a NEW custom role from institution catalogue permission keys, optionally inviting its first user in the same step. Draft the permission set carefully from the catalogue; the confirmation card shows the grouped permissions, sensitive flags and a diff vs the nearest preset. State-changing — requires confirmation.',
      inputSchema,
      parameters: params(
        {
          key: { type: 'string', description: 'lower_snake_case role key, e.g. exam_officer' },
          name: { type: 'string' },
          description: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' }, description: 'Institution permission keys' },
          invite: {
            type: 'object',
            properties: { email: { type: 'string' }, fullName: { type: 'string' } },
            required: ['email', 'fullName'],
            additionalProperties: false,
          },
        },
        ['key', 'name', 'permissions'],
      ),
      requiredPermissions: ['roles.manage'],
      capability: 'mutation',
      humanStatus: 'Drafting role…',
      impactPreview: async (_ctx, rawArgs) => {
        const args = inputSchema.parse(rawArgs);
        const valid = args.permissions.filter((k) => VALID_KEYS.has(k));
        const preset = nearestPreset(valid);
        return {
          summary: `Create role "${args.name}" with ${valid.length} permissions${args.invite ? ` and invite ${args.invite.email}` : ''}`,
          targetType: 'institution_role',
          groupedPermissions: groupPermissions(valid),
          sensitiveKeys: valid.filter((k) => getInstitutionPermission(k)?.sensitive),
          nearestPreset: preset,
          invite: args.invite ?? null,
          reversible: true,
        };
      },
      execute: async (ctx, rawArgs) => {
        const args = inputSchema.parse(rawArgs);
        const invalid = args.permissions.filter((k) => !VALID_KEYS.has(k));
        if (invalid.length) throw new Error(`Unknown permission keys: ${invalid.join(', ')}`);
        // Campus-admin actors may only create/assign roles inside the scoped allowlist.
        if (!ctx.principal.isInstitutionWide && !isCampusAdminAssignableRole(args.key)) {
          throw new Error('Campus-scoped admins can only create roles from the operational allowlist.');
        }
        const role = await roles.create(ctx, {
          key: args.key,
          name: args.name,
          description: args.description ?? undefined,
          permissions: args.permissions,
        } as never);
        let invited: unknown = null;
        if (args.invite) {
          invited = await users.invite(ctx, {
            email: args.invite.email,
            fullName: args.invite.fullName,
            phone: null,
            roleKeys: [args.key],
            campusIds: [],
            requireMfa: false,
          } as never);
        }
        return {
          roleId: (role as { id?: string }).id ?? null,
          roleKey: args.key,
          invited: invited ? { email: args.invite!.email } : null,
        };
      },
    },
  ];
}
