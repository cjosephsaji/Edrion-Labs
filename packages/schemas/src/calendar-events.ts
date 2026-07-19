import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/** Named swatch keys — map to CSS vars in the design system (never free hex). */
export const CALENDAR_SWATCHES = [
  'red',
  'amber',
  'green',
  'blue',
  'purple',
  'orange',
  'teal',
  'slate',
  'pink',
  'indigo',
] as const;
export const calendarSwatchSchema = z.enum(CALENDAR_SWATCHES);

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)').nullish();

const calendarEventFields = {
  title: z.string().trim().min(1).max(200),
  eventTypeId: z.string().uuid(),
  startsOn: dateOnly,
  endsOn: dateOnly.nullish(),
  startTime: time,
  endTime: time,
  description: z.string().max(2000).nullish(),
  status: z.enum(['draft', 'published']).default('draft'),
  audienceScope: z.string().trim().max(40).default('institution'),
  audienceRefId: z.string().uuid().nullish(),
};

export const createCalendarEventSchema = z
  .object(calendarEventFields)
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: 'End date must be on or after start date',
    path: ['endsOn'],
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const updateCalendarEventSchema = z
  .object({
    title: calendarEventFields.title.optional(),
    eventTypeId: calendarEventFields.eventTypeId.optional(),
    startsOn: calendarEventFields.startsOn.optional(),
    endsOn: calendarEventFields.endsOn,
    startTime: time,
    endTime: time,
    description: calendarEventFields.description,
    status: z.enum(['draft', 'published']).optional(),
    audienceScope: z.string().trim().max(40).optional(),
    audienceRefId: z.string().uuid().nullish(),
    version: versionSchema,
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    message: 'End date must be on or after start date',
    path: ['endsOn'],
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const calendarEventListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  eventTypeId: z.string().uuid().optional(),
  status: z.enum(['draft', 'published']).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export const createCalendarEventTypeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase snake_case'),
  label: z.string().trim().min(1).max(80),
  color: calendarSwatchSchema.default('green'),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const updateCalendarEventTypeSchema = createCalendarEventTypeSchema.partial().extend({
  version: versionSchema,
});

export const unifiedCalendarQuerySchema = z.object({
  from: dateOnly,
  to: dateOnly,
  sources: z.string().optional(),
});
export type UnifiedCalendarQuery = z.infer<typeof unifiedCalendarQuerySchema>;

export function parseUnifiedCalendarSources(sources?: string): string[] {
  const raw = sources?.trim() || 'events,exams,assignments,terms';
  return raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type CalendarEventListQuery = z.infer<typeof calendarEventListQuerySchema>;
export type CreateCalendarEventTypeInput = z.infer<typeof createCalendarEventTypeSchema>;
export type UpdateCalendarEventTypeInput = z.infer<typeof updateCalendarEventTypeSchema>;
