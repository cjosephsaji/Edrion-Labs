/** Client-side mirrors of the Phase-13 functional-staff DTOs. The API is authoritative. */

interface BaseRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// --- Health ------------------------------------------------------------------
export interface HealthRecordRow extends BaseRow {
  studentId: string | null;
  recordType: string;
  title: string;
  details: string | null;
  bloodGroup: string | null;
  status: string;
  recordedAt: string | null;
}
export interface MedicalIncidentRow extends BaseRow {
  studentId: string | null;
  title: string;
  description: string | null;
  severity: string;
  location: string | null;
  occurredAt: string | null;
  status: string;
}
export interface MedicationLogRow extends BaseRow {
  studentId: string | null;
  medication: string;
  dosage: string | null;
  administeredAt: string | null;
  notes: string | null;
  status: string;
}

// --- Counseling --------------------------------------------------------------
export interface CounselingRecordRow extends BaseRow {
  studentId: string | null;
  sessionType: string;
  title: string;
  notes: string | null;
  sessionAt: string | null;
  status: string;
}
export interface CounselingCaseRow extends BaseRow {
  studentId: string | null;
  title: string;
  summary: string | null;
  priority: string;
  status: string;
}

// --- Labs --------------------------------------------------------------------
export interface LabAssetRow extends BaseRow {
  name: string;
  kind: string;
  quantity: number;
  unit: string | null;
  location: string | null;
  status: string;
}
export interface LabScheduleRow extends BaseRow {
  labName: string;
  title: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  status: string;
}
export interface LabIncidentRow extends BaseRow {
  title: string;
  description: string | null;
  severity: string;
  occurredAt: string | null;
  status: string;
}

// --- Front Desk --------------------------------------------------------------
export interface VisitorRow extends BaseRow {
  fullName: string;
  purpose: string | null;
  host: string | null;
  badgeNo: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
}
export interface AppointmentRow extends BaseRow {
  visitorName: string;
  withWhom: string | null;
  scheduledAt: string | null;
  notes: string | null;
  status: string;
}

// --- Facilities --------------------------------------------------------------
export interface FacilityRow extends BaseRow {
  name: string;
  kind: string;
  location: string | null;
  status: string;
}
export interface WorkOrderRow extends BaseRow {
  title: string;
  description: string | null;
  priority: string;
  assignedTo: string | null;
  dueAt: string | null;
  status: string;
}
export interface MaintenanceTaskRow extends BaseRow {
  title: string;
  frequency: string;
  nextDueAt: string | null;
  notes: string | null;
  status: string;
}
export interface FacilityAssetRow extends BaseRow {
  name: string;
  category: string | null;
  location: string | null;
  status: string;
}

// --- Security ----------------------------------------------------------------
export interface GatePassRow extends BaseRow {
  holderName: string;
  kind: string;
  reason: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
}
export interface SecurityIncidentRow extends BaseRow {
  title: string;
  description: string | null;
  severity: string;
  location: string | null;
  occurredAt: string | null;
  status: string;
}
export interface EmergencyAlertRow extends BaseRow {
  title: string;
  message: string | null;
  level: string;
  raisedAt: string | null;
  status: string;
}
export interface CampusAccessLogRow extends BaseRow {
  subjectName: string;
  direction: string;
  gate: string | null;
  method: string;
  occurredAt: string | null;
  status: string;
}

// --- IT ----------------------------------------------------------------------
export interface DeviceRow extends BaseRow {
  name: string;
  kind: string;
  assetTag: string | null;
  assignedTo: string | null;
  status: string;
}
export interface AccessRequestRow extends BaseRow {
  requesterName: string;
  system: string | null;
  reason: string | null;
  priority: string;
  status: string;
}
