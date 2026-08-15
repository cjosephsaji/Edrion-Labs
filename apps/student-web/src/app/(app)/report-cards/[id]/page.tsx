'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryPage } from '@/components/query-page';
import { PageHeader, SurfaceCard } from '@/components/ui/states';
import { useStudentApi } from '@/lib/api-client';

type Entry = {
  id: string;
  subjectLabel?: string | null;
  component?: string | null;
  marks?: number | null;
  maxMarks?: number | null;
  gradeLetter?: string | null;
  remarks?: string | null;
};

type Detail = {
  id: string;
  termLabel?: string | null;
  kind?: string | null;
  publishedAt?: string | null;
  gpa?: number | null;
  pdfObjectId?: string | null;
  entries?: Entry[];
};

export default function ReportCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useStudentApi();
  const query = useQuery({
    queryKey: ['student', 'report-cards', id],
    queryFn: () => api.get<Detail>(`/student/report-cards/${id}`),
    enabled: Boolean(id),
  });

  return (
    <QueryPage query={query} loadingLabel="Loading report card…">
      {(raw) => {
        const data = raw as Detail;
        const rows = data.entries ?? [];
        return (
          <div>
            <PageHeader
              title={data.termLabel ?? 'Report card'}
              description={[
                data.kind,
                data.gpa != null ? `GPA ${data.gpa}` : '',
                data.publishedAt ? new Date(data.publishedAt).toLocaleDateString() : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              actions={
                <Link
                  href="/report-cards"
                  className="text-sm font-medium text-[var(--s-accentDeep)]"
                >
                  All report cards
                </Link>
              }
            />

            {rows.length === 0 ? (
              <SurfaceCard>
                <p className="text-sm text-[var(--s-muted)]">
                  {data.pdfObjectId
                    ? 'This report card is available as a PDF document from your institution.'
                    : 'No subject rows on this report card.'}
                </p>
              </SurfaceCard>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li key={row.id}>
                    <SurfaceCard>
                      <p className="font-medium text-[var(--s-ink)]">
                        {row.subjectLabel ?? 'Subject'}
                        {row.component ? ` · ${row.component}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-[var(--s-muted)]">
                        {[
                          row.marks != null && row.maxMarks != null
                            ? `${row.marks}/${row.maxMarks}`
                            : row.marks != null
                              ? String(row.marks)
                              : '',
                          row.gradeLetter,
                          row.remarks,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                    </SurfaceCard>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
