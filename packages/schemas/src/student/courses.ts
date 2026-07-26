import { z } from 'zod';

export const courseListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  credits: z.number().int().nullable(),
  professorName: z.string().nullable(),
});

export const courseListSchema = z.object({
  items: z.array(courseListItemSchema),
});

export const syllabusModuleSchema = z.object({
  weekNo: z.number().int(),
  title: z.string(),
  topics: z.array(z.string()),
  covered: z.boolean(),
  isCurrentWeek: z.boolean(),
});

export const courseMaterialSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kindLabel: z.string(),
  weekNo: z.number().int().nullable(),
  description: z.string().nullable(),
});

export const courseAboutSchema = z.object({
  officeHours: z.string().nullable(),
  gradingScheme: z.array(z.object({ component: z.string(), weightPct: z.number() })),
  attendance: z.object({
    present: z.number().int(),
    total: z.number().int(),
    requiredPct: z.number().int(),
    belowThreshold: z.boolean(),
    warningLine: z.string().nullable(),
  }),
});

export const streamPostSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  topicKey: z.string().nullable(),
  requiresAck: z.boolean(),
  acked: z.boolean(),
  postedAt: z.string(),
});

export type CourseListItemDto = z.infer<typeof courseListItemSchema>;
