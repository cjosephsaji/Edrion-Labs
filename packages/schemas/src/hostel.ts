import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal HOSTEL (Phase 8) request/response contracts: blocks + rooms (campus-scoped
 * catalogues) + per-student allocations. Tenancy + the active campus scope are derived by the API,
 * never the body. Room occupancy is maintained by the allocation bridge, never trusted from the body.
 */

const optionalUuid = z.string().uuid().nullish();
const shortText = (max = 120) => z.string().trim().max(max).nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const count = z.coerce.number().int().min(0).max(100_000);

export const HOSTEL_BLOCK_TYPES = ['boys', 'girls', 'mixed'] as const;
export const hostelBlockTypeSchema = z.enum(HOSTEL_BLOCK_TYPES);
export type HostelBlockType = (typeof HOSTEL_BLOCK_TYPES)[number];

export const HOSTEL_BLOCK_STATUSES = ['active', 'inactive'] as const;
export const hostelBlockStatusSchema = z.enum(HOSTEL_BLOCK_STATUSES);
export type HostelBlockStatus = (typeof HOSTEL_BLOCK_STATUSES)[number];

export const HOSTEL_ROOM_STATUSES = ['available', 'full', 'maintenance'] as const;
export const hostelRoomStatusSchema = z.enum(HOSTEL_ROOM_STATUSES);
export type HostelRoomStatus = (typeof HOSTEL_ROOM_STATUSES)[number];

export const HOSTEL_ALLOCATION_STATUSES = ['active', 'vacated'] as const;
export const hostelAllocationStatusSchema = z.enum(HOSTEL_ALLOCATION_STATUSES);
export type HostelAllocationStatus = (typeof HOSTEL_ALLOCATION_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- blocks ------------------------------------------------------------------

export const hostelBlocksListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: hostelBlockStatusSchema.optional(),
});
export type HostelBlocksListQuery = z.infer<typeof hostelBlocksListQuerySchema>;

export const createHostelBlockSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(120),
  code: shortText(40),
  blockType: hostelBlockTypeSchema.default('mixed'),
  warden: shortText(120),
  description: shortText(500),
  status: hostelBlockStatusSchema.default('active'),
});
export type CreateHostelBlockInput = z.infer<typeof createHostelBlockSchema>;

export const updateHostelBlockSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: shortText(40),
  blockType: hostelBlockTypeSchema.optional(),
  warden: shortText(120),
  description: shortText(500),
  status: hostelBlockStatusSchema.optional(),
  ...withVersion,
});
export type UpdateHostelBlockInput = z.infer<typeof updateHostelBlockSchema>;

// --- rooms -------------------------------------------------------------------

export const hostelRoomsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: hostelRoomStatusSchema.optional(),
  blockId: z.string().uuid().optional(),
});
export type HostelRoomsListQuery = z.infer<typeof hostelRoomsListQuerySchema>;

export const createHostelRoomSchema = z.object({
  blockId: optionalUuid,
  roomNo: z.string().trim().min(1, 'Required').max(40),
  floor: shortText(40),
  capacity: count.default(1),
  roomType: shortText(40),
  status: hostelRoomStatusSchema.default('available'),
});
export type CreateHostelRoomInput = z.infer<typeof createHostelRoomSchema>;

export const updateHostelRoomSchema = z.object({
  blockId: optionalUuid,
  roomNo: z.string().trim().min(1).max(40).optional(),
  floor: shortText(40),
  capacity: count.optional(),
  roomType: shortText(40),
  status: hostelRoomStatusSchema.optional(),
  ...withVersion,
});
export type UpdateHostelRoomInput = z.infer<typeof updateHostelRoomSchema>;

// --- allocations (per student, against a room) -------------------------------

/** Allocate a bed to a student. The service increments the room's occupancy. */
export const allocateHostelRoomSchema = z.object({
  studentId: z.string().uuid(),
  bedNo: shortText(40),
  fromDate: isoDate,
  toDate: isoDate,
  notes: shortText(500),
});
export type AllocateHostelRoomInput = z.infer<typeof allocateHostelRoomSchema>;

/** Vacate an active allocation. The service marks it vacated + decrements the room's occupancy. */
export const vacateHostelRoomSchema = z.object({
  toDate: isoDate,
  notes: shortText(500),
});
export type VacateHostelRoomInput = z.infer<typeof vacateHostelRoomSchema>;
