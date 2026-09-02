'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  FolderOpen,
} from 'lucide-react';
import { ClassRail, SubjectIcon, type ClassNavItem } from '@/components/classes/class-rail';
import styles from '@/components/classes/classes.module.css';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentList, useStudentMe } from '@/lib/hooks';

type Tab = 'overview' | 'materials' | 'homework' | 'about';
type StreamPost = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  topicKey: string | null;
  requiresAck: boolean;
  acked: boolean;
  postedAt: string;
};
type Material = { id: string; title: string; kindLabel: string | null; weekNo: number | null; description: string | null };
type Homework = { id: string; title: string; dueAt: string };
type About = { teacherName: string | null; timetableLines: string[]; attendance: { present: number; total: number } };

const subjectDescriptions: Record<string, { category: string; description: string }> = {
  english: {
    category: 'Language & literature',
    description: 'Develop your reading, writing, speaking, and critical thinking through literature, language study, and discussion.',
  },
  mathematics: {
    category: 'Mathematics',
    description: 'Build fluency in reasoning, problem solving, patterns, and the mathematical ideas used throughout the year.',
  },
  science: {
    category: 'Science',
    description: 'Explore living systems, matter, energy, and evidence through practical work and classroom investigation.',
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatDateParts(value: string) {
  const date = new Date(value);
  return {
    month: new Intl.DateTimeFormat('en', { month: 'short' }).format(date),
    day: new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date),
  };
}

function formatPostedAt(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function parseTimetableLine(value: string) {
  const [rawDay = '', time = '', ...rest] = value.split(' ');
  const dayNames: Record<string, string> = {
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '7': 'Sunday',
  };
  return { day: dayNames[rawDay] ?? rawDay, time, detail: rest.join(' ') };
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const api = useStudentApi();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const name = search.get('name') || 'Class';
  const teacher = search.get('teacher');

  const { data: me } = useStudentMe();
  const classes = useStudentList<{ items: ClassNavItem[] }>('classes', '/student/classes');
  const stream = useQuery({ queryKey: ['student', 'classes', id, 'stream'], queryFn: () => api.get<{ items: StreamPost[] }>(`/student/classes/${id}/stream`) });
  const materials = useQuery({ queryKey: ['student', 'classes', id, 'materials'], queryFn: () => api.get<{ items: Material[] }>(`/student/classes/${id}/materials`) });
  const homework = useQuery({ queryKey: ['student', 'classes', id, 'homework'], queryFn: () => api.get<{ items: Homework[] }>(`/student/classes/${id}/homework`) });
  const about = useQuery({ queryKey: ['student', 'classes', id, 'about'], queryFn: () => api.get<About>(`/student/classes/${id}/about`) });

  const ack = useMutation({
    mutationFn: (postId: string) => api.post(`/student/classes/stream/${postId}/ack`),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['student', 'classes', id, 'stream'] }),
  });

  const classInfo = subjectDescriptions[name.toLowerCase()] ?? {
    category: 'Class space',
    description: 'Keep up with lessons, teacher updates, shared resources, homework, and your schedule for this subject.',
  };
  const classItems = classes.data?.items ?? [];
  const homeworkItems = [...(homework.data?.items ?? [])].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const updates = [...(stream.data?.items ?? [])].reverse();
  const timetableLines = about.data?.timetableLines ?? [];
  const nextSlot = timetableLines[0] ? parseTimetableLine(timetableLines[0]) : null;
  const attendance = about.data?.attendance;
  const attendancePct = attendance?.total ? Math.round((attendance.present / attendance.total) * 100) : null;
  const firstName = me?.fullName?.split(' ')[0] || 'Student';

  const activeQuery = tab === 'materials' ? materials : tab === 'homework' ? homework : tab === 'about' ? about : stream;
  const activeError = tab === 'overview' ? stream.error ?? homework.error ?? about.error : activeQuery.error;
  const activeLoading = tab === 'overview'
    ? stream.isLoading || homework.isLoading || about.isLoading
    : activeQuery.isLoading;

  const retryActive = () => {
    if (tab === 'overview') {
      void stream.refetch();
      void homework.refetch();
      void about.refetch();
      return;
    }
    void activeQuery.refetch();
  };

  return (
    <div className={styles.workspace}>
      <ClassRail items={classItems} activeId={id} />

      <div className={styles.detailContent}>
        <div className={styles.hero}>
          <div className={styles.heroMark}>
            <SubjectIcon name={name} />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>{classInfo.category}</p>
            <h1 className={styles.heroTitle}>{name}</h1>
            <div className={styles.heroMeta}>
              <span>{about.data?.teacherName || teacher || 'Teacher to be confirmed'}</span>
              {me?.className ? <span>{me.className}</span> : null}
              {me?.termName ? <span>{me.termName}</span> : null}
            </div>
            <p className={styles.heroDescription}>{classInfo.description}</p>
          </div>
        </div>

        <div className={styles.stats} aria-label="Class summary">
          <div className={styles.stat}>
            <span className={styles.statIcon}><CalendarDays aria-hidden="true" /></span>
            <div>
              <p className={styles.statLabel}>Next class</p>
              <p className={styles.statValue}>{nextSlot?.day || 'Check timetable'}</p>
              <p className={styles.statHint}>{nextSlot ? `${nextSlot.time}${nextSlot.detail ? ` · ${nextSlot.detail}` : ''}` : 'No subject slot is published yet.'}</p>
              <Link href="/timetable" className={styles.statLink}>View timetable <ArrowRight aria-hidden="true" /></Link>
            </div>
          </div>
          <div className={styles.stat}>
            <span className={styles.statIcon}><FileText aria-hidden="true" /></span>
            <div>
              <p className={styles.statLabel}>Homework due</p>
              <p className={styles.statValue}>{homeworkItems.length}</p>
              <p className={styles.statHint}>{homeworkItems[0] ? `Next due ${formatDate(homeworkItems[0].dueAt)}` : 'Nothing currently due.'}</p>
              <button type="button" className={styles.statLink} onClick={() => setTab('homework')}>View homework <ArrowRight aria-hidden="true" /></button>
            </div>
          </div>
          <div className={styles.stat}>
            <span className={styles.statIcon}><Clock3 aria-hidden="true" /></span>
            <div>
              <p className={styles.statLabel}>Attendance</p>
              <p className={styles.statValue}>{attendancePct === null ? 'Not marked' : `${attendancePct}%`}</p>
              <p className={styles.statHint}>{attendance ? `${attendance.present} of ${attendance.total} classes present` : 'Attendance is still loading.'}</p>
              <button type="button" className={styles.statLink} onClick={() => setTab('about')}>View details <ArrowRight aria-hidden="true" /></button>
            </div>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Class sections">
          {([
            ['overview', 'Overview'],
            ['materials', 'Materials'],
            ['homework', 'Homework'],
            ['about', 'Class details'],
          ] as Array<[Tab, string]>).map(([tabId, label]) => (
            <button
              key={tabId}
              id={`class-tab-${tabId}`}
              type="button"
              role="tab"
              aria-controls={`class-panel-${tabId}`}
              aria-selected={tab === tabId}
              className={styles.tab}
              onClick={() => setTab(tabId)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeLoading ? <LoadingBlock label={`Loading ${tab}...`} /> : null}
        {activeError ? <ErrorState description={formatApiError(activeError)} onRetry={retryActive} /> : null}

        {!activeLoading && !activeError ? (
          <div className={styles.detailGrid}>
            <div
              key={tab}
              id={`class-panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`class-tab-${tab}`}
              className={`${styles.panel} ${styles.tabPanel}`}
            >
              {tab === 'overview' ? (
                <>
                  <div className={styles.welcome}>
                    <div>
                      <h2>Welcome to {name}, {firstName}</h2>
                      <p>Use this class space for teacher updates, shared resources, upcoming work, and the schedule for this subject.</p>
                    </div>
                    <span className={styles.welcomeIcon}><BookOpen aria-hidden="true" /></span>
                  </div>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Recent class updates</h2>
                  </div>
                  {updates.length ? (
                    <div className={styles.updates}>
                      {updates.slice(0, 4).map((post) => (
                        <div key={post.id} className={styles.update}>
                          <span className={styles.updateIcon}><Bell aria-hidden="true" /></span>
                          <div>
                            <p className={styles.updateTitle}>{post.title}</p>
                            {post.body ? <p className={styles.updateBody}>{post.body}</p> : null}
                          </div>
                          <time className={styles.updateTime} dateTime={post.postedAt}>{formatPostedAt(post.postedAt)}</time>
                          {post.requiresAck ? post.acked ? (
                            <span className={styles.acknowledged}><Check aria-hidden="true" /> Seen by your teacher</span>
                          ) : (
                            <button type="button" className={styles.acknowledge} disabled={ack.isPending} aria-busy={ack.isPending} onClick={() => ack.mutate(post.id)}>
                              {ack.isPending ? 'Saving...' : 'Mark as seen'}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : <p className={styles.emptyCopy}>Teacher announcements and class updates will appear here.</p>}
                </>
              ) : null}

              {tab === 'materials' ? (
                <>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Class materials</h2>
                    <Link href="/materials" className={styles.sectionLink}>All materials</Link>
                  </div>
                  {materials.data?.items.length ? (
                    <div className={styles.resourceList}>
                      {materials.data.items.map((material) => (
                        <div key={material.id} className={styles.resource}>
                          <span className={styles.resourceIcon}><FolderOpen aria-hidden="true" /></span>
                          <div>
                            <p className={styles.resourceTitle}>{material.title}</p>
                            <p className={styles.resourceMeta}>{[material.kindLabel, material.weekNo ? `Week ${material.weekNo}` : null, material.description].filter(Boolean).join(' · ') || 'Class material'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState icon={FolderOpen} title="No materials yet" description="Files shared with this class will appear here." />}
                </>
              ) : null}

              {tab === 'homework' ? (
                <>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Homework</h2>
                    <Link href="/homework" className={styles.sectionLink}>All homework</Link>
                  </div>
                  {homeworkItems.length ? (
                    <div className={styles.resourceList}>
                      {homeworkItems.map((item) => (
                        <Link key={item.id} href={`/homework/${item.id}`} className={styles.resource}>
                          <span className={styles.resourceIcon}><FileText aria-hidden="true" /></span>
                          <div>
                            <p className={styles.resourceTitle}>{item.title}</p>
                            <p className={styles.resourceMeta}>Due {formatPostedAt(item.dueAt)}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : <EmptyState icon={FileText} title="No homework for this class" description="New work will appear here after your teacher publishes it." />}
                </>
              ) : null}

              {tab === 'about' ? (
                <>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Class details</h2>
                  </div>
                  <div className={styles.teacherRow}>
                    <span className={styles.teacherAvatar}>{(about.data?.teacherName || teacher || 'T').slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{about.data?.teacherName || teacher || 'Teacher details to follow'}</strong>
                      <span>{name} teacher</span>
                    </div>
                  </div>
                  <div className={styles.attendanceBar} aria-hidden="true">
                    <div className={styles.attendanceFill} style={{ width: `${attendancePct ?? 0}%` }} />
                  </div>
                  <div className={styles.attendanceCopy}>
                    <span>Attendance</span>
                    <strong>{attendancePct === null ? 'Not marked' : `${attendancePct}%`}</strong>
                  </div>
                  <div className={styles.resourceList}>
                    {timetableLines.map((line) => {
                      const slot = parseTimetableLine(line);
                      return (
                        <div key={line} className={styles.resource}>
                          <span className={styles.resourceIcon}><Clock3 aria-hidden="true" /></span>
                          <div>
                            <p className={styles.resourceTitle}>{slot.day} · {slot.time}</p>
                            <p className={styles.resourceMeta}>{slot.detail || 'Published timetable slot'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            <aside className={styles.sideStack} aria-label="Class at a glance">
              <div className={styles.sidePanel}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Upcoming</h2>
                  <button type="button" className={styles.sectionLink} onClick={() => setTab('homework')}>View all</button>
                </div>
                {homeworkItems.length ? (
                  <div className={styles.deadlineList}>
                    {homeworkItems.slice(0, 3).map((item) => {
                      const date = formatDateParts(item.dueAt);
                      return (
                        <Link key={item.id} href={`/homework/${item.id}`} className={styles.deadline}>
                          <span className={styles.dateBlock}><span>{date.month}</span><strong>{date.day}</strong></span>
                          <span><span className={styles.deadlineTitle}>{item.title}</span><span className={styles.deadlineMeta}>Homework · Due {formatDate(item.dueAt)}</span></span>
                        </Link>
                      );
                    })}
                  </div>
                ) : <p className={styles.emptyCopy}>No upcoming homework.</p>}
              </div>

              <div className={styles.sidePanel}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Schedule</h2>
                  <Link href="/timetable" className={styles.sectionLink}>Timetable</Link>
                </div>
                {timetableLines.length ? (
                  <div className={styles.scheduleList}>
                    {timetableLines.slice(0, 4).map((line) => {
                      const slot = parseTimetableLine(line);
                      return (
                        <div key={line} className={styles.schedule}>
                          <span className={styles.scheduleTime}>{slot.day.slice(0, 3)}</span>
                          <span className={styles.scheduleDot} aria-hidden="true" />
                          <span><span className={styles.scheduleTitle}>{slot.time || line}</span><span className={styles.scheduleMeta}>{slot.detail || name}</span></span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className={styles.emptyCopy}>No class slots published.</p>}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
