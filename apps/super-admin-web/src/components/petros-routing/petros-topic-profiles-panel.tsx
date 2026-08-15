'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitCompare,
  History,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, Card, Input, Label, Select, cn } from '@edrion/ui';
import type {
  PetrosTopicProfileContentDto,
  PetrosTopicProfileDto,
} from '@edrion/api-client';
import {
  useGeneratePetrosTopicProfile,
  usePetrosTopicProfiles,
  usePublishPetrosTopicProfile,
  usePublishPetrosTopicProfileOverride,
  useRollbackPetrosTopicProfile,
  useUpdatePetrosTopicProfile,
  useValidatePetrosTopicProfile,
} from '@edrion/api-client';

export function PetrosTopicProfilesPanel() {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [status, setStatus] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const profiles = usePetrosTopicProfiles({
    ...(search ? { search } : {}),
    ...(subject ? { subject } : {}),
    ...(grade ? { grade } : {}),
    ...(curriculum ? { curriculum } : {}),
    ...(status ? { status } : {}),
    ...(institutionId ? { institutionId } : {}),
  });
  const rows = profiles.data ?? [];
  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    if (selectedId && !rows.some((profile) => profile.id === selectedId))
      setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);
  const selected = rows.find((profile) => profile.id === selectedId) ?? null;
  const facets = useMemo(
    () => ({
      subjects: unique(rows.map((item) => [item.subjectKey, item.subjectLabel] as const)),
      grades: unique(rows.map((item) => [item.gradeBand, item.gradeBand] as const)),
      curricula: unique(rows.map((item) => [item.curriculumKey, item.curriculumLabel] as const)),
    }),
    [rows],
  );

  return (
    <div className="grid min-h-[46rem] gap-4 xl:grid-cols-[23rem_minmax(0,1fr)]">
      <Card className="overflow-hidden xl:sticky xl:top-14 xl:h-[calc(100vh-8rem)]">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Topic profiles</div>
              <div className="text-xs text-text-muted">{rows.length} cached canonical profiles</div>
            </div>
            <Badge tone={rows.some((item) => item.status === 'stale') ? 'warning' : 'success'} dot>
              {rows.filter((item) => item.status === 'stale').length} stale
            </Badge>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topic or subject…" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select value={subject} onChange={(event) => setSubject(event.target.value)} options={[{ value: '', label: 'All subjects' }, ...facets.subjects.map(([value, label]) => ({ value, label }))]} />
            <Select value={grade} onChange={(event) => setGrade(event.target.value)} options={[{ value: '', label: 'All grades' }, ...facets.grades.map(([value, label]) => ({ value, label }))]} />
            <Select value={curriculum} onChange={(event) => setCurriculum(event.target.value)} options={[{ value: '', label: 'All curricula' }, ...facets.curricula.map(([value, label]) => ({ value, label }))]} />
            <Select value={status} onChange={(event) => setStatus(event.target.value)} options={['', 'published', 'draft', 'stale', 'archived'].map((value) => ({ value, label: value ? value.replace('_', ' ') : 'All statuses' }))} />
          </div>
          <Label className="mt-3 text-xs">Resolve overrides for institution (optional)</Label>
          <Input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="Institution UUID" />
        </div>
        <div className="max-h-[35rem] overflow-y-auto xl:max-h-none">
          {profiles.isLoading && <div className="p-5 text-sm text-text-muted">Loading profiles…</div>}
          {profiles.isError && <div className="p-5 text-sm text-danger">Could not load profiles. Apply migration 0189.</div>}
          {rows.map((profile) => (
            <button key={profile.id} onClick={() => setSelectedId(profile.id)} className={cn('w-full border-b border-border/70 px-4 py-3 text-left hover:bg-background-secondary', selectedId === profile.id && 'bg-primary-soft/70 shadow-[inset_3px_0_0_var(--primary)]')}>
              <div className="flex items-start justify-between gap-2"><strong className="text-sm text-text-primary">{profile.canonicalTitle}</strong><StatusBadge status={profile.status} /></div>
              <div className="mt-1 text-xs text-text-muted">{profile.subjectLabel} · {profile.gradeBand} · {profile.curriculumLabel}</div>
              <div className="mt-2 flex gap-3 text-[11px] text-text-secondary"><span>v{profile.latestVersion?.version ?? 0}</span><span>{profile.cacheHitCount} cache hits</span><span>{profile.overrides.length} overrides</span></div>
            </button>
          ))}
        </div>
      </Card>
      {selected ? <ProfileEditor key={`${selected.id}:${selected.version}`} profile={selected} institutionId={institutionId} /> : <EmptyProfiles />}
    </div>
  );
}

