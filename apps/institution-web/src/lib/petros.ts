'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';

/** Petros client types (mirror @edrion/schemas petros contracts). */
export interface PetrosBlock {
  type: 'text' | 'tool_activity' | 'artifact_ref' | 'question' | 'confirmation_ref' | 'attachment_ref';
  text?: string;
  toolName?: string;
  status?: string;
  summary?: string;
  artifactId?: string;
  attachmentId?: string;
  question?: string;
  options?: { id: string; label: string }[];
  answeredOptionId?: string | null;
  runId?: string;
}

export interface PetrosConversation {
  id: string;
  title: string | null;
  pinned: boolean;
  status: string;
  lastMessageAt: string | null;
  version: number;
  createdAt: string;
}

export interface PetrosMessage {
  id: string;
  role: 'user' | 'assistant';
  content: PetrosBlock[];
  status: string;
  runId: string | null;
  createdAt: string;
}

export interface PetrosPendingTurn {
  id: string;
  kind: 'confirmation' | 'question';
  runId: string | null;
  payload: Record<string, unknown>;
  expiresAt: string;
}

export interface PetrosDetail {
  conversation: PetrosConversation;
  messages: PetrosMessage[];
  pendingTurn: PetrosPendingTurn | null;
}

export interface PetrosCapabilities {
  canUploadFiles: boolean;
  canGenerateDocuments: boolean;
  canGenerateAssessments: boolean;
  suggestions: string[];
  toolNames: string[];
}

export type PetrosStreamEvent = Record<string, unknown> & { type: string };

export function usePetrosConversations() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['petros', 'conversations', scope],
    queryFn: () =>
      client.get<{ items: PetrosConversation[]; total: number }>('/portal/petros/conversations?pageSize=50', scope),
  });
}

export function usePetrosDetail(id: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['petros', 'conversation', id],
    queryFn: () => client.get<PetrosDetail>(`/portal/petros/conversations/${id}`, scope),
    enabled: Boolean(id),
  });
}

export function usePetrosCapabilities() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['petros', 'capabilities'],
    queryFn: () => client.get<PetrosCapabilities>('/portal/petros/capabilities', scope),
  });
}

export function useCreatePetrosConversation() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string }) =>
      client.post<PetrosConversation>('/portal/petros/conversations', scope, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['petros', 'conversations'] }),
  });
}

export function useUpdatePetrosConversation() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; pinned?: boolean; status?: string; version: number }) =>
      client.patch<PetrosConversation>(`/portal/petros/conversations/${id}`, scope, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['petros'] }),
  });
}

/** Streaming turn entrypoints — all resolve when the SSE stream ends. */
export function usePetrosStream() {
  const client = usePortalClient();
  const { scope } = useScope();
  return {
    sendTurn: (conversationId: string, message: string, attachmentIds: string[], onEvent: (e: PetrosStreamEvent) => void) =>
      client.stream(`/portal/petros/conversations/${conversationId}/turns`, scope, { message, attachmentIds }, onEvent as never),
    answer: (pendingTurnId: string, optionId: string, onEvent: (e: PetrosStreamEvent) => void) =>
      client.stream(`/portal/petros/turns/${pendingTurnId}/answer`, scope, { optionId }, onEvent as never),
    confirm: (runId: string, onEvent: (e: PetrosStreamEvent) => void) =>
      client.stream(`/portal/petros/runs/${runId}/confirm`, scope, {}, onEvent as never),
    reject: (runId: string, onEvent: (e: PetrosStreamEvent) => void) =>
      client.stream(`/portal/petros/runs/${runId}/reject`, scope, {}, onEvent as never),
  };
}

export function usePetrosArtifact(id: string | null) {
  const client = usePortalClient();
  return {
    downloadUrl: id ? client.fileUrl(`/portal/petros/artifacts/${id}/download`) : '',
  };
}
