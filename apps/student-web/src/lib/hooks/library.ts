'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AchievementsOverviewDto,
  CreateDebateInput,
  DebateDto,
  LibraryOverviewDto,
} from '@edrion/schemas';
import { useStudentClient } from '../student-client';

export type LibraryItemDto = {
  item: {
    id: string;
    kind: string;
    title: string;
    collectionId: string | null;
    pageCount: number | null;
    pagesDone: number;
    status: 'queued' | 'reading' | 'needs_ocr_confirm' | 'ready' | 'error';
    ingestStage?: string | null;
    errorMessage: string | null;
    extractedTextReady: boolean;
    aiRead: boolean;
    origin: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  pages: Array<{
    pageIndex: number;
    objectId: string;
    text: string;
    ocrConfidence: number | null;
    needsConfirm: boolean;
    mimeType?: string;
    filename?: string;
  }>;
  artifacts: Array<{
    id: string;
    kind: string;
    title: string;
    fromLabel: string;
    createdAt: string;
  }>;
};

export type DeckDto = {
  id: string;
  title: string;
  fromLabel: string;
  itemId: string | null;
  cardCount: number;
  dueToday: number;
  freshness: 'fresh' | 'fading' | 'due';
  cards: Array<{
    id: string;
    sequence: number;
    prompt: string;
    answer: string;
    sourcePage: number | null;
    nextDueAt: string;
    dueNow: boolean;
  }>;
};

function invalidateLibrary(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['student', 'library'] });
}

export function useLibrary(q?: string) {
  const client = useStudentClient();
  const trimmed = q?.trim() ?? '';
  return useQuery({
    queryKey: ['student', 'library', trimmed],
    queryFn: () =>
      client.get<LibraryOverviewDto>(trimmed ? `/library?q=${encodeURIComponent(trimmed)}` : '/library'),
    refetchInterval: (query) => {
      const uploads = query.state.data?.uploads ?? [];
      const busy = uploads.some((u) => u.status === 'reading' || u.status === 'queued');
      return busy ? 1500 : false;
    },
  });
}

export function useLibraryItem(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'item', id],
    queryFn: () => client.get<LibraryItemDto>(`/library/items/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.item.status;
      return status === 'reading' || status === 'queued' ? 1500 : false;
    },
  });
}

export type LibraryCollectionDto = {
  id: string;
  name: string;
  color: string | null;
  count: number;
  items: Array<{
    item: {
      id: string;
      kind: string;
      title: string;
      status: string;
      errorMessage?: string | null;
      pageCount: number | null;
      aiRead: boolean;
      createdAt: string;
    };
    artifacts: Array<{
      id: string;
      kind: string;
      title: string;
      fromLabel: string;
      freshness?: 'fresh' | 'fading' | 'due';
      createdAt: string;
    }>;
    decks: Array<{
      id: string;
      title: string;
      fromLabel: string;
      createdAt: string;
    }>;
  }>;
};

export function useLibraryCollection(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'collection', id],
    queryFn: () => client.get<LibraryCollectionDto>(`/library/collections/${id}`),
    enabled: !!id,
  });
}

export function useDeck(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'deck', id],
    queryFn: () => client.get<DeckDto>(`/library/decks/${id}`),
    enabled: !!id,
  });
}

export function useLibraryArtifact(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'artifact', id],
    queryFn: () =>
      client.get<{
        id: string;
        itemId: string | null;
        kind: string;
        title: string;
        fromLabel: string;
        content: unknown;
      }>(`/library/artifacts/${id}`),
    enabled: !!id,
  });
}

export function useQuizAttempt(artifactId: string | undefined, attemptId: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'quiz-attempt', artifactId, attemptId],
    queryFn: () =>
      client.get<{
        attemptId: string;
        artifactId: string;
        results: Array<{ index: number; verdict: string; note: string; sourcePage?: number }>;
        patterns: string[];
        finishedAt: string;
      }>(`/library/artifacts/${artifactId}/attempts/${attemptId}`),
    enabled: !!artifactId && !!attemptId,
  });
}

export function useUploadLibraryItem() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const uploads = await Promise.all(
        files.map((file) => client.upload<{ id: string }>('library_upload', file)),
      );
      return client.post<LibraryItemDto>('/library/items', {
        objectIds: uploads.map((u) => u.id),
        title: files[0]?.name.replace(/\.[^.]+$/, '') ?? 'Upload',
      });
    },
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useConfirmOcr(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post<LibraryItemDto>(`/library/items/${itemId}/confirm-ocr`),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] });
    },
  });
}

export function usePatchPageText(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageIndex, text }: { pageIndex: number; text: string }) =>
      client.patch(`/library/items/${itemId}/pages/${pageIndex}`, { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] }),
  });
}

export function useRetryIngest(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post<LibraryItemDto>(`/library/items/${itemId}/retry`),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] });
    },
  });
}

export function useDeleteLibraryItem() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => client.del<{ ok: boolean }>(`/library/items/${itemId}`),
    onSuccess: (_data, itemId) => {
      invalidateLibrary(qc);
      qc.removeQueries({ queryKey: ['student', 'library', 'item', itemId] });
    },
  });
}

export function useReviewCard(deckId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { cardId: string; result: 'got_it' | 'again' }) =>
      client.post<{ ok: boolean; nextDueAt: string; dueToday: number }>(
        `/library/decks/${deckId}/review`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', 'library', 'deck', deckId] });
      invalidateLibrary(qc);
    },
  });
}

export function usePatchDeck(deckId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string; cardOrder?: string[] }) =>
      client.patch<DeckDto>(`/library/decks/${deckId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', 'library', 'deck', deckId] });
      invalidateLibrary(qc);
    },
  });
}

