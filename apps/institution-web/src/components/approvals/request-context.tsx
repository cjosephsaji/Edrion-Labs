'use client';

import { Badge } from '@edrion/ui';
import type { PortalRequest } from '@/lib/requests';

type SessionRow = Record<string, unknown>;

export function RequestContextPanel({
  request,
  canDecide,
  acceptedIds,
  onToggleSession,
}: {
  request: PortalRequest;
  canDecide: boolean;
  acceptedIds: string[];
  onToggleSession: (sessionId: string, checked: boolean) => void;
}) {
  const sessions = Array.isArray(request.context?.sessions) ? (request.context!.sessions as SessionRow[]) : [];
  const attendance = Array.isArray(request.context?.attendance) ? (request.context!.attendance as SessionRow[]) : [];

  if (request.type === 'leave_request' || request.type === 'od_request') {
    const mark = request.type === 'leave_request' ? 'Excused' : 'On duty';
    return (
      <>
        <p className="text-sm font-semibold">
          Covers {sessions.length} session{sessions.length === 1 ? '' : 's'}
        </p>
        {request.type === 'od_request' ? (
          <p className="mt-1 text-sm text-text-secondary">
            {String(request.context?.eventName ?? request.payload.event_name ?? 'Event')} ·{' '}
            {String(request.context?.organizer ?? request.payload.organizer ?? '')}
          </p>
        ) : null}
        {attendance.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attendance.map((item, i) => (
              <Badge key={String(item.subjectId ?? i)} tone="neutral">
                {String(item.subjectName ?? 'Subject')} · {item.percentage == null ? '—' : `${String(item.percentage)}%`}
              </Badge>
            ))}
          </div>
        )}
        <ul className="mt-3 space-y-1 text-sm text-text-secondary">
          {sessions.map((session, i) => (
            <li key={String(session.session_id ?? session.date ?? i)}>
              {String(session.date)} · {String(session.period ?? session.subject_name ?? 'Session')}
            </li>
          ))}
        </ul>
        {canDecide ? (
          <p className="mt-3 text-xs text-text-muted">
            Approving marks {sessions.length} session{sessions.length === 1 ? '' : 's'} as {mark}.
          </p>
        ) : null}
      </>
    );
  }

  if (request.type === 'attendance_correction') {
    return (
      <>
        <p className="text-sm font-semibold">Disputed sessions</p>
        <ul className="mt-3 space-y-2">
          {sessions.map((session) => {
            const sessionId = String(session.session_id);
            const checked = acceptedIds.includes(sessionId);
            return (
              <li key={sessionId} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                {canDecide ? (
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => onToggleSession(sessionId, e.target.checked)}
                    aria-label={`Accept correction for ${sessionId}`}
                  />
                ) : null}
                <div>
                  <p className="font-medium text-text-primary">
                    {String(session.date)} · {String(session.period ?? 'Period')}
                  </p>
                  <p className="text-xs text-text-muted">
                    {String(session.subject_name ?? 'Subject')} · current: {String(session.current_status ?? '—')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {canDecide ? (
          <p className="mt-3 text-xs text-text-muted">
            Checked sessions flip to Present on approval. Unchecked sessions stay as marked.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <p className="text-sm text-text-secondary">
      {Number((request.context?.priorDocuments as unknown[])?.length ?? 0)} prior document(s) of this type · Fee dues unavailable
    </p>
  );
}
