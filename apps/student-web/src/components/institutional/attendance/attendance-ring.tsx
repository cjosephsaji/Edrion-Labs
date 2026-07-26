import type { AttendanceZone } from '@/lib/attendance';

const zoneStroke: Record<AttendanceZone, string> = {
  safe: 'var(--st-success)',
  warning: 'var(--st-amber)',
  below: 'var(--st-danger)',
  unrecoverable: 'var(--st-danger)',
};

const zoneLabel: Record<AttendanceZone, string> = {
  safe: 'On track',
  warning: 'Near threshold',
  below: 'Below threshold',
  unrecoverable: 'Unrecoverable',
};

export function AttendanceRing({
  pct,
  zone,
  thresholdPct,
  size = 140,
}: {
  pct: number | null;
  zone: AttendanceZone;
  thresholdPct: number;
  size?: number;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = pct == null ? 0 : Math.min(100, Math.max(0, pct)) / 100;
  const dash = circumference * progress;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--st-surface2)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={zoneStroke[zone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-3xl font-semibold text-st-ink">{pct ?? '—'}%</p>
          <p className="text-[10px] text-st-faint">min {thresholdPct}%</p>
        </div>
      </div>
      <span className="rounded-full bg-st-surface2 px-2.5 py-0.5 font-mono-ui text-[10px] font-semibold uppercase tracking-wide text-st-muted">
        {zoneLabel[zone]}
      </span>
    </div>
  );
}
