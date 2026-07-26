import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';
import { lenientPhoneSchema } from './geo/validators';

/**
 * Institution-Portal TRANSPORT (Phase 8) request/response contracts: routes + vehicles (campus-scoped
 * catalogues) + per-student route assignments. Tenancy + the active campus scope are derived by the
 * API, never the body. Money (fare) is a whole-number integer in MINOR units.
 */

const optionalUuid = z.string().uuid().nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM').nullish();
const money = z.coerce.number().int().min(0).max(1_000_000_000);
const count = z.coerce.number().int().min(0).max(1_000_000);

export const TRANSPORT_ROUTE_STATUSES = ['active', 'inactive'] as const;
export const transportRouteStatusSchema = z.enum(TRANSPORT_ROUTE_STATUSES);
export type TransportRouteStatus = (typeof TRANSPORT_ROUTE_STATUSES)[number];

export const TRANSPORT_VEHICLE_STATUSES = ['active', 'maintenance', 'inactive'] as const;
export const transportVehicleStatusSchema = z.enum(TRANSPORT_VEHICLE_STATUSES);
export type TransportVehicleStatus = (typeof TRANSPORT_VEHICLE_STATUSES)[number];

export const TRANSPORT_ASSIGNMENT_STATUSES = ['active', 'inactive'] as const;
export const transportAssignmentStatusSchema = z.enum(TRANSPORT_ASSIGNMENT_STATUSES);
export type TransportAssignmentStatus = (typeof TRANSPORT_ASSIGNMENT_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- routes ------------------------------------------------------------------

export const transportRoutesListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: transportRouteStatusSchema.optional(),
});
export type TransportRoutesListQuery = z.infer<typeof transportRoutesListQuerySchema>;

export const createTransportRouteSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  code: shortText(40),
  description: shortText(500),
  fare: money.default(0),
  status: transportRouteStatusSchema.default('active'),
});
export type CreateTransportRouteInput = z.infer<typeof createTransportRouteSchema>;

export const updateTransportRouteSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: shortText(40),
  description: shortText(500),
  fare: money.optional(),
  status: transportRouteStatusSchema.optional(),
  ...withVersion,
});
export type UpdateTransportRouteInput = z.infer<typeof updateTransportRouteSchema>;

// --- vehicles ----------------------------------------------------------------

export const transportVehiclesListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: transportVehicleStatusSchema.optional(),
  routeId: z.string().uuid().optional(),
});
export type TransportVehiclesListQuery = z.infer<typeof transportVehiclesListQuerySchema>;

export const createTransportVehicleSchema = z.object({
  registrationNo: z.string().trim().min(1, 'Required').max(60),
  model: shortText(120),
  capacity: count.default(0),
  routeId: optionalUuid,
  driverName: shortText(120),
  driverPhone: lenientPhoneSchema,
  status: transportVehicleStatusSchema.default('active'),
});
export type CreateTransportVehicleInput = z.infer<typeof createTransportVehicleSchema>;

export const updateTransportVehicleSchema = z.object({
  registrationNo: z.string().trim().min(1).max(60).optional(),
  model: shortText(120),
  capacity: count.optional(),
  routeId: optionalUuid,
  driverName: shortText(120),
  driverPhone: lenientPhoneSchema,
  status: transportVehicleStatusSchema.optional(),
  ...withVersion,
});
export type UpdateTransportVehicleInput = z.infer<typeof updateTransportVehicleSchema>;

// --- assignments (per student, against a route) ------------------------------

export const createTransportAssignmentSchema = z.object({
  studentId: z.string().uuid(),
  stopName: shortText(120),
  pickupTime: time,
  dropTime: time,
  status: transportAssignmentStatusSchema.default('active'),
  notes: shortText(500),
});
export type CreateTransportAssignmentInput = z.infer<typeof createTransportAssignmentSchema>;

export const updateTransportAssignmentSchema = z.object({
  studentId: z.string().uuid().optional(),
  stopName: shortText(120),
  pickupTime: time,
  dropTime: time,
  status: transportAssignmentStatusSchema.optional(),
  notes: shortText(500),
  ...withVersion,
});
export type UpdateTransportAssignmentInput = z.infer<typeof updateTransportAssignmentSchema>;
