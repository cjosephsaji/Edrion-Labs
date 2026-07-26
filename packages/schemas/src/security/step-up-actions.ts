import { isInstitutionSensitive } from '@edrion/permissions/institution';

/**
 * Institution-portal permission keys that require MFA step-up (AAL2 on the portal session) when the
 * user has MFA enrolled. Sensitive keys already require recent auth; this catalogue adds AAL2.
 */
export const INSTITUTION_MFA_STEP_UP_PERMISSIONS = [
  'roles.manage',
  'users.manage',
  'users.invite',
  'institution_settings.manage',
  'documents.issue',
  'audit.export',
  'integrations.view',
  'parent_comm.ptm.manage',
] as const;

export type InstitutionMfaStepUpPermission = (typeof INSTITUTION_MFA_STEP_UP_PERMISSIONS)[number];

const stepUpSet = new Set<string>(INSTITUTION_MFA_STEP_UP_PERMISSIONS);

/** True when MFA-enrolled users must present an AAL2 portal session for this permission. */
export function institutionPermissionRequiresMfaStepUp(permissionKey: string): boolean {
  if (stepUpSet.has(permissionKey)) return true;
  return isInstitutionSensitive(permissionKey);
}
