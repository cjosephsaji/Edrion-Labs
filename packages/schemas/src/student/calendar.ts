import { z } from 'zod';

export const calendarEventKindSchema = z.enum(['exam', 'holiday', 'event', 'due', 'cls', 'learn']);

export const fusedCalendarEventSchema = z.object({
  kind: calendarEventKindSchema,
  label: z.string(),
  sourceLine: z.string(),
  refType: z.string().optional(),
  refId: z.string().uuid().optional(),
});

export const calendarDaySchema = z.object({
  date: z.string(),
  events: z.array(fusedCalendarEventSchema),
});

export const semesterBarSegmentSchema = z.object({
  label: z.string(),
  weightPct: z.number(),
  tone: z.string(),
});

export const nextExamSchema = z.object({
  days: z.number().int(),
  dateLabel: z.string(),
  title: z.string(),
  sub: z.string().nullable(),
});

export const studentCalendarSchema = z.object({
  days: z.array(calendarDaySchema),
  nextExam: nextExamSchema.nullable(),
  semesterBar: z.array(semesterBarSegmentSchema).nullable(),
});

export const createPlannerItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeLabel: z.string().max(80).nullish(),
  kind: z.enum(['task', 'learn_plan']).default('task'),
  topicKey: z.string().max(120).nullish(),
});

export const updatePlannerItemSchema = createPlannerItemSchema.partial().extend({
  done: z.boolean().optional(),
  version: z.number().int().min(1),
});

export type StudentCalendarDto = z.infer<typeof studentCalendarSchema>;
export type CreatePlannerItemInput = z.infer<typeof createPlannerItemSchema>;
export type UpdatePlannerItemInput = z.infer<typeof updatePlannerItemSchema>;
