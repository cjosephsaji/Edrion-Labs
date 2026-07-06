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
  termCount?: number;
  classCount?: number;
}

export interface DepartmentRow extends BaseRow {
  name: string;
  code: string;
  headUserId: string | null;
  headUserName: string | null;
  description: string | null;
  staffCount?: number;
  subjectCount?: number;
  gradeLevelCount?: number;
}

export interface GradeLevelRow extends BaseRow {
  name: string;
  level: number;
  departmentId: string | null;
  departmentName: string | null;
  classCount?: number;
  studentCount?: number;
}

export interface SubjectRow extends BaseRow {
  name: string;
  code: string;
  kind: 'core' | 'elective';
  departmentId: string | null;
  departmentName: string | null;
  classCount?: number;
}

export interface DepartmentGradeLevelRow extends BaseRow {
  departmentId: string;
  gradeLevelId: string;
  departmentName: string | null;
  gradeLevelName: string | null;
  sequence: number;
  durationLabel: string | null;
  status: 'active' | 'inactive';
}

export interface ProgrammeStructureSection {
  id: string;
  name: string;
  section: string | null;
  termId: string | null;
  programmeLevelId: string | null;
  studentCount?: number;
}

export interface ProgrammeStructureTerm {
  id: string;
  name: string;
  kind: string;
  sequence: number;
  startDate: string;
  endDate: string;
  status: string;
  programmeLevelId: string | null;
  sections: ProgrammeStructureSection[];
}

export interface ProgrammeStructureLevel {
  id: string;
  departmentId: string;
  gradeLevelId: string;
  gradeLevelName: string;
  sequence: number;
  durationLabel: string | null;
  status: string;
  version: number;
  terms: ProgrammeStructureTerm[];
}

export interface ProgrammeStructureDepartment {
  id: string;
  name: string;
  code: string;
  levels: ProgrammeStructureLevel[];
}

export interface ClassRow extends BaseRow {
  name: string;
  section: string | null;
  academicYearId: string;
  academicYearName: string | null;
  gradeLevelId: string;
  gradeLevelName: string | null;
  programmeLevelId?: string | null;
  termId?: string | null;
  classTeacherId: string | null;
  classTeacherName: string | null;
  room: string | null;
  capacity: number | null;
  studentCount?: number;
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

export interface AcademicTermRow extends BaseRow {
  academicYearId: string;
  academicYearName: string | null;
  programmeLevelId?: string | null;
  departmentId?: string | null;
  gradeLevelId?: string | null;
  name: string;
  kind: 'term' | 'semester' | 'trimester' | 'quarter';
  sequence: number;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: 'planning' | 'active' | 'archived';
  classCount?: number;
}
