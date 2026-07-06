import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-st-bd1 bg-st-card p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
