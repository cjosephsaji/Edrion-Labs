import { z } from 'zod';

export const attendancePolicyBasisSchema = z.enum(['present', 'excluded']);
export const attendanceLateCountsAsSchema = z.enum(['present', 'absent']);
export const attendanceComputationBasisSchema = z.enum(['conducted', 'scheduled']);
export const attendanceLeaveMarkSchema = z.enum(['excused', 'od']);
export const attendanceParentVisibilitySchema = z.enum(['on', 'off']);
export const attendanceZoneSchema = z.enum(['safe', 'warning', 'below', 'unrecoverable']);
export const attendanceForecastBranchSchema = z.enum([
  'can_miss',
  'edge',
  'recovery',
  'unrecoverable',
  'none',
]);

export const attendancePolicySchema = z.object({
  thresholdPct: z.number().min(1).max(100),
  safeMarginPct: z.number().min(0).max(50),
  odBasis: attendancePolicyBasisSchema,
  excusedBasis: attendancePolicyBasisSchema,
  lateCountsAs: attendanceLateCountsAsSchema,
  leftEarlyCountsAs: attendanceLateCountsAsSchema,
  computationBasis: attendanceComputationBasisSchema,
  leaveMark: attendanceLeaveMarkSchema,
  correctionWindowDays: z.number().int().min(1).max(365),
  condonationEnabled: z.boolean(),
  parentVisibility: attendanceParentVisibilitySchema,
  workingDaysMask: z.number().int().min(1).max(127),
});

export type AttendancePolicyValues = z.infer<typeof attendancePolicySchema>;

export const attendancePolicyDefaults: AttendancePolicyValues = {
  thresholdPct: 75,
  safeMarginPct: 5,
  odBasis: 'present',
  excusedBasis: 'excluded',
  lateCountsAs: 'present',
  leftEarlyCountsAs: 'present',
  computationBasis: 'conducted',
  leaveMark: 'excused',
  correctionWindowDays: 14,
  condonationEnabled: true,
  parentVisibility: 'off',
  workingDaysMask: 63,
};

export const attendanceForecastSchema = z.object({
  branch: attendanceForecastBranchSchema,
  n: z.number().int().nonnegative(),
});

export type AttendanceForecast = z.infer<typeof attendanceForecastSchema>;
