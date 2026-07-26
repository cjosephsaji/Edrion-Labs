'use client';

import { cn } from '../cn';
import { monthMatrix } from './date-math';

export interface MonthGridItem {
  id: string;
  title: string;
  date: string;
  endDate?: string | null;
  color?: string | null;
  editable?: boolean;
}

export interface MonthGridProps {
  year: number;
  month: number;
  items: MonthGridItem[];
  today?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onDayClick?: (iso: string) => void;
  onItemClick?: (item: MonthGridItem) => void;
  className?: string;
}

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

/** Greedy lane packing for multi-day bars within one week row. */
function packLanes(
  events: Array<MonthGridItem & { startCol: number; endCol: number; span: number }>,
): Array<{ event: MonthGridItem; startCol: number; span: number; lane: number }> {
  const sorted = [...events].sort((a, b) => a.startCol - b.startCol || b.span - a.span);
  const laneEnds: number[] = [];
  const placed: Array<{ event: MonthGridItem; startCol: number; span: number; lane: number }> = [];
  for (const ev of sorted) {
    let lane = laneEnds.findIndex((end) => end < ev.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(ev.endCol);
    } else {
      laneEnds[lane] = ev.endCol;
    }
    placed.push({ event: ev, startCol: ev.startCol, span: ev.span, lane });
  }
  return placed;
}

export function MonthGrid({
  year,
  month,
  items,
  today,
  weekStartsOn = 1,
  onDayClick,
  onItemClick,
  className,
}: MonthGridProps) {
  const weeks = monthMatrix(year, month, weekStartsOn);
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-surface-elevated',
        className,
      )}
    >
      <div className="grid grid-cols-7 border-b border-border bg-background-secondary/60">
        {DOW.map((d) => (
          <div
            key={d}
            className="border-r border-border px-2 py-2 text-center text-xs font-medium text-text-muted last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const multi = items
          .filter((it) => {
            const end = it.endDate ?? it.date;
            return end >= week[0]! && it.date <= week[6]!;
          })
          .map((it) => {
            const startCol = Math.max(
              0,
              week.findIndex((d) => d >= it.date),
            );
            const endIso = it.endDate ?? it.date;
            let endCol = week.findIndex((d) => d > endIso);
            if (endCol === -1) endCol = 7;
            const span = Math.max(1, endCol - startCol);
            return { ...it, startCol, endCol: endCol - 1, span };
          })
          .filter((it) => (it.endDate ?? it.date) !== it.date || it.span > 1);

        const singles = items.filter((it) => {
          const end = it.endDate ?? it.date;
          return end === it.date && week.includes(it.date);
        });

        const packed = packLanes(multi);
        const maxLane = packed.reduce((m, p) => Math.max(m, p.lane), -1);
        const multiPad = maxLane >= 0 ? (maxLane + 1) * 18 + 4 : 0;

        return (
          <div
            key={wi}
            className={cn('relative', wi < weeks.length - 1 && 'border-b border-border')}
          >
            <div className="grid grid-cols-7">
              {week.map((iso) => {
                const inMonth = iso.startsWith(monthPrefix);
                const isTod = today === iso;
                const daySingles = singles.filter((s) => s.date === iso);
                const overflow = daySingles.length > 3 ? daySingles.length - 3 : 0;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => onDayClick?.(iso)}
                    className={cn(
                      'min-h-[6.5rem] border-r border-border p-1.5 text-left align-top transition-colors last:border-r-0 hover:bg-primary-soft/25',
                      !inMonth && 'bg-background-secondary/40 text-text-muted',
                      isTod && 'bg-primary-soft/20',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                        isTod && 'bg-primary font-semibold text-primary-foreground',
                        !isTod && inMonth && 'text-text-primary',
                        !isTod && !inMonth && 'text-text-muted',
                      )}
                    >
                      {Number(iso.slice(8))}
                    </span>
                    <div
                      className="mt-1 flex flex-col gap-0.5"
                      style={multiPad > 0 ? { paddingTop: multiPad } : undefined}
                    >
                      {daySingles.slice(0, 3).map((it) => (
                        <span
                          key={it.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onItemClick?.(it);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              onItemClick?.(it);
                            }
                          }}
                          className={cn(
                            'truncate rounded px-1 py-0.5 text-[10px] font-medium',
                            swatchClass(it.color),
                          )}
                        >
                          {it.title}
                        </span>
                      ))}
                      {overflow > 0 ? (
                        <span className="text-[10px] text-text-muted">+{overflow} more</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            {maxLane >= 0 ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-8 grid grid-cols-7 px-0.5"
                style={{ height: `${(maxLane + 1) * 18}px` }}
              >
                {packed.map((p) => (
                  <button
                    key={`${p.event.id}-${p.startCol}`}
                    type="button"
                    className={cn(
                      'pointer-events-auto mx-0.5 truncate rounded px-1 text-[10px] font-medium',
                      swatchClass(p.event.color),
                    )}
                    style={{
                      gridColumn: `${p.startCol + 1} / span ${p.span}`,
                      gridRow: p.lane + 1,
                    }}
                    onClick={() => onItemClick?.(p.event)}
                  >
                    {p.event.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
