import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal HEALTH module (Phase 13 — School Nurse) request contracts. Tenancy
 * (institution_id) + campus scope are derived from the principal + scope header, never the body.
 * Medical writes are gated by sensitive permission keys + audited at the service layer.
 */
const text = (max = 200) => z.string().trim().max(max).nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const ts = z.coerce.date().nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- health records ----------------------------------------------------------
export const healthRecordsListQuerySchema = listQuery;
export type HealthRecordsListQuery = z.infer<typeof healthRecordsListQuerySchema>;

export const createHealthRecordSchema = z.object({
  studentId: z.string().uuid().nullish(),
  recordType: z.enum(['allergy', 'condition', 'vaccination', 'note']).default('note'),
  title: z.string().trim().min(1, 'Required').max(200),
  details: text(2000),
  bloodGroup: text(8),
  status: z.enum(['active', 'resolved', 'archived']).default('active'),
  recordedAt: isoDate,
});
export type CreateHealthRecordInput = z.infer<typeof createHealthRecordSchema>;

export const updateHealthRecordSchema = createHealthRecordSchema.partial().extend({ version: versionSchema });
export type UpdateHealthRecordInput = z.infer<typeof updateHealthRecordSchema>;

// --- medical incidents -------------------------------------------------------
export const medicalIncidentsListQuerySchema = listQuery;
export type MedicalIncidentsListQuery = z.infer<typeof medicalIncidentsListQuerySchema>;

export const createMedicalIncidentSchema = z.object({
  studentId: z.string().uuid().nullish(),
  title: z.string().trim().min(1, 'Required').max(200),
  description: text(2000),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
  location: text(160),
  occurredAt: ts,
  status: z.enum(['open', 'resolved']).default('open'),
});
export type CreateMedicalIncidentInput = z.infer<typeof createMedicalIncidentSchema>;

export const updateMedicalIncidentSchema = createMedicalIncidentSchema.partial().extend({ version: versionSchema });
export type UpdateMedicalIncidentInput = z.infer<typeof updateMedicalIncidentSchema>;

// --- medication logs ---------------------------------------------------------
export const medicationLogsListQuerySchema = listQuery;
export type MedicationLogsListQuery = z.infer<typeof medicationLogsListQuerySchema>;

export const createMedicationLogSchema = z.object({
  studentId: z.string().uuid().nullish(),
  medication: z.string().trim().min(1, 'Required').max(200),
  dosage: text(120),
  administeredAt: ts,
  notes: text(1000),
  status: z.enum(['administered', 'scheduled', 'missed']).default('administered'),
});
export type CreateMedicationLogInput = z.infer<typeof createMedicationLogSchema>;

export const updateMedicationLogSchema = createMedicationLogSchema.partial().extend({ version: versionSchema });
export type UpdateMedicationLogInput = z.infer<typeof updateMedicationLogSchema>;