function ProfileEditor({ profile, institutionId }: { profile: PetrosTopicProfileDto; institutionId: string }) {
  const source = profile.latestVersion?.profile ?? profile.publishedVersion?.profile;
  const [draft, setDraft] = useState<PetrosTopicProfileContentDto | null>(() => clone(source));
  const [rawDraft, setRawDraft] = useState(() =>
    source ? JSON.stringify(source, null, 2) : '',
  );
  const [reason, setReason] = useState('Review Stage 4 topic-profile policy.');
  const [message, setMessage] = useState('');
  const [overrideMove, setOverrideMove] = useState('diagram');
  const [overrideWeight, setOverrideWeight] = useState(5000);
  const update = useUpdatePetrosTopicProfile();
  const validate = useValidatePetrosTopicProfile();
  const publish = usePublishPetrosTopicProfile();
  const rollback = useRollbackPetrosTopicProfile();
  const regenerate = useGeneratePetrosTopicProfile();
  const publishOverride = usePublishPetrosTopicProfileOverride();
  const published = profile.publishedVersion?.profile;
  const comparison = useMemo(
    () => (published && draft ? changedPaths(published, draft) : []),
    [draft, published],
  );
  if (!draft) return <Card className="p-8 text-sm text-text-muted">No profile version exists yet.</Card>;
  const dimensions = draft.dimensions;
  const moves = Object.entries(dimensions.moves.weights).sort((left, right) => right[1] - left[1]);
  const run = async (work: () => Promise<unknown>, success: string) => {
    setMessage('Working…');
    try {
      await work();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The profile operation failed.');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-text-primary">{profile.canonicalTitle}</h2><StatusBadge status={profile.status} />{profile.latestVersion?.source === 'human_edit' && <Badge tone="primary">Human edited</Badge>}</div>
            <p className="mt-1 text-sm text-text-muted">{profile.subjectLabel} · {profile.gradeBand} · {profile.curriculumLabel}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
            <Metric label="Profile" value={`v${profile.latestVersion?.version ?? 0}`} />
            <Metric label="Cache" value={`v${profile.cacheVersion} · ${profile.cacheHitCount} hits`} />
            <Metric label="Confidence" value={`${((draft.provenance.confidenceBasisPoints ?? 0) / 100).toFixed(0)}%`} />
            <Metric label="Resolution" value={institutionId && profile.overrides.length ? 'Institution override' : 'Canonical'} />
          </div>
        </div>
        {profile.staleReason && <div className="mt-4 flex gap-2 rounded-xl border border-warning/20 bg-warning-soft p-3 text-sm text-warning"><AlertTriangle className="h-4 w-4 shrink-0" />{profile.staleReason}</div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <Heading icon={Sparkles} title="Profile dimensions" copy="Scales are 0 none/concrete through 4 very high/highly abstract. Weights are basis points." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScaleField label="Abstraction" value={dimensions.abstractionLevel} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, abstractionLevel: value } })} />
            <ScaleField label="Prerequisite density" value={dimensions.prerequisiteDensity} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, prerequisiteDensity: value } })} />
            <ScaleField label="Misconception richness" value={dimensions.misconceptionRichness} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, misconceptionRichness: value } })} />
            <ScaleField label="Mathematical load" value={dimensions.mathematicalLoad} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, mathematicalLoad: value } })} />
            <ScaleField label="Memorisation load" value={dimensions.memorisationLoad} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, memorisationLoad: value } })} />
            <ScaleField label="Anchor availability" value={dimensions.realWorldAnchors.availability} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, realWorldAnchors: { ...dimensions.realWorldAnchors, availability: value } } })} />
            <ScaleField label="Anchor quality" value={dimensions.realWorldAnchors.quality} onChange={(value) => setDraft({ ...draft, dimensions: { ...dimensions, realWorldAnchors: { ...dimensions.realWorldAnchors, quality: value } } })} />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <DimensionList title="Knowledge type" values={dimensions.knowledgeTypes.map((item) => `${item.type.replace(/_/g, ' ')} · ${(item.weightBasisPoints / 100).toFixed(0)}%`)} />
            <DimensionList title="Natural representations" values={dimensions.representations.map((item) => `${item.type} · ${(item.weightBasisPoints / 100).toFixed(0)}%`)} />
            <DimensionList title="Prerequisites" values={dimensions.prerequisites.map((item) => `${item.label} · ${item.requiredness}`)} empty="No explicit prerequisite links" />
            <DimensionList title="Known misconceptions" values={dimensions.misconceptions.map((item) => item.summary)} empty="No sourced misconception references" />
          </div>
        </Card>
        <Card className="p-5">
          <Heading icon={Database} title="Provenance & cache" copy="Canonical source and invalidation inputs are distinct from institution overlays." />
          <dl className="mt-4 space-y-3 text-xs">
            <Row label="Source" value={draft.provenance.source.replace(/_/g, ' ')} />
            <Row label="Generator" value={draft.provenance.generatorVersion} />
            <Row label="Prompt" value={draft.provenance.promptVersion} />
            <Row label="Schema" value={draft.schemaVersion} />
            <Row label="Curriculum version" value={draft.cache.invalidationInputs.curriculumVersion ?? '—'} />
            <Row label="Syllabus version" value={draft.cache.invalidationInputs.syllabusVersion ?? '—'} />
            <Row label="Grounding hash" value={(draft.cache.invalidationInputs.groundingHash ?? '').slice(0, 12)} />
          </dl>
          <div className="mt-4 rounded-xl border border-border bg-background-secondary p-3 text-xs text-text-secondary"><strong className="block text-text-primary">Canonical vs override</strong>{institutionId ? profile.overrides.find((item) => item.institutionId === institutionId) ? 'A published institution overlay wins for this institution only.' : 'No overlay exists; canonical values resolve unchanged.' : 'Enter an institution UUID in the filter to inspect overlay precedence.'}</div>
        </Card>
      </div>

      <Card className="p-5">
        <Heading icon={ShieldCheck} title="Resolved move policy & expected session bias" copy="Edit weights, then validate and save a human-authored draft. Eligibility guardrails still override impossible choices." />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {moves.map(([move, value]) => <div key={move} className="grid grid-cols-[1fr_6rem] items-center gap-2 rounded-lg border border-border p-2"><Label className="truncate text-xs">{move.replace(/_/g, ' ')}</Label><Input type="number" min={0} max={10000} value={value} onChange={(event) => setDraft({ ...draft, dimensions: { ...dimensions, moves: { ...dimensions.moves, weights: { ...dimensions.moves.weights, [move]: Number(event.target.value) } } } })} /></div>)}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Pattern label="Opening" moves={dimensions.moves.openingPattern} />
          <Pattern label="Practice" moves={dimensions.moves.practicePattern} />
          <Pattern label="Closing" moves={dimensions.moves.closingPattern} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Heading icon={GitCompare} title="Generated vs working version" copy="Review exactly which fields differ before publishing." />
          <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-border bg-background-secondary p-3 text-xs">
            {comparison.length ? comparison.map((path) => <div key={path} className="border-b border-border py-1 text-text-secondary">{path}</div>) : <span className="text-text-muted">No changes from the published version.</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.versions.map((version) => <button key={version.id} className="rounded-lg border border-border px-3 py-2 text-xs text-text-secondary" onClick={() => setDraft(clone(version.profile))}>v{version.version} · {version.source.replace('_', ' ')} · {version.status}</button>)}
          </div>
        </Card>
        <Card className="p-5">
          <Heading icon={History} title="Audit history" copy="Generation, edits, publishing, rollbacks, overrides, and cache hits are attributable." />
          <div className="mt-4 max-h-72 space-y-2 overflow-auto">
            {profile.auditHistory.map((entry) => <div key={entry.id} className="rounded-lg border border-border p-3 text-xs"><div className="flex justify-between gap-3"><strong className="text-text-primary">{entry.action}</strong><span className="text-text-muted">{new Date(entry.createdAt).toLocaleString()}</span></div><p className="mt-1 text-text-secondary">{entry.reason}</p><small className="text-text-muted">{entry.actorRef ?? 'system'}</small></div>)}
            {!profile.auditHistory.length && <div className="text-xs text-text-muted">No profile-local audit events yet.</div>}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <Heading icon={ShieldCheck} title="Institution override" copy="Publish a complete move-policy overlay for one tenant without mutating canonical values." />
        <div className="mt-4 grid items-end gap-3 md:grid-cols-[1fr_1fr_8rem_auto]">
          <div><Label>Institution UUID</Label><Input value={institutionId} readOnly placeholder="Set in left filter" /></div>
          <div><Label>Move</Label><Select value={overrideMove} onChange={(event) => { setOverrideMove(event.target.value); setOverrideWeight(dimensions.moves.weights[event.target.value] ?? 0); }} options={Object.keys(dimensions.moves.weights).map((value) => ({ value, label: value.replace(/_/g, ' ') }))} /></div>
          <div><Label>Weight</Label><Input type="number" min={0} max={10000} value={overrideWeight} onChange={(event) => setOverrideWeight(Number(event.target.value))} /></div>
          <Button variant="secondary" disabled={!institutionId || publishOverride.isPending} onClick={() => void run(() => publishOverride.mutateAsync({ id: profile.id, institutionId, expectedVersion: profile.overrides.find((item) => item.institutionId === institutionId)?.version ?? 0, patch: { dimensions: { moves: { ...dimensions.moves, weights: { ...dimensions.moves.weights, [overrideMove]: overrideWeight } } } }, reason }), 'Institution override published.')}>Publish override</Button>
        </div>
      </Card>

      <Card className="p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-text-primary">
            Advanced strict profile editor
          </summary>
          <p className="mt-2 text-xs leading-5 text-text-muted">
            Edit any typed dimension, source reference, prerequisite, misconception, move list, or
            session pattern. Apply locally, then use Validate before saving a human-authored
            version.
          </p>
          <textarea
            className="mt-3 min-h-96 w-full rounded-xl border border-border bg-background-secondary p-3 font-mono text-xs text-text-primary"
            aria-label="Complete topic profile JSON"
            spellCheck={false}
            value={rawDraft}
            onChange={(event) => setRawDraft(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                try {
                  const parsed = JSON.parse(rawDraft) as PetrosTopicProfileContentDto;
                  setDraft(parsed);
                  setRawDraft(JSON.stringify(parsed, null, 2));
                  setMessage('JSON applied locally. Validate it before saving.');
                } catch {
                  setMessage('The advanced editor does not contain valid JSON.');
                }
              }}
            >
              Apply JSON to draft
            </Button>
            <Button
              variant="ghost"
              onClick={() => setRawDraft(JSON.stringify(draft, null, 2))}
            >
              Reload from form
            </Button>
          </div>
        </details>
      </Card>

      <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1"><Label>Required reason</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} /><div className={cn('mt-1 text-xs', message.includes('failed') ? 'text-danger' : 'text-text-muted')}>{message || 'Publish and rollback require confirmation and recent authentication.'}</div></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" loading={validate.isPending} onClick={() => void run(async () => { const result = await validate.mutateAsync(draft); if (!result.valid) throw new Error(result.issues.map((item) => `${item.path}: ${item.message}`).join(' · ')); }, 'Profile contract is valid.')}><CheckCircle2 className="h-4 w-4" /> Validate</Button>
          <Button variant="secondary" loading={regenerate.isPending} onClick={() => void run(() => regenerate.mutateAsync({ topicKey: profile.topicKey, canonicalTitle: profile.canonicalTitle, subjectKey: profile.subjectKey, subjectLabel: profile.subjectLabel, gradeBand: profile.gradeBand, curriculumKey: profile.curriculumKey, curriculumLabel: profile.curriculumLabel, curriculumVersion: draft.cache.invalidationInputs.curriculumVersion, syllabusVersion: draft.cache.invalidationInputs.syllabusVersion, syllabusReferences: draft.identity.syllabusReferences, authoritativeGrounding: [], reason, regenerate: true }), 'A regenerated draft was created; the published human version still wins until republished.')}><Sparkles className="h-4 w-4" /> Regenerate</Button>
          <Button variant="secondary" loading={update.isPending} onClick={() => void run(() => update.mutateAsync({ id: profile.id, expectedVersion: profile.version, profile: draft, reason }), 'Human-edited draft saved.')}><Save className="h-4 w-4" /> Save draft</Button>
          {profile.versions.length > 1 && <Button variant="ghost" loading={rollback.isPending} onClick={() => { const target = profile.versions.find((item) => item.version !== profile.latestVersion?.version); if (target && window.confirm(`Restore v${target.version} as a new published version?`)) void run(() => rollback.mutateAsync({ id: profile.id, targetVersion: target.version, expectedVersion: profile.version, reason }), `Rolled back to v${target.version} as a new auditable version.`); }}><RotateCcw className="h-4 w-4" /> Roll back</Button>}
          <Button loading={publish.isPending} onClick={() => { if (window.confirm('Publish the latest validated canonical profile? New sessions will use it immediately.')) void run(() => publish.mutateAsync({ id: profile.id, expectedVersion: profile.version, reason }), 'Latest profile version published.'); }}><ShieldCheck className="h-4 w-4" /> Publish</Button>
        </div>
      </div>
    </div>
  );
}

