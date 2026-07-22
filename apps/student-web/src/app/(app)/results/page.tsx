'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { fetchTermResults, isResultsStale, schemeSnapshotFromPayload, type TermSubject } from '@/lib/results';
import { WhatIfDrawer } from '@/components/institutional/results/what-if-drawer';

export default function ResultsPage() {
  const { data, error, isLoading, mutate } = useSWR('student-results-term', () => fetchTermResults());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [whatIfSubject, setWhatIfSubject] = useState<TermSubject | null>(null);

  const stale = useMemo(
    () => isResultsStale(data?.computed_at, data ? new Date().toISOString() : undefined),
    [data],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button type="button" onClick={() => mutate()} className="rounded-[12px] border border-st-bd1 bg-st-card p-4 text-sm">
          Couldn&apos;t load results. Tap to retry.
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="h-8 w-48 shimmer rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 shimmer rounded-[15px]" />
        ))}
      </div>
    );
  }

  const empty = data.subjects.length === 0;
  const whatIfEnabled = data.features?.whatif === true;
  const scheme = schemeSnapshotFromPayload(data);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>ACADEMICS</Eyebrow>} title="Marks" subtitle="Released assessments only" />

      {stale ? (
        <p className="rounded-full bg-st-amberSoft px-3 py-1.5 text-xs text-st-amberInk">
          Last updated {new Date(data.computed_at).toLocaleString()}
        </p>
      ) : null}

      {empty ? (
        <p className="rounded-[15px] border border-st-bd1 bg-st-card p-6 text-sm text-st-muted">
          No marks released yet this term. You&apos;ll get a notification the moment they are.
        </p>
      ) : (
        <div className="space-y-3">
          {data.subjects.map((subject) => {
            const open = expanded === subject.subject_id;
            const soFar = subject.open_weight_pct > 0;
            return (
              <article key={subject.subject_id} className="rounded-[15px] border border-st-bd1 bg-st-card shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  onClick={() => setExpanded(open ? null : subject.subject_id)}
                >
                  <div>
                    <p className="font-medium text-st-ink">{subject.subject_name_snapshot}</p>
                    <p className="text-sm text-st-muted">
                      {subject.weighted_pct}% · {subject.grade ?? '—'}
                      {soFar ? ' so far' : ''}
                    </p>
                    {subject.credits_not_set ? (
                      <p className="text-xs text-st-amberInk">Credits not set</p>
                    ) : null}
                  </div>
                </button>
                {open ? (
                  <div className="space-y-2 border-t border-st-bd1 px-4 py-3">
                    {subject.components.map((component) => (
                      <div key={component.key} className="flex justify-between text-sm">
                        <span>{component.label}</span>
                        <span className="text-st-muted">
                          {component.released && component.score !== null
                            ? `${component.score}/${component.max}`
                            : '—'}
                        </span>
                      </div>
                    ))}
                    {whatIfEnabled && subject.open_weight_pct > 0 ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-st-primary"
                        onClick={() => setWhatIfSubject(subject)}
                      >
                        What do I need?
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <WhatIfDrawer subject={whatIfSubject} scheme={scheme} onClose={() => setWhatIfSubject(null)} />
    </div>
  );
}
