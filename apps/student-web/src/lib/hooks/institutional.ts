'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnalyticsRange,
  ClassListItemDto,
  CourseListItemDto,
  DocumentsSurfaceDto,
  FeesSurfaceDto,
  HomeworkDetailDto,
  HomeworkListFilter,
  HostelSurfaceDto,
  ReportCardDetailDto,
  ReportCardListDto,
  StudentAnalyticsDto,
  StudentAssignmentDetailDto,
  StudentCalendarDto,
  StudentExamsDto,
  TransportSurfaceDto,
  UpsertHomeworkAnswerInput,
} from '@edrion/schemas';
import { useStudentClient } from '../student-client';

export function useHomeworkList(filter: HomeworkListFilter = 'all') {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'homework', filter],
    queryFn: () => client.get<{ items: unknown[] }>(`/homework?filter=${filter}`),
  });
}

export function useHomework(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'homework', id],
    queryFn: () => client.get<HomeworkDetailDto>(`/homework/${id}`),
    enabled: !!id,
  });
}

export function useUpsertHomeworkAnswer(homeworkId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, body }: { questionId: string; body: UpsertHomeworkAnswerInput }) =>
      client.patch(`/homework/${homeworkId}/answers/${questionId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'homework', homeworkId] }),
  });
}

export function useAssignmentsList(filter = 'all') {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'assignments', filter],
    queryFn: () => client.get<{ items: unknown[] }>(`/assignments?filter=${filter}`),
  });
}

export function useAssignment(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'assignment', id],
    queryFn: () => client.get<StudentAssignmentDetailDto>(`/assignments/${id}`),
    enabled: !!id,
  });
}

export function useClasses() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'classes'],
    queryFn: () => client.get<{ items: ClassListItemDto[] }>('/classes'),
  });
}

export function useClassAbout(subjectClassId: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'classes', subjectClassId, 'about'],
    queryFn: () => client.get(`/classes/${subjectClassId}/about`),
    enabled: !!subjectClassId,
  });
}

export function useClassStream(subjectClassId: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'classes', subjectClassId, 'stream'],
    queryFn: () =>
      client.get<{
        items: {
          id: string;
          kind: string;
          title: string | null;
          body: string | null;
          topicKey: string | null;
          requiresAck: boolean;
          acked: boolean;
          postedAt: string;
        }[];
      }>(`/classes/${subjectClassId}/stream`),
    enabled: !!subjectClassId,
  });
}

export function useClassMaterials(subjectClassId: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'classes', subjectClassId, 'materials'],
    queryFn: () =>
      client.get<{
        items: {
          id: string;
          title: string;
          kindLabel: string;
          weekNo: number | null;
          description: string | null;
        }[];
      }>(`/classes/${subjectClassId}/materials`),
    enabled: !!subjectClassId,
  });
}

export function useCourses() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'courses'],
    queryFn: () => client.get<{ items: CourseListItemDto[] }>('/courses'),
  });
}

export function useCourseAbout(courseId: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'courses', courseId, 'about'],
    queryFn: () => client.get(`/courses/${courseId}/about`),
    enabled: !!courseId,
  });
}

export function useAnalytics(range: AnalyticsRange = 'week') {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'analytics', range],
    queryFn: () => client.get<StudentAnalyticsDto>(`/analytics?range=${range}`),
  });
}

export function useCalendar() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'calendar'],
    queryFn: () => client.get<StudentCalendarDto>('/calendar'),
  });
}

export function useReportCards() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'report-cards'],
    queryFn: () => client.get<ReportCardListDto>('/report-cards'),
  });
}

export function useReportCard(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'report-cards', id],
    queryFn: () => client.get<ReportCardDetailDto>(`/report-cards/${id}`),
    enabled: !!id,
  });
}

export function useExams() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'exams'],
    queryFn: () => client.get<StudentExamsDto>('/exams'),
  });
}

export function useFeesSurface() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'surfaces', 'fees'],
    queryFn: () => client.get<FeesSurfaceDto>('/surfaces/fees'),
  });
}

export function useTransportSurface() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'surfaces', 'transport'],
    queryFn: () => client.get<TransportSurfaceDto>('/surfaces/transport'),
  });
}

export function useHostelSurface() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'surfaces', 'hostel'],
    queryFn: () => client.get<HostelSurfaceDto>('/surfaces/hostel'),
  });
}

export function useDocumentsSurface() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'surfaces', 'documents'],
    queryFn: () => client.get<DocumentsSurfaceDto>('/surfaces/documents'),
  });
}
