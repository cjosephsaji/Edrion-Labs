import Link from 'next/link';
import type { AttendancePolicyValues } from '@edrion/schemas';

export function BranchActions({
  branch,
  policy,
}: {
  branch: string;
  policy: AttendancePolicyValues;
}) {
  if (!policy.condonationEnabled) return null;
  if (branch !== 'recovery' && branch !== 'unrecoverable') return null;

  return (
    <div className="rounded-[12px] border border-st-amberBd bg-st-amberSoft px-4 py-3">
      <p className="text-sm font-semibold text-st-amberInk">Need to recover attendance?</p>
      <p className="mt-1 text-xs text-st-muted">Apply for leave or on-duty approval before upcoming sessions.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/requests/new?type=leave_request"
          className="rounded-full bg-st-card px-4 py-2 text-xs font-semibold text-st-ink shadow-sm transition hover:border-st-accent/40 border border-st-bd1"
        >
          Apply for leave
        </Link>
        <Link
          href="/requests/new?type=od_request"
          className="rounded-full bg-st-card px-4 py-2 text-xs font-semibold text-st-ink shadow-sm transition hover:border-st-accent/40 border border-st-bd1"
        >
          Request on-duty
        </Link>
      </div>
    </div>
  );
}
