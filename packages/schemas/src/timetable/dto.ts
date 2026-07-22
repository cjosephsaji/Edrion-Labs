import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from '../common';

/**
 * Institution-Portal TIMETABLE request/response contracts: recurring weekly slots.
 * Tenancy + active campus scope are derived by the API, never the body.
 */

const optionalUuid = z.string().uuid().nullish();
/** "HH:MM" 24-hour. */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TIMETABLE_SLOT_KINDS = ['teaching', 'break', 'lunch'] as const;
export const timetableSlotKindSchema = z.enum(TIMETABLE_SLOT_KINDS);
export type TimetableSlotKind = (typeof TIMETABLE_SLOT_KINDS)[number];

export const PERIOD_EXCEPTION_TYPES = [
  'cancelled',
  'room_change',
  'substitution',
  'extra_class',
] as const;
export const periodExceptionTypeSchema = z.enum(PERIOD_EXCEPTION_TYPES);
export type PeriodExceptionType = (typeof PERIOD_EXCEPTION_TYPES)[number];

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

export const timetableListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
    search: z.string().trim().max(160).optional(),
    classId: z.string().uuid().optional(),
    dayOfWeek: dayOfWeekSchema.optional(),
    departmentId: z.string().uuid().optional(),
    programmeLevelId: z.string().uuid().optional(),
  });
export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>;

const withVersion = { version: versionSchema };

export const createTimetableSlotSchema = z
  .object({
    classId: z.string().uuid(),
    subjectId: optionalUuid,
    teacherId: optionalUuid,
    academicYearId: optionalUuid,
    termId: optionalUuid,
    dayOfWeek: dayOfWeekSchema,
    startTime: time,
    endTime: time,
    label: z.string().trim().max(64).nullish(),
    kind: timetableSlotKindSchema.default('teaching'),
    room: z.string().trim().max(64).nullish(),
    effectiveFrom: isoDate.nullish(),
    effectiveTo: isoDate.nullish(),
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
    termId: optionalUuid,
    dayOfWeek: dayOfWeekSchema.optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    label: z.string().trim().max(64).nullish(),
    kind: timetableSlotKindSchema.optional(),
    room: z.string().trim().max(64).nullish(),
    effectiveFrom: isoDate.nullish(),
    effectiveTo: isoDate.nullish(),
    ...withVersion,
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be after the start time',
    path: ['endTime'],
  });
export type UpdateTimetableSlotInput = z.infer<typeof updateTimetableSlotSchema>;

export const studentTimetableQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.to >= v.from, { message: 'to must be on or after from', path: ['to'] })
  .refine((v) => daysBetween(v.from, v.to) <= 42, {
    message: 'Range must be 42 days or fewer',
    path: ['to'],
  });
export type StudentTimetableQuery = z.infer<typeof studentTimetableQuerySchema>;

export const portalTimetableDayQuerySchema = z.object({
  date: isoDate,
  classId: z.string().uuid(),
});
export type PortalTimetableDayQuery = z.infer<typeof portalTimetableDayQuerySchema>;

export const createPeriodExceptionSchema = z
  .object({
    slotId: z.string().uuid().nullish(),
    classId: z.string().uuid(),
    date: isoDate,
    recurring: z.boolean().default(false),
    recurringUntil: isoDate.nullish(),
    type: periodExceptionTypeSchema,
    newRoom: z.string().trim().max(64).nullish(),
    newTeacherId: z.string().uuid().nullish(),
    subjectId: z.string().uuid().nullish(),
    startTime: time.nullish(),
    endTime: time.nullish(),
    note: z.string().trim().max(200).nullish(),
    version: versionSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.recurring && !v.recurringUntil) {
      ctx.addIssue({ code: 'custom', message: 'recurringUntil is required when recurring is true', path: ['recurringUntil'] });
    }
    if (v.recurringUntil && v.recurringUntil < v.date) {
      ctx.addIssue({ code: 'custom', message: 'recurringUntil must be on or after date', path: ['recurringUntil'] });
    }
    if (v.type === 'room_change' && !v.newRoom) {
      ctx.addIssue({ code: 'custom', message: 'newRoom is required for room_change', path: ['newRoom'] });
    }
    if (v.type === 'substitution' && !v.newTeacherId) {
      ctx.addIssue({ code: 'custom', message: 'newTeacherId is required for substitution', path: ['newTeacherId'] });
    }
    if (v.type === 'extra_class') {
      if (!v.startTime || !v.endTime) {
        ctx.addIssue({ code: 'custom', message: 'startTime and endTime are required for extra_class', path: ['startTime'] });
      } else if (v.endTime <= v.startTime) {
        ctx.addIssue({ code: 'custom', message: 'endTime must be after startTime', path: ['endTime'] });
      }
    }
  });
export type CreatePeriodExceptionInput = z.infer<typeof createPeriodExceptionSchema>;

export const revokePeriodExceptionSchema = z.object({
  reason: z.enum(['manual', 'superseded', 'slot_deleted']).default('manual'),
  version: versionSchema,
});
export type RevokePeriodExceptionInput = z.infer<typeof revokePeriodExceptionSchema>;

const teacherSchema = z.object({ id: z.string().uuid().nullable(), name: z.string() });
const subjectSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string(),
  colorIndex: z.number().int().min(0).max(11),
});

export const timetableOccurrenceSchema = z.object({
  id: z.string(),
  date: isoDate,
  start: time,
  end: time,
  kind: z.enum(['class', 'exam', 'extra']),
  subject: subjectSchema,
  teacher: teacherSchema,
  room: z.object({ name: z.string().nullable() }),
  state: z.enum(['normal', 'cancelled', 'room_changed', 'substituted']),
  original: z.object({
    room: z.string().nullable(),
    teacher: teacherSchema.nullable(),
  }),
  note: z.string().nullable(),
  clash: z.boolean(),
  clash_with: z.string().nullable(),
  class_id: z.string().uuid(),
});
export type TimetableOccurrence = z.infer<typeof timetableOccurrenceSchema>;

export const studentTimetableResponseSchema = z.object({
  occurrences: z.array(timetableOccurrenceSchema),
  dayBounds: z.object({ earliestStart: time, latestEnd: time }),
  published: z.boolean(),
  term: z
    .object({
      id: z.string().uuid(),
      name: z.string().optional(),
      startDate: isoDate,
      endDate: isoDate,
    })
    .nullable(),
});
export type StudentTimetableResponse = z.infer<typeof studentTimetableResponseSchema>;

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}
