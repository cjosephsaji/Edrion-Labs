'use client';
import Link from 'next/link';
import { FlaskConical, GitBranch, MessageSquare, PenLine } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

const INSTRUMENTS = [
  {
    tag: 'INSTRUMENT 01',
    href: '/lab/visual',
    icon: GitBranch,
    tone: 'violet' as const,
    title: 'Visual Studio',
    desc: 'Mind maps and flowcharts from any topic — structured, not generated images.',
  },
  {
    tag: 'INSTRUMENT 02',
    href: '/lab/mock-exams/new',
    icon: PenLine,
    tone: 'amber' as const,
    title: 'Mock exams',
    desc: 'Timed practice tests with counts-only results — evidence, not scores.',
  },
  {
    tag: 'INSTRUMENT 03',
    href: '/lab/debate',
    icon: MessageSquare,
    tone: 'blue' as const,
    title: 'Debate',
    desc: 'Argue a motion with Petros — solo or invite a friend. No winner banner.',
  },
];

export default function LabPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>THE LAB</Eyebrow>}
        title="The workshop"
        subtitle="Instruments for thinking harder — visuals, mock tests, and structured debate."
      />

      <div className="mt-8 space-y-3">
        {INSTRUMENTS.map((inst) => (
          <Link key={inst.href} href={inst.href}>
            <Card className="transition hover:border-st-accent/40" noPadding>
              <div className="flex items-start gap-4 p-5">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] ${
                    inst.tone === 'violet'
                      ? 'bg-st-violetSoft text-st-violet'
                      : inst.tone === 'amber'
                        ? 'bg-st-amberSoft text-st-amberInk'
                        : 'bg-st-blueSoft text-st-blue'
                  }`}
                >
                  <inst.icon size={22} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <Eyebrow>{inst.tag}</Eyebrow>
                  <p className="mt-1 font-display text-lg font-semibold text-st-ink">{inst.title}</p>
                  <p className="mt-1 text-sm text-st-muted">{inst.desc}</p>
                  <p className="mt-2 text-xs font-semibold text-st-accent">Open →</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}

        <div className="rounded-[15px] border border-dashed border-st-bd2 bg-st-cardAlt px-5 py-4 opacity-80">
          <div className="flex items-center gap-3">
            <FlaskConical className="text-st-faint" size={20} aria-hidden />
            <div>
              <p className="text-sm font-medium text-st-muted">Coming soon</p>
              <p className="text-xs text-st-faint">Draw on screen and ask Petros about your sketch.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
