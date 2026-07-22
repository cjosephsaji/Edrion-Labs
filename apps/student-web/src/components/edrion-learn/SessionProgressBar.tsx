'use client';
import type { LearnSessionV1Dto } from '@edrion/schemas';

export function SessionProgressBar({ session }: { session: LearnSessionV1Dto }) {
  const total = Math.max(session.checkpointsTotal, 1);
  const done = session.checkpointsDone;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[#e8e4d8]" aria-hidden>
      <div
        className="h-full bg-[#1f604a] transition-all duration-200 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
