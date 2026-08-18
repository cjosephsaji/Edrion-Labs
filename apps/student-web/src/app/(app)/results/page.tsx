'use client';

import { Award, BookOpenCheck, CalendarDays, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { QueryPage } from '@/components/query-page';
import styles from '@/components/student-content.module.css';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';

type Numeric = number | string;
type Result = {
  id: string;
  title?: string | null;
  subjectName?: string | null;
  marksObtained?: Numeric | null;
  maxMarks?: Numeric | null;
  letterGrade?: string | null;
  termGpa?: Numeric | null;
  termPct?: Numeric | null;
};
type Response = { items: Result[]; termId: string | null; computedAt: string | null };

function number(value: Numeric | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(item: Result) {
  const obtained = number(item.marksObtained);
  const maximum = number(item.maxMarks);
  return obtained != null && maximum ? Math.round((obtained / maximum) * 100) : null;
}

export default function Page() {
  const query = useStudentList<Response>('results', '/student/results');

  return (
    <QueryPage query={query} loadingLabel="Loading results…">
      {(data) => {
        const items = data.items ?? [];
        const percentages = items.map(percentage).filter((value): value is number => value != null);
        const termPercentage = number(items[0]?.termPct);
        const average = termPercentage ?? (percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : null);
        const best = items.reduce<Result | null>((current, item) => !current || (percentage(item) ?? -1) > (percentage(current) ?? -1) ? item : current, null);
        const focusResult = items.reduce<Result | null>((current, item) => !current || (percentage(item) ?? 101) < (percentage(current) ?? 101) ? item : current, null);
        const gpa = number(items[0]?.termGpa);

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Academic performance"
              title="Results"
              description="Published assessment marks and your latest term performance."
            />

            {items.length === 0 ? (
              <EmptyState icon={BookOpenCheck} title="No published results" description="Results will appear after your institution releases them." />
            ) : (
              <>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Overall score</span>
                    <strong className={styles.summaryValue}>{average != null ? `${average}%` : '—'}</strong>
                    <span className={styles.summarySupporting}>Across published results</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Strongest subject</span>
                    <strong className={styles.summaryValue}>{best?.letterGrade ?? '—'}</strong>
                    <span className={styles.summarySupporting}>{best?.subjectName ?? 'Not available'}</span>
                  </div>
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>{gpa != null ? 'Term GPA' : 'Published'}</span>
                    <strong className={styles.summaryValue}>{gpa != null ? gpa.toFixed(2) : items.length}</strong>
                    <span className={styles.summarySupporting}>{gpa != null ? 'Current term' : `${items.length === 1 ? 'assessment' : 'assessments'}`}</span>
                  </div>
                </div>

                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Subject results</h2>
                  {data.computedAt ? <span className={styles.sectionMeta}><CalendarDays aria-hidden="true" size={13} className="mr-1 inline" />Updated {new Date(data.computedAt).toLocaleDateString('en-IN')}</span> : null}
                </div>
                <div className={styles.resultList}>
                  {items.map((item) => {
                    const pct = percentage(item);
                    return (
                      <article
                        className={styles.resultRow}
                        key={item.id}
                        data-petros-target={item.id === focusResult?.id ? 'primary' : undefined}
                        data-petros-title={item.id === focusResult?.id ? `${item.subjectName ?? 'Subject'} result` : undefined}
                        data-petros-message={item.id === focusResult?.id && pct != null ? `${pct}% is the result that deserves the closest look.` : undefined}
                        data-petros-source-id={item.id === focusResult?.id ? item.id : undefined}
                        data-petros-href={item.id === focusResult?.id ? '/results' : undefined}
                      >
                        <div>
                          <h3 className={styles.resultSubject}>{item.subjectName ?? 'Subject'}</h3>
                          <p className={styles.resultAssessment}>{item.title ?? 'Published assessment'}</p>
                        </div>
                        <div className={styles.resultProgress}>
                          <div className={styles.progressTrack} aria-label={pct != null ? `${pct}%` : 'Score unavailable'}>
                            <div className={styles.progressFill} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
                          </div>
                        </div>
                        <div className={styles.mark}>{item.marksObtained ?? '—'}{item.maxMarks != null ? ` / ${item.maxMarks}` : ''}</div>
                        <div className={styles.grade} aria-label={`Grade ${item.letterGrade ?? 'unavailable'}`}>{item.letterGrade ?? '—'}</div>
                        {pct != null && pct < 70 ? (
                          <PetrosDoorButton className={styles.petrosRepair} door="result_repair" sourceId={item.id} label="See what to fix" timeBudgetSeconds={900} />
                        ) : <span aria-hidden="true" />}
                      </article>
                    );
                  })}
                </div>

                <div className={styles.sectionHeader}><h2 className={styles.sectionTitle}>Performance note</h2></div>
                <div className={styles.featureNotice}>
                  <div className={styles.featureDate}><TrendingUp aria-hidden="true" size={28} /><span>Progress</span></div>
                  <div className={styles.featureBody}>
                    <div className={styles.featureKicker}><Award aria-hidden="true" size={14} />Latest release</div>
                    <h2 className={styles.featureTitle}>{best?.subjectName ?? 'Results'} is your strongest published result</h2>
                    <p className={styles.featureCopy}>Your institution publishes marks here after review. Use the subject breakdown above to decide where to focus next.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
