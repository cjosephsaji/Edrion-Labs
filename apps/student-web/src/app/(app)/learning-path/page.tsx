'use client';

import Link from 'next/link';
import { Check, Circle, Map, Route } from 'lucide-react';
import type { PetrosReflectionSurface } from '@edrion/schemas';
import { PageHeader } from '@/components/design-system';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { PetrosDoorButton } from '@/components/petros/petros-door-button';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { useStudentList } from '@/lib/hooks';
import { LearnCrossLinks } from '../learn/learn-links';

type Path = {
  id: string;
  title: string;
  subjectLabel: string;
  metaLine: string | null;
  version: number;
  items: Array<{
    id: string;
    topicId: string;
    title: string;
    subjectLabel: string;
    sequence: number;
    whyHere: string | null;
    status: string;
    completedAt: string | null;
    version: number;
  }>;
} | null;

export default function LearningPathPage() {
  const query = useStudentList<Path>('petros-path', '/student/petros/path');
  const reflectionQuery = useStudentList<PetrosReflectionSurface>(
    'petros-reflection-context',
    '/student/petros/reflection',
  );
  const nextReflection = reflectionQuery.data?.recommendations[0] ?? null;

  usePetrosPage(
    query.data
      ? {
          title: query.data.title,
          summary: query.data.metaLine ?? 'Adaptive learning path',
          candidates: query.data.items.map((item) => ({
            ref: item.id,
            entityType: 'learning_path_step' as const,
            entityId: item.id,
            title: item.title,
            summary: [`step ${item.sequence}`, item.status, item.subjectLabel]
              .filter(Boolean)
              .join(' · '),
            href: '/learning-path',
          })),
        }
      : null,
  );

  return (
    <QueryPage query={query} loadingLabel="Loading your learning path…">
      {(path) => (
        <div className="mx-auto w-full max-w-[820px]">
          <PageHeader eyebrow="Adaptive learning" title={path?.title ?? 'Learning path'} description={path?.metaLine ?? 'Each active topic opens the same adaptive Petros teaching engine.'} />
          {nextReflection ? (
            <aside className="mt-5 border border-[#aacbbf] bg-[#f4faf7] p-4" aria-labelledby="reflection-next-heading">
              <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#557167]">Evidence-ranked next step</p>
              <h2 id="reflection-next-heading" className="mt-1 text-lg font-semibold">{nextReflection.title}</h2>
              <p className="mt-1 text-sm text-[var(--s-muted)]">{nextReflection.whyThis}</p>
              <p className="mt-2 text-xs text-[var(--s-faint)]">Rank score {nextReflection.score} · {nextReflection.sessionType} · one of at most four suggestions</p>
              <Link className="mt-3 inline-flex min-h-10 items-center border border-[#1f604a] px-3 py-2 text-xs font-bold text-[#1f604a]" href="/progress">
                Review evidence and action preview
              </Link>
            </aside>
          ) : null}
          {!path ? (
            <EmptyState icon={Map} title="No active learning path" description="Your institution or a future planning flow can add an evidence-based path here." />
          ) : (
            <ol className="mt-7 space-y-3" aria-label={`${path.subjectLabel} learning path`}>
              {path.items.map((item) => {
                const complete = item.status === 'completed';
                const current = item.status === 'current';
                return (
                  <li
                    key={item.id}
                    className={`grid grid-cols-[44px_1fr] gap-3 border p-4 ${current ? 'border-[#1f604a] bg-[#eef6f2]' : 'border-[var(--s-bd1)] bg-[var(--s-card)]'}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center ${complete ? 'bg-[#1f604a] text-white' : current ? 'border-2 border-[#1f604a] text-[#1f604a]' : 'border border-dashed border-[var(--s-bd2)] text-[var(--s-faint)]'}`}>
                      {complete ? <Check aria-hidden="true" /> : current ? <Route aria-hidden="true" /> : <Circle aria-hidden="true" />}
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--s-faint)]">Step {item.sequence} · {item.status}</p>
                      <h2 className="mt-1 text-lg font-semibold">{item.title}</h2>
                      {item.whyHere ? <p className="mt-1 text-sm text-[var(--s-muted)]">{item.whyHere}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {current ? <PetrosDoorButton door="learning_path" sourceId={item.id} label="Start this adaptive topic" /> : null}
                        <PetrosAskButton candidateRef={item.id} label={item.title} />
                      </div>
                      {complete ? <p className="mt-2 text-xs font-semibold text-[#1f604a]">Completed from demonstrated evidence</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <LearnCrossLinks />
        </div>
      )}
    </QueryPage>
  );
}
