'use client';
import { useState } from 'react';
import type { AnalyticsRange } from '@edrion/schemas';
import { useAnalytics } from '@/lib/hooks';
import { StatCard } from '@/components/learn/StatCard';
import { HeatMap } from '@/components/institutional/HeatMap';
import { TrendBars } from '@/components/institutional/TrendBars';
import { MarkDotPlot } from '@/components/institutional/MarkDotPlot';
import { TransparencyPanel } from '@/components/institutional/TransparencyPanel';
import { Card } from '@/components/ui/card';

const RANGES: AnalyticsRange[] = ['week', 'month', 'term'];

export default function ProgressPage() {
  const [range, setRange] = useState<AnalyticsRange>('week');
  const { data, isLoading } = useAnalytics(range);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Progress</h1>
      <p className="mt-1 text-sm text-st-muted">Your learning analytics at a glance.</p>

      <div className="mt-4 flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              range === r ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="mt-8 h-48 shimmer rounded-2xl" />
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Topics" value={data.statSlots.topicsCompleted.value} from={data.statSlots.topicsCompleted.from} />
            <StatCard label="Practice" value={data.statSlots.practiceItems.value} from={data.statSlots.practiceItems.from} />
            <StatCard label="Time" value={data.statSlots.timeOnLearning.value} from={data.statSlots.timeOnLearning.from} />
            <StatCard label="Streak" value={data.statSlots.currentStreak.value} from={data.statSlots.currentStreak.from} />
          </div>

          <Card className="mt-6">
            <p className="text-xs font-semibold text-st-faint">ACTIVITY</p>
            <div className="mt-3">
              <HeatMap days={data.heatmap} />
            </div>
          </Card>

          <Card className="mt-4">
            <p className="text-xs font-semibold text-st-faint">TREND</p>
            <div className="mt-3">
              <TrendBars bars={data.trendBars} />
            </div>
          </Card>

          {data.markDots.length > 0 && (
            <Card className="mt-4">
              <p className="text-xs font-semibold text-st-faint">MARKS</p>
              <div className="mt-3">
                <MarkDotPlot dots={data.markDots} />
              </div>
            </Card>
          )}

          <div className="mt-6">
            <TransparencyPanel
              sharedWith={data.transparency.sharedWith}
              neverShared={data.transparency.neverShared}
            />
          </div>
        </>
      )}
    </div>
  );
}
