'use client';
import Link from 'next/link';
import { useMockExams } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function MockExamsIndexPage() {
  const { data, isLoading } = useMockExams();
  const exams = data?.exams ?? [];
  const blueprints = data?.blueprints ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab"
        backLabel="The Lab"
        eyebrow={<Eyebrow color="amber">INSTRUMENT 02</Eyebrow>}
        title="Mock exams"
        subtitle="Blueprint-driven practice — marks are honest; verdicts stay qualitative."
      />

      <div className="mt-6">
        <Link href="/lab/mock-exams/new">
          <PillButton className="w-full sm:w-auto">Build a new exam</PillButton>
        </Link>
      </div>

      <section className="mt-10">
        <Eyebrow>PAST EXAMS</Eyebrow>
        {isLoading && <p className="mt-3 text-sm text-st-muted">Loading…</p>}
        {!isLoading && exams.length === 0 && (
          <p className="mt-3 text-sm text-st-muted">No exams yet — start with a blueprint.</p>
        )}
        <ul className="mt-3 space-y-2">
          {exams.map((e) => (
            <li key={e.id}>
              <Link
                href={
                  e.status === 'completed'
                    ? `/lab/mock-exams/${e.id}/results`
                    : e.status === 'ready' || e.status === 'in_progress'
                      ? `/lab/mock-exams/${e.id}/attempt`
                      : e.status === 'generating'
                        ? `/lab/mock-exams/${e.id}`
                        : `/lab/mock-exams/${e.id}`
                }
                className="flex items-center justify-between rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 hover:border-st-accent"
              >
                <div>
                  <p className="font-medium text-st-ink">{e.title}</p>
                  <p className="font-mono text-xs text-st-muted">{e.subjectLabel}</p>
                </div>
                <span className="font-mono text-xs uppercase text-st-muted">{e.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {blueprints.length > 0 && (
        <section className="mt-10">
          <Eyebrow>SAVED BLUEPRINTS</Eyebrow>
          <ul className="mt-3 space-y-2">
            {blueprints.map((b) => {
              const title =
                typeof b.blueprint === 'object' && b.blueprint && 'title' in b.blueprint
                  ? String((b.blueprint as { title?: string }).title ?? 'Blueprint')
                  : 'Blueprint';
              return (
                <li key={b.id}>
                  <Link
                    href={`/lab/mock-exams/blueprints/${b.id}`}
                    className="block rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 hover:border-st-accent"
                  >
                    <p className="font-medium text-st-ink">{title}</p>
                    <p className="font-mono text-xs text-st-muted">v{b.version}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
