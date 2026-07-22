'use client';

import Link from 'next/link';
import { Drawer } from '@edrion/ui';
import { GovernancePill } from '@/components/institutional/GovernancePill';
import { AttendanceRing } from '@/components/institutional/attendance/attendance-ring';
import { BranchActions } from '@/components/institutional/attendance/branch-actions';
import {
  type AttendanceSession,
  type AttendanceSubjectDetail,
  useAttendanceSubject,
} from '@/lib/attendance';
import type { AttendancePolicyValues } from '@edrion/schemas';

const zoneTone: Record<string, string> = {
  safe: 'success',
  warning: 'warning',
  below: 'danger',
  unrecoverable: 'danger',
};

function SessionRow({ session }: { session: AttendanceSession }) {
  const isAbsent = session.status === 'absent' || session.displayStatus === 'absent';
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-st-bd1 bg-st-card px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-st-ink">{session.date}</p>
        <p className="text-xs text-st-muted">{session.period}</p>
        {session.provenance?.humanCode ? (
          <p className="mt-0.5 font-mono-ui text-[10px] text-st-faint">via {session.provenance.humanCode}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="rounded-full bg-st-surface2 px-2 py-0.5 text-[10px] font-semibold capitalize text-st-muted">
          {session.displayStatus.replaceAll('_', ' ')}
        </span>
        {isAbsent ? (
          <Link
            href={`/requests/new?type=attendance_correction&sessionId=${session.id}`}
            className="text-[10px] font-semibold text-st-accentDeep underline"
          >
            Dispute
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SubjectDetailContent({
  detail,
  policy,
  sessions,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  detail: AttendanceSubjectDetail;
  policy: AttendancePolicyValues;
  sessions: AttendanceSession[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <AttendanceRing
          pct={detail.rollup.pct}
          zone={detail.rollup.zone}
          thresholdPct={policy.thresholdPct}
          size={120}
        />
      </div>

      {detail.teacherName ? (
        <p className="text-center text-sm text-st-muted">Teacher: {detail.teacherName}</p>
      ) : null}

      <p className="text-sm text-st-muted">{detail.rollup.forecast.message}</p>

      <BranchActions branch={detail.math.branch} policy={policy} />

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-[10px] bg-st-page px-2 py-2">
          <p className="text-lg font-semibold text-st-ink">{detail.math.attended}</p>
          <p className="text-[10px] text-st-faint">Attended</p>
        </div>
        <div className="rounded-[10px] bg-st-page px-2 py-2">
          <p className="text-lg font-semibold text-st-ink">{detail.math.conducted}</p>
          <p className="text-[10px] text-st-faint">Conducted</p>
        </div>
        <div className="rounded-[10px] bg-st-page px-2 py-2">
          <p className="text-lg font-semibold text-st-ink">{detail.math.remaining}</p>
          <p className="text-[10px] text-st-faint">Remaining</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">SESSIONS</p>
          <GovernancePill
            label={detail.rollup.zone}
            tone={zoneTone[detail.rollup.zone] ?? 'neutral'}
          />
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-st-muted">No sessions recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        )}
        {hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full rounded-[10px] border border-st-bd1 py-2 text-sm font-semibold text-st-accentDeep disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more sessions'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SubjectDetailDrawer({
  subjectId,
  policy,
  open,
  onClose,
}: {
  subjectId: string;
  policy: AttendancePolicyValues;
  open: boolean;
  onClose: () => void;
}) {
  const query = useAttendanceSubject(subjectId, open);
  const firstPage = query.data?.pages[0]?.value;
  const sessions = query.data?.pages.flatMap((page) => page.value.sessions) ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={firstPage?.subjectName ?? 'Subject attendance'}
      description={
        firstPage?.teacherName
          ? `${firstPage.teacherName} · ${policy.computationBasis} basis`
          : `${policy.computationBasis} basis`
      }
    >
      {query.isLoading || !firstPage ? (
        <div className="space-y-3">
          <div className="mx-auto h-28 w-28 shimmer rounded-full" />
          <div className="h-12 shimmer rounded-xl" />
          <div className="h-24 shimmer rounded-xl" />
        </div>
      ) : (
        <SubjectDetailContent
          detail={firstPage}
          policy={policy}
          sessions={sessions}
          hasMore={Boolean(query.hasNextPage)}
          loadingMore={query.isFetchingNextPage}
          onLoadMore={() => void query.fetchNextPage()}
        />
      )}
    </Drawer>
  );
}
