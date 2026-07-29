'use client';

import Link from 'next/link';

/**
 * Interim Learn handoff during rebuild.
 * Creates no session and calls no LLM — routes the student to /learn with the topic prefilled.
 */
export function LearnHandoffCard({
  topicKey,
  topicLabel,
}: {
  topicKey: string;
  topicLabel: string;
  studentMessage?: string;
  emotionalContext?: 'neutral' | 'setback';
}) {
  const href = `/learn?q=${encodeURIComponent(topicLabel)}&topicKey=${encodeURIComponent(topicKey)}&goal=learn`;

  return (
    <div className="mt-3 rounded-xl border border-[#1f604a]/30 bg-[#1f604a]/5 p-4">
      <p className="text-sm font-medium text-st-ink">Want to actually learn this properly?</p>
      <p className="mt-1 text-xs text-st-muted">
        Petros Learn is being rebuilt. You can start from the Learn home with {topicLabel}.
      </p>
      <Link
        href={href}
        className="mt-3 inline-flex rounded-full bg-[#1f604a] px-4 py-2 text-sm font-medium text-white"
      >
        Open in Learn
      </Link>
    </div>
  );
}

export function shouldShowLearnHandoff(answer: string, followUpCount: number): boolean {
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  return words > 120 || followUpCount >= 1;
}
