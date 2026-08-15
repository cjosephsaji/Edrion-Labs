'use client';

import { Bell, Home, UserRound } from 'lucide-react';
import type { StudentHomePriorityKey } from '@edrion/schemas';

const PRIORITY_LABELS: Record<StudentHomePriorityKey, string> = {
  exam: 'Examinations',
  due_work: 'Due work',
  learning: 'Continue learning',
  fees: 'Fees',
  attendance: 'Attendance',
  schedule: 'Classes',
  announcement: 'Announcements',
  notification: 'Updates',
};

export function StudentHomePreview({
  modules,
  terminology,
  priorities,
}: {
  modules: Array<{ key: string; label: string; enabled: boolean }>;
  terminology: Record<string, string>;
  priorities: Record<StudentHomePriorityKey, number>;
}) {
  const ranked = Object.entries(priorities)
    .map(([key, value]) => ({ key: key as StudentHomePriorityKey, value }))
    .sort((a, b) => b.value - a.value);
  const first = ranked[0]!;
  return (
    <div className="mx-auto w-full max-w-[390px] rounded-[34px] border-[8px] border-slate-900 bg-[#f8f5ee] p-5 shadow-xl">
      <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-slate-800" />
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Today</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-900">Good morning</h3>
      <p className="mt-1 text-xs text-slate-500">Your {terminology.term_period?.toLowerCase() ?? 'term'} at a glance.</p>
      <div className="mt-5 rounded-2xl bg-emerald-900 p-4 text-white">
        <p className="text-xs opacity-70">HIGHEST BASE PRIORITY</p>
        <p className="mt-1 font-semibold">{PRIORITY_LABELS[first.key]}</p>
        <p className="text-xs opacity-80">Weight {first.value} · live urgency is added per student</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {ranked.slice(1, 5).map((item) => <div key={item.key} className="rounded-lg bg-white/80 px-2 py-1.5 text-[10px] text-slate-600"><span className="block truncate">{PRIORITY_LABELS[item.key]}</span><strong>{item.value}</strong></div>)}
      </div>
      <div className="mt-5 space-y-1.5">
        <PreviewRow icon={<Home size={15} />} label="Today" />
        {modules.filter((m) => m.enabled).map((m) => <PreviewRow key={m.key} icon={<Bell size={15} />} label={m.label} />)}
        <PreviewRow icon={<UserRound size={15} />} label="Profile" />
      </div>
    </div>
  );
}

function PreviewRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs font-medium text-slate-700">{icon}{label}</div>;
}
