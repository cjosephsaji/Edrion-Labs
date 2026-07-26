export type ReportCardStatus = 'draft' | 'in_review' | 'published';

export interface ReportCardRow {
  id: string;
  version: number;
  studentId: string;
  termId: string | null;
  termLabel: string;
  kind: 'uploaded_pdf' | 'structured';
  academicYearId: string | null;
  gpa: string | null;
  status: ReportCardStatus;
  publishedAt: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface ReportCardEntryRow {
  id: string;
  subjectLabel: string;
  marks: number;
  maxMarks: number;
  gradeLetter: string | null;
  sequence: number;
}
