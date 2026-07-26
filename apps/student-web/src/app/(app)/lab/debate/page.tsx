'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateDebate, useDebateMotions } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';

const SIDES = ['for', 'against', 'surprise'] as const;
const FORMATS = [
  { key: 'quick_clash', label: 'Quick clash', desc: 'Free-flow, no timers' },
  { key: 'structured', label: 'Structured', desc: 'Opening → rebuttal → closing' },
] as const;

export default function DebateSetupPage() {
  const router = useRouter();
  const { data: motions } = useDebateMotions();
  const create = useCreateDebate();
  const [motion, setMotion] = useState('');
  const [side, setSide] = useState<(typeof SIDES)[number]>('for');
  const [format, setFormat] = useState<'quick_clash' | 'structured'>('structured');

  const handleStart = async (mode: 'solo' | 'friend') => {
    const m = motion.trim();
    if (!m) return;
    const debate = await create.mutateAsync({
      motion: m,
      side: side === 'surprise' ? 'surprise' : side,
      format,
      mode,
    });
    router.push(mode === 'friend' ? `/lab/debate/${debate.id}/lobby` : `/lab/debate/${debate.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab"
        backLabel="The Lab"
        eyebrow={<Eyebrow color="blue">INSTRUMENT 03</Eyebrow>}
        title="Set up a debate"
        subtitle="Pick a motion, choose your side, and argue with Petros."
      />

      <section className="mt-8">
        <Eyebrow>PICK A MOTION</Eyebrow>
        <div className="mt-3 space-y-2">
          {(motions?.motions ?? []).slice(0, 4).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotion(m)}
              className={`w-full rounded-[15px] border px-4 py-3 text-left text-sm transition ${
                motion === m ? 'border-st-blue bg-st-blueSoft' : 'border-st-bd1 bg-st-card hover:border-st-blue/40'
              }`}
            >
              {m}
            </button>
          ))}
          <input
            value={motion}
            onChange={(e) => setMotion(e.target.value)}
            placeholder="Or write your own motion…"
            className="w-full rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm outline-none focus:border-st-accent"
          />
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow>YOUR SIDE</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {SIDES.map((s) => (
            <PillChip key={s} variant={side === s ? 'primary' : 'default'} onClick={() => setSide(s)}>
              {s === 'surprise' ? 'Surprise me' : s}
            </PillChip>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow>FORMAT</Eyebrow>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFormat(f.key)}
              className={`rounded-[15px] border p-4 text-left ${
                format === f.key ? 'border-st-blue bg-st-blueSoft' : 'border-st-bd1 bg-st-card'
              }`}
            >
              <p className="font-semibold text-st-ink">{f.label}</p>
              <p className="text-xs text-st-muted">{f.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <PillButton className="flex-1" onClick={() => router.push('/lab/debate/new')}>
          Practice vs AI (full round)
        </PillButton>
        <PillButton variant="soft" className="flex-1" onClick={() => void handleStart('solo')} disabled={create.isPending}>
          Debate Petros (legacy)
        </PillButton>
      </div>
    </div>
  );
}
