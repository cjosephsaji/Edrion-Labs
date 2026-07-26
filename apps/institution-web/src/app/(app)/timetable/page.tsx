'use client';

import { useState } from 'react';
import { TimetableGrid } from '@/components/timetable/timetable-grid';
import { LiveChangesPanel } from '@/components/timetable/live-changes-panel';

export default function TimetablePage() {
  const [tab, setTab] = useState<'builder' | 'live'>('builder');
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('builder')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'builder' ? 'bg-primary text-white' : 'bg-muted'}`}>Builder</button>
        <button type="button" onClick={() => setTab('live')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'live' ? 'bg-primary text-white' : 'bg-muted'}`}>Live changes</button>
      </div>
      {tab === 'builder' ? <TimetableGrid /> : <LiveChangesPanel />}
    </div>
  );
}
