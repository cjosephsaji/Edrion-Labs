/** Client-side mirrors of the portal Library DTOs (Phase 8). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type LibraryBookStatus = 'available' | 'archived';
export type LibraryLoanStatus = 'issued' | 'returned' | 'lost';

export interface LibraryBookRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  author: string | null;
  isbn: string | null;
  category: string | null;
  publisher: string | null;
  totalCopies: number;
  availableCopies: number;
  status: LibraryBookStatus;
  description: string | null;
  activeLoans: number;
}

export interface LibraryLoanRow {
  id: string;
  institutionId: string;
  bookId: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  status: LibraryLoanStatus;
  issueDate: string | null;
  dueDate: string | null;
  returnDate: string | null;
  fineAmount: number;
  notes: string | null;
  version: number;
  createdAt: string;
}
