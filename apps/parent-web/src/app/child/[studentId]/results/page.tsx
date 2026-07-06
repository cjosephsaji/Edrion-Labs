'use client';
import { useParams } from 'next/navigation';
import { useGet } from '@/lib/hooks';
import { useTerm } from '@/lib/term';
import { Card, Skeleton, EmptyState, Section } from '@/components/ui';

type Results = { terms: Array<{ key: string; title: string; subjects: Array<{ subject: string | null; marksObtained: number; maxMarks: number; letterGrade: string | null }> }> };

export default function ResultsPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { t, tp } = useTerm();
  const { data, isLoading } = useGet<Results>(`/students/${studentId}/results`);
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-40" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Results & {tp('term')}</h1>
      {(!data || data.terms.length === 0) && (
        <EmptyState title="No results published yet" hint={`Results appear here once the institution publishes them.`} />
      )}
      {data?.terms.map((term) => (
        <Section key={term.key} title={term.title}>
          <Card className="divide-y divide-line">
            {term.subjects.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">{s.subject ?? t('subject')}</span>
                <span className="text-sm">
                  <b>{s.marksObtained}</b><span className="text-muted">/{s.maxMarks}</span>
                  {s.letterGrade && <span className="ml-2 text-brand font-semibold">{s.letterGrade}</span>}
                </span>
              </div>
            ))}
          </Card>
        </Section>
      ))}
    </div>
  );
}
