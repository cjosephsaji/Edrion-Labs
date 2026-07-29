'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useReportCard, useReportCards } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { PillButton } from '@/components/ui/pill-button';

function weakEntry(entry: { marks: number; maxMarks: number }) {
  return entry.maxMarks > 0 && entry.marks / entry.maxMarks <= 0.55;
}

export default function ReportCardsPage() {
  const searchParams = useSearchParams();
  const detailId = searchParams.get('id');
  const { data, isLoading } = useReportCards();
  const { data: detail, isLoading: detailLoading } = useReportCard(detailId ?? undefined);

  if (detailId) {
    if (detailLoading || !detail) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="h-48 shimmer rounded-[15px]" />
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref="/report-cards"
          eyebrow={<Eyebrow>SCHOOL</Eyebrow>}
          title={detail.termLabel}
          subtitle={detail.publishedAt ? `Published ${new Date(detail.publishedAt).toLocaleDateString()}` : undefined}
        />

        {detail.kind === 'structured' && (detail.entries ?? []).length > 0 ? (
          <div className="mt-6 space-y-3">
            {(detail.entries ?? []).map((entry) => (
              <div
                key={entry.id}
                className="rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-st-ink">{entry.subjectLabel}</p>
                    <p className="text-sm text-st-muted">
                      {entry.marks}/{entry.maxMarks}
                      {entry.gradeLetter ? ` · ${entry.gradeLetter}` : ''}
                    </p>
                  </div>
                  {entry.id && weakEntry(entry) && (
                    <Link
                      href={`/learn/session/start?entryPoint=bad_result&reportCardEntryId=${entry.id}`}
                    >
                      <PillButton variant="soft" className="text-xs whitespace-nowrap">
                        Fix with Petros
                      </PillButton>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-8"
            eyebrow="NO DETAIL"
            title="No structured entries"
            description="This report card does not have per-subject breakdowns."
          />
        )}
      </div>
    );
  }

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
