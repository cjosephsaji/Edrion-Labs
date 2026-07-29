'use client';

import { get, set } from 'idb-keyval';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StorageObjectDto } from '@edrion/schemas';
import { useStudentClient } from './student-client';

export type StudentRequestStatus = 'submitted' | 'in_review' | 'needs_info' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled' | 'expired';

export interface StudentRequestEvent {
  id: string;
  seq: number;
  eventType: string;
  actorKind: 'student' | 'staff' | 'system';
  actorRole: string | null;
  actorName?: string | null;
  note: string | null;
  createdAt: string;
}

export interface StudentRequest {
  id: string;
  humanCode: string;
  type: 'leave_request' | 'document_request' | string;
  typeLabel: string;
  category: string;
  summary: string;
  payload: Record<string, unknown>;
  attachments: RequestAttachment[];
  status: StudentRequestStatus;
  displayStatus: StudentRequestStatus;
  decisionNote: string | null;
  needsInfoQuestion: string | null;
  assignedUserId: string | null;
  assignedRole: string;
  submittedAt: string;
  slaDueAt: string | null;
  producesDocument: boolean;
  canCancel: boolean;
  fulfilmentDocumentId: string | null;
  version: number;
  expectedWorkingDays?: number;
  expectationSource?: 'median' | 'sla';
  events?: StudentRequestEvent[];
}

export interface RequestAttachment {
  storage_object_id: string;
  filename: string;
  mime: string;
  bytes: number;
}

export interface RequestTypeInfo {
  key: string;
  label: string;
  category: string;
  slaDays: number;
  enabled: boolean;
  producesDocument: boolean;
}

export interface DocumentCatalogItem {
  subtypeKey: string;
  docType: string;
  name: string;
  description: string | null;
  templateId: string | null;
  requiresSignOff: boolean;
  enabled: boolean;
  reason: string | null;
  deliveryModes: string[];
  requiresPayment: boolean;
  feeAmountMinor: number;
  family: string;
}
export interface VaultDocument {
  id: string;
  title: string;
  docType: string;
  issuedAt: string;
  revokedAt: string | null;
  hasFile: boolean;
  pickupReady?: boolean;
  deliveryMode?: string | null;
  pickupNote?: string | null;
}

type Cached<T> = { value: T; cachedAt: number };
const listCache = 'student:requests:list:v1';
const detailCache = (id: string) => `student:requests:detail:${id}:v1`;

async function cacheFirst<T>(key: string, live: () => Promise<T>): Promise<{ value: T; cachedAt: number | null }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await get<Cached<T>>(key);
    if (cached) return cached;
  }
  try {
    const value = await live();
    const cachedAt = Date.now();
    await set(key, { value, cachedAt } satisfies Cached<T>);
    return { value, cachedAt: null };
  } catch (error) {
    const cached = await get<Cached<T>>(key);
    if (cached) return cached;
    throw error;
  }
}

export function useRequestTypes() {
  const client = useStudentClient();
  return useQuery({ queryKey: ['student', 'requests', 'types'], queryFn: () => client.get<{ types: RequestTypeInfo[]; documentCatalog: DocumentCatalogItem[] }>('/requests/types') });
}

export function useLeavePreview(start: string, end: string) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'requests', 'leave-preview', start, end],
    queryFn: () => client.get<{ sessions: Array<{ sessionId: string; date: string; subjectId: string | null; period: string }>; sessionCount: number; subjectCount: number }>(`/requests/leave-preview?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
    enabled: Boolean(start && end && end >= start),
  });
}

export function useStudentRequests() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'requests', 'list'],
    queryFn: () => cacheFirst(listCache, () => client.get<{ items: StudentRequest[]; nextCursor: string | null }>('/requests?limit=50')),
    staleTime: 30_000,
  });
}

export function useStudentRequest(id: string) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'requests', id],
    queryFn: () => cacheFirst(detailCache(id), () => client.get<StudentRequest>(`/requests/${id}`)),
    enabled: Boolean(id),
  });
}

export function useSubmitRequest() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: { type: string; payload: Record<string, unknown>; attachments: RequestAttachment[] }; idempotencyKey: string }) =>
      client.request<StudentRequest>('/requests', { method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'requests'] }),
  });
}

export function useStudentRequestAction(id: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: { action: 'cancel' | 'reply'; body: Record<string, unknown> }) => client.post<StudentRequest>(`/requests/${id}/${action}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'requests'] }),
  });
}

export function useRequestUpload() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: async (file: File): Promise<RequestAttachment> => {
      const row = await client.upload<StorageObjectDto>('request_attachment', file);
      return { storage_object_id: row.id, filename: row.filename ?? file.name, mime: row.mimeType, bytes: row.sizeBytes };
    },
  });
}

export function useStudentVault(enabled = true) {
  const client = useStudentClient();
  return useQuery({ queryKey: ['student', 'requests', 'vault'], queryFn: () => client.get<{ items: VaultDocument[] }>('/requests/documents'), enabled });
}
