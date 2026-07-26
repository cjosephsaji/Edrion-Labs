'use client';

import { cn } from '../cn';
import { addDays, startOfWeek, toISODate } from './date-math';
import type { MonthGridItem } from './month-grid';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function swatchClass(color: string | null | undefined): string {
  const map: Record<string, string> = {
    red: 'bg-[var(--danger-soft)] text-[var(--danger)]',
    amber: 'bg-[var(--warning-soft)] text-[var(--warning)]',
    green: 'bg-[var(--success-soft)] text-[var(--success)]',
    blue: 'bg-[var(--info-soft)] text-[var(--info)]',
    purple: 'bg-primary-soft text-primary',
    orange: 'bg-[var(--warning-soft)] text-[var(--warning)]',
    teal: 'bg-[var(--info-soft)] text-[var(--info)]',
    slate: 'bg-surface text-text-muted',
    pink: 'bg-[var(--danger-soft)] text-[var(--danger)]',
    indigo: 'bg-primary-soft text-primary',
  };
  return map[color ?? 'green'] ?? map.green!;
}

export interface WeekGridProps {
  /** Any ISO date in the week to display. */
  weekOf: string;
  items: MonthGridItem[];
  today?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onDayClick?: (iso: string) => void;
  onItemClick?: (item: MonthGridItem) => void;
  className?: string;
}

export function WeekGrid({
  weekOf,
  items,
  today = toISODate(new Date()),
  weekStartsOn = 1,
  onDayClick,
  onItemClick,
  className,
}: WeekGridProps) {
  const start = startOfWeek(weekOf, weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const labels =
    weekStartsOn === 0
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : DOW;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-surface-elevated',
        className,
      )}
    >
      <div className="grid grid-cols-7 border-b border-border bg-background-secondary/60">
        {days.map((iso, i) => {
          const isTod = today === iso;
          const d = Number(iso.slice(8, 10));
          return (
            <button
              key={`h-${iso}`}
              type="button"
              onClick={() => onDayClick?.(iso)}
              className={cn(
                'flex flex-col items-center gap-1 border-r border-border px-2 py-3 last:border-r-0 hover:bg-primary-soft/25',
                isTod && 'bg-primary-soft/30',
              )}
            >
              <span className="text-xs font-medium text-text-muted">{labels[i]}</span>
              <span
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
                  isTod ? 'bg-primary text-primary-foreground' : 'text-text-primary',
                )}
              >
                {d}
              </span>
            </button>
          );
        })}
      </div>
      <div className="grid min-h-[22rem] grid-cols-7">
        {days.map((iso) => {
          const dayItems = items.filter((it) => {
            const end = it.endDate ?? it.date;
            return it.date <= iso && end >= iso;
          });
          const isTod = today === iso;
          return (
            <div
              key={iso}
              className={cn(
                'flex flex-col border-r border-border p-1.5 last:border-r-0',
                isTod && 'bg-primary-soft/10',
              )}
            >
              <button
                type="button"
                className="mb-1 min-h-[1.5rem] w-full rounded text-left text-[10px] text-text-muted opacity-0 hover:opacity-100 focus:opacity-100"
                onClick={() => onDayClick?.(iso)}
                aria-label={`Add event on ${iso}`}
              >
                + Add
              </button>
              <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {dayItems.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      className={cn(
                        'w-full truncate rounded px-1.5 py-1 text-left text-xs',
                        swatchClass(it.color),
                      )}
                      onClick={() => onItemClick?.(it)}
                    >
                      {it.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
