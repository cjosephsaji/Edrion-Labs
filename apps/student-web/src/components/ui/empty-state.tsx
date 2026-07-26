import type { ReactNode } from 'react';
import { Eyebrow, PetrosMark } from './primitives';

export function EmptyState({
  eyebrow = 'NOTHING HERE YET',
  title,
  description,
  action,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[15px] border border-dashed border-st-bd2 bg-st-cardAlt px-6 py-10 text-center ${className}`}
    >
      <div className="flex items-center justify-center gap-1.5">
        <PetrosMark />
        <Eyebrow color="faint">{eyebrow}</Eyebrow>
      </div>
      <p className="mt-3 font-display text-lg font-semibold text-st-ink">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm text-st-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
