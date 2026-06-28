/** Client-side mirrors of the portal Reports DTOs (Phase 9). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type ReportType = 'attendance' | 'fees' | 'admissions' | 'exams' | 'payroll' | 'custom';
export type ReportStatus = 'active' | 'archived';
export type ReportFormat = 'csv' | 'pdf' | 'xlsx';

export interface ReportDefinitionRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  reportType: ReportType;
  referenceCode: string;
  description: string | null;
  config: string | null;
  status: ReportStatus;
  runCount: number;
}

export interface ReportRunRow {
  id: string;
  institutionId: string;
  reportId: string;
  version: number;
  createdAt: string;
  format: ReportFormat;
  status: 'completed' | 'failed';
  rowCount: number;
  generatedDate: string | null;
  notes: string | null;
}
