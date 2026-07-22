'use client';
import { useRouter } from 'next/navigation';
import { useCreateEdrionLearnSession } from '@/lib/hooks/useEdrionLearnSession';

export function LearnHandoffCard({
  topicKey,
  topicLabel,
  emotionalContext,
}: {
  topicKey: string;
  topicLabel: string;
  emotionalContext?: 'neutral' | 'setback';
}) {
  const router = useRouter();
  const create = useCreateEdrionLearnSession();

  const setbackPattern = /\b(i failed|i bombed|i don't get|don't understand anything)\b/i;
  const emotion = emotionalContext ?? (setbackPattern.test(topicLabel) ? 'setback' : 'neutral');

  return (
    <div className="mt-3 rounded-xl border border-[#1f604a]/30 bg-[#1f604a]/5 p-4">
      <p className="text-sm font-medium text-st-ink">Want to actually learn this properly?</p>
      <p className="mt-1 text-xs text-st-muted">A focused 15-minute Edrion Learn lesson on {topicLabel}.</p>
      <button
        type="button"
        disabled={create.isPending}
        className="mt-3 rounded-full bg-[#1f604a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={async () => {
          const session = await create.mutateAsync({
            entryPoint: 'free_chat_handoff',
            topicKey,
            goal: 'acquisition',
            emotionalContext: emotion,
            timeBudgetMinutes: 15,
            idempotencyKey: crypto.randomUUID(),
          });
          router.push(`/learn/session/${session.id}`);
        }}
      >
        Start a 15-min lesson
      </button>
    </div>
  );
}

export function shouldShowLearnHandoff(answer: string, followUpCount: number): boolean {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  return words > 120 || followUpCount >= 1;
}
