import type { SubjectKind } from '@edrion/schemas';

/** Client-side mirrors of the portal Academics DTOs (Phase 2). The API is authoritative. */

export type { SubjectKind };

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

/** Where a subject sits in the curriculum — "Applied Psychology · Year 1 · Semester 1". */
export interface SubjectPlacement {
  id: string;
  programmeLevelId: string;
  departmentId: string;
  departmentName: string | null;
  gradeLevelName: string | null;
  semesterSequence: number;
  slotId: string | null;
  slotName: string | null;
  credits: number | null;
  isElective: boolean;
}

export interface SubjectRow extends BaseRow {
  name: string;
  code: string;
  kind: SubjectKind;
  isLabSubject: boolean;
  departmentId: string | null;
  departmentName: string | null;
  classCount?: number;
  placements?: SubjectPlacement[];
}

/** A curriculum row: this subject is taught in this semester of this programme year. */
export interface ProgrammeSubjectRow extends BaseRow {
  departmentId: string;
  departmentName: string | null;
  programmeLevelId: string;
  gradeLevelName: string | null;
  programmeSequence: number | null;
  semesterSequence: number;
  slotId: string | null;
  slotName: string | null;
  subjectId: string;
  subjectName: string | null;
  subjectCode: string | null;
  subjectKind: SubjectKind | null;
  credits: number | null;
  isElective: boolean;
  sequence: number;
}

/** A curriculum row resolved against a class, with whether the class already teaches it. */
export interface ClassCurriculumRow extends ProgrammeSubjectRow {
  assigned: boolean;
}

/** A student who could be added to a class. */
export interface RosterCandidate {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  rollNo: string | null;
  status: string;
  currentClassId: string | null;
  currentClassName: string | null;
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
  subjectCount?: number;
  version?: number;
}

export interface ProgrammeStructureSubject {
  id: string;
  subjectId: string;
  name: string;
  code: string;
  kind: string;
  credits: number | null;
  isElective: boolean;
  version: number;
  subjectVersion: number;
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
  slotId: string | null;
  sections: ProgrammeStructureSection[];
  subjects: ProgrammeStructureSubject[];
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
  termName?: string | null;
  termSequence?: number | null;
  departmentId?: string | null;
  departmentName?: string | null;
  classTeacherId: string | null;
  classTeacherName: string | null;
  room: string | null;
  capacity: number | null;
  studentCount?: number;
  subjectCount?: number;
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
  departmentName?: string | null;
  gradeLevelName?: string | null;
  classCount?: number;
  subjectCount?: number;
}
