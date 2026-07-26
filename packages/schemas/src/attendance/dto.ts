import { z } from 'zod';
import { attendancePolicySchema } from './policy';

export const attendanceSummaryQuerySchema = z.object({
  term_id: z.string().uuid().optional(),
});

export const attendanceSubjectQuerySchema = z.object({
  cursor: z.string().optional(),
});

export const attendanceCoverageQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const attendanceRollupLineSchema = z.object({
  subjectId: z.string().uuid().nullable(),
  subjectName: z.string().nullable(),
  attended: z.number().int(),
  conducted: z.number().int(),
  remaining: z.number().int(),
  pct: z.number().nullable(),
  zone: z.enum(['safe', 'warning', 'below', 'unrecoverable']),
  forecast: z.object({
    branch: z.string(),
    n: z.number().int(),
    message: z.string(),
  }),
});

export const attendanceSummaryResponseSchema = z.object({
  termId: z.string().uuid(),
  policy: attendancePolicySchema,
  overall: attendanceRollupLineSchema,
  subjects: z.array(attendanceRollupLineSchema),
  pendingRequests: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      humanCode: z.string(),
      status: z.string(),
    }),
  ),
  updatedAt: z.string().datetime().nullable(),
});

export const attendanceSubjectDetailSchema = z.object({
  subjectId: z.string().uuid(),
  subjectName: z.string(),
  teacherName: z.string().nullable(),
  rollup: attendanceRollupLineSchema,
  math: z.object({
    attended: z.number().int(),
    conducted: z.number().int(),
    remaining: z.number().int(),
    branch: z.string(),
    n: z.number().int(),
    nuances: z.array(z.string()),
  }),
  sessions: z.array(
    z.object({
      id: z.string().uuid(),
      date: z.string(),
      period: z.string(),
      startTime: z.string().nullable(),
      endTime: z.string().nullable(),
      status: z.string().nullable(),
      displayStatus: z.string(),
      provenance: z
        .object({
          kind: z.string(),
          request_id: z.string().uuid(),
          humanCode: z.string().optional(),
        })
        .nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const attendanceCoverageResponseSchema = z.object({
  count: z.number().int(),
  occurrences: z.array(z.object({ date: z.string(), slotId: z.string() })),
  subjects: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});

export const attendancePolicyUpsertSchema = attendancePolicySchema.extend({
  version: z.number().int().nonnegative(),
});

export type AttendancePolicyUpsertInput = z.infer<typeof attendancePolicyUpsertSchema>;

export type AttendanceSummaryQuery = z.infer<typeof attendanceSummaryQuerySchema>;
export type AttendanceSubjectQuery = z.infer<typeof attendanceSubjectQuerySchema>;
export type AttendanceCoverageQuery = z.infer<typeof attendanceCoverageQuerySchema>;
