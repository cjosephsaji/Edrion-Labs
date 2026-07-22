export const ATTENDANCE_RECOMPUTE_JOB = 'attendance.recompute';
export const ATTENDANCE_MARKS_SWEEP_JOB = 'attendance.marks_sweep';

export interface AttendanceRecomputeJobData {
  institutionId: string;
  studentId?: string;
  subjectId?: string | null;
  termId?: string;
  rebuild?: boolean;
}
