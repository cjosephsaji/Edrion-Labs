'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CURRICULUM_ALIGNMENT_VERSION, readCurriculumCompatibility } from '@edrion/schemas';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  FileText,
  GraduationCap,
  Megaphone,
  UserRound,
} from 'lucide-react';
import { DocumentViewer } from '@/components/materials/document-viewer';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { ErrorState, LoadingBlock } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';
import styles from './course-detail.module.css';

type Course = {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  professorName: string | null;
};
type Announcement = { id: string; title: string; body: string | null; postedAt: string };
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
  filename: string | null;
  mimeType: string;
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
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const courses = useStudentList<{ items: Course[] }>('courses', '/student/courses');
  const announcements = useQuery({
    queryKey: ['student', 'courses', id, 'announcements'],
    queryFn: () => api.get<{ items: Announcement[] }>(`/student/courses/${id}/announcements`),
  });
  const syllabus = useQuery({
    queryKey: ['student', 'courses', id, 'syllabus'],
    queryFn: () => api.get<{ modules: SyllabusModule[]; curriculum?: unknown }>(`/student/courses/${id}/syllabus`, undefined,
      { 'x-petros-curriculum-alignment': CURRICULUM_ALIGNMENT_VERSION }),
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
  const attendancePct = attendance?.total ? Math.round((attendance.present / attendance.total) * 100) : null;
  const modules = syllabus.data?.modules ?? [];
  const curriculum = readCurriculumCompatibility(syllabus.data?.curriculum);
  const courseMaterials = materials.data?.items ?? [];
  const courseProjects = projects.data?.items ?? [];
  const courseAnnouncements = announcements.data?.items ?? [];
  const coveredModules = modules.filter((module) => module.covered).length;
  const currentModule = modules.find((module) => module.isCurrentWeek);

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
            ...courseMaterials.map((item) => ({
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
    <div className={styles.page}>
      <Link href="/courses" className={styles.backLink}>
        <ArrowLeft aria-hidden="true" /> Courses
      </Link>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.badges}>
            {code ? <span>{code}</span> : null}
            {course?.credits ? <span>{course.credits} credits</span> : null}
          </div>
          <h1>{name}</h1>
          <p>{professor ? `Professor ${professor}` : 'Professor to be confirmed'}</p>
          <div className={styles.heroActions}>
            {course ? <PetrosAskButton candidateRef={course.id} label={name} /> : null}
            <Link href="/materials">Browse library <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>
        <span className={styles.courseMark} aria-hidden="true">{courseInitials(name)}</span>
      </header>

      {firstError ? (
        <div className={styles.systemState}>
          <ErrorState description={formatApiError(firstError)} onRetry={() => window.location.reload()} />
        </div>
      ) : loading ? (
        <div className={styles.systemState}>
          <LoadingBlock label={`Opening ${name}…`} />
        </div>
      ) : (
        <>
          <section className={styles.summary} aria-label="Course overview">
            <SummaryItem label="Materials" value={String(courseMaterials.length)} note={courseMaterials.length === 1 ? 'file ready to open' : 'files ready to open'} />
            <SummaryItem label="Course plan" value={modules.length ? `${coveredModules}/${modules.length}` : '—'} note={currentModule ? `Week ${currentModule.weekNo} now` : modules.length ? 'modules covered' : 'not published'} />
            <SummaryItem label="Assignments" value={String(courseProjects.length)} note={courseProjects.length ? 'currently published' : 'nothing due'} />
            <SummaryItem label="Attendance" value={attendancePct === null ? '—' : `${attendancePct}%`} note={attendancePct === null ? 'not recorded' : `${attendance?.present} of ${attendance?.total} classes`} warning={attendance?.belowThreshold} />
          </section>

          {attendance?.warningLine ? <p className={styles.attendanceWarning}>{attendance.warningLine}</p> : null}

          <div className={styles.workspace}>
            <main className={styles.primary}>
              <section className={styles.panel} aria-labelledby="course-materials-title">
                <PanelHeader icon={FileText} title="Materials" note="Notes and files shared for this course" id="course-materials-title">
                  <Link href="/materials">View library <ArrowRight aria-hidden="true" /></Link>
                </PanelHeader>

                {courseMaterials.length ? (
                  <div className={styles.materialList}>
                    {courseMaterials.map((material, index) => (
                      <button
                        className={styles.materialCard}
                        type="button"
                        key={material.id}
                        onClick={() => setActiveMaterial(material)}
                        aria-label={`Open ${material.title}`}
                      >
                        <span className={styles.fileType}>{material.kindLabel || 'File'}</span>
                        <span className={styles.materialCopy}>
                          {index === 0 ? <span className={styles.latest}>Latest</span> : null}
                          <strong>{material.title}</strong>
                          {material.description ? <small>{material.description}</small> : null}
                          <span className={styles.materialMeta}>
                            {material.weekNo ? `Week ${material.weekNo}` : 'Course material'}
                            <span aria-hidden="true">·</span> Open preview
                          </span>
                        </span>
                        <ArrowRight className={styles.rowArrow} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ) : <CompactEmpty icon={FileText} title="No materials shared" note="Files from your professor will appear here." />}
              </section>

              <section className={styles.panel} aria-labelledby="course-assignments-title">
                <PanelHeader icon={GraduationCap} title="Assignments" note="Published work for this course" id="course-assignments-title">
                  {courseProjects.length ? <Link href="/assignments">All assignments <ArrowRight aria-hidden="true" /></Link> : null}
                </PanelHeader>
                {courseProjects.length ? (
                  <div className={styles.projectList}>
                    {courseProjects.map((project) => (
                      <Link key={project.id} href={`/assignments/${project.id}`} className={styles.projectRow}>
                        <span><strong>{project.title}</strong><small>{project.dueDate ? `Due ${shortDate(project.dueDate)}` : 'No due date'}</small></span>
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ) : <CompactEmpty icon={GraduationCap} title="Nothing due" note="New assignments will appear here." />}
              </section>

              <section className={styles.panel} aria-labelledby="course-plan-title">
                <PanelHeader icon={BookOpen} title="Course plan" note="Weekly topics and coverage" id="course-plan-title" />
                {modules.length ? (
                  <ol className={styles.moduleList}>
                    {modules.map((module) => (
                      <li key={`${module.weekNo}:${module.title}`} data-state={module.covered ? 'covered' : module.isCurrentWeek ? 'current' : 'upcoming'}>
                        <span className={styles.weekNumber}>{module.covered ? <Check aria-hidden="true" /> : module.weekNo}</span>
                        <div>
                          <span className={styles.moduleState}>{module.covered ? 'Covered' : module.isCurrentWeek ? 'Current week' : `Week ${module.weekNo}`}</span>
                          <strong>{module.title}</strong>
                          {module.topics.length ? <small>{module.topics.join(' · ')}</small> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <CompactEmpty icon={BookOpen} title="Course plan not published" note="Weekly topics will appear when they are available." />}
                {curriculum ? <details>
                  <summary>Course objectives and standards</summary>
                  <p>Alignment describes the course plan. It is not evidence of your learning.</p>
                  {curriculum.status !== 'ready' ? <p>{curriculum.status === 'unmapped' ? 'No standard mappings are published.' :
                    curriculum.status === 'stale' ? 'The course plan changed; its standard mappings need review.' : 'Standard mappings are currently unavailable.'}</p> : <>
                    {curriculum.data.objectives.map((objective) => <div key={objective.id}>
                      <strong>{objective.descriptor}</strong>
                      {curriculum.data.alignments.filter((a) => a.objective.id === objective.id && a.state === 'approved').map((a) => {
                        const standard = curriculum.data.items.find((i) => i.id === a.standard.id);
                        return <p key={a.id}>{standard?.externalId}: {standard?.descriptor} ({a.relation.replace(/_/g, ' ')})
                          {a.gaps.length ? ` · Gaps: ${a.gaps.join('; ')}` : ''}</p>;
                      })}
                      {curriculum.data.unmappedObjectives.includes(objective.id) ? <p>No current approved standard mapping.</p> : null}
                    </div>)}
                  </>}
                </details> : null}
              </section>
            </main>

            <aside className={styles.sidebar}>
              <section className={styles.sidePanel} aria-labelledby="course-information-title">
                <h2 id="course-information-title">Course information</h2>
                <div className={styles.instructor}>
                  <span aria-hidden="true">{personInitials(professor)}</span>
                  <div><small>Professor</small><strong>{professor || 'To be confirmed'}</strong></div>
                </div>
                <dl className={styles.details}>
                  <div><dt>Course code</dt><dd>{code || 'Not set'}</dd></div>
                  <div><dt>Credits</dt><dd>{course?.credits ?? '—'}</dd></div>
                  <div><dt>Office hours</dt><dd>{about.data?.officeHours || 'Not published'}</dd></div>
                  <div><dt>Attendance requirement</dt><dd>{attendance?.requiredPct ? `${attendance.requiredPct}%` : 'Not set'}</dd></div>
                </dl>
              </section>

              <section className={styles.sidePanel} aria-labelledby="course-announcements-title">
                <SideTitle icon={Megaphone} id="course-announcements-title">Announcements</SideTitle>
                {courseAnnouncements.length ? (
                  <div className={styles.announcementList}>
                    {courseAnnouncements.slice(0, 4).map((item) => (
                      <article key={item.id}>
                        <strong>{item.title}</strong>
                        {item.body ? <p>{item.body}</p> : null}
                        <time dateTime={item.postedAt}>{shortDate(item.postedAt)}</time>
                      </article>
                    ))}
                  </div>
                ) : <p className={styles.sideEmpty}>No announcements.</p>}
              </section>

              <section className={styles.sidePanel} aria-labelledby="course-grading-title">
                <SideTitle icon={CalendarClock} id="course-grading-title">Grading</SideTitle>
                {about.data?.gradingScheme.length ? (
                  <div className={styles.gradingList}>
                    {about.data.gradingScheme.map((item) => (
                      <div key={item.component}>
                        <p><span>{item.component}</span><strong>{item.weightPct}%</strong></p>
                        <span className={styles.gradeTrack}><span style={{ width: `${Math.min(100, item.weightPct)}%` }} /></span>
                      </div>
                    ))}
                  </div>
                ) : <p className={styles.sideEmpty}>Grading details have not been published.</p>}
              </section>
            </aside>
          </div>
        </>
      )}

      {activeMaterial ? (
        <DocumentViewer
          material={activeMaterial}
          previewUrl={api.fileUrl(`/student/materials/${activeMaterial.id}/view`)}
          documentPreviewUrl={api.fileUrl(`/student/materials/${activeMaterial.id}/preview`)}
          downloadUrl={api.fileUrl(`/student/materials/${activeMaterial.id}/file`)}
          onClose={() => setActiveMaterial(null)}
        />
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value, note, warning = false }: { label: string; value: string; note: string; warning?: boolean }) {
  return <article data-warning={warning ? 'true' : 'false'}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function PanelHeader({ icon: Icon, title, note, id, children }: { icon: typeof UserRound; title: string; note: string; id: string; children?: React.ReactNode }) {
  return <div className={styles.panelHead}><div><span className={styles.panelIcon}><Icon aria-hidden="true" /></span><div><h2 id={id}>{title}</h2><p>{note}</p></div></div>{children}</div>;
}

function SideTitle({ icon: Icon, id, children }: { icon: typeof UserRound; id: string; children: React.ReactNode }) {
  return <div className={styles.sideTitle}><Icon aria-hidden="true" /><h2 id={id}>{children}</h2></div>;
}

function CompactEmpty({ icon: Icon, title, note }: { icon: typeof UserRound; title: string; note: string }) {
  return <div className={styles.compactEmpty}><Icon aria-hidden="true" /><div><strong>{title}</strong><p>{note}</p></div></div>;
}

function courseInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'C';
}

function personInitials(name: string | null) {
  return name?.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'P';
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