function EmptyProfiles() {
  const generate = useGeneratePetrosTopicProfile();
  const [title, setTitle] = useState('Integration by parts');
  const [subject, setSubject] = useState('Mathematics');
  const [message, setMessage] = useState('');
  const topicKey = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return <Card className="grid place-content-center p-10 text-center"><Database className="mx-auto h-8 w-8 text-text-muted" /><h2 className="mt-3 text-lg font-semibold text-text-primary">Create the first cached profile</h2><p className="mt-1 max-w-md text-sm text-text-muted">Use verified curriculum metadata where available. With no configured route, the provider-neutral Stage 4 seed remains reviewable before wider use.</p><div className="mx-auto mt-5 grid w-full max-w-md gap-3 text-left"><div><Label>Topic</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div><Label>Subject</Label><Input value={subject} onChange={(event) => setSubject(event.target.value)} /></div><Button loading={generate.isPending} onClick={() => void generate.mutateAsync({ topicKey, canonicalTitle: title, subjectKey: subject.toLowerCase().replace(/[^a-z0-9]+/g, '-'), subjectLabel: subject, gradeBand: 'unspecified', curriculumKey: 'generic', curriculumLabel: 'General curriculum', curriculumVersion: 'unspecified', syllabusVersion: 'unspecified', syllabusReferences: [], authoritativeGrounding: [], reason: 'Create the first Stage 4 profile for review.', regenerate: false }).then(() => setMessage('Profile created.')).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Generation failed.'))}><Sparkles className="h-4 w-4" /> Generate profile</Button>{message && <p className="text-xs text-text-muted">{message}</p>}</div></Card>;
}

function Heading({ icon: Icon, title, copy }: { icon: typeof Sparkles; title: string; copy: string }) { return <div><div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><span className="grid h-7 w-7 place-content-center rounded-lg bg-primary-soft text-primary"><Icon className="h-4 w-4" /></span>{title}</div><p className="ml-9 mt-0.5 text-xs leading-5 text-text-muted">{copy}</p></div>; }
function StatusBadge({ status }: { status: PetrosTopicProfileDto['status'] }) { return <Badge tone={status === 'published' ? 'success' : status === 'stale' ? 'warning' : status === 'draft' ? 'primary' : 'neutral'}>{status}</Badge>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-background-secondary px-3 py-2"><div className="text-text-muted">{label}</div><strong className="mt-0.5 block text-text-primary">{value}</strong></div>; }
function ScaleField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <div><Label className="text-xs">{label} · {value}/4</Label><Input type="range" min={0} max={4} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} /></div>; }
function DimensionList({ title, values, empty }: { title: string; values: string[]; empty?: string }) { return <div className="rounded-xl border border-border p-3"><strong className="text-xs text-text-primary">{title}</strong><ul className="mt-2 space-y-1 text-xs text-text-secondary">{values.map((value) => <li key={value}>• {value}</li>)}{!values.length && <li className="text-text-muted">{empty}</li>}</ul></div>; }
function Pattern({ label, moves }: { label: string; moves: string[] }) { return <div className="rounded-xl border border-border bg-background-secondary p-3"><strong className="text-xs text-text-primary">{label} bias</strong><div className="mt-2 flex flex-wrap gap-1">{moves.map((move, index) => <Badge key={`${move}-${index}`} tone="neutral">{index + 1}. {move.replace(/_/g, ' ')}</Badge>)}</div></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-text-muted">{label}</dt><dd className="max-w-[60%] truncate text-right font-medium text-text-primary">{value}</dd></div>; }
function unique(values: ReadonlyArray<readonly [string, string]>) { return [...new Map(values).entries()]; }
function clone<T>(value: T | null | undefined): T | null { return value ? JSON.parse(JSON.stringify(value)) as T : null; }
function changedPaths(before: unknown, after: unknown, prefix = ''): string[] { if (JSON.stringify(before) === JSON.stringify(after)) return []; if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) { const keys = new Set([...Object.keys(before as Record<string, unknown>), ...Object.keys(after as Record<string, unknown>)]); return [...keys].flatMap((key) => changedPaths((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key)); } return [prefix || 'profile']; }
