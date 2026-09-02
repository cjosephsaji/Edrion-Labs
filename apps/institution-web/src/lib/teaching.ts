'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

export interface TeachingAssignment {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  teacherId: string | null;
  teacherName: string | null;
  isMine: boolean;
  /** Class id plus any course teaching this subject — where its content can live. */
  contextIds: string[];
  counts: { materials: number; notes: number; drafts: number; updates: number };
}

export interface AssignmentDetail extends TeachingAssignment {
  studentCount: number;
}

/**
 * The subjects the signed-in user can publish to. A teacher gets their own; an owner or admin
 * with no staff record gets every assignment, labelled with the teacher who owns it.
 */
export function useMyTeaching() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['teaching', 'mine', scopeKey(scope)],
    queryFn: () =>
      client.get<{ items: TeachingAssignment[]; scope: 'own' | 'all' }>('/portal/teaching/mine', scope),
    placeholderData: keepPreviousData,
  });
}

export function useAssignment(classId: string, subjectId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['teaching', 'assignment', scopeKey(scope), classId, subjectId],
    queryFn: () => client.get<AssignmentDetail>(`/portal/teaching/${classId}/${subjectId}`, scope),
    enabled: Boolean(classId && subjectId),
  });
}

/** Upload and publish a material in one action — no separate "add" step to forget. */
export function usePublishMaterial(classId: string, subjectId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title }: { file: File; title?: string }) => {
      const params = new URLSearchParams({
        filename: file.name,
        contextType: 'class',
        contextId: classId,
        subjectId,
      });
      if (title?.trim()) params.set('title', title.trim());
      return client.upload<{ id: string; title: string }>(
        `/portal/course-content/materials/publish?${params.toString()}`,
        scope,
        file,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-content'] });
      void qc.invalidateQueries({ queryKey: ['teaching'] });
    },
  });
}
