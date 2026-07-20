'use client';

import { Bell, Home, UserRound } from 'lucide-react';

export function StudentHomePreview({
  modules,
  terminology,
}: {
  modules: Array<{ key: string; label: string; enabled: boolean }>;
  terminology: Record<string, string>;
}) {
  return (
    <div className="mx-auto w-full max-w-[390px] rounded-[34px] border-[8px] border-slate-900 bg-[#f8f5ee] p-5 shadow-xl">
      <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-slate-800" />
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Today</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-900">Good morning</h3>
      <p className="mt-1 text-xs text-slate-500">Your {terminology.term_period?.toLowerCase() ?? 'term'} at a glance.</p>
      <div className="mt-5 rounded-2xl bg-emerald-900 p-4 text-white">
        <p className="text-xs opacity-70">NEXT</p>
        <p className="mt-1 font-semibold">Physics · Lab 2</p>
        <p className="text-xs opacity-80">11:20 · {terminology.teacher_title ?? 'Teacher'} Rao</p>
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
