import { describe, expect, it } from 'vitest';
import {
  institutionPermissionRequiresMfaStepUp,
  INSTITUTION_MFA_STEP_UP_PERMISSIONS,
} from './step-up-actions';

describe('institutionPermissionRequiresMfaStepUp', () => {
  it('includes explicit catalogue keys', () => {
    for (const key of INSTITUTION_MFA_STEP_UP_PERMISSIONS) {
      expect(institutionPermissionRequiresMfaStepUp(key)).toBe(true);
    }
  });

  it('treats sensitive institution permissions as step-up', () => {
    expect(institutionPermissionRequiresMfaStepUp('students.delete')).toBe(true);
  });

  it('does not step-up routine read permissions', () => {
    expect(institutionPermissionRequiresMfaStepUp('students.view')).toBe(false);
    expect(institutionPermissionRequiresMfaStepUp('portal.dashboard.view')).toBe(false);
  });
});
