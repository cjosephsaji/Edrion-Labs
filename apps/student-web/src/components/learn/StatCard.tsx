import type { ReactNode } from 'react';

type StatCardProps = {
  label: string;
  value: ReactNode;
  from: string;
  className?: string;
};

export function StatCard({ label, value, from, className = '' }: StatCardProps) {
  return (
    <div className={`rounded-2xl border border-st-bd1 bg-st-card p-4 ${className}`}>
      <p className="text-[10px] font-semibold tracking-[0.12em] text-st-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-st-ink">{value}</p>
      <p className="mt-1 text-xs text-st-muted">{from}</p>
    </div>
  );
}
