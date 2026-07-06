'use client';
import Link from 'next/link';
import { useCreateSession, usePath } from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

export default function PathPage() {
  const { data: path, isLoading } = usePath();
  const createSession = useCreateSession();

  const startItem = async (itemId: string, title: string, topicKey: string) => {
    const session = await createSession.mutateAsync({
      pathItemId: itemId,
      topicTitle: title,
      topicKey,
      source: 'path',
    });
    window.location.href = `/learn/session/${session.id}`;
  };

  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-10"><div className="h-48 shimmer rounded-2xl" /></div>;
  }

  if (!path) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-semibold text-st-ink">No learning path yet</h1>
        <p className="mt-2 text-sm text-st-muted">Start from Learn home to build your path.</p>
        <Link href="/learn" className="mt-4 inline-block text-st-accent">Go to Learn</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/learn" className="text-sm text-st-muted hover:text-st-accent">← Learn</Link>
      <p className="mt-4 text-[10px] font-semibold tracking-wide text-st-faint">{path.subjectLabel}</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{path.title}</h1>
      {path.metaLine && <p className="mt-1 text-sm text-st-muted">{path.metaLine}</p>}

      <div className="mt-8 space-y-3">
        {path.items
          .filter((i) => i.status !== 'removed')
          .map((item) => (
            <Card key={item.id} className={item.status === 'current' ? 'border-st-accent/40' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display font-semibold text-st-ink">{item.title}</p>
                  {item.whyHere && <p className="mt-1 text-xs text-st-muted">{item.whyHere}</p>}
                </div>
                {item.freshness && <FreshnessChip freshness={item.freshness} />}
              </div>
              {item.status === 'current' && (
                <PillButton
                  className="mt-3"
                  onClick={() => void startItem(item.id, item.title, item.topicKey)}
                  disabled={createSession.isPending}
                >
                  Start
                </PillButton>
              )}
              {item.status === 'completed' && (
                <p className="mt-2 text-xs font-semibold text-st-green">Completed</p>
              )}
            </Card>
          ))}
      </div>
    </div>
  );
}
