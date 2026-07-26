'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';

export interface InfoFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'mcq' | 'date' | 'file';
  options?: string[];
  required?: boolean;
  multiple?: boolean;
}
export interface InfoFileRef {
  fileName: string;
  storageKey: string;
  sizeBytes: number;
  contentType: string | null;
}
export interface InfoRequest {
  id: string;
  status: string;
  message: string | null;
  fields: InfoFieldDef[];
  responses: Record<string, unknown> | null;
  submittedAt: string | null;
  createdAt: string;
}

export function useInfoRequests(applicationId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['admission-info', applicationId],
    queryFn: () => client.get<{ items: InfoRequest[] }>(`/portal/admissions/${applicationId}/info-requests`, scope),
    enabled: !!applicationId,
  });
}

export function useCreateInfoRequest(applicationId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { message?: string | null; fields: InfoFieldDef[] }) =>
      client.post<{ request: InfoRequest; link: string }>(`/portal/admissions/${applicationId}/info-requests`, scope, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admission-info', applicationId] });
      qc.invalidateQueries({ queryKey: ['admissions'] });
    },
  });
}

/** Absolute URL to download a file a parent uploaded (staff review; cookie-authed). */
export function useInfoFileUrl() {
  const client = usePortalClient();
  return (requestId: string, storageKey: string) =>
    client.fileUrl(`/portal/admissions/info-requests/${requestId}/file?key=${encodeURIComponent(storageKey)}`);
}
