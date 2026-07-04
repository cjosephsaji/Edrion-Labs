import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/** Institution-Portal FACILITIES module (Phase 13 — Maintenance Staff) request contracts. */
const text = (max = 200) => z.string().trim().max(max).nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- facilities --------------------------------------------------------------
export const facilitiesListQuerySchema = listQuery;
export type FacilitiesListQuery = z.infer<typeof facilitiesListQuerySchema>;

export const createFacilitySchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  kind: z.enum(['building', 'room', 'utility', 'ground']).default('room'),
  location: text(160),
  status: z.enum(['operational', 'maintenance', 'closed']).default('operational'),
});
export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;

export const updateFacilitySchema = createFacilitySchema.partial().extend({ version: versionSchema });
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;

// --- work orders -------------------------------------------------------------
export const workOrdersListQuerySchema = listQuery;
export type WorkOrdersListQuery = z.infer<typeof workOrdersListQuerySchema>;

export const createWorkOrderSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  description: text(2000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  assignedTo: text(160),
  dueAt: isoDate,
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).default('open'),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const updateWorkOrderSchema = createWorkOrderSchema.partial().extend({ version: versionSchema });
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;

/**
 * Restricted issue-report payload (`facilities.report_issue`): any staff member with the key may
 * raise a triage work order (status always opens as `open`, unassigned). Shared by the REST
 * endpoint and the Petros `work_order_create` tool — one audited path.
 */
export const reportFacilityIssueSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  description: text(2000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});
export type ReportFacilityIssueInput = z.infer<typeof reportFacilityIssueSchema>;

// --- maintenance tasks -------------------------------------------------------
export const maintenanceTasksListQuerySchema = listQuery;
export type MaintenanceTasksListQuery = z.infer<typeof maintenanceTasksListQuerySchema>;

export const createMaintenanceTaskSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']).default('monthly'),
  nextDueAt: isoDate,
  notes: text(1000),
  status: z.enum(['pending', 'done']).default('pending'),
});
export type CreateMaintenanceTaskInput = z.infer<typeof createMaintenanceTaskSchema>;

export const updateMaintenanceTaskSchema = createMaintenanceTaskSchema.partial().extend({ version: versionSchema });
export type UpdateMaintenanceTaskInput = z.infer<typeof updateMaintenanceTaskSchema>;

// --- facility assets ---------------------------------------------------------
export const facilityAssetsListQuerySchema = listQuery;
export type FacilityAssetsListQuery = z.infer<typeof facilityAssetsListQuerySchema>;

export const createFacilityAssetSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  category: text(120),
  location: text(160),
  status: z.enum(['active', 'retired']).default('active'),
});
export type CreateFacilityAssetInput = z.infer<typeof createFacilityAssetSchema>;

export const updateFacilityAssetSchema = createFacilityAssetSchema.partial().extend({ version: versionSchema });
export type UpdateFacilityAssetInput = z.infer<typeof updateFacilityAssetSchema>;
