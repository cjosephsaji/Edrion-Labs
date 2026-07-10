'use client';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  defaultBlueprintForTemplate,
  examBlueprintTotalMarks,
  type ExamBlueprint,
  type ExamSourceKind,
  type ExamTemplate,
  type ExamTopicWeight,
} from '@edrion/schemas';
import {
  useCheckTopic,
  useCreateBlueprint,
  useExamPaperPatterns,
  useGenerateExam,
  useMockExamDefaults,
  useLibrary,
} from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader, PillChip } from '@/components/ui/primitives';
import Link from 'next/link';

const TEMPLATES: { id: ExamTemplate; label: string; blurb: string }[] = [
  { id: 'quick_check', label: 'Quick check', blurb: '~10 min · objective' },
  { id: 'chapter_test', label: 'Chapter test', blurb: '~30 min · mixed' },
  { id: 'board_pattern', label: 'Board pattern', blurb: 'Full paper structure' },
  { id: 'custom', label: 'Custom', blurb: 'Edit everything' },
];

const SOURCES: { id: ExamSourceKind; label: string }[] = [
  { id: 'studied', label: 'Studied topics' },
  { id: 'preset', label: 'Curriculum presets' },
  { id: 'library', label: 'Library notes' },
  { id: 'manual', label: 'Manual topics' },
];

