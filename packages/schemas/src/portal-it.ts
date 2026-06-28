import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/** Institution-Portal IT module (Phase 13 — IT Staff) request contracts. */
const text = (max = 200) => z.string().trim().max(max).nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- devices -----------------------------------------------------------------
export const devicesListQuerySchema = listQuery;
export type DevicesListQuery = z.infer<typeof devicesListQuerySchema>;

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  kind: z.enum(['laptop', 'desktop', 'printer', 'projector', 'network', 'other']).default('laptop'),
  assetTag: text(80),
  assignedTo: text(160),
  status: z.enum(['active', 'repair', 'retired']).default('active'),
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = createDeviceSchema.partial().extend({ version: versionSchema });
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

// --- access requests ---------------------------------------------------------
export const accessRequestsListQuerySchema = listQuery;
export type AccessRequestsListQuery = z.infer<typeof accessRequestsListQuerySchema>;

export const createAccessRequestSchema = z.object({
  requesterName: z.string().trim().min(1, 'Required').max(200),
  system: text(160),
  reason: text(1000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['open', 'approved', 'denied', 'closed']).default('open'),
});
export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;

export const updateAccessRequestSchema = createAccessRequestSchema.partial().extend({ version: versionSchema });
export type UpdateAccessRequestInput = z.infer<typeof updateAccessRequestSchema>;