export function useAddCard(deckId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { prompt: string; answer: string }) =>
      client.post(`/library/decks/${deckId}/cards`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'library', 'deck', deckId] }),
  });
}

export function usePatchCard(deckId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, ...body }: { cardId: string; prompt?: string; answer?: string }) =>
      client.patch(`/library/decks/${deckId}/cards/${cardId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'library', 'deck', deckId] }),
  });
}

export function useDeleteCard(deckId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => client.del(`/library/decks/${deckId}/cards/${cardId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'library', 'deck', deckId] }),
  });
}

export function useSubmitQuizAttempt(artifactId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      answers: Array<{ itemIndex: number; choiceKey?: string; answerText?: string }>;
    }) =>
      client.post<{
        attemptId: string;
        results: Array<{ index: number; verdict: string; note: string; sourcePage?: number }>;
        patterns: string[];
      }>(`/library/artifacts/${artifactId}/quiz-attempt`, body),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ['student', 'library', 'artifact', artifactId] });
    },
  });
}

export type GenerationKind = 'summarize' | 'flashcards' | 'quiz';

export type GenerationFrame =
  | { type: 'start'; title: string; fromLabel: string; kind: string }
  | { type: 'section'; section: unknown; index: number }
  | { type: 'card'; card: unknown; index: number }
  | { type: 'item'; item: unknown; index: number }
  | { type: 'draft'; jobId: string; kind: string; proposals: unknown[]; title?: string; fromLabel?: string }
  | { type: 'saved'; artifactId?: string; deckId?: string; kind: string }
  | { type: 'error'; code: string; message: string };

export function useGenerationStream(itemId: string, kind: GenerationKind) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [frames, setFrames] = useState<GenerationFrame[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'draft' | 'saved' | 'error'>('idle');
  const [saved, setSaved] = useState<{ artifactId?: string; deckId?: string; noteId?: string } | null>(null);
  const [draft, setDraft] = useState<{ jobId: string; proposals: unknown[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connRef = useRef<{ close: () => void } | null>(null);

  const stop = useCallback(() => {
    connRef.current?.close();
    connRef.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    setFrames([]);
    setSaved(null);
    setDraft(null);
    setError(null);
    setStatus('streaming');
    const path = `/library/items/${itemId}/${kind}/stream`;
    connRef.current = client.sse(
      path,
      {
        onMessage: (frame) => {
          const data = frame.data;
          if (data === '[DONE]') return;
          const gen = data as GenerationFrame;
          setFrames((prev) => [...prev, gen]);
          if (gen.type === 'draft') {
            setDraft({ jobId: gen.jobId, proposals: gen.proposals });
            setStatus('draft');
          }
          if (gen.type === 'saved') {
            setSaved({ artifactId: gen.artifactId, deckId: gen.deckId });
            setStatus('saved');
            invalidateLibrary(qc);
            qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] });
          }
          if (gen.type === 'error') {
            setError(gen.message);
            setStatus('error');
          }
        },
        onError: (err) => {
          setError((err as Error).message ?? 'Stream failed');
          setStatus('error');
        },
      },
      { method: 'POST', body: {} },
    );
  }, [client, itemId, kind, qc, stop]);

  useEffect(() => () => stop(), [stop]);

  return { frames, status, saved, draft, error, start, stop };
}

export function useSaveGenerationDraft() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { jobId: string; kept: unknown[]; deck_id?: string }) =>
      client.post<{ saved: number; deckId?: string; artifactId?: string; noteId?: string }>(
        `/library/generation/${body.jobId}/save`,
        { kept: body.kept, deck_id: body.deck_id },
      ),
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useLibrarySummarize(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post(`/library/items/${itemId}/summarize`),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] });
    },
  });
}

export function useLibraryFlashcards(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post<{ deckId: string; title: string }>(`/library/items/${itemId}/flashcards`),
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useLibraryQuiz(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post(`/library/items/${itemId}/quiz`),
    onSuccess: () => invalidateLibrary(qc),
  });
}

export function useLibraryTutor(itemId: string) {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (input?: { focusConcept?: string; timeBudgetMinutes?: number }) =>
      client.post<{ sessionId: string }>(`/library/items/${itemId}/tutor`, input ?? {}),
  });
}

export function useLibraryGlossary(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.post<{ id: string; kind: string; title: string }>(`/library/items/${itemId}/glossary`),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] });
    },
  });
}

/* ── Lab hooks (kept in this module for historical bundling) ── */

export function useAchievements() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'achievements'],
    queryFn: () => client.get<AchievementsOverviewDto>('/achievements'),
  });
}

export function useDebateMotions() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'lab', 'debate', 'motions'],
    queryFn: () => client.get<{ motions: string[] }>('/lab/debates/motions'),
  });
}

export function useCreateDebate() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (input: CreateDebateInput) => client.post<DebateDto>('/lab/debates', input),
  });
}

export function useDebate(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'lab', 'debate', id],
    queryFn: () => client.get<DebateDto>(`/lab/debates/${id}`),
    enabled: !!id,
  });
}

export function useDebateLobby(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'lab', 'debate', id, 'lobby'],
    queryFn: () => client.get(`/lab/debates/${id}/lobby`),
    enabled: !!id,
  });
}

export function useSubmitDebateTurn() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      client.post<DebateDto>(`/lab/debates/${id}/turns`, { text }),
    onSuccess: (data) => qc.setQueryData(['student', 'lab', 'debate', data.id], data),
  });
}

export function useFinishDebate() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<DebateDto>(`/lab/debates/${id}/finish`),
    onSuccess: (data) => qc.setQueryData(['student', 'lab', 'debate', data.id], data),
  });
}

export function useJoinDebate() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (token: string) =>
      client.post<{ debateId: string }>(`/lab/debates/join/${token}`),
  });
}
