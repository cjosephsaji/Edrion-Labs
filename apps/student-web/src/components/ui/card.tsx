import type { ReactNode } from 'react';
import { Eyebrow } from './primitives';
import type { LucideIcon } from 'lucide-react';
import { IconChip } from './primitives';

export function Card({
  children,
  className = '',
  eyebrow,
  title,
  icon,
  iconTone = 'accent',
  headerRight,
  noPadding,
}: {
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  title?: string;
  icon?: LucideIcon;
  iconTone?: 'accent' | 'success' | 'gold' | 'amber' | 'violet' | 'blue' | 'danger';
  headerRight?: ReactNode;
  noPadding?: boolean;
}) {
  const hasHeader = eyebrow || title;

  return (
    <div className={`rounded-[15px] border border-st-bd1 bg-st-card shadow-sm ${className}`}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 border-b border-st-divider px-5 py-4">
          <div className="flex items-start gap-2.5">
            {icon && <IconChip icon={icon} tone={iconTone} className="mt-0.5" />}
            <div>
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              {title && (
                <p className={`font-display text-lg font-semibold text-st-ink ${eyebrow ? 'mt-1' : ''}`}>
                  {title}
                </p>
              )}
            </div>
          </div>
          {headerRight}
        </div>
      )}
      <div className={noPadding ? '' : hasHeader ? 'p-5' : 'p-4'}>{children}</div>
    </div>
  );
}
