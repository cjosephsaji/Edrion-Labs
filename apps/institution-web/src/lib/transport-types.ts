/** Client-side mirrors of the portal Transport DTOs (Phase 8). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type TransportRouteStatus = 'active' | 'inactive';
export type TransportVehicleStatus = 'active' | 'maintenance' | 'inactive';
export type TransportAssignmentStatus = 'active' | 'inactive';

export interface TransportRouteRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  code: string | null;
  description: string | null;
  fare: number;
  status: TransportRouteStatus;
  assignmentCount: number;
}

export interface TransportVehicleRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  registrationNo: string;
  model: string | null;
  capacity: number;
  routeId: string | null;
  routeName: string | null;
  driverName: string | null;
  driverPhone: string | null;
  status: TransportVehicleStatus;
}

export interface TransportAssignmentRow {
  id: string;
  institutionId: string;
  routeId: string;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  stopName: string | null;
  pickupTime: string | null;
  dropTime: string | null;
  status: TransportAssignmentStatus;
  notes: string | null;
  version: number;
  createdAt: string;
}
