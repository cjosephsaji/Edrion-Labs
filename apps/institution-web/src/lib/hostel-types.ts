/** Client-side mirrors of the portal Hostel DTOs (Phase 8). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type HostelBlockType = 'boys' | 'girls' | 'mixed';
export type HostelBlockStatus = 'active' | 'inactive';
export type HostelRoomStatus = 'available' | 'full' | 'maintenance';
export type HostelAllocationStatus = 'active' | 'vacated';

export interface HostelBlockRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  code: string | null;
  blockType: HostelBlockType;
  warden: string | null;
  description: string | null;
  status: HostelBlockStatus;
  roomCount: number;
}

export interface HostelRoomRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  blockId: string | null;
  blockName: string | null;
  roomNo: string;
  floor: string | null;
  capacity: number;
  occupied: number;
  available: number;
  roomType: string | null;
  status: HostelRoomStatus;
}

export interface HostelAllocationRow {
  id: string;
  institutionId: string;
  roomId: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  bedNo: string | null;
  fromDate: string | null;
  toDate: string | null;
  status: HostelAllocationStatus;
  notes: string | null;
  version: number;
  createdAt: string;
}

/** A current resident row from GET /portal/hostel/hostellers (student × room × block). */
export interface HostellerRow {
  id: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  roomId: string;
  roomNo: string | null;
  blockId: string | null;
  blockName: string | null;
  bedNo: string | null;
  fromDate: string | null;
  status: string;
}
