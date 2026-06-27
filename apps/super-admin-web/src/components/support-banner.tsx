'use client';
import { useEffect, useState } from 'react';
import { ShieldAlert, Clock, Plus } from 'lucide-react';
import { Button } from '@edrion/ui';
import { secondsUntilExpiry } from '@edrion/schemas';
import {
  ApiClientError,
  useEndSupportSession,
  useExtendSupportSession,
  useMarkPortalEntered,
} from '@edrion/api-client';
import { useSupportSession } from '@/lib/support-session';

const EXTEND_MINUTES = 30;

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Persistent support-mode banner. Renders above the whole app while a session is active:
 * employee identity + institution + a live countdown to hard expiry + the recorded-actions
 * warning. Auto-clears when the countdown lapses (the server's sweep marks it `expired`).
 */
export function SupportBanner() {
  const { active, enter, leave } = useSupportSession();
  const sessionId = active?.sessionId ?? '';

  const markEntered = useMarkPortalEntered();
  const endSession = useEndSupportSession();
  const extendSession = useExtendSupportSession(sessionId);

  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Log "portal opened" once per active session id.
  useEffect(() => {
    if (sessionId) markEntered.mutate(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 1s countdown; auto-leave on expiry.
  useEffect(() => {
    if (!active) return;
    const expiresAt = new Date(active.expiresAt);
    const tick = () => {
      const left = secondsUntilExpiry(expiresAt);
      setRemaining(left);
      if (left <= 0) leave();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active, leave]);

  if (!active) return null;

  const expiringSoon = remaining <= 120;

  function onEnd() {
    setError(null);
    endSession.mutate(
      { id: active!.sessionId, reason: 'Support task complete' },
      {
        onSuccess: () => leave(),
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not end the session.'),
      },
    );
  }

  function onExtend() {
    setError(null);
    extendSession.mutate(
      { addMinutes: EXTEND_MINUTES, reason: 'Additional time needed to complete support task' },
      {
        onSuccess: (updated) => enter({ ...active!, expiresAt: updated.expiresAt }),
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Could not extend the session.'),
      },
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-sm text-white"
    >
      <span className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="h-4 w-4" />
        Edrion Support Mode
      </span>
      <span className="min-w-0">
        Accessing <span className="font-semibold">{active.institutionName}</span> as{' '}
        <span className="font-semibold">{active.employeeName}</span> ·{' '}
        <span className="capitalize">{active.accessLevel.replace(/_/g, ' ')}</span>. All actions are
        recorded.
      </span>
      <span
        className={`ml-auto flex items-center gap-1.5 font-medium tabular-nums ${
          expiringSoon ? 'animate-pulse' : ''
        }`}
      >
        <Clock className="h-4 w-4" />
        Expires in {formatCountdown(remaining)}
      </span>
      {error && <span className="text-xs font-medium text-white/90">{error}</span>}
      <Button
        variant="ghost"
        size="sm"
        onClick={onExtend}
        loading={extendSession.isPending}
        className="text-white hover:bg-white/15"
      >
        <Plus className="h-3.5 w-3.5" /> {EXTEND_MINUTES}m
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onEnd}
        loading={endSession.isPending}
        className="border border-white/60 bg-white text-warning hover:bg-white/90"
      >
        End session
      </Button>
    </div>
  );
}
