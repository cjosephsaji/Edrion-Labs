'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCreateSession, usePath } from '@/lib/hooks';
import { redirectIfSessionActive } from '@/lib/learn/session-active';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { PillButton } from '@/components/ui/pill-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function PathPage() {
  const router = useRouter();
  const { data: path, isLoading } = usePath();
  const createSession = useCreateSession();

  const startItem = async (itemId: string) => {
    try {
      const session = await createSession.mutateAsync({
        entryPoint: 'learning_path',
        pathItemId: itemId,
        goal: 'acquisition',
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(`/learn/session/${session.id}`);
    } catch (err) {
      if (!redirectIfSessionActive(err, router)) {
        throw err;
      }
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  const items = path?.items ?? [];

  if (!path?.id) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <EmptyState
          eyebrow="NO PATH YET"
          title="Your learning path will grow here"
          description="Start from Learn home — Petros will build a path as you go."
          action={
            <Link href="/learn">
              <PillButton>Go to Learn</PillButton>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/learn"
        eyebrow={<Eyebrow>{path.subjectLabel}</Eyebrow>}
        title={path.title}
        subtitle={path.metaLine ?? undefined}
      />

      <div className="relative mt-8 space-y-0">
        {items
          .filter((i) => i.status !== 'removed')
          .map((item, index, arr) => (
            <div key={item.id} className="relative flex gap-4 pb-6">
              <div className="flex flex-col items-center">
                <div
                  className={`z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                    item.status === 'completed'
                      ? 'border-st-accent bg-st-accent text-white'
                      : item.status === 'current'
                        ? 'border-st-accent bg-st-card'
                        : 'border-dashed border-st-faint2 bg-st-card'
                  }`}
                >
                  {item.status === 'completed' && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2 6.5l2.6 2.6L10 3.5"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  {item.status === 'current' && (
                    <span className="h-2 w-2 rounded-full bg-st-accent" />
                  )}
                </div>
                {index < arr.length - 1 && (
                  <div className="mt-1 w-px flex-1 bg-st-bd1" />
                )}
              </div>
              <div
                className={`min-w-0 flex-1 rounded-[15px] border p-4 ${
                  item.status === 'current'
                    ? 'border-st-accentBd bg-st-accentSoft'
                    : 'border-st-bd1 bg-st-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-semibold text-st-ink">{item.title}</p>
                    {item.whyHere && <p className="mt-1 text-xs text-st-muted">{item.whyHere}</p>}
                  </div>
                  {item.freshness && <FreshnessChip freshness={item.freshness} />}
                </div>
                {item.status === 'current' && path.orchestratorEnabled !== false && (
                  <PillButton
                    className="mt-3"
                    onClick={() => void startItem(item.id)}
                    disabled={createSession.isPending}
                  >
                    Start lesson
                  </PillButton>
                )}
                {item.status === 'current' && path.orchestratorEnabled === false && (
                  <p className="mt-2 text-xs text-st-muted">Lessons are paused right now.</p>
                )}
                {item.status === 'completed' && (
                  <p className="mt-2 text-xs font-semibold text-st-success">Completed</p>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
