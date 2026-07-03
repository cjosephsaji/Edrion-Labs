import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface border border-line p-4 ${className}`}>{children}</div>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const pillTone: Record<string, string> = {
  good: 'bg-good/10 text-good',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
  neutral: 'bg-line text-muted',
  brand: 'bg-brand/10 text-brand',
};
export function Pill({ tone = 'neutral', children }: { tone?: keyof typeof pillTone | string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pillTone[tone] ?? pillTone.neutral}`}>{children}</span>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-xl ${className}`} />;
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="text-center py-10 px-6">
      {icon && <div className="mx-auto mb-3 text-muted">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="text-sm text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, correlationId }: { message: string; correlationId?: string }) {
  return (
    <Card className="border-bad/30 bg-bad/5">
      <p className="font-medium text-bad">Something went wrong</p>
      <p className="text-sm text-muted mt-1">{message}</p>
      {correlationId && <p className="text-xs text-muted mt-2 font-mono">reference #{correlationId}</p>}
    </Card>
  );
}

export function Button({ children, onClick, disabled, variant = 'primary', type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'ghost'; type?: 'button' | 'submit' }) {
  const base = 'w-full rounded-xl px-4 py-3 font-semibold text-sm transition disabled:opacity-50';
  const styles = variant === 'primary' ? 'bg-brand text-white active:bg-brand-700' : 'bg-line/60 text-ink';
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}
