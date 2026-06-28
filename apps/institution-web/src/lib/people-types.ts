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
}

export interface TeacherRow extends PersonBase {
  employeeNo: string | null;
  firstName: string;
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
}

export interface StaffRow extends PersonBase {
  employeeNo: string | null;
  firstName: string;
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
}

export interface ParentRow extends PersonBase {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  address: string | null;
  institutionUserId: string | null;
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
