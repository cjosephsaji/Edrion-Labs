'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateDebate, useDebateMotions } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

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
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/lab" className="text-sm text-st-accent">← The Lab</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Set up a debate</h1>
      <p className="mt-2 text-sm text-st-muted">Pick a motion, choose your side, and argue with Petros.</p>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">PICK A MOTION</h2>
        <div className="mt-3 space-y-2">
          {(motions?.motions ?? []).slice(0, 4).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotion(m)}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                motion === m ? 'border-st-accent bg-st-accentSoft' : 'border-st-bd1 bg-st-card'
              }`}
            >
              {m}
            </button>
          ))}
          <input
            value={motion}
            onChange={(e) => setMotion(e.target.value)}
            placeholder="Or write your own motion…"
            className="w-full rounded-xl border border-st-bd1 bg-st-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-st-accent/30"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">YOUR SIDE</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SIDES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ${
                side === s ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
              }`}
            >
              {s === 'surprise' ? 'Surprise me' : s}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">FORMAT</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFormat(f.key)}
              className={`rounded-xl border p-4 text-left ${
                format === f.key ? 'border-st-accent bg-st-accentSoft' : 'border-st-bd1 bg-st-card'
              }`}
            >
              <p className="font-semibold text-st-ink">{f.label}</p>
              <p className="text-xs text-st-muted">{f.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <PillButton className="flex-1" onClick={() => void handleStart('solo')} disabled={create.isPending}>
          Debate Petros
        </PillButton>
        <PillButton variant="soft" className="flex-1" onClick={() => void handleStart('friend')} disabled={create.isPending}>
          Invite a friend
        </PillButton>
      </div>
    </div>
  );
}
