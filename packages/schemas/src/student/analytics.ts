import { z } from 'zod';
import { statFromSchema } from './homework';

export const analyticsRangeSchema = z.enum(['week', 'month', 'term']);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

export const heatmapDaySchema = z.object({
  date: z.string(),
  count: z.number().int(),
});

export const trendBarSchema = z.object({
  label: z.string(),
  value: z.number().int(),
});

export const markDotSchema = z.object({
  label: z.string(),
  marks: z.number().int(),
  maxMarks: z.number().int(),
  pct: z.number(),
});

export const insightSchema = z.object({
  label: z.string(),
  events: z.array(z.object({ label: z.string(), meta: z.string().nullable() })),
});

export const courseRowSchema = z.object({
  courseCode: z.string(),
  courseName: z.string(),
  topicsCount: statFromSchema,
  attendancePct: statFromSchema,
  internalMarks: statFromSchema.nullable(),
});

export const studentAnalyticsSchema = z.object({
  range: analyticsRangeSchema,
  statSlots: z.object({
    topicsCompleted: statFromSchema,
    practiceItems: statFromSchema,
    timeOnLearning: statFromSchema,
    currentStreak: statFromSchema,
  }),
  heatmap: z.array(heatmapDaySchema),
  trendBars: z.array(trendBarSchema),
  subjectChips: z.array(z.object({ label: z.string(), count: z.number().int() })),
  assignmentsRecord: z.object({
    onTime: statFromSchema,
    late: statFromSchema,
    missed: statFromSchema,
  }),
  markDots: z.array(markDotSchema),
  revisionHealth: z.object({
    due: statFromSchema,
    refreshed: statFromSchema,
  }),
  insights: z.array(insightSchema),
  courseRows: z.array(courseRowSchema).optional(),
  transparency: z.object({
    sharedWith: z.array(z.string()),
    neverShared: z.array(z.string()),
  }),
});

export type StudentAnalyticsDto = z.infer<typeof studentAnalyticsSchema>;
