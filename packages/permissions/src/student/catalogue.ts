/**
 * Student portal permission catalogue. Separate from institution staff permissions.
 * The student role on institution_users references these keys.
 */
import type { PermissionDef } from '../catalogue';

const def = (key: string, group: string, description: string, sensitive = false): PermissionDef => ({
  key,
  group,
  description,
  sensitive,
});

export const STUDENT_PERMISSIONS: readonly PermissionDef[] = [
  def('student.learn.use', 'Learn', 'Use the Learn engine and Petros features.'),
  def('student.library.use', 'Library', 'Use the knowledge library.'),
  def('student.lab.use', 'Lab', 'Use The Lab (mock exams, debate, visual studio).'),
  def('student.history.view', 'You', 'View learning history.'),
  def('student.achievements.view', 'You', 'View achievements.'),
  def('student.analytics.view', 'Institution', 'View learning analytics.'),
  def('student.calendar.view', 'Institution', 'View calendar.'),
  def('student.planner.manage', 'Institution', 'Manage personal planner items.'),
  def('student.homework.view', 'Institution', 'View homework assignments.'),
  def('student.homework.submit', 'Institution', 'Submit homework.'),
  def('student.assignments.view', 'Institution', 'View college assignments.'),
  def('student.assignments.submit', 'Institution', 'Submit college assignments.'),
  def('student.classes.view', 'Institution', 'View classes.'),
  def('student.courses.view', 'Institution', 'View courses.'),
  def('student.report_cards.view', 'Institution', 'View report cards.'),
  def('student.exams.view', 'Institution', 'View institution exams.'),
  def('student.attendance.view', 'Institution', 'View attendance summary and subject breakdown.'),
  def('student.surface.results.view', 'Surfaces', 'View released marks and term results.'),
  def('student.surface.fees.view', 'Surfaces', 'View fees summary.'),
  def('student.surface.transport.view', 'Surfaces', 'View transport info.'),
  def('student.surface.hostel.view', 'Surfaces', 'View hostel info.'),
  def('student.surface.documents.view', 'Surfaces', 'View institution documents.'),
  def('student.surface.requests.view', 'Surfaces', 'Create and track institution requests.'),
  def('student.surface.content.view', 'Surfaces', 'View custom content pages.'),
  def('student.settings.manage', 'Account', 'Manage preferences and settings.'),
  def('student.data.export', 'Account', 'Export personal data.', true),
  def('student.account.delete', 'Account', 'Request account deletion.', true),
] as const;

export type StudentPermissionKey = (typeof STUDENT_PERMISSIONS)[number]['key'];

export const ALL_STUDENT_PERMISSION_KEYS: readonly string[] = STUDENT_PERMISSIONS.map((p) => p.key);

const byKey = new Map(STUDENT_PERMISSIONS.map((p) => [p.key, p]));

export function getStudentPermission(key: string): PermissionDef | undefined {
  return byKey.get(key);
}
