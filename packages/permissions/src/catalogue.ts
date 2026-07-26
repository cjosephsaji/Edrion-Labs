/**
 * The permission catalogue — the single registry of every granular platform permission.
 *
 * Roles are bags of these keys (see roles.ts); code checks keys, never role names. Adding a
 * permission here, wiring a guard in the API and adding it to a role is the whole flow for a
 * new gated action. This object is also the source for docs/PERMISSIONS.md.
 */

export interface PermissionDef {
  key: string;
  group: string;
  description: string;
  /** Sensitive actions require recent auth / MFA at the API even if permitted. */
  sensitive?: boolean;
}

const def = (
  key: string,
  group: string,
  description: string,
  sensitive = false,
): PermissionDef => ({ key, group, description, sensitive });

export const PERMISSIONS: readonly PermissionDef[] = [
  def('platform.dashboard.view', 'Platform', 'View the platform dashboard and overview.'),

  // Institutions
  def('institutions.view', 'Institutions', 'View institutions and their details.'),
  def('institutions.create', 'Institutions', 'Create new institutions.'),
  def('institutions.update', 'Institutions', 'Edit institution profile and configuration.'),
  def('institutions.activate', 'Institutions', 'Activate an institution.', true),
  def('institutions.restrict', 'Institutions', 'Restrict an institution’s access.', true),
  def('institutions.suspend', 'Institutions', 'Suspend an institution.', true),
  def('institutions.archive', 'Institutions', 'Archive an institution.', true),
  def('institutions.access_portal', 'Institutions', 'Start a support-access session.', true),

  // Registration requests (public institution onboarding funnel → reviewer workflow)
  def('registration.view', 'Registration', 'View institution registration requests and their details.'),
  def(
    'registration.review',
    'Registration',
    'Start review, assign a reviewer and add internal notes on registration requests.',
  ),
  def(
    'registration.approve',
    'Registration',
    'Approve a registration and provision the institution + primary administrator.',
    true,
  ),
  def('registration.reject', 'Registration', 'Reject a registration request.', true),

  // Campuses
  def('campuses.view', 'Campuses', 'View campuses.'),
  def('campuses.create', 'Campuses', 'Add campuses (may generate charges).', true),
  def('campuses.update', 'Campuses', 'Edit campus configuration.'),
  def('campuses.activate', 'Campuses', 'Activate a campus.', true),
  def('campuses.suspend', 'Campuses', 'Suspend a campus.', true),
  def('campuses.configure_billing', 'Campuses', 'Configure campus pricing and billing.', true),

  // Institution users
  def('institution_users.view', 'Institution Users', 'View institution users.'),
  def('institution_users.create', 'Institution Users', 'Invite institution users.'),
  def('institution_users.update', 'Institution Users', 'Edit institution users.'),
  def('institution_users.disable', 'Institution Users', 'Disable institution users.', true),
  def('institution_users.reset_security', 'Institution Users', 'Reset user security.', true),
  def(
    'institution_users.manage_permissions',
    'Institution Users',
    'Manage roles, campus access and overrides.',
    true,
  ),

  // Independent users
  def('independent_users.view', 'Independent Users', 'View independent users.'),
  def('independent_users.update', 'Independent Users', 'Edit independent users.'),
  def('independent_users.disable', 'Independent Users', 'Disable independent users.', true),
  def(
    'independent_users.manage_subscription',
    'Independent Users',
    'Manage independent-user subscriptions.',
    true,
  ),
  def(
    'independent_users.manage_entitlements',
    'Independent Users',
    'Grant/revoke independent-user entitlements.',
    true,
  ),

  // Employees
  def('employees.view', 'Employees', 'View Edrion employees and roles.'),
  def('employees.create', 'Employees', 'Create employee accounts.', true),
  def('employees.update', 'Employees', 'Edit employee accounts.'),
  def('employees.disable', 'Employees', 'Disable employee accounts.', true),
  def('employees.assign_roles', 'Employees', 'Assign platform roles to employees.', true),

  // Plans
  def('plans.view', 'Plans', 'View plans and versions.'),
  def('plans.create', 'Plans', 'Create plans.'),
  def('plans.update', 'Plans', 'Edit draft plans / create versions.'),
  def('plans.publish', 'Plans', 'Publish a plan version.', true),
  def('plans.archive', 'Plans', 'Archive a plan.', true),

  // Subscriptions
  def('subscriptions.view', 'Subscriptions', 'View subscriptions and billing.'),
  def('subscriptions.update', 'Subscriptions', 'Change plan, cycle, add-ons.', true),
  def('subscriptions.cancel', 'Subscriptions', 'Cancel a subscription.', true),
  def('subscriptions.issue_credit', 'Subscriptions', 'Issue credits.', true),
  def('subscriptions.override_pricing', 'Subscriptions', 'Override pricing.', true),

  // Billing
  def('billing.view', 'Billing', 'View invoices, payments, credits and billing history.'),
  def('billing.manage', 'Billing', 'Create invoices, record payments, issue credits and discounts.', true),
  def('billing.refund', 'Billing', 'Issue refunds against payments.', true),
  def('billing.void_invoice', 'Billing', 'Void an invoice.', true),

  // Entitlements
  def('entitlements.view', 'Entitlements', 'View resolved plan entitlements.'),
  def('entitlements.manage', 'Entitlements', 'Override entitlements for an institution.', true),

  // Features
  def('features.view', 'Features', 'View the feature registry and assignments.'),
  def('features.manage_global', 'Features', 'Manage global feature defaults.', true),
  def('features.manage_plan', 'Features', 'Manage plan-level feature overrides.', true),
  def('features.manage_institution', 'Features', 'Manage institution feature overrides.', true),
  def('features.manage_campus', 'Features', 'Manage campus feature overrides.', true),
  def('features.manage_user', 'Features', 'Manage user-level feature overrides.', true),

  // Support
  def('support.view', 'Support', 'View support cases and access sessions.'),
  def('support.manage', 'Support', 'Manage support cases.'),
  def('support.access_institution', 'Support', 'Operate inside an institution portal.', true),

  // Audit
  def('audit.view', 'Audit', 'View audit and activity records.'),
  def('audit.export', 'Audit', 'Export audit records.', true),

  // Security
  def('security.view', 'Security', 'View security events and posture.'),
  def('security.manage', 'Security', 'Manage security configuration and reviews.', true),

  // AI
  def('ai.view', 'AI', 'View AI usage, policies and audit.'),
  def('ai.configure', 'AI', 'Configure AI policies and guardrails.', true),
  def('ai.approve_sensitive_action', 'AI', 'Approve sensitive AI-prepared actions.', true),
  def('ai.disable', 'AI', 'Trigger AI kill switches.', true),

  // Integrations
  def('integrations.view', 'Integrations', 'View webhook endpoints and delivery history.'),
  def('integrations.manage', 'Integrations', 'Create/edit webhook endpoints, rotate secrets, send tests.', true),

  // Platform settings
  def('platform_settings.view', 'Platform Settings', 'View platform settings.'),
  def('platform_settings.manage', 'Platform Settings', 'Manage platform settings.', true),
] as const;

/** Literal union of all valid permission keys. */
export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: readonly string[] = PERMISSIONS.map((p) => p.key);

const byKey = new Map(PERMISSIONS.map((p) => [p.key, p]));

export function getPermission(key: string): PermissionDef | undefined {
  return byKey.get(key);
}

export function isSensitive(key: string): boolean {
  return byKey.get(key)?.sensitive ?? false;
}

/** Wildcard granting every permission. Reserved for Platform Owner only. */
export const WILDCARD_PERMISSION = '*';
