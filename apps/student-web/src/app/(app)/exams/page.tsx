'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MapPin,
  MonitorCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import styles from '@/components/exams/exams.module.css';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';

type ExamRow = {
  id: string;
  title: string;
  subjectName: string | null;
  examType: string | null;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  durationMin: number | null;
  maxMarks: number | null;
  hall: string | null;
  room: string | null;
  seatInfo: string | null;
  questionCount: number;
  attemptStatus: 'in_progress' | 'completed' | null;
  canStart: boolean;
  blockedReason: string | null;
  availability: 'available' | 'upcoming' | 'closed' | 'unavailable';
};

type Response = { items: ExamRow[] };

function dateParts(value: string | null) {
  if (!value) return { day: '—', month: 'TBA' };
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat('en-IN', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date),
  };
}

function scheduleText(value: string | null) {
  if (!value) return 'Schedule pending';
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function actionLabel(exam: ExamRow) {
  if (exam.attemptStatus === 'completed') return 'View submission';
  if (exam.attemptStatus === 'in_progress') return 'Resume exam';
  if (exam.canStart) return 'Attend exam';
  return 'View details';
}

function statusLabel(exam: ExamRow) {
  if (exam.attemptStatus === 'completed') return 'Submitted';
  if (exam.attemptStatus === 'in_progress') return 'In progress';
  if (exam.canStart) return 'Open now';
  if (!exam.questionCount) return 'In person';
  return exam.availability === 'upcoming' ? 'Upcoming' : 'Closed';
}

export default function Page() {
  const query = useStudentList<Response>('exams', '/student/exams');

  return (
    <QueryPage query={query} loadingLabel="Loading examinations…">
      {(data) => {
        const items = data.items ?? [];
        const available = items.filter((item) => item.canStart || item.attemptStatus === 'in_progress');
        const completed = items.filter((item) => item.attemptStatus === 'completed');
        const upcoming = items.filter((item) => item.availability === 'upcoming');
        const featured = available[0] ?? null;
        const remaining = items.filter((item) => item.id !== featured?.id);

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Assessment centre"
              title="Examinations"
              description="Attend online papers, resume active attempts, and check your published examination schedule."
            />

            {items.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No examinations scheduled" description="Published dates and online papers will appear here." />
            ) : (
              <>
                <div className={styles.summary}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Available now</span>
                    <strong className={styles.summaryValue}>{available.length}</strong>
                    <span className={styles.summaryCopy}>Ready to attend or resume</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Upcoming</span>
                    <strong className={styles.summaryValue}>{upcoming.length}</strong>
                    <span className={styles.summaryCopy}>Published future examinations</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Submitted</span>
                    <strong className={styles.summaryValue}>{completed.length}</strong>
                    <span className={styles.summaryCopy}>Completed online attempts</span>
                  </div>
                </div>

                {featured ? (
                  <>
                    <div className={styles.sectionHead}><h2>Available examination</h2><span>Timer begins after you start</span></div>
                    <article className={styles.liveCard}>
                      <span className={styles.liveIcon}><MonitorCheck aria-hidden="true" size={27} /></span>
                      <div>
                        <p className={styles.liveKicker}><Clock3 aria-hidden="true" size={13} />{featured.attemptStatus === 'in_progress' ? 'Attempt in progress' : 'Open for attendance'}</p>
                        <h2 className={styles.liveTitle}>{featured.title}</h2>
                        <div className={styles.meta}>
                          <span><FileCheck2 aria-hidden="true" size={14} />{featured.questionCount} questions</span>
                          <span><Clock3 aria-hidden="true" size={14} />{featured.durationMin ?? '—'} minutes</span>
                          <span>{featured.maxMarks ?? '—'} marks</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link className={styles.primaryLink} href={`/exams/${featured.id}/attempt`}>{actionLabel(featured)} <ArrowRight aria-hidden="true" size={16} /></Link>
                        {featured.attemptStatus !== 'completed' && featured.availability === 'upcoming' ? <PetrosDoorButton className={styles.primaryLink} door="upcoming_exam" sourceId={featured.id} label="Revise with Petros" /> : null}
                      </div>
                    </article>
                  </>
                ) : null}

                {remaining.length ? (
                  <>
                    <div className={styles.sectionHead}><h2>Examination schedule</h2><span>{remaining.length} published</span></div>
                    <ul className={styles.scheduleList}>
                      {remaining.map((exam) => {
                        const date = dateParts(exam.startsAt);
                        const isOnline = exam.questionCount > 0;
                        return (
                          <li className={styles.scheduleRow} key={exam.id}>
                            <div className={styles.dateTile}><strong>{date.day}</strong><span>{date.month}</span></div>
                            <div>
                              <h3 className={styles.rowTitle}>{exam.title}</h3>
                              <p className={styles.rowSub}>{scheduleText(exam.startsAt)} · {exam.maxMarks ?? '—'} marks</p>
                            </div>
                            <div>
                              <span className={styles.status} data-tone={exam.canStart || exam.attemptStatus === 'in_progress' ? 'live' : exam.attemptStatus === 'completed' ? 'done' : undefined}>
                                {exam.attemptStatus === 'completed' ? <CheckCircle2 aria-hidden="true" size={13} /> : isOnline ? <MonitorCheck aria-hidden="true" size={13} /> : <MapPin aria-hidden="true" size={13} />}
                                {statusLabel(exam)}
                              </span>
                              <p className={styles.rowSub}>{isOnline ? `${exam.questionCount} questions · ${exam.durationMin ?? '—'} min` : exam.hall || exam.room || 'Venue pending'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {isOnline ? <Link className={styles.primaryLink} href={`/exams/${exam.id}/attempt`}>{actionLabel(exam)} <ArrowRight aria-hidden="true" size={15} /></Link> : <span className={styles.rowSub}>{exam.seatInfo ?? 'Seat details pending'}</span>}
                              {exam.attemptStatus !== 'completed' && exam.availability === 'upcoming' ? <PetrosDoorButton className={styles.primaryLink} door="upcoming_exam" sourceId={exam.id} label="Revise with Petros" /> : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
