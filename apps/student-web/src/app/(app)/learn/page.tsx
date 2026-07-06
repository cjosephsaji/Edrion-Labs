'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  useCreateSession,
  useIntent,
  usePath,
  useRevisionQueue,
  useStreaks,
} from '@/lib/hooks';
import { StatCard } from '@/components/learn/StatCard';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

const SUGGESTIONS = ['Quadratic equations', 'Photosynthesis', 'World War II causes', 'Trigonometry'];

export default function LearnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [intentText, setIntentText] = useState('');
  const { data: streaks } = useStreaks();
  const { data: path } = usePath();
  const { data: revision } = useRevisionQueue();
  const intent = useIntent();
  const createSession = useCreateSession();

  const currentItem = path?.items.find((i) => i.status === 'current');
  const dueRevision = revision?.queue.find((q) => q.freshness === 'due');

  useEffect(() => {
    const topic = searchParams.get('topic');
    if (topic) setIntentText(topic);
  }, [searchParams]);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const routed = await intent.mutateAsync({ text: trimmed });
    if (routed.route.startsWith('/')) {
      router.push(routed.route);
    } else if (routed.intent === 'learn_topic') {
      const session = await createSession.mutateAsync({
        topicTitle: routed.topicGuess ?? trimmed,
        source: 'intent',
      });
      router.push(`/learn/session/${session.id}`);
    } else {
      router.push(routed.route);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-st-faint">LEARN</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-st-ink">What do you want to learn?</h1>

      <div className="mt-6 rounded-2xl border border-st-bd1 bg-st-card p-4 shadow-sm">
        <div className="flex gap-2">
          <Sparkles className="mt-2.5 shrink-0 text-st-accent" size={18} />
          <textarea
            value={intentText}
            onChange={(e) => setIntentText(e.target.value)}
            placeholder="Ask a question or name a topic…"
            className="min-h-[80px] flex-1 resize-none bg-transparent text-sm text-st-ink outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(intentText);
              }
            }}
          />
        </div>
        <PillButton
          onClick={() => void handleSubmit(intentText)}
          disabled={intent.isPending || createSession.isPending}
          className="mt-3 w-full"
        >
          Go
        </PillButton>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setIntentText(chip);
              void handleSubmit(chip);
            }}
            className="rounded-full border border-st-bd1 bg-st-surface2 px-3 py-1.5 text-xs font-medium text-st-muted hover:border-st-accent/40"
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Streak"
          value={streaks?.showStreak ? `${streaks.streakDays} days` : '—'}
          from="Keep learning daily"
        />
        <StatCard
          label="Weekly goal"
          value={`${streaks?.weeklyGoal.done ?? 0}/${streaks?.weeklyGoal.target ?? 3}`}
          from="Topics completed this week"
        />
      </div>

      {currentItem && (
        <Card className="mt-6">
          <p className="text-[10px] font-semibold tracking-wide text-st-faint">RESUME PATH</p>
          <p className="mt-1 font-display text-lg font-semibold text-st-ink">{currentItem.title}</p>
          {currentItem.freshness && <FreshnessChip freshness={currentItem.freshness} />}
          <Link href="/learn/path" className="mt-3 inline-block text-sm font-semibold text-st-accent">
            Continue path →
          </Link>
        </Card>
      )}

      {dueRevision && (
        <Card className="mt-4">
          <p className="text-[10px] font-semibold tracking-wide text-st-faint">REVISION DUE</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-display text-lg font-semibold text-st-ink">{dueRevision.title}</p>
            <FreshnessChip freshness={dueRevision.freshness} />
          </div>
          <Link href="/learn/revision" className="mt-3 inline-block text-sm font-semibold text-st-accent">
            Review now →
          </Link>
        </Card>
      )}

      <div className="mt-6 flex gap-3">
        <Link href="/learn/path" className="text-sm font-medium text-st-muted hover:text-st-accent">
          Learning path
        </Link>
        <Link href="/learn/revision" className="text-sm font-medium text-st-muted hover:text-st-accent">
          Revision queue
        </Link>
      </div>
    </div>
  );
}
