'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CreateMockExamInput } from '@edrion/schemas';
import { useCreateMockExam, useMockExamDefaults } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

const DURATIONS = [30, 60, 90] as const;

export default function MockExamSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: defaults } = useMockExamDefaults();
  const create = useCreateMockExam();
  const [subject, setSubject] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(60);

  useEffect(() => {
    const sub = searchParams.get('subject');
    const rawTopics = searchParams.get('topics');
    if (sub) setSubject(sub);
    if (rawTopics) {
      const parsed = rawTopics.split(',').map((t) => t.trim()).filter(Boolean);
      if (parsed.length) setTopics(parsed);
    }
  }, [searchParams]);

  const toggleTopic = (t: string) => {
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleCreate = async () => {
    const subjectLabel = subject.trim() || defaults?.subjectLabel || 'Practice';
    if (topics.length === 0) return;
    const input: CreateMockExamInput = {
      subjectLabel,
      topics,
      context: {
        level: 'current',
        board: 'general',
        mix: 'balanced',
        difficulty: 'medium',
        durationMin: duration,
        hintsOff: true,
      },
    };
    const exam = await create.mutateAsync(input);
    router.push(`/lab/mock-exams/${exam.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/lab" className="text-sm text-st-accent">← The Lab</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Build a mock exam</h1>
      <p className="mt-2 text-sm text-st-muted">Timed practice with counts-only results — no letter grades.</p>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">SUBJECT</h2>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={defaults?.subjectLabel ?? 'Subject'}
          className="mt-3 w-full rounded-xl border border-st-bd1 bg-st-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-st-accent/30"
        />
      </section>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">TOPICS</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(defaults?.topics ?? []).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTopic(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                topics.includes(t) ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">DURATION</h2>
        <div className="mt-3 flex gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                duration === d ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
              }`}
            >
              {d} min
            </button>
          ))}
        </div>
      </section>

      <PillButton
        className="mt-8 w-full sm:w-auto"
        onClick={() => void handleCreate()}
        disabled={create.isPending || topics.length === 0}
      >
        {create.isPending ? 'Generating…' : 'Generate exam ✦'}
      </PillButton>
    </div>
  );
}
