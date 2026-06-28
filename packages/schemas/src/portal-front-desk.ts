import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/** Institution-Portal FRONT DESK module (Phase 13 — Receptionist) request contracts. */
const text = (max = 200) => z.string().trim().max(max).nullish();
const ts = z.coerce.date().nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- visitors ----------------------------------------------------------------
export const visitorsListQuerySchema = listQuery;
export type VisitorsListQuery = z.infer<typeof visitorsListQuerySchema>;

export const createVisitorSchema = z.object({
  fullName: z.string().trim().min(1, 'Required').max(200),
  purpose: text(200),
  host: text(160),
  badgeNo: text(40),
  checkInAt: ts,
  checkOutAt: ts,
  status: z.enum(['checked_in', 'checked_out']).default('checked_in'),
});
export type CreateVisitorInput = z.infer<typeof createVisitorSchema>;

export const updateVisitorSchema = createVisitorSchema.partial().extend({ version: versionSchema });
export type UpdateVisitorInput = z.infer<typeof updateVisitorSchema>;

// --- appointments ------------------------------------------------------------
export const appointmentsListQuerySchema = listQuery;
export type AppointmentsListQuery = z.infer<typeof appointmentsListQuerySchema>;

export const createAppointmentSchema = z.object({
  visitorName: z.string().trim().min(1, 'Required').max(200),
  withWhom: text(160),
  scheduledAt: ts,
  notes: text(1000),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']).default('scheduled'),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({ version: versionSchema });
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
