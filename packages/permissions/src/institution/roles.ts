/**
 * Default INSTITUTION roles, expressed purely as bags of permission keys. These seed the
 * institution-level role tables; at runtime the DB is authoritative so an Institution Admin can
 * edit role membership without a code change. Nothing branches on a role *name* — only on keys.
 *
 * Scope (which campuses) is independent of the role: e.g. Campus Admin holds broad keys but is
 * confined to its assigned campuses by campus_user_access + the scope guard.
 */
import { WILDCARD_PERMISSION } from '../catalogue';
import type { RoleDef } from '../roles';
import {
  ALL_INSTITUTION_PERMISSION_KEYS,
  type InstitutionPermissionKey,
} from './catalogue';

const view = (...keys: InstitutionPermissionKey[]) => keys;

export const INSTITUTION_DEFAULT_ROLES: readonly RoleDef[] = [
  {
    key: 'institution_owner',
    name: 'Institution Owner',
    description: 'Full unrestricted access across the whole institution.',
    permissions: [WILDCARD_PERMISSION],
  },
  {
    key: 'institution_admin',
    name: 'Institution Admin',
    description: 'Manages the whole institution and every campus.',
    permissions: [...ALL_INSTITUTION_PERMISSION_KEYS],
  },
  {
    key: 'campus_admin',
    name: 'Campus Admin',
    description: 'Manages assigned campuses only (scope-confined).',
    permissions: view(
      'portal.dashboard.view',
      'academics.view', 'academics.manage',
      'campuses.view',
      'students.view', 'students.create', 'students.update',
      'teachers.view', 'teachers.manage',
      'staff.view', 'staff.manage',
      'parents.view', 'parents.manage',
      'admissions.view', 'admissions.manage',
      'attendance.view', 'attendance.manage',
      'timetable.view', 'timetable.manage',
      'exams.view', 'exams.manage',
      'gradebook.view',
      'assignments.view', 'assignments.manage',
      'fees.view', 'fees.manage',
      'library.view', 'library.manage',
      'transport.view', 'transport.manage',
      'inventory.view', 'inventory.manage',
      'hostel.view', 'hostel.manage',
      'announcements.view', 'announcements.send',
      'messages.use',
      'reports.view', 'reports.export',
      'users.view', 'users.invite',
      'campus_settings.manage',
      'ai.use',
      'audit.view',
    ),
  },
  {
    key: 'principal',
    name: 'Principal',
    description: 'Academic and operational lead for a campus.',
    permissions: view(
      'portal.dashboard.view',
      'academics.view', 'academics.manage',
      'campuses.view',
      'students.view', 'students.create', 'students.update',
      'teachers.view', 'teachers.manage',
      'staff.view',
      'parents.view',
      'admissions.view', 'admissions.manage',
      'attendance.view', 'attendance.manage',
      'timetable.view', 'timetable.manage',
      'exams.view', 'exams.manage',
      'gradebook.view', 'gradebook.manage',
      'assignments.view',
      'announcements.view', 'announcements.send',
      'messages.use',
      'reports.view',
      'users.view',
      'ai.use',
      'audit.view',
    ),
  },
  {
    key: 'academic_coordinator',
    name: 'Academic Coordinator',
    description: 'Owns timetable, exams and academic structure.',
    permissions: view(
      'portal.dashboard.view',
      'academics.view', 'academics.manage',
      'students.view',
      'teachers.view',
      'attendance.view',
      'timetable.view', 'timetable.manage',
      'exams.view', 'exams.manage',
      'gradebook.view', 'gradebook.manage',
      'assignments.view', 'assignments.manage',
      'reports.view',
      'messages.use',
      'ai.use',
    ),
  },
  {
    key: 'finance_manager',
    name: 'Finance Manager',
    description: 'Owns fees, invoices and collections.',
    permissions: view(
      'portal.dashboard.view',
      'students.view',
      'fees.view', 'fees.manage',
      'reports.view', 'reports.export',
      'messages.use',
      'ai.use',
      'audit.view',
    ),
  },
  {
    key: 'hr_manager',
    name: 'HR Manager',
    description: 'Owns staff and payroll.',
    permissions: view(
      'portal.dashboard.view',
      'teachers.view', 'teachers.manage',
      'staff.view', 'staff.manage',
      'payroll.view', 'payroll.manage',
      'reports.view', 'reports.export',
      'messages.use',
      'ai.use',
      'audit.view',
    ),
  },
  {
    key: 'teacher',
    name: 'Teacher',
    description: 'Teaches classes; marks attendance, grades and assignments.',
    permissions: view(
      'portal.dashboard.view',
      'academics.view',
      'students.view',
      'attendance.view', 'attendance.manage',
      'timetable.view',
      'exams.view',
      'gradebook.view', 'gradebook.manage',
      'assignments.view', 'assignments.manage',
      'announcements.view',
      'messages.use',
      'ai.use',
    ),
  },
  {
    key: 'librarian',
    name: 'Librarian',
    description: 'Manages the library catalogue and loans.',
    permissions: view(
      'portal.dashboard.view',
      'students.view',
      'library.view', 'library.manage',
      'messages.use',
      'ai.use',
    ),
  },
  {
    key: 'transport_manager',
    name: 'Transport Manager',
    description: 'Manages transport routes and assignments.',
    permissions: view(
      'portal.dashboard.view',
      'students.view',
      'transport.view', 'transport.manage',
      'messages.use',
      'ai.use',
    ),
  },
  {
    key: 'parent',
    name: 'Parent',
    description: 'Views their children’s information.',
    permissions: view(
      'portal.dashboard.view',
      'attendance.view',
      'fees.view',
      'gradebook.view',
      'announcements.view',
      'messages.use',
      'ai.use',
    ),
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Views their own classes, timetable, grades and assignments.',
    permissions: view(
      'portal.dashboard.view',
      'timetable.view',
      'exams.view',
      'gradebook.view',
      'assignments.view',
      'announcements.view',
      'messages.use',
      'ai.use',
    ),
  },
] as const;

export type InstitutionRoleKey = (typeof INSTITUTION_DEFAULT_ROLES)[number]['key'];

export function getInstitutionRole(key: string): RoleDef | undefined {
  return INSTITUTION_DEFAULT_ROLES.find((r) => r.key === key);
}
