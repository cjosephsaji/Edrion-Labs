'use client';
import { Badge, Button, type BadgeTone } from '@edrion/ui';
import { secondsUntilExpiry } from '@edrion/schemas';
import {
  ApiClientError,
  useCurrentEmployee,
  useEndSupportSession,
  type SupportAccessSessionDto,
} from '@edrion/api-client';
import { useSupportSession } from '@/lib/support-session';

const STATUS_TONE: Record<SupportAccessSessionDto['status'], BadgeTone> = {
  requested: 'warning',
  approved: 'info',
  active: 'success',
  ended: 'neutral',
  expired: 'danger',
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function remainingLabel(expiresAt: string): string {
  const secs = secondsUntilExpiry(new Date(expiresAt));
  if (secs <= 0) return 'expired';
  const m = Math.floor(secs / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m left`;
  return `${m}m left`;
}

/** Shared sessions table. Renders one row per session; ends sessions owned by the viewer. */
export function SupportSessionsTable({
  sessions,
  showInstitution = true,
}: {
  sessions: SupportAccessSessionDto[];
  showInstitution?: boolean;
}) {
  const { data: me } = useCurrentEmployee();
  const { active, leave } = useSupportSession();
  const endSession = useEndSupportSession();

  function onEnd(s: SupportAccessSessionDto) {
    endSession.mutate(
      { id: s.id, reason: 'Ended from access sessions' },
      {
        onSuccess: () => {
          if (active?.sessionId === s.id) leave();
        },
        onError: (e) => {
          if (e instanceof ApiClientError) alert(e.message);
        },
      },
    );
  }

  if (sessions.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">No support sessions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
            {showInstitution && <th className="px-3 py-2 font-medium">Institution</th>}
            <th className="px-3 py-2 font-medium">Employee</th>
            <th className="px-3 py-2 font-medium">Access</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2 font-medium">Expires</th>
            <th className="px-3 py-2 font-medium">Case</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const mine = me?.employeeId === s.employeeId;
            const canEnd = s.status === 'active' && mine;
            return (
              <tr key={s.id} className="border-b border-border/60 hover:bg-background-secondary/50">
                {showInstitution && (
                  <td className="px-3 py-2 text-text-primary">{s.institutionName ?? '—'}</td>
                )}
                <td className="px-3 py-2">
                  <div className="text-text-primary">{s.employeeName}</div>
                  {s.employeeRole && (
                    <div className="text-xs text-text-muted">{s.employeeRole.replace(/_/g, ' ')}</div>
                  )}
                </td>
                <td className="px-3 py-2 capitalize text-text-secondary">
                  {s.accessLevel.replace(/_/g, ' ')}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[s.status]} dot className="capitalize">
                    {s.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-text-secondary">{when(s.startedAt)}</td>
                <td className="px-3 py-2 text-text-secondary">
                  {s.status === 'active' ? (
                    <span title={when(s.expiresAt)}>{remainingLabel(s.expiresAt)}</span>
                  ) : (
                    when(s.expiresAt)
                  )}
                </td>
                <td className="px-3 py-2 text-text-muted">{s.caseRef ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  {canEnd && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEnd(s)}
                      loading={endSession.isPending && endSession.variables?.id === s.id}
                    >
                      End
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
