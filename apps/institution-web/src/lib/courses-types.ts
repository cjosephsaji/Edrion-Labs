export interface CourseRow {
  id: string;
  version: number;
  code: string;
  name: string;
  credits: number | null;
  professorTeacherId: string | null;
  termId: string | null;
  officeHours: string | null;
  gradingScheme: { component: string; weightPct: number }[];
  attendanceRequiredPct: number;
  status: string;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface SyllabusModuleRow {
  id?: string;
  weekNo: number;
  title: string;
  topics: string[];
  covered: boolean;
}
