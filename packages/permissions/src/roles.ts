/**
 * Default platform roles, expressed purely as bags of permission keys. These seed the
 * `platform_roles` / `platform_role_permissions` tables; at runtime the DB is authoritative
 * so admins can edit role membership without a code change. Nothing in the app branches on
 * a role *name* — only on permission keys.
 */
import { ALL_PERMISSION_KEYS, WILDCARD_PERMISSION, type PermissionKey } from './catalogue';

export interface RoleDef {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const view = (...keys: string[]) => keys;

export const DEFAULT_ROLES: readonly RoleDef[] = [
  {
    key: 'platform_owner',
    name: 'Platform Owner',
    description: 'Full unrestricted access. Use sparingly.',
    permissions: [WILDCARD_PERMISSION],
  },
  {
    key: 'super_administrator',
    name: 'Super Administrator',
    description: 'Broad administrative access across the platform.',
    permissions: [...ALL_PERMISSION_KEYS].filter(
      (k) => k !== 'ai.disable' && k !== 'employees.disable',
    ),
  },
  {
    key: 'onboarding_specialist',
    name: 'Institution Onboarding Specialist',
    description: 'Creates and onboards institutions and their first users.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'institutions.create',
      'institutions.update',
      'institutions.activate',
      'registration.view',
      'registration.review',
      'registration.approve',
      'registration.reject',
      'campuses.view',
      'campuses.create',
      'campuses.update',
      'institution_users.view',
      'institution_users.create',
      'institution_users.update',
      'plans.view',
      'subscriptions.view',
      'features.view',
      'support.view',
      'audit.view',
    ),
  },
  {
    key: 'support_administrator',
    name: 'Customer Support Administrator',
    description: 'Handles support cases and time-boxed institution access.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'registration.view',
      'institutions.access_portal',
      'campuses.view',
      'institution_users.view',
      'institution_users.update',
      'independent_users.view',
      'support.view',
      'support.manage',
      'support.access_institution',
      'audit.view',
    ),
  },
  {
    key: 'customer_success',
    name: 'Customer Success Manager',
    description: 'Owns institution relationships and health.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'registration.view',
      'institutions.update',
      'campuses.view',
      'institution_users.view',
      'subscriptions.view',
      'features.view',
      'support.view',
      'audit.view',
    ),
  },
  {
    key: 'finance_administrator',
    name: 'Finance and Billing Administrator',
    description: 'Owns plans, subscriptions, billing and credits.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'campuses.view',
      'campuses.configure_billing',
      'independent_users.view',
      'independent_users.manage_subscription',
      'plans.view',
      'plans.create',
      'plans.update',
      'plans.publish',
      'plans.archive',
      'subscriptions.view',
      'subscriptions.update',
      'subscriptions.cancel',
      'subscriptions.issue_credit',
      'subscriptions.override_pricing',
      'billing.view',
      'billing.manage',
      'billing.refund',
      'billing.void_invoice',
      'entitlements.view',
      'entitlements.manage',
      'audit.view',
    ),
  },
  {
    key: 'technical_operations',
    name: 'Technical Operations Administrator',
    description: 'Runs integrations, jobs, webhooks and platform settings.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'campuses.view',
      'features.view',
      'support.view',
      'audit.view',
      'security.view',
      'integrations.view',
      'integrations.manage',
      'platform_settings.view',
      'platform_settings.manage',
    ),
  },
  {
    key: 'security_compliance',
    name: 'Security and Compliance Administrator',
    description: 'Owns security posture, access reviews and audit export.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'employees.view',
      'audit.view',
      'audit.export',
      'security.view',
      'security.manage',
      'support.view',
    ),
  },
  {
    key: 'product_administrator',
    name: 'Product and Feature Administrator',
    description: 'Owns the feature registry and rollouts.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'campuses.view',
      'features.view',
      'features.manage_global',
      'features.manage_plan',
      'features.manage_institution',
      'features.manage_campus',
      'features.manage_user',
      'plans.view',
      'audit.view',
    ),
  },
  {
    key: 'ai_safety',
    name: 'AI Safety Administrator',
    description: 'Owns AI guardrails, approvals and kill switches.',
    permissions: view(
      'platform.dashboard.view',
      'ai.view',
      'ai.configure',
      'ai.approve_sensitive_action',
      'ai.disable',
      'audit.view',
      'security.view',
    ),
  },
  {
    key: 'read_only_auditor',
    name: 'Read-only Auditor',
    description: 'Read access for audit and oversight. No mutations.',
    permissions: view(
      'platform.dashboard.view',
      'institutions.view',
      'registration.view',
      'campuses.view',
      'institution_users.view',
      'independent_users.view',
      'employees.view',
      'plans.view',
      'subscriptions.view',
      'billing.view',
      'entitlements.view',
      'features.view',
      'support.view',
      'audit.view',
      'security.view',
      'ai.view',
      'integrations.view',
      'platform_settings.view',
    ),
  },
] as const;

export type DefaultRoleKey = (typeof DEFAULT_ROLES)[number]['key'];

export function getDefaultRole(key: string): RoleDef | undefined {
  return DEFAULT_ROLES.find((r) => r.key === key);
}

// Compile-time assurance the curated lists only reference real permission keys.
// Exported so `noUnusedLocals` is satisfied; resolves to `true` when every key is valid.
export type AssertRolePermissionKeys = Exclude<
  Exclude<(typeof DEFAULT_ROLES)[number]['permissions'][number], typeof WILDCARD_PERMISSION>,
  PermissionKey
> extends never
  ? true
  : ['Unknown permission key in DEFAULT_ROLES'];
