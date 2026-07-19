/** Client-side mirrors of the portal People DTOs (Phase 4). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

interface PersonBase {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudentRow extends PersonBase {
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  email: string | null;
  phone: string | null;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  classId: string | null;
  className: string | null;
  rollNo: string | null;
  address: string | null;
  status: 'enrolled' | 'inactive' | 'graduated' | 'transferred' | 'alumni';
  enrollmentDate: string | null;
  /** Linked institution_users id when the student has a portal login. */
  institutionUserId: string | null;
  /** Portal account status when linked (`invited` | `active` | `disabled` | …). */
  portalUserStatus: string | null;
}

export interface StaffRow extends PersonBase {
  employeeNo: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  designation: string | null;
  employmentType: 'full_time' | 'part_time' | 'contract' | 'visiting';
  status: 'active' | 'inactive' | 'on_leave';
  joinDate: string | null;
  institutionUserId: string | null;
  isTeaching?: boolean;
  roleKeys?: string[];
}

/** Lightweight row returned by GET /portal/people/staff/teaching-options. */
export interface TeachingStaffOption {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  designation: string | null;
  departmentName: string | null;
}

export interface ParentRow extends PersonBase {
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  address: string | null;
  institutionUserId: string | null;
  childrenCount?: number;
}

export interface GuardianRow {
  id: string;
  studentId: string;
  parentId: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  relationship: 'father' | 'mother' | 'guardian' | 'other';
  isPrimary: boolean;
  isEmergencyContact: boolean;
  version: number;
}

export interface StaffProfile {
  overview: {
    id: string;
    name: string;
    employeeNo: string | null;
    departmentName: string | null;
    designation: string | null;
    employmentType: string;
    status: string;
    joinDate: string | null;
    email: string | null;
    phone: string | null;
    roleKeys: string[];
    isTeaching: boolean;
  };
  teaching: {
    classTeacherOf: { id: string; name: string; studentCount?: number }[];
    subjectTeaching: { classId: string; className: string; subjectId: string; subjectName: string }[];
  } | null;
  account: {
    institutionUserId: string | null;
    userStatus: string | null;
    lastLoginAt: string | null;
    mfaEnrolled: boolean;
  } | null;
}

export interface ParentProfile {
  overview: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    occupation: string | null;
    address: string | null;
    institutionUserId: string | null;
  };
  children: {
    studentId: string;
    name: string;
    admissionNo: string;
    className: string | null;
    gradeLevelName: string | null;
    relationship: string;
    isPrimary: boolean;
    status: string;
  }[];
  fees:
    | {
        studentId: string;
        name: string;
        invoices: number;
        billedMinor: number;
        paidMinor: number;
        outstandingMinor: number;
        overdue: number;
      }[]
    | null;
}

export interface ClassRosterEntry {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  rollNo: string | null;
  status: string;
}
