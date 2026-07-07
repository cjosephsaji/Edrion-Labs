'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useGenerateVisual, useRegenerateVisual, useSaveVisual } from '@/lib/hooks';
import { GraphCanvas } from '@/components/lab/GraphCanvas';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader, PetrosMark, PillChip } from '@/components/ui/primitives';
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
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab"
        backLabel="The Lab"
        eyebrow={<Eyebrow color="violet">INSTRUMENT 01</Eyebrow>}
        title="Visual Studio"
        subtitle="Structured diagrams from any topic — not AI images."
      />

      <div className="mt-6 flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic or concept…"
          className="flex-1 rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none focus:border-st-accent focus:shadow-[0_0_0_3px_rgba(30,122,94,0.13)]"
        />
        <PillButton onClick={() => void handleGenerate()} disabled={generate.isPending || format === 'diagram'}>
          Generate <PetrosMark className="ml-1" />
        </PillButton>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FORMATS.map((f) => (
          <PillChip key={f.key} variant={format === f.key ? 'primary' : 'default'} onClick={() => setFormat(f.key)}>
            {f.label}
          </PillChip>
        ))}
      </div>

      {format === 'diagram' && (
        <EmptyState
          className="mt-6"
          eyebrow="COMING SOON"
          title="Diagram mode is on the way"
          description="Mind maps and flowcharts work today."
        />
      )}

      {spec && format !== 'diagram' && (
        <Card className="mt-6" eyebrow="OUTPUT" icon={GitBranch} iconTone="violet" noPadding>
          <div className="space-y-4 p-5">
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
          </div>
        </Card>
      )}
    </div>
  );
}
