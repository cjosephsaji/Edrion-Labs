import Link from 'next/link';

type PendingRequest = { id: string; type: string; humanCode: string; status: string };

const typeLabel: Record<string, string> = {
  leave_request: 'Leave',
  od_request: 'On-duty',
  attendance_correction: 'Correction',
};

export function PendingRequestsStrip({ requests }: { requests: PendingRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">PENDING REQUESTS</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {requests.map((request) => (
          <Link
            key={request.id}
            href={`/requests/${request.id}`}
            className="shrink-0 rounded-[12px] border border-st-bd1 bg-st-card px-4 py-3 text-sm shadow-sm transition hover:border-st-accent/40"
          >
            <p className="font-semibold text-st-ink">{typeLabel[request.type] ?? request.type}</p>
            <p className="mt-0.5 font-mono-ui text-xs text-st-faint">{request.humanCode}</p>
            <p className="mt-1 text-xs capitalize text-st-muted">{request.status.replaceAll('_', ' ')}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
