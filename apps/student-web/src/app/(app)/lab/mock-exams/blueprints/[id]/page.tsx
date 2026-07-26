'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  examBlueprintTotalMarks,
  type ExamBlueprint,
} from '@edrion/schemas';
import { useExamBlueprint, useGenerateExam, useUpdateBlueprint } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';

export default function BlueprintEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useExamBlueprint(id);
  const update = useUpdateBlueprint(id);
  const generate = useGenerateExam();
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);

  useEffect(() => {
    if (data?.blueprint) setBlueprint(data.blueprint);
  }, [data?.blueprint]);

  if (!blueprint || !data) {
    return <div className="p-8 font-mono text-sm text-st-muted">Loading blueprint…</div>;
  }

  const saveAndGenerate = async () => {
    await update.mutateAsync({ blueprint, version: data.version });
    const exam = await generate.mutateAsync(id);
    router.push(`/lab/mock-exams/${exam.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab/mock-exams"
        backLabel="Mock exams"
        eyebrow={<Eyebrow color="amber">BLUEPRINT</Eyebrow>}
        title={blueprint.title}
        subtitle={`${blueprint.durationMin} min · ${examBlueprintTotalMarks(blueprint)} marks`}
      />

      <section className="mt-8">
        <Eyebrow>DIFFICULTY</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['gentle', 'balanced', 'exam_level'] as const).map((d) => (
            <PillChip
              key={d}
              variant={blueprint.difficultyCurve === d ? 'primary' : 'default'}
              onClick={() => setBlueprint({ ...blueprint, difficultyCurve: d })}
            >
              {d}
            </PillChip>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow>SECTIONS</Eyebrow>
        <ul className="mt-3 space-y-3">
          {blueprint.sections.map((s) => (
            <li key={s.id} className="rounded-[14px] border border-st-bd2 px-4 py-3">
              <p className="font-medium">{s.name}</p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                Count
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={s.questionCount}
                  onChange={(e) =>
                    setBlueprint({
                      ...blueprint,
                      sections: blueprint.sections.map((x) =>
                        x.id === s.id
                          ? { ...x, questionCount: Number(e.target.value) || 1 }
                          : x,
                      ),
                    })
                  }
                  className="w-20 rounded-lg border border-st-bd2 px-2 py-1 font-mono"
                />
              </label>
            </li>
          ))}
        </ul>
      </section>

      <PillButton className="mt-8" onClick={() => void saveAndGenerate()} disabled={generate.isPending}>
        Generate from this blueprint
      </PillButton>
    </div>
  );
}
