'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useHistory } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';

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
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>HISTORY</Eyebrow>}
        title="History"
        subtitle="Your learning activity over time."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <PillChip key={f.key} variant={filter === f.key ? 'primary' : 'default'} onClick={() => setFilter(f.key)}>
            {f.label}
          </PillChip>
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
              <Eyebrow className="mb-2">
                {new Date(group.day).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                }).toUpperCase()}
              </Eyebrow>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.cursor}>
                    <Link
                      href={item.reopen.route}
                      className="flex items-center justify-between rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3 transition hover:border-st-accent/40"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-st-ink">{item.title}</p>
                        <p className="text-xs text-st-muted">{item.meta}</p>
                      </div>
                      <span className="shrink-0 font-mono-ui text-[10px] font-semibold uppercase tracking-wide text-st-faint">
                        {item.kind}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {(data?.groups ?? []).length === 0 && (
            <EmptyState
              eyebrow="NO HISTORY"
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