export default function MockExamNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: defaults } = useMockExamDefaults();
  const { data: patterns = [] } = useExamPaperPatterns();
  const { data: library } = useLibrary();
  const createBp = useCreateBlueprint();
  const generate = useGenerateExam();
  const checkTopic = useCheckTopic();

  const [step, setStep] = useState<'source' | 'template' | 'blueprint'>('source');
  const [sourceKind, setSourceKind] = useState<ExamSourceKind>('studied');
  const [subject, setSubject] = useState(searchParams.get('subject') ?? '');
  const [topics, setTopics] = useState<string[]>(
    () =>
      searchParams
        .get('topics')
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean) ?? [],
  );
  const [manualTopic, setManualTopic] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);
  const [libraryIds, setLibraryIds] = useState<string[]>([]);
  const [patternId, setPatternId] = useState<string | null>(null);
  const [template, setTemplate] = useState<ExamTemplate>('chapter_test');
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);

  const topicWeights: ExamTopicWeight[] = useMemo(
    () => (topics.length ? topics : ['General']).map((t) => ({ topicLabel: t, weight: 5 as const })),
    [topics],
  );

  const subjectLabel = subject.trim() || defaults?.subjectLabel || 'Practice';

  const toggleTopic = (t: string) => {
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const buildBlueprint = (tpl: ExamTemplate) => {
    const pattern = patterns.find((p) => p.id === patternId);
    let bp = defaultBlueprintForTemplate(tpl, {
      subjectLabel,
      topicWeights,
      paperPatternId: patternId,
      sourceKind,
    });
    if (tpl === 'board_pattern' && pattern) {
      bp = {
        ...bp,
        durationMin: pattern.durationMin,
        sections: pattern.sections as ExamBlueprint['sections'],
        paperPatternId: pattern.id,
      };
    }
    if (sourceKind === 'library') bp = { ...bp, libraryItemIds: libraryIds };
    setBlueprint(bp);
    setTemplate(tpl);
    setStep('blueprint');
  };

  const addManual = async () => {
    setTopicError(null);
    const t = manualTopic.trim();
    if (!t) return;
    const res = await checkTopic.mutateAsync({ topic: t, subjectLabel });
    if (!res.ok) {
      setTopicError(res.reason);
      return;
    }
    setTopics((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setManualTopic('');
  };

  const confirm = async () => {
    if (!blueprint) return;
    const saved = await createBp.mutateAsync(blueprint);
    const exam = await generate.mutateAsync(saved.id);
    router.push(`/lab/mock-exams/${exam.id}`);
  };

  const updateSectionCount = (sectionId: string, questionCount: number) => {
    if (!blueprint) return;
    setBlueprint({
      ...blueprint,
      sections: blueprint.sections.map((s) =>
        s.id === sectionId ? { ...s, questionCount: Math.max(1, Math.min(40, questionCount)) } : s,
      ),
    });
  };

  const updateWeight = (label: string, weight: number) => {
    if (!blueprint) return;
    setBlueprint({
      ...blueprint,
      topicWeights: blueprint.topicWeights.map((t) =>
        t.topicLabel === label ? { ...t, weight: Math.max(1, Math.min(10, weight)) } : t,
      ),
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab/mock-exams"
        backLabel="Mock exams"
        eyebrow={<Eyebrow color="amber">INSTRUMENT 02</Eyebrow>}
        title="Build a mock exam"
        subtitle="Pick sources, shape a blueprint, then generate."
      />

      {step === 'source' && (
        <>
          <section className="mt-8">
            <Eyebrow>SOURCE</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <PillChip
                  key={s.id}
                  variant={sourceKind === s.id ? 'primary' : 'default'}
                  onClick={() => setSourceKind(s.id)}
                >
                  {s.label}
                </PillChip>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <Eyebrow>SUBJECT</Eyebrow>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={defaults?.subjectLabel ?? 'Subject'}
              className="mt-3 w-full rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm outline-none focus:border-st-accent"
            />
          </section>

          {sourceKind === 'studied' && (
            <section className="mt-8">
              <Eyebrow>TOPICS FROM HISTORY</Eyebrow>
              <div className="mt-3 flex flex-wrap gap-2">
                {(defaults?.studiedTopics ?? defaults?.topics.map((t) => ({ label: t })) ?? []).map((t) => {
                  const label = typeof t === 'string' ? t : t.label;
                  return (
                    <PillChip
                      key={label}
                      variant={topics.includes(label) ? 'primary' : 'default'}
                      onClick={() => toggleTopic(label)}
                    >
                      {label}
                    </PillChip>
                  );
                })}
              </div>
            </section>
          )}

          {sourceKind === 'preset' && (
            <section className="mt-8">
              <Eyebrow>PAPER PATTERN</Eyebrow>
              <div className="mt-3 space-y-2">
                {patterns.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPatternId(p.id)}
                    className={`w-full rounded-[14px] border px-4 py-3 text-left text-sm ${
                      patternId === p.id ? 'border-st-accent bg-st-accentSoft' : 'border-st-bd2 bg-st-card'
                    }`}
                  >
                    <p className="font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-st-muted">
                      {p.durationMin} min · {p.totalMarks} marks · {p.board}
                    </p>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(defaults?.topics ?? []).map((t) => (
                  <PillChip key={t} variant={topics.includes(t) ? 'primary' : 'default'} onClick={() => toggleTopic(t)}>
                    {t}
                  </PillChip>
                ))}
              </div>
            </section>
          )}

          {sourceKind === 'library' && (
            <section className="mt-8">
              <Eyebrow>LIBRARY ITEMS</Eyebrow>
              <div className="mt-3 space-y-2">
                {(library?.uploads ?? []).slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setLibraryIds((prev) =>
                        prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                      )
                    }
                    className={`w-full rounded-[14px] border px-4 py-3 text-left text-sm ${
                      libraryIds.includes(item.id) ? 'border-st-accent bg-st-accentSoft' : 'border-st-bd2 bg-st-card'
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </section>
          )}

          {sourceKind === 'manual' && (
            <section className="mt-8">
              <Eyebrow>ADD TOPICS</Eyebrow>
              <div className="mt-3 flex gap-2">
                <input
                  value={manualTopic}
                  onChange={(e) => setManualTopic(e.target.value)}
                  placeholder="e.g. Quadratic equations"
                  className="flex-1 rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm outline-none focus:border-st-accent"
                />
                <PillButton onClick={() => void addManual()} disabled={checkTopic.isPending}>
                  Add
                </PillButton>
              </div>
              {topicError && <p className="mt-2 text-sm text-st-danger">{topicError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {topics.map((t) => (
                  <PillChip key={t} variant="primary" onClick={() => toggleTopic(t)}>
                    {t}
                  </PillChip>
                ))}
              </div>
            </section>
          )}

          <PillButton
            className="mt-8"
            disabled={
              (sourceKind !== 'library' && topics.length === 0) ||
              (sourceKind === 'library' && libraryIds.length === 0) ||
              (sourceKind === 'preset' && !patternId)
            }
            onClick={() => setStep('template')}
          >
            Choose template
          </PillButton>
        </>
      )}

      {step === 'template' && (
        <section className="mt-8">
          <Eyebrow>TEMPLATE</Eyebrow>
          <div className="mt-3 grid gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => buildBlueprint(t.id)}
                className="rounded-[14px] border border-st-bd2 bg-st-card px-4 py-4 text-left hover:border-st-accent"
              >
                <p className="font-medium">{t.label}</p>
                <p className="font-mono text-xs text-st-muted">{t.blurb}</p>
              </button>
            ))}
          </div>
          <button type="button" className="mt-4 text-sm text-st-muted" onClick={() => setStep('source')}>
            Back
          </button>
        </section>
      )}

      {step === 'blueprint' && blueprint && (
        <section className="mt-8 space-y-6">
          <div>
            <Eyebrow>BLUEPRINT</Eyebrow>
            <p className="mt-2 font-display text-xl text-st-ink">{blueprint.title}</p>
            <p className="font-mono text-sm text-st-muted">
              {blueprint.durationMin} min · {examBlueprintTotalMarks(blueprint)} marks · {template}
            </p>
          </div>

          <div>
            <Eyebrow>DIFFICULTY CURVE</Eyebrow>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['gentle', 'balanced', 'exam_level'] as const).map((d) => (
                <PillChip
                  key={d}
                  variant={blueprint.difficultyCurve === d ? 'primary' : 'default'}
                  onClick={() => setBlueprint({ ...blueprint, difficultyCurve: d })}
                >
                  {d.replace('_', '-')}
                </PillChip>
              ))}
            </div>
          </div>

          <div>
            <Eyebrow>DURATION (MIN)</Eyebrow>
            <input
              type="number"
              min={5}
              max={240}
              value={blueprint.durationMin}
              onChange={(e) =>
                setBlueprint({ ...blueprint, durationMin: Number(e.target.value) || 10 })
              }
              className="mt-2 w-32 rounded-[14px] border border-st-bd2 bg-st-card px-3 py-2 font-mono text-sm"
            />
          </div>

          <div>
            <Eyebrow>SECTIONS</Eyebrow>
            <ul className="mt-2 space-y-3">
              {blueprint.sections.map((s) => (
                <li key={s.id} className="rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3">
                  <p className="font-medium">{s.name}</p>
                  <p className="font-mono text-xs text-st-muted">
                    {s.questionTypes.join(', ')} · {s.marksPerQuestion} marks each
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    Questions
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={s.questionCount}
                      onChange={(e) => updateSectionCount(s.id, Number(e.target.value))}
                      className="w-20 rounded-lg border border-st-bd2 bg-st-surface px-2 py-1 font-mono"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Eyebrow>TOPIC WEIGHTS</Eyebrow>
            <ul className="mt-2 space-y-2">
              {blueprint.topicWeights.map((t) => (
                <li key={t.topicLabel} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t.topicLabel}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={t.weight}
                    onChange={(e) => updateWeight(t.topicLabel, Number(e.target.value))}
                  />
                  <span className="font-mono w-6">{t.weight}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            <PillButton onClick={() => void confirm()} disabled={createBp.isPending || generate.isPending}>
              {generate.isPending || createBp.isPending ? 'Starting…' : 'Confirm & generate'}
            </PillButton>
            <button type="button" className="text-sm text-st-muted" onClick={() => setStep('template')}>
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
