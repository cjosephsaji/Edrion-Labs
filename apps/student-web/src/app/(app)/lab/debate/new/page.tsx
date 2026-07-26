'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  useCreateDebateRound,
  useDebateFormats,
  useDebateMotionBank,
} from '@/lib/hooks/debate-lab';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';

export default function DebateNewPage() {
  const router = useRouter();
  const { data: formats } = useDebateFormats();
  const { data: motions } = useDebateMotionBank();
  const create = useCreateDebateRound();
  const [motion, setMotion] = useState('');
  const [formatKey, setFormatKey] = useState('practice_solo');
  const [difficulty, setDifficulty] = useState<'novice' | 'intermediate' | 'circuit'>('novice');

  const start = async () => {
    const motionText = motion.trim();
    if (motionText.length < 10) return;
    const round = await create.mutateAsync({
      formatKey,
      mode: 'practice_vs_ai',
      motionText,
      aiOpponentDifficulty: difficulty,
      scaffoldsEnabled: true,
    });
    router.push(`/lab/debate/rounds/${round.id}/consent`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <PageHeader
        backHref="/lab/debate"
        backLabel="Debate"
        eyebrow={<Eyebrow color="blue">PRACTICE VS AI</Eyebrow>}
        title="New round"
        subtitle="Pick a format, motion, and difficulty."
      />
      <section className="mt-8">
        <Eyebrow>FORMAT</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {(formats ?? []).map((f) => (
            <PillChip
              key={f.key}
              variant={formatKey === f.key ? 'primary' : 'default'}
              onClick={() => setFormatKey(f.key)}
            >
              {f.name}
            </PillChip>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <Eyebrow>MOTION</Eyebrow>
        <div className="mt-3 space-y-2">
          {(motions ?? []).slice(0, 5).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMotion(m.text)}
              className={`w-full rounded-[15px] border px-4 py-3 text-left text-sm ${
                motion === m.text ? 'border-st-blue bg-st-blueSoft' : 'border-st-bd1 bg-st-card'
              }`}
            >
              {m.text}
            </button>
          ))}
          <textarea
            value={motion}
            onChange={(e) => setMotion(e.target.value)}
            rows={3}
            placeholder="Or write your own motion…"
            className="w-full rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm"
          />
        </div>
      </section>
      <section className="mt-8">
        <Eyebrow>DIFFICULTY</Eyebrow>
        <div className="mt-3 flex gap-2">
          {(['novice', 'intermediate', 'circuit'] as const).map((d) => (
            <PillChip key={d} variant={difficulty === d ? 'primary' : 'default'} onClick={() => setDifficulty(d)}>
              {d}
            </PillChip>
          ))}
        </div>
      </section>
      <PillButton className="mt-10 w-full" disabled={create.isPending} onClick={() => void start()}>
        Continue to consent
      </PillButton>
    </div>
  );
}
