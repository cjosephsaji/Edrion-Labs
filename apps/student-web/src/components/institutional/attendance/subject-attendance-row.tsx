import { TrendBars } from '@/components/institutional/TrendBars';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import type { AttendanceRollupLine } from '@/lib/attendance';

const zoneTone: Record<string, string> = {
  safe: 'success',
  warning: 'warning',
  below: 'danger',
  unrecoverable: 'danger',
};

const zoneLabel: Record<string, string> = {
  safe: 'Safe',
  warning: 'Warning',
  below: 'Below',
  unrecoverable: 'Critical',
};

export function SubjectAttendanceRow({
  subject,
  onClick,
}: {
  subject: AttendanceRollupLine;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-[15px] border border-st-bd1 bg-st-card p-4 text-left shadow-sm transition hover:border-st-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-st-ink">{subject.subjectName ?? 'Subject'}</p>
          <p className="mt-0.5 text-xs text-st-muted">
            {subject.attended}/{subject.conducted} sessions
            {subject.remaining > 0 ? ` · ${subject.remaining} remaining` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className="text-lg font-semibold text-st-ink">{subject.pct ?? '—'}%</p>
          <GovernancePill label={zoneLabel[subject.zone] ?? subject.zone} tone={zoneTone[subject.zone] ?? 'neutral'} />
        </div>
      </div>
      {subject.forecast.message ? (
        <p className="mt-2 text-xs text-st-muted">{subject.forecast.message}</p>
      ) : null}
      <div className="mt-3 h-16 overflow-hidden">
        <div className="origin-bottom scale-50">
          <TrendBars
            bars={[
              { label: 'Att', value: subject.attended },
              { label: 'Done', value: subject.conducted },
              { label: 'Left', value: subject.remaining },
            ]}
          />
        </div>
      </div>
    </button>
  );
}
