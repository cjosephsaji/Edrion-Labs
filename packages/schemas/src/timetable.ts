import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal TIMETABLE (Phase 5) request/response contracts: recurring weekly slots.
 * Tenancy + active campus scope are derived by the API, never the body.
 */

const optionalUuid = z.string().uuid().nullish();
/** "HH:MM" 24-hour. */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');

export const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
] as const;
/** 1 = Monday … 7 = Sunday. */
export const dayOfWeekSchema = z.coerce.number().int().min(1).max(7);

export const timetableListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  classId: z.string().uuid().optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
});
export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>;

const withVersion = { version: versionSchema };

export const createTimetableSlotSchema = z
  .object({
    classId: z.string().uuid(),
    subjectId: optionalUuid,
    teacherId: optionalUuid,
    academicYearId: optionalUuid,
    dayOfWeek: dayOfWeekSchema,
    startTime: time,
    endTime: time,
    room: z.string().trim().max(64).nullish(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });
export type CreateTimetableSlotInput = z.infer<typeof createTimetableSlotSchema>;

export const updateTimetableSlotSchema = z
  .object({
    classId: z.string().uuid().optional(),
    subjectId: optionalUuid,
    teacherId: optionalUuid,
    academicYearId: optionalUuid,
    dayOfWeek: dayOfWeekSchema.optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    room: z.string().trim().max(64).nullish(),
    ...withVersion,
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });
export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;
