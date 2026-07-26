'use client';
import { useId, useState, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem {
  /** Stable identifier for the tab. */
  key: string;
  /** Tab button label (text or a node with an icon/count). */
  label: ReactNode;
  /** Panel body shown when the tab is active. */
  content: ReactNode;
}

/**
 * Lightweight, accessible controlled-by-default tab strip. Renders a horizontal, scrollable list of
 * tab buttons with an underline indicator, then the active panel below. Purely presentational —
 * callers supply the sections. Used by the user-details popup to split a large record into
 * digestible groups; small records can pass a single tab or skip Tabs entirely.
 */
export function Tabs({
  items,
  defaultKey,
  className,
  tablistClassName,
}: {
  items: TabItem[];
  defaultKey?: string;
  className?: string;
  tablistClassName?: string;
}) {
  const baseId = useId();
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  const current = items.find((t) => t.key === active) ?? items[0];
  if (!current) return null;

  return (
    <div className={className}>
      <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-border', tablistClassName)}>
        {items.map((t) => {
          const selected = t.key === current.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.key}`}
              onClick={() => setActive(t.key)}
              className={cn(
                'relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ease-standard duration-100',
                selected ? 'text-primary' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {t.label}
              {selected && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${current.key}`}
        aria-labelledby={`${baseId}-tab-${current.key}`}
        className="pt-4"
      >
        {current.content}
      </div>
    </div>
  );
}
