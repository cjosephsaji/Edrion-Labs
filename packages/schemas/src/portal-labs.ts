import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/** Institution-Portal LABS module (Phase 13 — Lab Staff) request contracts. */
const text = (max = 200) => z.string().trim().max(max).nullish();
const ts = z.coerce.date().nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- lab assets --------------------------------------------------------------
export const labAssetsListQuerySchema = listQuery;
export type LabAssetsListQuery = z.infer<typeof labAssetsListQuerySchema>;

export const createLabAssetSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  kind: z.enum(['inventory', 'equipment', 'consumable']).default('equipment'),
  quantity: z.coerce.number().int().min(0).default(0),
  unit: text(40),
  location: text(160),
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']).default('available'),
});
export type CreateLabAssetInput = z.infer<typeof createLabAssetSchema>;

export const updateLabAssetSchema = createLabAssetSchema.partial().extend({ version: versionSchema });
export type UpdateLabAssetInput = z.infer<typeof updateLabAssetSchema>;

// --- lab schedules -----------------------------------------------------------
export const labSchedulesListQuerySchema = listQuery;
export type LabSchedulesListQuery = z.infer<typeof labSchedulesListQuerySchema>;

export const createLabScheduleSchema = z.object({
  labName: z.string().trim().min(1, 'Required').max(160),
  title: z.string().trim().min(1, 'Required').max(200),
  scheduledAt: ts,
  durationMinutes: z.coerce.number().int().min(0).nullish(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
});
export type CreateLabScheduleInput = z.infer<typeof createLabScheduleSchema>;

export const updateLabScheduleSchema = createLabScheduleSchema.partial().extend({ version: versionSchema });
export type UpdateLabScheduleInput = z.infer<typeof updateLabScheduleSchema>;

// --- lab incidents -----------------------------------------------------------
export const labIncidentsListQuerySchema = listQuery;
export type LabIncidentsListQuery = z.infer<typeof labIncidentsListQuerySchema>;

export const createLabIncidentSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  description: text(2000),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
  occurredAt: ts,
  status: z.enum(['open', 'resolved']).default('open'),
});
export type CreateLabIncidentInput = z.infer<typeof createLabIncidentSchema>;

export const updateLabIncidentSchema = createLabIncidentSchema.partial().extend({ version: versionSchema });
export type UpdateLabIncidentInput = z.infer<typeof updateLabIncidentSchema>;
