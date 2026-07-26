'use client';
import { useState } from 'react';
import { useAchievements } from '@/lib/hooks';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';

export default function AchievementsPage() {
  const { data, isLoading } = useAchievements();
  const [family, setFamily] = useState<string | null>(null);

  const activeFamily = data?.families.find((f) => f.key === family) ?? data?.families[0];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>ACHIEVEMENTS</Eyebrow>}
        title="Earned, with evidence"
        subtitle="Every badge names what you actually did — tap one to see why."
      />

      {data && (
        <Card className="mt-6 inline-block px-4 py-2">
          <span className="text-2xl font-display font-semibold text-st-accentDeep">{data.earnedCount}</span>
          <span className="text-sm text-st-muted"> / {data.total} badges earned</span>
        </Card>
      )}

      {isLoading ? (
        <div className="mt-8 h-48 shimmer rounded-2xl" />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {(data?.families ?? []).map((f) => (
              <PillChip
                key={f.key}
                variant={activeFamily?.key === f.key ? 'primary' : 'default'}
                onClick={() => setFamily(f.key)}
              >
                {f.label}
              </PillChip>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(activeFamily?.badges ?? []).map((badge) => (
              <Card
                key={badge.key}
                className={badge.earned ? '' : 'border-dashed border-st-bd2 bg-st-cardAlt opacity-80'}
                noPadding
              >
                <div className="flex items-start gap-3 p-4">
                  <span className="text-2xl">{badge.glyph}</span>
                  <div>
                    <p className="font-semibold text-st-ink">{badge.name}</p>
                    <p className="text-xs text-st-muted">{badge.sub}</p>
                    {badge.progress && !badge.earned && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-st-surface2">
                        <div
                          className="h-full rounded-full bg-st-accent"
                          style={{ width: `${(badge.progress.done / badge.progress.target) * 100}%` }}
                        />
                      </div>
                    )}
                    {badge.note && badge.earned && (
                      <p className="mt-2 text-xs text-st-faint">{badge.note}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
