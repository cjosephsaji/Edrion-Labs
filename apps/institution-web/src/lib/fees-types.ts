/** Client-side mirrors of the portal Fees DTOs (Phase 7). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type FeeType = 'tuition' | 'admission' | 'transport' | 'hostel' | 'exam' | 'library' | 'misc';
export type FeeFrequency = 'one_time' | 'monthly' | 'term' | 'annual';
export type FeeStructureStatus = 'active' | 'inactive';
export type FeeInvoiceStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export type FeePaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'online' | 'other';

export interface FeeStructureRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  feeType: FeeType;
  gradeLevelId: string | null;
  gradeLevelName: string | null;
  classId: string | null;
  className: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
  termId: string | null;
  termName: string | null;
  amount: number;
  frequency: FeeFrequency;
  description: string | null;
  status: FeeStructureStatus;
}

export interface FeeInvoiceRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  invoiceNo: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  feeStructureId: string | null;
  feeStructureName: string | null;
  amount: number;
  amountPaid: number;
  balance: number;
  status: FeeInvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
}

export interface FeePaymentRow {
  id: string;
  institutionId: string;
  invoiceId: string;
  amount: number;
  method: FeePaymentMethod;
  reference: string | null;
  paidDate: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
}
