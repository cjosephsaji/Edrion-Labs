import { RiskLevel } from '@edrion/shared-types';

/**
 * Default risk classification for an action key. Services may override, but this gives a
 * sensible baseline so risk is never left unset. Used to drive confirmation strength and
 * security flagging.
 */
const CRITICAL = new Set([
  'institution.suspend',
  'institution.archive',
  'subscription.cancel',
  'subscription.issue_credit',
  'billing.refund',
  'ai.kill_switch',
  'employee.disable',
  'support_access.start',
]);

const HIGH = new Set([
  // Provisions a real institution + primary admin account from a public application.
  'registration.approve',
  'institution.restrict',
  'institution.activate',
  'campus.configure_billing',
  'institution_user.manage_permissions',
  'institution_user.reset_security',
  'subscription.override_pricing',
  'subscription.update',
  'feature.manage_global',
  'feature.manage_institution',
  'independent_user.manage_subscription',
]);

const MEDIUM = new Set([
  'registration.reject',
  'registration.submitted',
  'institution.update',
  'campus.create',
  'campus.suspend',
  'institution_user.create',
  'institution_user.disable',
  'feature.manage_campus',
  'feature.manage_user',
]);

export function classifyRisk(action: string): RiskLevel {
  if (CRITICAL.has(action)) return RiskLevel.Critical;
  if (HIGH.has(action)) return RiskLevel.High;
  if (MEDIUM.has(action)) return RiskLevel.Medium;
  return RiskLevel.Low;
}
