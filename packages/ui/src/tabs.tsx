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
  keepMounted = false,
}: {
  items: TabItem[];
  defaultKey?: string;
  className?: string;
  tablistClassName?: string;
  /** Keep visited panels mounted so unsaved form work survives tab changes. */
  keepMounted?: boolean;
}) {
  const baseId = useId();
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  const [visited, setVisited] = useState<string[]>([
    defaultKey ?? items[0]?.key ?? '',
  ]);
  function select(key: string) {
    setActive(key);
    setVisited((keys) => (keys.includes(key) ? keys : [...keys, key]));
  }
  const current = items.find((t) => t.key === active) ?? items[0];
  if (!current) return null;

  return (
    <div className={className}>
      <div
        role="tablist"
        className={cn(
          'flex gap-1 overflow-x-auto border-b border-border',
          tablistClassName,
        )}
      >
        {items.map((t) => {
          const selected = t.key === current.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.key}`}
              tabIndex={selected ? 0 : -1}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.key}`}
              onClick={() => select(t.key)}
              onKeyDown={(event) => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const index = items.findIndex((item) => item.key === t.key);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index +
                          (event.key === 'ArrowRight' ? 1 : -1) +
                          items.length) %
                        items.length;
                select(items[next]!.key);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus();
              }}
              className={cn(
                'relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ease-standard duration-100',
                selected
                  ? 'text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {t.label}
              {selected && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>
      {(keepMounted
        ? items.filter((t) => visited.includes(t.key) || t.key === current.key)
        : [current]
      ).map((t) => (
        <div
          key={t.key}
          role="tabpanel"
          id={`${baseId}-panel-${t.key}`}
          aria-labelledby={`${baseId}-tab-${t.key}`}
          hidden={t.key !== current.key}
          className="pt-4"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
