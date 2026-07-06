'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGenerateVisual, useRegenerateVisual, useSaveVisual } from '@/lib/hooks';
import { GraphCanvas } from '@/components/lab/GraphCanvas';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import type { GraphSpec } from '@edrion/schemas';

const FORMATS = [
  { key: 'mind_map' as const, label: 'Mind map' },
  { key: 'flowchart' as const, label: 'Flowchart' },
  { key: 'diagram' as const, label: 'Diagram' },
];

export default function VisualStudioPage() {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<'mind_map' | 'flowchart' | 'diagram'>('mind_map');
  const [spec, setSpec] = useState<GraphSpec | null>(null);
  const generate = useGenerateVisual();
  const regenerate = useRegenerateVisual();
  const saveVisual = useSaveVisual();

  useEffect(() => {
    const q = searchParams.get('topic');
    if (q) setTopic(q);
  }, [searchParams]);

  const handleGenerate = async () => {
    if (!topic.trim() || format === 'diagram') return;
    const result = await generate.mutateAsync({ topic: topic.trim(), format });
    setSpec(result.spec);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/lab" className="text-sm text-st-accent">← The Lab</Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-st-ink">Visual Studio</h1>

      <div className="mt-6 flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic or concept…"
          className="flex-1 rounded-xl border border-st-bd1 bg-st-card px-4 py-2.5 text-sm text-st-ink outline-none focus:ring-2 focus:ring-st-accent/30"
        />
        <PillButton onClick={() => void handleGenerate()} disabled={generate.isPending || format === 'diagram'}>
          Generate ✦
        </PillButton>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFormat(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              format === f.key ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {format === 'diagram' && (
        <Card className="mt-6 text-center text-sm text-st-muted">
          Diagram generation is coming soon — mind maps and flowcharts work today.
        </Card>
      )}

      {spec && format !== 'diagram' && (
        <Card className="mt-6 space-y-4">
          <GraphCanvas spec={spec} />
          <div className="flex flex-wrap gap-2">
            <PillButton
              variant="soft"
              disabled={regenerate.isPending}
              onClick={() =>
                void regenerate.mutateAsync({ spec, direction: 'simpler' }).then((r) => setSpec(r.spec))
              }
            >
              Simpler
            </PillButton>
            <PillButton
              variant="soft"
              disabled={saveVisual.isPending}
              onClick={() =>
                void saveVisual.mutateAsync({
                  spec,
                  title: topic.trim() || 'Visual',
                  topic: topic.trim() || undefined,
                })
              }
            >
              {saveVisual.isSuccess ? 'Saved to Library' : 'Save to Library'}
            </PillButton>
          </div>
        </Card>
      )}
    </div>
  );
}
