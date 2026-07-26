'use client';
import { useState } from 'react';
import type { AnalyticsRange } from '@edrion/schemas';
import { useAnalytics } from '@/lib/hooks';
import { HeatMap } from '@/components/institutional/HeatMap';
import { TrendBars } from '@/components/institutional/TrendBars';
import { MarkDotPlot } from '@/components/institutional/MarkDotPlot';
import { TransparencyPanel } from '@/components/institutional/TransparencyPanel';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader, PillChip, StatSlot } from '@/components/ui/primitives';

const RANGES: AnalyticsRange[] = ['week', 'month', 'term'];

export default function ProgressPage() {
  const [range, setRange] = useState<AnalyticsRange>('week');
  const { data, isLoading } = useAnalytics(range);

  return (
    <div className="mx-auto max-w-[1130px] px-5 py-8 pb-24 animate-st-block-in md:px-10">
      <PageHeader
        eyebrow={<Eyebrow>ANALYTICS</Eyebrow>}
        title="Progress"
        subtitle="Evidence-first analytics — every number shows where it came from."
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <PillChip key={r} variant={range === r ? 'primary' : 'default'} onClick={() => setRange(r)}>
            {r}
          </PillChip>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="mt-8 h-48 shimmer rounded-[15px]" />
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatSlot label="Topics" value={data.statSlots.topicsCompleted.value} from={data.statSlots.topicsCompleted.from} />
            <StatSlot label="Practice" value={data.statSlots.practiceItems.value} from={data.statSlots.practiceItems.from} />
            <StatSlot label="Time" value={data.statSlots.timeOnLearning.value} from={data.statSlots.timeOnLearning.from} />
            <StatSlot label="Streak" value={data.statSlots.currentStreak.value} from={data.statSlots.currentStreak.from} />
          </div>

          <Card className="mt-6" eyebrow="ACTIVITY" noPadding>
            <div className="p-5">
              {data.heatmap.some((d) => d.count > 0) ? (
                <HeatMap days={data.heatmap} />
              ) : (
                <EmptyState
                  eyebrow="NO ACTIVITY YET"
                  title="Your heatmap will fill in as you learn"
                  description="Complete a session or quick answer to start building your activity map."
                />
              )}
            </div>
          </Card>

          <Card className="mt-4" eyebrow="TREND" noPadding>
            <div className="p-5">
              <TrendBars bars={data.trendBars} />
            </div>
          </Card>

          {data.markDots.length > 0 && (
            <Card className="mt-4" eyebrow="MARKS" noPadding>
              <div className="p-5">
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
