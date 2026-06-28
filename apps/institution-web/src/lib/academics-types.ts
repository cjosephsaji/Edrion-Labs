/** Client-side mirrors of the portal Academics DTOs (Phase 2). The API is authoritative. */

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface BaseRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicYearRow extends BaseRow {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: 'planning' | 'active' | 'archived';
}

export interface DepartmentRow extends BaseRow {
  name: string;
  code: string;
  headUserId: string | null;
  headUserName: string | null;
  description: string | null;
}

export interface GradeLevelRow extends BaseRow {
  name: string;
  level: number;
  departmentId: string | null;
  departmentName: string | null;
}

export interface SubjectRow extends BaseRow {
  name: string;
  code: string;
  kind: 'core' | 'elective';
  departmentId: string | null;
  departmentName: string | null;
}

export interface ClassRow extends BaseRow {
  name: string;
  section: string | null;
  academicYearId: string;
  academicYearName: string | null;
  gradeLevelId: string;
  gradeLevelName: string | null;
  classTeacherId: string | null;
  classTeacherName: string | null;
  room: string | null;
  capacity: number | null;
}

export interface ClassSubjectRow {
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string | null;
  subjectCode: string | null;
  teacherId: string | null;
  teacherName: string | null;
}
