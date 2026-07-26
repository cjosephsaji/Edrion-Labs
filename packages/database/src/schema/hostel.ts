import { date, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL hostel (Phase 8). Blocks + rooms (campus-scoped catalogue) + per-student
 * allocations with an allocate→occupancy bridge:
 *   - hostel_blocks: a hostel building/wing, campus-scoped + version-guarded.
 *   - hostel_rooms: a room within a block (block is an optional FK), campus-scoped + version-guarded.
 *     `capacity` is the bed count; `occupied` is maintained by the allocation bridge.
 *   - hostel_allocations: a student's allocation to a room. No campus column of its own — it inherits
 *     the room's campus and is only reachable through a room the caller can see (mirrors fee_payments
 *     / exam_schedules). Allocating increments occupied (a full room is a friendly 400); vacating
 *     decrements it (a small bridge like fees payment→invoice). Students are the FK target.
 *
 * Same tenant convention. academics/people are referenced forward-only, so plain `.references()` is
 * safe (no Drizzle type cycle).
 */
export const hostelBlocks = pgTable(
  'hostel_blocks',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code'),
    /** boys | girls | mixed. */
    blockType: text('block_type').notNull().default('mixed'),
    warden: text('warden'),
    description: text('description'),
    /** active | inactive. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('hostel_blocks_institution_idx').on(t.institutionId),
    scopeIdx: index('hostel_blocks_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('hostel_blocks_status_idx').on(t.status),
  }),
);

/** A room within a block, with a tracked occupancy. */
export const hostelRooms = pgTable(
  'hostel_rooms',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id').references(() => hostelBlocks.id, { onDelete: 'set null' }),
    roomNo: text('room_no').notNull(),
    floor: text('floor'),
    /** Bed count. */
    capacity: integer('capacity').notNull().default(1),
    /** Beds occupied (maintained by the allocation bridge). */
    occupied: integer('occupied').notNull().default(0),
    /** standard | deluxe | dormitory (free-text). */
    roomType: text('room_type'),
    /** available | full | maintenance. */
    status: text('status').notNull().default('available'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('hostel_rooms_institution_idx').on(t.institutionId),
    scopeIdx: index('hostel_rooms_institution_campus_idx').on(t.institutionId, t.campusId),
    blockIdx: index('hostel_rooms_block_idx').on(t.blockId),
    statusIdx: index('hostel_rooms_status_idx').on(t.status),
  }),
);

/** A student's allocation to a room. Inherits the room's campus (no campus column of its own). */
export const hostelAllocations = pgTable(
  'hostel_allocations',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => hostelRooms.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    bedNo: text('bed_no'),
    fromDate: date('from_date'),
    toDate: date('to_date'),
    /** active | vacated. */
    status: text('status').notNull().default('active'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('hostel_allocations_institution_idx').on(t.institutionId),
    roomIdx: index('hostel_allocations_room_idx').on(t.roomId),
    studentIdx: index('hostel_allocations_student_idx').on(t.studentId),
    statusIdx: index('hostel_allocations_status_idx').on(t.status),
  }),
);

export type HostelBlock = typeof hostelBlocks.$inferSelect;
export type NewHostelBlock = typeof hostelBlocks.$inferInsert;
export type HostelRoom = typeof hostelRooms.$inferSelect;
export type NewHostelRoom = typeof hostelRooms.$inferInsert;
export type HostelAllocation = typeof hostelAllocations.$inferSelect;
export type NewHostelAllocation = typeof hostelAllocations.$inferInsert;
