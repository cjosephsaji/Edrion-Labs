import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';

/**
 * Institution-Portal ATTENDANCE (Phase 5) request/response contracts: registers (sessions) and the
 * per-student rows within them. Tenancy + active campus scope are derived by the API, never the body.
 */

const optionalUuid = z.string().uuid().nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const shortText = (max = 120) => z.string().trim().max(max).nullish();

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused', 'left_early', 'od'] as const;
export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const withVersion = { version: versionSchema };

// --- sessions (registers) ----------------------------------------------------

export const attendanceListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  classId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;

export const createAttendanceSessionSchema = z.object({
  classId: z.string().uuid(),
  subjectId: optionalUuid,
  date: isoDate,
  period: z.string().trim().min(1).max(40).default('full_day'),
  takenById: optionalUuid,
  notes: shortText(300),
});
export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;

export const updateAttendanceSessionSchema = z.object({
  classId: z.string().uuid().optional(),
  subjectId: optionalUuid,
  date: isoDate.optional(),
  period: z.string().trim().min(1).max(40).optional(),
  takenById: optionalUuid,
  notes: shortText(300),
  ...withVersion,
});
export type UpdateAttendanceSessionInput = z.infer<typeof updateAttendanceSessionSchema>;

// --- records (per student) ---------------------------------------------------

/** One student's mark within a session. */
export const attendanceMarkSchema = z.object({
  studentId: z.string().uuid(),
  status: attendanceStatusSchema.default('present'),
  remarks: shortText(200),
});
export type AttendanceMarkInput = z.infer<typeof attendanceMarkSchema>;

/** Bulk upsert the register: a list of per-student marks (upserts on (session, student)). */
export const markAttendanceSchema = z.object({
  marks: z.array(attendanceMarkSchema).min(1, 'Mark at least one student').max(500),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

// --- agenda / open -----------------------------------------------------------

export const attendanceAgendaQuerySchema = z.object({
  date: isoDate.optional(),
  scope: z.enum(['mine', 'all']).optional(),
  classId: z.string().uuid().optional(),
});
export type AttendanceAgendaQuery = z.infer<typeof attendanceAgendaQuerySchema>;

export const openAttendanceSessionSchema = z
  .object({
    slotId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    date: isoDate,
  })
  .refine((v) => !!v.slotId || !!v.classId, {
    message: 'Provide slotId or classId',
    path: ['slotId'],
  });
export type OpenAttendanceSessionInput = z.infer<typeof openAttendanceSessionSchema>;
