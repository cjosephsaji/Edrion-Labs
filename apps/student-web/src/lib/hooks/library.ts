'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AchievementsOverviewDto,
  CreateDebateInput,
  CreateMockExamInput,
  DebateDto,
  GenerateVisualInput,
  GraphSpec,
  LibraryOverviewDto,
  MockExamDto,
} from '@edrion/schemas';
import { useStudentClient } from '../student-client';

export function useLibrary() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library'],
    queryFn: () => client.get<LibraryOverviewDto>('/library'),
  });
}

export function useLibraryItem(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'item', id],
    queryFn: () => client.get(`/library/items/${id}`),
    enabled: !!id,
  });
}

export function useDeck(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'library', 'deck', id],
    queryFn: () => client.get(`/library/decks/${id}`),
    enabled: !!id,
  });
}

export function useAchievements() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'achievements'],
    queryFn: () => client.get<AchievementsOverviewDto>('/achievements'),
  });
}

export function useMockExamDefaults() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'lab', 'mock', 'defaults'],
    queryFn: () =>
      client.get<{ subjectLabel: string; topics: string[] }>('/lab/mock-exams/defaults'),
  });
}

export function useMockExam(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'lab', 'mock', id],
    queryFn: () => client.get<MockExamDto>(`/lab/mock-exams/${id}`),
    enabled: !!id,
  });
}

export function useCreateMockExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMockExamInput) =>
      client.post<MockExamDto>('/lab/mock-exams', input),
    onSuccess: (data) => qc.setQueryData(['student', 'lab', 'mock', data.id], data),
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
    mutationFn: (input: CreateDebateInput) =>
      client.post<DebateDto>('/lab/debates', input),
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

export function useGenerateVisual() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (input: GenerateVisualInput) => client.post<GraphSpec>('/lab/visuals', input),
  });
}

export function useStartMockExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<MockExamDto>(`/lab/mock-exams/${id}/start`),
    onSuccess: (data) => qc.setQueryData(['student', 'lab', 'mock', data.id], data),
  });
}

export function useSaveMockAnswer() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: ({
      examId,
      questionId,
      body,
    }: {
      examId: string;
      questionId: string;
      body: { choiceKey?: string; answerText?: string; flagged?: boolean };
    }) =>
      client.request(`/lab/mock-exams/${examId}/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  });
}

export function useFinishMockExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<MockExamDto>(`/lab/mock-exams/${id}/finish`),
    onSuccess: (data) => qc.setQueryData(['student', 'lab', 'mock', data.id], data),
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

export function useRetakeWeakMockExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<MockExamDto>(`/lab/mock-exams/${id}/retake-weak`),
    onSuccess: (data) => {
      qc.setQueryData(['student', 'lab', 'mock', data.id], data);
    },
  });
}

export function useRegenerateVisual() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: ({ spec, direction }: { spec: GraphSpec; direction: string }) =>
      client.post<GraphSpec>('/lab/visuals/regenerate', { spec, direction }),
  });
}

export function useSaveVisual() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ spec, title, topic }: { spec: GraphSpec; title: string; topic?: string }) =>
      client.post('/lab/visuals/save', { spec, title, topic }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'library'] }),
  });
}

function invalidateLibrary(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['student', 'library'] });
}

export function useUploadLibraryItem() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: File[]) => {
      const uploads = await Promise.all(
        files.map((file) => {
          const kind = file.type.startsWith('image/') ? 'library_upload' : 'library_upload';
          return client.upload<{ id: string }>(kind, file);
        }),
      );
      return client.post<{ id: string }>('/library/items', {
        objectIds: uploads.map((u) => u.id),
        title: files[0]?.name.replace(/\.[^.]+$/, '') ?? 'Upload',
      });
    },
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
    mutationFn: (input?: { focusConcept?: string }) =>
      client.post<{ sessionId: string }>(`/library/items/${itemId}/tutor`, input ?? {}),
  });
}

export function useLibraryConceptMap(itemId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.post<{ id: string; kind: string; title: string }>(`/library/items/${itemId}/concept-map`),
    onSuccess: () => {
      invalidateLibrary(qc);
      qc.invalidateQueries({ queryKey: ['student', 'library', 'item', itemId] });
    },
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
