'use client';
import Link from 'next/link';
import { useReportCards } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function ReportCardsPage() {
  const { data, isLoading } = useReportCards();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>SCHOOL</Eyebrow>}
        title="Report cards"
        subtitle={data?.cgpa != null ? `CGPA: ${data.cgpa.toFixed(2)}` : undefined}
      />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (data?.groups ?? []).length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO REPORTS"
          title="No report cards yet"
          description="Term reports from your school will appear here when published."
        />
      ) : (
        <div className="mt-6 space-y-6">
          {(data?.groups ?? []).map((group) => (
            <section key={group.yearLabel}>
              <Eyebrow>{group.yearLabel}</Eyebrow>
              <div className="mt-2 space-y-2">
                {group.terms.map((term) => (
                  <Link key={term.id} href={`/report-cards?id=${term.id}`}>
                    <div className="rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5 transition hover:border-st-accent/40">
                      <p className="font-semibold text-st-ink">{term.termLabel}</p>
                      <p className="text-xs text-st-muted">
                        {term.kind === 'uploaded_pdf' ? 'PDF' : 'Structured'}
                        {term.superseded && ' · Superseded'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
