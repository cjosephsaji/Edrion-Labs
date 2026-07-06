import { z } from 'zod';

export const classListItemSchema = z.object({
  subjectClassId: z.string().uuid(),
  name: z.string(),
  initial: z.string(),
  teacherName: z.string().nullable(),
  nextMeta: z.string().nullable(),
  liveToday: z.boolean(),
});

export const classListSchema = z.object({
  items: z.array(classListItemSchema),
});

export const classAboutSchema = z.object({
  teacherName: z.string().nullable(),
  timetableLines: z.array(z.string()),
  attendance: z.object({ present: z.number().int(), total: z.number().int() }),
});

export type ClassListItemDto = z.infer<typeof classListItemSchema>;
