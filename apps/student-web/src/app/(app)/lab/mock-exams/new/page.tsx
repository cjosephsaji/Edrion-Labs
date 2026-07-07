'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CreateMockExamInput } from '@edrion/schemas';
import { useCreateMockExam, useMockExamDefaults } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader, PetrosMark, PillChip } from '@/components/ui/primitives';

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
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab"
        backLabel="The Lab"
        eyebrow={<Eyebrow color="amber">INSTRUMENT 02</Eyebrow>}
        title="Build a mock exam"
        subtitle="Timed practice with counts-only results — no letter grades."
      />

      <section className="mt-8">
        <Eyebrow>SUBJECT</Eyebrow>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={defaults?.subjectLabel ?? 'Subject'}
          className="mt-3 w-full rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm outline-none focus:border-st-accent"
        />
      </section>

      <section className="mt-8">
        <Eyebrow>TOPICS</Eyebrow>
        <div className="mt-3 flex flex-wrap gap-2">
          {(defaults?.topics ?? []).map((t) => (
            <PillChip key={t} variant={topics.includes(t) ? 'primary' : 'default'} onClick={() => toggleTopic(t)}>
              {t}
            </PillChip>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow>DURATION</Eyebrow>
        <div className="mt-3 flex gap-2">
          {DURATIONS.map((d) => (
            <PillChip key={d} variant={duration === d ? 'primary' : 'default'} onClick={() => setDuration(d)}>
              {d} min
            </PillChip>
          ))}
        </div>
      </section>

      <PillButton
        className="mt-8 w-full sm:w-auto"
        onClick={() => void handleCreate()}
        disabled={create.isPending || topics.length === 0}
      >
        {create.isPending ? 'Generating…' : (
          <>
            Generate exam <PetrosMark className="ml-1" />
          </>
        )}
      </PillButton>
    </div>
  );
}
