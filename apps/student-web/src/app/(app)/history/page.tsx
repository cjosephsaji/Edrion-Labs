'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useHistory } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'session', label: 'Sessions' },
  { key: 'quick', label: 'Quick' },
  { key: 'mock', label: 'Mock exams' },
  { key: 'debate', label: 'Debates' },
] as const;

export default function HistoryPage() {
  const [filter, setFilter] = useState<string>('all');
  const { data, isLoading } = useHistory(filter === 'all' ? undefined : filter);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">History</h1>
      <p className="mt-1 text-sm text-st-muted">Your learning activity over time.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === f.key ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 shimmer rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {(data?.groups ?? []).map((group) => (
            <section key={group.day}>
              <p className="text-[10px] font-semibold tracking-wide text-st-faint">
                {new Date(group.day).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <ul className="mt-2 space-y-2">
                {group.items.map((item) => (
                  <li key={item.cursor}>
                    <Link
                      href={item.reopen.route}
                      className="flex items-center justify-between rounded-xl border border-st-bd1 bg-st-card px-4 py-3 transition hover:border-st-accent/40"
                    >
                      <div>
                        <p className="text-sm font-medium text-st-ink">{item.title}</p>
                        <p className="text-xs text-st-muted">{item.meta}</p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase text-st-faint">{item.kind}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {(data?.groups ?? []).length === 0 && (
            <EmptyState
              icon="🕐"
              title={filter === 'mock' || filter === 'debate' ? 'Nothing here yet' : 'No history yet'}
              description={
                filter === 'mock' || filter === 'debate'
                  ? 'Complete a mock exam or debate to see it here.'
                  : 'Start a Learn session — your activity will show up here.'
              }
              action={
                <Link href="/learn" className="text-sm font-semibold text-st-accent">
                  Go to Learn →
                </Link>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
