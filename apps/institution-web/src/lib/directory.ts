'use client';
import { useQuery } from '@tanstack/react-query';
import { formatPersonName } from '@edrion/schemas';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

/**
 * Reduced-projection people reads for non-academic staff (nurse/counselor/receptionist): name +
 * class/role + contact only, gated by student_basic_profile.view / staff_basic_profile.view — never
 * the full students.view/staff.view keys. Backs the student/staff pickers on the Health, Counseling
 * and Front-Desk screens. See DirectoryController on the API.
 */
export interface StudentBasic {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  admissionNo: string;
  rollNo: string | null;
  classId: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface StaffBasic {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeNo: string | null;
  designation: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

/** Up to 200 students for a picker (client-side search inside the Combobox). */
export function useStudentDirectory(enabled = true) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['directory', 'students-basic', scopeKey(scope)],
    queryFn: () => client.get<Paged<StudentBasic>>('/portal/directory/students-basic?pageSize=200', scope),
    enabled,
  });
}

/** Up to 200 staff for a picker. */
export function useStaffDirectory(enabled = true) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['directory', 'staff-basic', scopeKey(scope)],
    queryFn: () => client.get<Paged<StaffBasic>>('/portal/directory/staff-basic?pageSize=200', scope),
    enabled,
  });
}

/** Map students to Combobox options: "Name" + admission-no keyword search. */
export function studentOptions(items: StudentBasic[] | undefined) {
  return (items ?? []).map((s) => ({
    value: s.id,
    label: formatPersonName(s),
    keywords: [s.firstName, s.middleName ?? '', s.lastName, s.admissionNo, s.rollNo ?? '', s.email ?? '', s.phone ?? ''].filter(Boolean),
  }));
}

/** Map staff to Combobox options. */
export function staffOptions(items: StaffBasic[] | undefined) {
  return (items ?? []).map((s) => ({
    value: s.id,
    label: formatPersonName(s),
    keywords: [s.firstName, s.middleName ?? '', s.lastName, s.employeeNo ?? '', s.designation ?? '', s.email ?? '', s.phone ?? ''].filter(Boolean),
  }));
}
