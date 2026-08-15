'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudentHomePriorityKey } from '@edrion/schemas';
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

export interface StudentPortalModuleCard {
  key: string;
  category: 'academics' | 'money' | 'campus' | 'life' | 'learning';
  label: string;
  icon: string;
  value: boolean;
  effective: boolean;
  planLocked: boolean;
  dependencyMet: boolean;
  dependencyNoteKey: string | null;
}

export interface StudentPortalPresetDto {
  key: string;
  label: string;
  modules: Record<string, boolean>;
  terminology: Record<string, string>;
  defaults: { attendanceThreshold: number; gradingScheme: string };
}

export interface StudentPortalConfigAdminResponse {
  catalog: StudentPortalModuleCard[];
  settings: {
    revision: number;
    presetKey: string;
    terminology: Record<string, string>;
    labelOverrides: Record<string, string>;
    attendanceThreshold: number;
    gradingScheme: string;
    homePriorities: Record<StudentHomePriorityKey, number>;
  };
  campuses: Array<{ id: string; name: string }>;
  campusOverrides: Record<string, Record<string, boolean>>;
  suggestedPresetKey: string;
  presets: Record<string, StudentPortalPresetDto>;
}

export function useStudentPortalConfig() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['student-portal', 'config', scope],
    queryFn: () => client.get<StudentPortalConfigAdminResponse>('/portal/settings/student-portal', scope),
  });
}

export function useSaveStudentPortalConfig() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.put<{ revision: number; presetKey: string }>('/portal/settings/student-portal', scope, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student-portal', 'config'] }),
  });
}

export function useInviteStudentToPortal() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: string; targetEmail?: string; guardianParentId?: string }) =>
      client.post<{ studentId: string; institutionUserId: string }>(
        `/portal/students/${input.studentId}/portal-invite`,
        scope,
        { targetEmail: input.targetEmail, guardianParentId: input.guardianParentId },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
  });
}

export function useSendStudentPortalPasswordReset() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useMutation({
    mutationFn: (studentId: string) =>
      client.post<{ studentId: string; institutionUserId: string; email: string }>(
        `/portal/students/${studentId}/portal-password-reset`,
        scope,
        {},
      ),
  });
}
