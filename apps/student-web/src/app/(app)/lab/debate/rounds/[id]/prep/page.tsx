'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useAdvanceDebateRound,
  useDebatePrepNotes,
  useSaveDebatePrepNotes,
} from '@/lib/hooks/debate-lab';
import { PillButton } from '@/components/ui/pill-button';
import { PageHeader } from '@/components/ui/primitives';

const KEYS = ['claim', 'mechanism', 'example', 'impact', 'comparative'] as const;

export default function DebatePrepPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useDebatePrepNotes(params.id);
  const save = useSaveDebatePrepNotes(params.id);
  const advance = useAdvanceDebateRound(params.id);
  const [blocks, setBlocks] = useState(() =>
    KEYS.map((key) => ({ key, text: '' })),
  );
  const version = (data as { version?: number } | undefined)?.version ?? 1;

  useEffect(() => {
    const remote = (data as { blocks?: { key: string; text: string }[] } | undefined)?.blocks;
    if (remote?.length) setBlocks(remote as typeof blocks);
  }, [data]);

  const persist = async () => {
    await save.mutateAsync({ blocks, version });
  };

  const goSpeak = async () => {
    await persist();
    await advance.mutateAsync();
    router.push(`/lab/debate/rounds/${params.id}/speak`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <PageHeader title="Prep pad" subtitle="Five-minute scaffold — clock starts when you enter the speaking room." backHref={`/lab/debate/rounds/${params.id}/consent`} />
      <div className="mt-8 space-y-4">
        {blocks.map((b, i) => (
          <label key={b.key} className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-st-muted">{b.key}</span>
            <textarea
              value={b.text}
              onChange={(e) => {
                const next = [...blocks];
                next[i] = { ...b, text: e.target.value };
                setBlocks(next);
              }}
              rows={2}
              className="mt-1 w-full rounded-[12px] border border-st-bd2 bg-st-card px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="mt-8 flex gap-3">
        <PillButton variant="soft" onClick={() => void persist()}>
          Save
        </PillButton>
        <PillButton className="flex-1" onClick={() => void goSpeak()}>
          Start speaking
        </PillButton>
      </div>
    </div>
  );
}
