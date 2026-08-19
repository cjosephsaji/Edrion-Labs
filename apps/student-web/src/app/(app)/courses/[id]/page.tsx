'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  FileText,
  GraduationCap,
  Megaphone,
  UserRound,
} from 'lucide-react';
import { Card, PageHeader } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';

type Course = {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  professorName: string | null;
};
type Announcement = {
  id: string;
  title: string;
  body: string | null;
  postedAt: string;
};
type SyllabusModule = {
  weekNo: number;
  title: string;
  topics: string[];
  covered: boolean;
  isCurrentWeek: boolean;
};
type Material = {
  id: string;
  title: string;
  kindLabel: string;
  weekNo: number | null;
  description: string | null;
};
type Project = { id: string; title: string; dueDate: string | null };
type About = {
  officeHours: string | null;
  gradingScheme: Array<{ component: string; weightPct: number }>;
  attendance: {
    present: number;
    total: number;
    requiredPct: number;
    belowThreshold: boolean;
    warningLine: string | null;
  };
};

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const api = useStudentApi();
  const courses = useStudentList<{ items: Course[] }>('courses', '/student/courses');
  const announcements = useQuery({
    queryKey: ['student', 'courses', id, 'announcements'],
    queryFn: () => api.get<{ items: Announcement[] }>(`/student/courses/${id}/announcements`),
  });
  const syllabus = useQuery({
    queryKey: ['student', 'courses', id, 'syllabus'],
    queryFn: () => api.get<{ modules: SyllabusModule[] }>(`/student/courses/${id}/syllabus`),
  });
  const materials = useQuery({
    queryKey: ['student', 'courses', id, 'materials'],
    queryFn: () => api.get<{ items: Material[] }>(`/student/courses/${id}/materials`),
  });
  const projects = useQuery({
    queryKey: ['student', 'courses', id, 'projects'],
    queryFn: () => api.get<{ items: Project[] }>(`/student/courses/${id}/projects`),
  });
  const about = useQuery({
    queryKey: ['student', 'courses', id, 'about'],
    queryFn: () => api.get<About>(`/student/courses/${id}/about`),
  });

  const course = courses.data?.items.find((item) => item.id === id);
  const name = course?.name ?? search.get('name') ?? 'Course';
  const code = course?.code ?? search.get('code');
  const professor = course?.professorName ?? search.get('professor');
  const firstError = announcements.error ?? syllabus.error ?? materials.error ?? projects.error ?? about.error;
  const loading = announcements.isLoading || syllabus.isLoading || materials.isLoading || projects.isLoading || about.isLoading;
  const attendance = about.data?.attendance;
  const attendancePct = attendance?.total
    ? Math.round((attendance.present / attendance.total) * 100)
    : null;

  usePetrosPage(
    course
      ? {
          title: name,
          summary: [code, professor ? `taught by ${professor}` : null].filter(Boolean).join(' · '),
          candidates: [
            {
              ref: course.id,
              entityType: 'course',
              entityId: course.id,
              title: name,
              summary: [code, professor].filter(Boolean).join(' · '),
              href: `/courses/${course.id}`,
            },
            ...(materials.data?.items ?? []).map((item) => ({
              ref: `material:${item.id}`,
              entityType: 'material' as const,
              entityId: item.id,
              title: item.title,
              summary: 'Course material',
              href: `/courses/${id}`,
            })),
          ],
        }
      : null,
  );

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      <Link href="/courses" className="focus-ring mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--s-accentDeep)]">
        <ArrowLeft aria-hidden="true" size={16} /> All courses
      </Link>

      <section>
        <PageHeader
          eyebrow={code ?? 'Your course'}
          title={name}
          description={[
            professor ? `Taught by ${professor}` : 'Professor details will appear here.',
            course?.credits ? `${course.credits} credits` : null,
          ].filter(Boolean).join(' · ')}
          actions={course ? <PetrosAskButton candidateRef={course.id} label={name} /> : undefined}
        />
      </section>

      {firstError ? (
        <ErrorState description={formatApiError(firstError)} onRetry={() => window.location.reload()} />
      ) : loading ? (
        <LoadingBlock label={`Opening ${name}…`} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.75fr)]">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[var(--s-accentSoft)] p-2 text-[var(--s-accentDeep)]"><BookOpen aria-hidden="true" size={20} /></span>
                <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--s-muted)]">Course plan</p><h2 className="text-xl text-[var(--s-ink)]">Syllabus</h2></div>
              </div>
              {syllabus.data?.modules.length ? (
                <div className="mt-4 divide-y divide-[var(--s-bd1)]">
                  {syllabus.data.modules.map((module) => (
                    <div key={`${module.weekNo}:${module.title}`} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong className="text-[var(--s-ink)]">Week {module.weekNo} · {module.title}</strong>
                        <span className="text-xs font-semibold text-[var(--s-muted)]">{module.covered ? 'Covered' : module.isCurrentWeek ? 'Current' : 'Upcoming'}</span>
                      </div>
                      {module.topics.length ? <p className="mt-1 text-sm leading-6 text-[var(--s-muted)]">{module.topics.join(' · ')}</p> : null}
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={BookOpen} title="No syllabus published yet" description="Your professor’s weekly course plan will appear here." actionHref="/courses" actionLabel="Back to courses" />}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3"><FileText aria-hidden="true" className="text-[var(--s-accentDeep)]" size={20} /><h2 className="text-xl text-[var(--s-ink)]">Course materials</h2></div>
                <Link href="/materials" className="text-sm font-semibold text-[var(--s-accentDeep)]">All materials</Link>
              </div>
              {materials.data?.items.length ? (
                <div className="mt-4 grid gap-3">
                  {materials.data.items.map((material) => (
                    <a
                      key={material.id}
                      href={api.fileUrl(`/student/materials/${material.id}/file`)}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring flex items-start justify-between gap-4 rounded-xl border border-[var(--s-bd1)] p-4 transition hover:border-[var(--s-accentBd)] hover:bg-[var(--s-cardAlt)]"
                    >
                      <span><strong className="text-[var(--s-ink)]">{material.title}</strong><span className="mt-1 block text-sm text-[var(--s-muted)]">{[material.kindLabel, material.weekNo ? `Week ${material.weekNo}` : null, material.description].filter(Boolean).join(' · ')}</span></span>
                      <ArrowRight aria-hidden="true" className="mt-1 shrink-0 text-[var(--s-accentDeep)]" size={17} />
                    </a>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-[var(--s-muted)]">No files have been attached to this course yet.</p>}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3"><GraduationCap aria-hidden="true" className="text-[var(--s-accentDeep)]" size={21} /><h2 className="text-xl text-[var(--s-ink)]">Assignments and projects</h2></div>
              {projects.data?.items.length ? (
                <div className="mt-4 grid gap-3">
                  {projects.data.items.map((project) => (
                    <Link key={project.id} href={`/assignments/${project.id}`} className="focus-ring rounded-xl border border-[var(--s-bd1)] p-4 transition hover:border-[var(--s-accentBd)]">
                      <strong className="text-[var(--s-ink)]">{project.title}</strong>
                      <span className="mt-1 block text-sm text-[var(--s-muted)]">{project.dueDate ? `Due ${new Date(project.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'No due date'}</span>
                    </Link>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-[var(--s-muted)]">No course projects are currently published.</p>}
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3"><Megaphone aria-hidden="true" className="text-[var(--s-accentDeep)]" size={19} /><h2 className="text-lg text-[var(--s-ink)]">Announcements</h2></div>
              {announcements.data?.items.length ? (
                <div className="mt-4 space-y-4">
                  {announcements.data.items.slice(0, 4).map((item) => (
                    <article key={item.id} className="border-b border-[var(--s-bd1)] pb-4 last:border-0 last:pb-0">
                      <strong className="text-sm text-[var(--s-ink)]">{item.title}</strong>
                      {item.body ? <p className="mt-1 text-sm leading-6 text-[var(--s-muted)]">{item.body}</p> : null}
                    </article>
                  ))}
                </div>
              ) : <p className="mt-3 text-sm text-[var(--s-muted)]">No course announcements yet.</p>}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3"><UserRound aria-hidden="true" className="text-[var(--s-accentDeep)]" size={19} /><h2 className="text-lg text-[var(--s-ink)]">Course details</h2></div>
              <dl className="mt-4 space-y-4 text-sm">
                <div><dt className="text-[var(--s-muted)]">Professor</dt><dd className="mt-1 font-semibold text-[var(--s-ink)]">{professor || 'To be confirmed'}</dd></div>
                <div><dt className="text-[var(--s-muted)]">Office hours</dt><dd className="mt-1 font-semibold text-[var(--s-ink)]">{about.data?.officeHours || 'Not published'}</dd></div>
                <div><dt className="text-[var(--s-muted)]">Attendance</dt><dd className="mt-1 font-semibold text-[var(--s-ink)]">{attendancePct === null ? 'No attendance recorded' : `${attendancePct}% · ${attendance?.present}/${attendance?.total}`}</dd></div>
              </dl>
              {attendance?.warningLine ? <p className="mt-4 rounded-xl bg-[var(--s-warningSoft)] p-3 text-sm text-[var(--s-inkSoft)]">{attendance.warningLine}</p> : null}
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3"><CalendarClock aria-hidden="true" className="text-[var(--s-accentDeep)]" size={19} /><h2 className="text-lg text-[var(--s-ink)]">Grading</h2></div>
              {about.data?.gradingScheme.length ? (
                <dl className="mt-4 space-y-3 text-sm">
                  {about.data.gradingScheme.map((item) => <div key={item.component} className="flex justify-between gap-4"><dt className="text-[var(--s-muted)]">{item.component}</dt><dd className="font-semibold text-[var(--s-ink)]">{item.weightPct}%</dd></div>)}
                </dl>
              ) : <p className="mt-3 text-sm text-[var(--s-muted)]">The grading breakdown has not been published.</p>}
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
