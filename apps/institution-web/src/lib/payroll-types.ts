/** Client-side mirrors of the portal Payroll DTOs (Phase 7). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type PayrollStatus = 'draft' | 'processing' | 'approved' | 'paid' | 'cancelled';
export type PayrollEmployeeType = 'teacher' | 'staff';

export interface PayrollRunRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  payDate: string | null;
  status: PayrollStatus;
  notes: string | null;
  itemCount: number;
  totalNet: number;
}

export interface PayrollItemRow {
  id: string;
  institutionId: string;
  payrollRunId: string;
  employeeType: PayrollEmployeeType;
  teacherId: string | null;
  staffId: string | null;
  employeeName: string | null;
  gross: number;
  deductions: number;
  net: number;
  notes: string | null;
  version: number;
}
