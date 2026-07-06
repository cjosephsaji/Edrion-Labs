'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';

export interface StudentPortalSurfaceRow {
  key: string;
  label: string;
  featureFlagKey: string;
  enabled: boolean;
}

export interface StudentPortalSurfacesResponse {
  portalEnabled: boolean;
  surfaces: StudentPortalSurfaceRow[];
}

export function useStudentPortalSurfaces() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['student-portal', 'surfaces', scope],
    queryFn: () => client.get<StudentPortalSurfacesResponse>('/portal/student-portal/surfaces', scope),
  });
}

export function useSetStudentPortalSurface() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ featureFlagKey, value }: { featureFlagKey: string; value: boolean }) =>
      client.patch<{ featureFlagKey: string; value: boolean }>(
        `/portal/student-portal/surfaces/${encodeURIComponent(featureFlagKey)}`,
        scope,
        { value },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student-portal', 'surfaces'] }),
  });
}

export function useInviteStudentToPortal() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useMutation({
    mutationFn: (input: { studentId: string; targetEmail?: string; guardianParentId?: string }) =>
      client.post<{ studentId: string; institutionUserId: string }>(
        `/portal/students/${input.studentId}/portal-invite`,
        scope,
        { targetEmail: input.targetEmail, guardianParentId: input.guardianParentId },
      ),
  });
}
