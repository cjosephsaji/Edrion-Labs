import type { RoleDef } from '../roles';
import { ALL_STUDENT_PERMISSION_KEYS } from './catalogue';

/** Universal student role — granted to every student portal principal. */
export const STUDENT_BASE_ROLE: RoleDef = {
  key: 'student',
  name: 'Student',
  description: 'Full student portal access; institutional features gated by feature flags.',
  permissions: [...ALL_STUDENT_PERMISSION_KEYS],
};

export const STUDENT_DEFAULT_ROLES: readonly RoleDef[] = [STUDENT_BASE_ROLE];
