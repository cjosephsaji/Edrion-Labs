'use client';
import { useEffect, useRef, useState } from 'react';

type TimerTone = 'calm' | 'warn' | 'urgent';

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Display-only countdown driven by the server `endsAt`. Fires `onExpire` once at
 * zero (auto-submit) and `onWarning` at the halfway mark and the 5-minute mark.
 */
export function ExamTimer({
  endsAt,
  durationMs,
  onExpire,
  onWarning,
  compact = false,
}: {
  endsAt: string;
  durationMs?: number;
  onExpire?: () => void;
  onWarning?: (kind: 'half' | 'five_min') => void;
  compact?: boolean;
}) {
  const endMs = new Date(endsAt).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endMs - Date.now()));
  const firedExpire = useRef(false);
  const firedHalf = useRef(false);
  const firedFive = useRef(false);

  useEffect(() => {
    firedExpire.current = false;
    firedHalf.current = false;
    firedFive.current = false;
  }, [endsAt]);

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, endMs - Date.now());
      setRemaining(left);

      if (durationMs && !firedHalf.current && left <= durationMs / 2 && left > durationMs / 2 - 1500) {
        firedHalf.current = true;
        onWarning?.('half');
      }
      if (!firedFive.current && left <= 5 * 60_000 && left > 5 * 60_000 - 1500) {
        firedFive.current = true;
        onWarning?.('five_min');
      }
      if (left <= 0 && !firedExpire.current) {
        firedExpire.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endMs, durationMs, onExpire, onWarning]);

  const tone: TimerTone =
    remaining <= 60_000 ? 'urgent' : remaining <= 5 * 60_000 ? 'warn' : 'calm';
  const toneClass =
    tone === 'urgent'
      ? 'text-st-danger'
      : tone === 'warn'
        ? 'text-st-amberInk'
        : 'text-st-ink';

  return (
    <div
      className={`inline-flex items-center gap-2 ${compact ? '' : 'rounded-full border border-st-bd1 bg-st-card px-3.5 py-1.5'}`}
      role="timer"
      aria-live="off"
    >
      {!compact && (
        <span className="font-mono-ui text-[9px] font-semibold tracking-[0.12em] text-st-faint">
          TIME LEFT
        </span>
      )}
      <span
        className={`font-mono-ui text-[15px] font-semibold tabular-nums ${toneClass} ${
          tone === 'urgent' ? 'animate-st-blink' : ''
        }`}
      >
        {format(remaining)}
      </span>
    </div>
  );
}
