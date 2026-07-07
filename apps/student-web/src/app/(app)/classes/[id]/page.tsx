'use client';
import Link from 'next/link';
import { useClassAbout, useClassMaterials, useClassStream } from '@/lib/hooks';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export default function ClassDetailPage({ params }: { params: { id: string } }) {
  const { data: about, isLoading: aboutLoading } = useClassAbout(params.id);
  const { data: stream, isLoading: streamLoading } = useClassStream(params.id);
  const { data: materials, isLoading: materialsLoading } = useClassMaterials(params.id);

  const loading = aboutLoading || streamLoading || materialsLoading;

  if (loading) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  const info = about as {
    teacherName?: string | null;
    timetableLines?: string[];
    attendance?: { present: number; total: number };
  } | undefined;

  const streamItems = stream?.items ?? [];
  const materialItems = materials?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/classes" className="text-sm text-st-muted hover:text-st-accent">← Classes</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Class details</h1>

      <Card className="mt-6">
        <p className="text-xs text-st-faint">Teacher</p>
        <p className="font-semibold text-st-ink">{info?.teacherName ?? '—'}</p>
        {info?.attendance && (
          <p className="mt-3 text-sm text-st-muted">
            Attendance: {info.attendance.present}/{info.attendance.total}
          </p>
        )}
        {info?.timetableLines && info.timetableLines.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-st-muted">
            {info.timetableLines.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        )}
      </Card>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">CLASS STREAM</h2>
        {streamItems.length === 0 ? (
          <EmptyState
            eyebrow="EMPTY STREAM"
            title="Nothing posted yet"
            description="Your teacher hasn't shared updates for this class."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {streamItems.map((post) => (
              <li key={post.id}>
                <Card>
                  <span className="text-[10px] font-semibold uppercase text-st-faint">{post.kind}</span>
                  <p className="mt-1 font-semibold text-st-ink">{post.title ?? '—'}</p>
                  {post.body && <p className="mt-1 text-sm text-st-muted">{post.body}</p>}
                  {post.kind === 'covered' && post.title && (
                    <Link
                      href={`/learn?topic=${encodeURIComponent(post.title)}`}
                      className="mt-2 inline-block text-xs font-semibold text-st-accent"
                    >
                      Learn this topic →
                    </Link>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">MATERIALS</h2>
        {materialItems.length === 0 ? (
          <EmptyState
            eyebrow="NO MATERIALS"
            title="No materials yet"
            description="Handouts and readings will show up here when your teacher adds them."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {materialItems.map((m) => (
              <li key={m.id}>
                <Card>
                  <p className="font-semibold text-st-ink">{m.title}</p>
                  <p className="text-xs text-st-muted">
                    {m.kindLabel}
                    {m.weekNo != null && ` · Week ${m.weekNo}`}
                  </p>
                  {m.description && <p className="mt-1 text-sm text-st-muted">{m.description}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
