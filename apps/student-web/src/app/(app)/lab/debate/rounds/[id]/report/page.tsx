'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useDebateReport } from '@/lib/hooks/debate-lab';
import { PageHeader, PillChip } from '@/components/ui/primitives';

export default function DebateReportPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useDebateReport(params.id);
  const verdict = data?.verdict;
  const report = data?.report;
  const score = data?.score;
  const speaker = (report?.perSpeaker?.[0] ?? {}) as {
    strengths?: { text: string }[];
    fixes?: { text: string }[];
    focus_directive?: string;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <PageHeader
        backHref="/lab/debate"
        title="Round report"
        subtitle={isLoading ? 'Loading…' : undefined}
      />
      <div className="mt-6 flex items-center gap-2">
        <PillChip variant="primary">Beta judge</PillChip>
        {score?.bandLabel && <span className="text-sm">{score.bandLabel}</span>}
      </div>
      {verdict && (
        <section className="mt-8 rounded-[16px] border border-st-bd1 bg-st-card p-5">
          <p className="text-xs font-semibold uppercase text-st-muted">Verdict</p>
          <p className="mt-2 text-lg font-medium capitalize">{verdict.winner}</p>
          <p className="mt-2 text-sm text-st-muted">{verdict.reasoning}</p>
        </section>
      )}
      {report?.roundSummary && (
        <section className="mt-6 text-sm leading-relaxed">{report.roundSummary}</section>
      )}
      {speaker.focus_directive && (
        <section className="mt-8 rounded-[16px] border border-st-accent/30 bg-st-accentSoft p-5">
          <p className="text-xs font-semibold uppercase text-st-accent">Focus next round</p>
          <p className="mt-2 text-sm">{speaker.focus_directive}</p>
        </section>
      )}
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-st-muted">Strengths</p>
          <ul className="mt-2 space-y-2 text-sm">
            {(speaker.strengths ?? []).map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-st-muted">Fixes</p>
          <ul className="mt-2 space-y-2 text-sm">
            {(speaker.fixes ?? []).map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ul>
        </div>
      </div>
      <Link href={`/lab/debate/rounds/${params.id}/clash`} className="mt-10 inline-block text-sm text-st-accent">
        View clash map →
      </Link>
    </div>
  );
}
