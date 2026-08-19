'use client';

import { CalendarCheck2, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';
import styles from './attendance.module.css';

type Zone = 'safe' | 'warning' | 'critical';
type Row = {
  id: string;
  subjectName: string;
  present: number;
  total: number;
  percentage: number | null;
  zone: Zone | string;
  /** Plain-language consequence, e.g. "Can miss 5 more and stay ≥75%." */
  forecast: string | null;
};
type Response = { items: Row[] };

const pageTitle = 'Attendance';
const pageDescription = 'Every session your institution has recorded, and what it means for you.';

function zoneOf(row: Row): Zone {
  return row.zone === 'critical' ? 'critical' : row.zone === 'warning' ? 'warning' : 'safe';
}

export default function Page() {
  const query = useStudentList<Response>('attendance', '/student/attendance');

  usePetrosPage(
    query.data
      ? {
          title: pageTitle,
          summary: pageDescription,
          candidates: (query.data.items ?? []).map((row) => ({
            ref: row.id,
            entityType: 'attendance_summary' as const,
            // The row id is the subject; the API resolves the rollup from it.
            entityId: row.id,
            title: row.subjectName,
            summary: `${row.present}/${row.total} sessions${row.percentage == null ? '' : ` · ${row.percentage}%`}`,
            href: '/attendance',
          })),
        }
      : null,
  );

  return (
    <QueryPage query={query} loadingLabel="Loading attendance…">
      {(data) => {
        const items = data.items ?? [];
        const present = items.reduce((sum, row) => sum + row.present, 0);
        const total = items.reduce((sum, row) => sum + row.total, 0);
        const overall = total ? Math.floor((present / total) * 1000) / 10 : null;
        const atRisk = items.filter((row) => zoneOf(row) !== 'safe');

        return (
          <div className="mx-auto w-full max-w-[1120px]">
            <PageHeader eyebrow="Your record" title={pageTitle} description={pageDescription} />

            {items.length === 0 ? (
              <EmptyState
                icon={CalendarCheck2}
                title="No attendance recorded yet"
                description="Sessions appear here once your teachers mark them."
              />
            ) : (
              <>
                <section className={styles.summary} aria-label="Overall attendance">
                  <div className={styles.overall} data-zone={atRisk.length ? 'warning' : 'safe'}>
                    <span className={styles.overallLabel}>Overall</span>
                    <strong className={styles.overallValue}>{overall == null ? '—' : `${overall}%`}</strong>
                    <span className={styles.overallMeta}>
                      {present} of {total} sessions attended
                    </span>
                  </div>
                  <p className={styles.summaryNote}>
                    {atRisk.length === 0
                      ? 'Every subject is comfortably above the threshold.'
                      : `${atRisk.length} ${atRisk.length === 1 ? 'subject needs' : 'subjects need'} attention. Each one below tells you exactly what it takes to recover.`}
                  </p>
                </section>

                <ul className={styles.list} aria-label="Attendance by subject">
                  {items.map((row) => {
                    const zone = zoneOf(row);
                    const pct = row.percentage ?? 0;
                    return (
                      <li className={styles.row} key={row.id} data-zone={zone}>
                        <div className={styles.rowHead}>
                          <h2 className={styles.subject}>{row.subjectName}</h2>
                          <span className={styles.count}>
                            {row.present}/{row.total}
                          </span>
                          <strong className={styles.pct}>
                            {row.percentage == null ? '—' : `${row.percentage}%`}
                          </strong>
                          <PetrosAskButton candidateRef={row.id} label={row.subjectName} variant="icon" />
                        </div>

                        <div
                          className={styles.track}
                          role="img"
                          aria-label={`${row.percentage ?? 0}% attended`}
                        >
                          <span className={styles.fill} style={{ width: `${Math.min(100, pct)}%` }} />
                          {/* The threshold is the number that decides the outcome, so it is drawn. */}
                          <span className={styles.threshold} aria-hidden="true" />
                        </div>

                        {row.forecast ? (
                          <p className={styles.forecast}>
                            {zone !== 'safe' ? <TriangleAlert aria-hidden="true" /> : null}
                            {row.forecast}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                <p className={styles.note}>
                  Counts come from sessions your teachers have marked. Ask your teacher if something
                  looks wrong — Petros cannot change attendance.
                </p>
              </>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
