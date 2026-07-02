'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { scopeKey } from './admin';

/** The aggregated Student-360 profile. Sections are null when the caller lacks that permission. */
export interface StudentProfile {
  overview: {
    id: string;
    name: string;
    admissionNo: string;
    rollNo: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    enrollmentDate: string | null;
    className: string | null;
    gradeName: string | null;
    campusName: string | null;
  };
  hostel: { resident: boolean; blockName: string | null; roomNo: string | null; bedNo: string | null; since: string | null } | null;
  guardians:
    | { name: string; relationship: string; isPrimary: boolean; isEmergencyContact: boolean; email: string | null; phone: string | null }[]
    | null;
  academics: {
    gradesRecorded: number;
    averagePct: number | null;
    recentGrades: { marksObtained: number; maxMarks: number; letterGrade: string | null; remarks: string | null; at: string }[];
    submissions: { total: number; submitted: number; graded: number; pending: number };
  } | null;
  attendance: { total: number; present: number; absent: number; late: number; ratePct: number | null } | null;
  fees: { invoices: number; billedMinor: number; paidMinor: number; outstandingMinor: number; overdue: number } | null;
  health: {
    records: { id: string; recordType: string; title: string; status: string; followUpRequired: boolean; at: string }[];
    incidentsOpen: number;
    incidentsTotal: number;
  } | null;
  conduct: {
    open: number;
    total: number;
    recent: { id: string; category: string; title: string; severity: string; status: string; occurredOn: string | null; at: string }[];
  } | null;
}

export function useStudentProfile(studentId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['student-profile', scopeKey(scope), studentId],
    queryFn: () => client.get<StudentProfile>(`/portal/students/${studentId}/profile`, scope),
    enabled: !!studentId,
  });
}

/** Log a conduct incident for a specific student (used from the profile page). */
export function useLogIncident() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post('/portal/conduct', scope, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-profile'] });
      qc.invalidateQueries({ queryKey: ['conduct'] });
    },
  });
}
