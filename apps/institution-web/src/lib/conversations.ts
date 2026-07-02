'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { Target } from './recipients';

export interface ConversationParticipant {
  participantType: string;
  participantId: string;
  label: string;
  sub: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  isGroup: boolean;
  name: string;
  participants: ConversationParticipant[];
  participantCount: number;
  lastMessage: { body: string; createdAt: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  muted: boolean;
  archived: boolean;
  closed: boolean;
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  ready: boolean;
}

export interface MessageDto {
  id: string;
  body: string;
  senderType: string;
  senderId: string;
  senderName: string;
  replyToId: string | null;
  createdAt: string;
  mine: boolean;
  readByOthers: boolean;
  attachments: MessageAttachment[];
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

type Filter = 'all' | 'unread' | 'archived';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

export function useConversations(filter: Filter, search: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['conversations', scopeKey(scope), filter, search],
    queryFn: () =>
      client.get<Paged<ConversationSummary>>(
        `/portal/conversations?filter=${filter}&pageSize=100${search ? `&search=${encodeURIComponent(search)}` : ''}`,
        scope,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });
}

export function useConversation(id: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['conversation', scopeKey(scope), id],
    queryFn: () => client.get<ConversationSummary>(`/portal/conversations/${id}`, scope),
    enabled: !!id,
  });
}

export function useMessages(id: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['conversation', scopeKey(scope), id, 'messages'],
    queryFn: () => client.get<MessageDto[]>(`/portal/conversations/${id}/messages?pageSize=200`, scope),
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function useConversationMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidateAll = () => qc.invalidateQueries({ queryKey: ['conversations'] });
  const invalidateOne = (id: string) => {
    qc.invalidateQueries({ queryKey: ['conversation'] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
    void id;
  };

  const create = useMutation({
    mutationFn: (body: { title?: string | null; isGroup?: boolean; targets: Target[]; body?: string | null }) =>
      client.post<ConversationSummary>('/portal/conversations', scope, body),
    onSuccess: invalidateAll,
  });
  const send = useMutation({
    mutationFn: ({ id, body, replyToId }: { id: string; body: string; replyToId?: string | null }) =>
      client.post<{ id: string; createdAt: string }>(`/portal/conversations/${id}/messages`, scope, { body, replyToId }),
    onSuccess: (_d, v) => invalidateOne(v.id),
  });
  const uploadAttachment = useMutation({
    mutationFn: ({ id, messageId, file }: { id: string; messageId: string; file: File }) =>
      client.upload<MessageAttachment>(`/portal/conversations/${id}/messages/${messageId}/attachments`, scope, file),
    onSuccess: (_d, v) => invalidateOne(v.id),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => client.post(`/portal/conversations/${id}/read`, scope, {}),
    onSuccess: invalidateAll,
  });
  const addParticipants = useMutation({
    mutationFn: ({ id, targets }: { id: string; targets: Target[] }) =>
      client.post(`/portal/conversations/${id}/participants`, scope, { targets }),
    onSuccess: (_d, v) => invalidateOne(v.id),
  });
  const removeParticipant = useMutation({
    mutationFn: ({ id, type, pid }: { id: string; type: string; pid: string }) =>
      client.post(`/portal/conversations/${id}/participants/${type}/${pid}/remove`, scope, {}),
    onSuccess: (_d, v) => invalidateOne(v.id),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/conversations/${id}`, scope, body),
    onSuccess: (_d, v) => invalidateOne(v.id),
  });
  return { create, send, uploadAttachment, markRead, addParticipants, removeParticipant, update };
}
