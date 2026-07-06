'use client';
import Link from 'next/link';
import { useReportCards } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function ReportCardsPage() {
  const { data, isLoading } = useReportCards();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Report cards</h1>
      {data?.cgpa != null && (
        <p className="mt-1 text-sm text-st-muted">CGPA: {data.cgpa.toFixed(2)}</p>
      )}

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (
        <div className="mt-6 space-y-6">
          {(data?.groups ?? []).map((group) => (
            <section key={group.yearLabel}>
              <p className="text-xs font-semibold text-st-faint">{group.yearLabel}</p>
              <div className="mt-2 space-y-2">
                {group.terms.map((term) => (
                  <Link key={term.id} href={`/report-cards?id=${term.id}`}>
                    <Card className="transition hover:border-st-accent/40">
                      <p className="font-semibold text-st-ink">{term.termLabel}</p>
                      <p className="text-xs text-st-muted">
                        {term.kind === 'uploaded_pdf' ? 'PDF' : 'Structured'}
                        {term.superseded && ' · Superseded'}
                      </p>
                    </Card>
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
