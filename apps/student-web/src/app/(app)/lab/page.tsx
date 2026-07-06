'use client';
import Link from 'next/link';
import { FlaskConical, GitBranch, MessageSquare, PenLine } from 'lucide-react';
import { Card } from '@/components/ui/card';

const INSTRUMENTS = [
  {
    tag: 'INSTRUMENT 01',
    href: '/lab/visual',
    icon: GitBranch,
    color: 'bg-st-violetSoft text-st-violet',
    title: 'Visual Studio',
    desc: 'Mind maps and flowcharts from any topic — structured, not generated images.',
  },
  {
    tag: 'INSTRUMENT 02',
    href: '/lab/mock-exams/new',
    icon: PenLine,
    color: 'bg-st-amberSoft text-st-amber',
    title: 'Mock exams',
    desc: 'Timed practice tests with counts-only results — evidence, not scores.',
  },
  {
    tag: 'INSTRUMENT 03',
    href: '/lab/debate',
    icon: MessageSquare,
    color: 'bg-st-blueSoft text-st-blue',
    title: 'Debate',
    desc: 'Argue a motion with Petros — solo or invite a friend. No winner banner.',
  },
];

export default function LabPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-st-faint">THE LAB</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-st-ink">The workshop</h1>
      <p className="mt-2 text-sm text-st-muted">
        Instruments for thinking harder — visuals, mock tests, and structured debate.
      </p>

      <div className="mt-8 space-y-4">
        {INSTRUMENTS.map((inst) => {
          const Icon = inst.icon;
          return (
            <Link key={inst.href} href={inst.href}>
              <Card className="flex items-start gap-4 transition hover:border-st-accent/40">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${inst.color}`}>
                  <Icon size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold tracking-wide text-st-faint">{inst.tag}</p>
                  <p className="font-display text-lg font-semibold text-st-ink">{inst.title}</p>
                  <p className="mt-1 text-sm text-st-muted">{inst.desc}</p>
                  <p className="mt-2 text-xs font-semibold text-st-accent">Open →</p>
                </div>
              </Card>
            </Link>
          );
        })}

        <Card className="border-dashed bg-st-surface2/50 opacity-70">
          <div className="flex items-center gap-3">
            <FlaskConical className="text-st-faint" size={20} />
            <div>
              <p className="text-sm font-medium text-st-muted">Coming soon</p>
              <p className="text-xs text-st-faint">Draw on screen and ask Petros about your sketch.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
