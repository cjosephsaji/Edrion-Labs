'use client';
import { useParams } from 'next/navigation';
import { useGet } from '@/lib/hooks';
import { Card, Skeleton, EmptyState, Section } from '@/components/ui';

type Results = { terms: Array<{ key: string; title: string; subjects: Array<{ subject: string | null; marksObtained: number; maxMarks: number; letterGrade: string | null }> }> };

export default function ResultsPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data, isLoading } = useGet<Results>(`/students/${studentId}/results`);
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-40" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Results & Exams</h1>
      {(!data || data.terms.length === 0) && (
        <EmptyState title="No results published yet" hint="Results appear here once the school publishes them." />
      )}
      {data?.terms.map((t) => (
        <Section key={t.key} title={t.title}>
          <Card className="divide-y divide-line">
            {t.subjects.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-medium">{s.subject ?? 'Subject'}</span>
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
