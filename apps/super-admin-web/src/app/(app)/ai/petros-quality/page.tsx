'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FlaskConical, Play, ShieldCheck, Timer, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, ErrorState, Skeleton, cn } from '@edrion/ui';
import { usePetrosQualityRun, usePetrosQualityRuns, usePromotePetrosQualityBaseline, useRequestPetrosQualityRerun } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { webEnv } from '@/lib/env';
import { PetrosOperationsPanel } from '@/components/petros-quality/petros-operations-panel';

const DIMENSION_LABELS: Record<string, string> = {
  correctness: 'Correctness', structural_variety: 'Variety', move_appropriateness: 'Move fit', prerequisite_handling: 'Prerequisites',
  guess_confidence: 'Guess + confidence', stuck_recovery: 'Stuck recovery', socratic_cap: 'Socratic cap', pacing: 'Pacing',
  explainability: 'Why this?', detour_return: 'Detour return', repetition: 'Repetition', artifact_quality: 'Artifacts',
  safety_boundaries: 'Safety', language_register: 'Language', operational_efficiency: 'Cost + latency',
};

export default function PetrosQualityPage() {
  const [gate, setGate] = useState('');
  const [mode, setMode] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [personaFilter, setPersonaFilter] = useState('');
  const [functionFilter, setFunctionFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [versionFilter, setVersionFilter] = useState('');
  const runs = usePetrosQualityRuns({ gate: gate || undefined, mode: mode || undefined });
  const visibleRuns = (runs.data ?? []).filter((run) => !versionFilter || run.promptVersion === versionFilter);
  const detail = usePetrosQualityRun(selectedId || visibleRuns[0]?.id || '');
  const selected = detail.data;
  const promote = usePromotePetrosQualityBaseline();
  const rerun = useRequestPetrosQualityRerun();
  const sessions = useMemo(() => (selected?.sessions ?? []).filter((session) => {
    const usage = session.transcript.usage ?? [];
    return (!topicFilter || session.topicKey === topicFilter)
      && (!personaFilter || session.personaId === personaFilter)
      && (!functionFilter || usage.some((item) => item.functionKey === functionFilter))
      && (!providerFilter || usage.some((item) => item.providerKey === providerFilter))
      && (!modelFilter || usage.some((item) => item.modelKey === modelFilter));
  }), [selected, topicFilter, personaFilter, functionFilter, providerFilter, modelFilter]);
  const topics = [...new Set((selected?.sessions ?? []).map((session) => session.topicKey))];
  const personas = [...new Set((selected?.sessions ?? []).map((session) => session.personaId))];
  const usages = (selected?.sessions ?? []).flatMap((session) => session.transcript.usage ?? []);
  const functions = [...new Set(usages.map((item) => item.functionKey).filter(Boolean))];
  const providers = [...new Set(usages.map((item) => item.providerKey).filter(Boolean))];
  const models = [...new Set(usages.map((item) => item.modelKey).filter(Boolean))];
  const versions = [...new Set((runs.data ?? []).map((run) => run.promptVersion))];
  const [openSessionId, setOpenSessionId] = useState('');
  const openSession = selected?.sessions.find((session) => session.id === openSessionId) ?? sessions[0];

  const promoteBaseline = async () => {
    if (!selected || !window.confirm(`Promote ${selected.label} to the selected baseline? This is audited and retires the prior selection.`)) return;
    const reason = window.prompt('Promotion reason (minimum 8 characters):');
    if (reason) await promote.mutateAsync({ id: selected.id, reason });
  };
  const requestRerun = async () => {
    if (!selected) return;
    const reason = window.prompt('Reason for the safe evaluation rerun:');
    if (reason) await rerun.mutateAsync({ id: selected.id, reason, failedOnly: true });
  };

  return (
    <>
      <Topbar title="Petros Quality" actions={<span className="hidden text-xs text-text-muted md:inline">Synthetic evaluation only · no student data</span>} />
      <section aria-label="Petros quality evaluations" className="page-enter space-y-5 p-4 md:p-6">
        <PetrosOperationsPanel />
        <section className="rounded-2xl border border-violet-400/20 bg-[linear-gradient(125deg,#211633,#362052_58%,#482768)] p-5 text-white shadow-md md:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-3xl"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-200"><FlaskConical className="h-4 w-4" /> Teaching quality harness</p><h1 className="mt-3 text-2xl font-semibold md:text-3xl">Catch regressions before learners feel them.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Compare immutable baselines across topics, learner policies, prompt/schema/profile versions, correctness, variety, recovery, artifacts, cost and latency.</p></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><Signal label="Isolation" value="evaluation source" icon={ShieldCheck} /><Signal label="Corpus" value={selected?.corpusVersion ?? '30 frozen cases'} icon={FlaskConical} /><Signal label="Spend" value={selected ? usd(selected.costMicros) : '—'} icon={Timer} /><Signal label="Gate" value={selected?.gate ?? '—'} icon={selected?.gate === 'fail' ? AlertTriangle : CheckCircle2} /></div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)]">
          <Card className="h-fit p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Runs</h2><span className="text-xs text-text-muted">{runs.data?.length ?? 0}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><Filter value={gate} onChange={setGate} label="Gate" values={['pass','warn','fail']} /><Filter value={mode} onChange={setMode} label="Mode" values={['fixture','live']} /><Filter value={versionFilter} onChange={setVersionFilter} label="Version" values={versions} /></div>
            {runs.isLoading ? <Skeleton className="mt-3 h-52" /> : runs.isError ? <ErrorState description="Quality runs require migration 0190 and the Petros Quality API." /> : <div className="mt-3 space-y-2">{visibleRuns.map((run) => <button key={run.id} onClick={() => { setSelectedId(run.id); setOpenSessionId(''); }} className={cn('w-full rounded-xl border p-3 text-left transition', (selectedId || visibleRuns[0]?.id) === run.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface')}><div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{run.label}</span><Gate value={run.gate} /></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted"><span>{run.mode}</span><span>{Number(run.totals.sessions ?? 0)} sessions</span><span>{run.promptVersion}</span><span>{new Date(run.createdAt).toLocaleDateString()}</span></div></button>)}</div>}
          </Card>

          {!selected ? <Card className="p-8"><p className="text-sm text-text-secondary">{visibleRuns.length ? "Select a quality run to inspect its evidence." : "No quality evaluations have been recorded. Release activation remains blocked until current engineering evidence is registered."}</p></Card> : <div className="min-w-0 space-y-4">
            <Card className="p-4 md:p-5"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{selected.label}</h2><Gate value={selected.gate} />{selected.baseline?.selected && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Selected baseline</span>}</div><p className="mt-1 text-xs text-text-muted">Corpus {selected.corpusVersion} · Rubric {selected.rubricVersion} · Prompt {selected.promptVersion} · Schema {selected.schemaVersion}</p></div><div className="flex flex-wrap gap-2"><a href={`${webEnv.apiBaseUrl}/v1/petros-quality/runs/${selected.id}/export.json`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><Download className="h-3.5 w-3.5" /> JSON</a><a href={`${webEnv.apiBaseUrl}/v1/petros-quality/runs/${selected.id}/export.csv`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><Download className="h-3.5 w-3.5" /> CSV</a><button onClick={requestRerun} disabled={rerun.isPending} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold"><Play className="h-3.5 w-3.5" /> Rerun failures</button><button onClick={promoteBaseline} disabled={promote.isPending || selected.gate === 'fail'} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Promote baseline</button></div></div></Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Mean score" value={`${Number(selected.totals.score ?? 0).toFixed(2)} / 5`} /><Metric label="Sessions" value={`${selected.totals.completed ?? 0}/${selected.totals.sessions ?? 0}`} /><Metric label="Cost" value={usd(selected.costMicros)} /><Metric label="Latency" value={`${selected.latencyMs.toLocaleString()} ms`} /></div>

            <Card className="p-4 md:p-5"><h2 className="font-semibold">Rubric dimensions</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{Object.entries(selected.dimensions).map(([key, value]) => <div key={key}><div className="mb-1 flex justify-between text-xs"><span>{DIMENSION_LABELS[key] ?? key}</span><span className="font-semibold">{value.mean.toFixed(2)} <span className="font-normal text-text-muted">n={value.count}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-surface"><div className={cn('h-full rounded-full', value.mean < 3 ? 'bg-danger' : value.mean < 4 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.max(0, Math.min(100, value.mean / 5 * 100))}%` }} /></div></div>)}</div></Card>

            {selected.comparison && <Comparison comparison={selected.comparison} />}

            <Card className="p-4 md:p-5"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><h2 className="font-semibold">Topic × persona matrix</h2><p className="text-xs text-text-muted">Open any cell to inspect typed moves, observations, score evidence, errors and usage.</p></div><div className="flex flex-wrap gap-2"><Filter value={topicFilter} onChange={setTopicFilter} label="Topic" values={topics} /><Filter value={personaFilter} onChange={setPersonaFilter} label="Persona" values={personas} /><Filter value={functionFilter} onChange={setFunctionFilter} label="Function" values={functions} /><Filter value={providerFilter} onChange={setProviderFilter} label="Provider" values={providers} /><Filter value={modelFilter} onChange={setModelFilter} label="Model" values={models} /></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-xs"><thead><tr className="border-b border-border text-text-muted"><th className="p-2">Topic</th><th className="p-2">Persona</th><th className="p-2">Goal</th><th className="p-2">Score</th><th className="p-2">Status</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id} onClick={() => setOpenSessionId(session.id)} className="cursor-pointer border-b border-border/60 hover:bg-surface"><td className="p-2 font-medium">{session.topicTitle}</td><td className="p-2">{session.personaId.replace(/_/g,' ')}</td><td className="p-2">{session.goal}</td><td className="p-2 font-semibold">{(session.totalScoreBasisPoints / 100).toFixed(2)}</td><td className="p-2"><Gate value={session.status === 'failed' ? 'fail' : session.status === 'warning' ? 'warn' : 'pass'} /></td></tr>)}</tbody></table></div></Card>

            {openSession && <SessionEvidence session={openSession} scores={selected.scores.filter((score) => score.sessionId === openSession.id)} />}

            {(selected.blockingFailures.length > 0 || selected.warnings.length > 0) && <Card className="p-4 md:p-5"><h2 className="font-semibold">Diagnostics</h2><div className="mt-3 space-y-2 text-sm">{selected.blockingFailures.map((item) => <p key={item} className="rounded-lg bg-danger/10 p-3 text-danger">Blocking · {item}</p>)}{selected.warnings.map((item) => <p key={item} className="rounded-lg bg-warning/10 p-3">Warning · {item}</p>)}</div></Card>}
          </div>}
        </div>
      </section>
    </>
  );
}

function SessionEvidence({ session, scores }: { session: NonNullable<ReturnType<typeof usePetrosQualityRun>['data']>['sessions'][number]; scores: NonNullable<ReturnType<typeof usePetrosQualityRun>['data']>['scores'] }) {
  return <Card className="p-4 md:p-5"><div className="flex justify-between gap-3"><div><h2 className="font-semibold">Typed transcript · {session.topicTitle}</h2><p className="text-xs text-text-muted">{session.personaId} · {session.externalSessionId}</p></div><Gate value={session.status === 'failed' ? 'fail' : session.status === 'warning' ? 'warn' : 'pass'} /></div><div className="mt-4 space-y-3">{(session.transcript.moves ?? []).map((move, index) => <article key={move.id} className="rounded-xl border border-border p-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{index + 1} · {move.type.replace(/_/g,' ')}</span><span className="text-[11px] text-text-muted">{move.id} · {move.blockId}</span></div><h3 className="mt-2 text-sm font-semibold">{move.title}</h3><p className="mt-1 text-sm text-text-muted">{move.content}</p><details className="mt-2 text-xs"><summary className="cursor-pointer font-semibold">Why this?</summary><p className="mt-2">{move.studentSafeReason}</p><ul className="mt-1 list-disc pl-5 text-text-muted">{move.decisionFactors.map((factor) => <li key={factor}>{factor}</li>)}</ul></details>{(session.transcript.observations ?? []).filter((observation) => observation.moveId === move.id).map((observation) => <p key={observation.id} className="mt-2 rounded bg-surface p-2 text-xs">OBSERVE · {observation.summary}</p>)}</article>)}</div><div className="mt-5 grid gap-2 md:grid-cols-2">{scores.map((score) => <div key={score.dimension} className="rounded-xl border border-border p-3 text-xs"><div className="flex justify-between"><span className="font-semibold">{DIMENSION_LABELS[score.dimension] ?? score.dimension}</span><span>{(score.scoreBasisPoints / 100).toFixed(2)} / 5</span></div><p className="mt-2 text-text-muted">{score.rationale}</p><p className="mt-1 text-text-muted">Uncertainty {(score.uncertaintyBasisPoints / 100).toFixed(1)}% · {score.evaluator}</p></div>)}</div></Card>;
}

function Comparison({ comparison }: { comparison: Record<string, unknown> }) { const regressions = Array.isArray(comparison.regressions) ? comparison.regressions as Array<Record<string, unknown>> : []; const improvements = Array.isArray(comparison.improvements) ? comparison.improvements as Array<Record<string, unknown>> : []; return <Card className="p-4 md:p-5"><h2 className="font-semibold">Baseline comparison</h2><div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-danger/5 p-3"><h3 className="flex items-center gap-1 text-sm font-semibold"><TrendingDown className="h-4 w-4" /> Regressions</h3>{regressions.length ? regressions.map((item, index) => <p key={index} className="mt-2 text-xs">{String(item.scope)} · {String(item.key)} · {Number(item.delta).toFixed(2)}{item.noisy ? ' · low sample' : ''}</p>) : <p className="mt-2 text-xs text-text-muted">None detected.</p>}</div><div className="rounded-xl bg-success/5 p-3"><h3 className="flex items-center gap-1 text-sm font-semibold"><TrendingUp className="h-4 w-4" /> Improvements</h3>{improvements.length ? improvements.map((item, index) => <p key={index} className="mt-2 text-xs">{String(item.scope)} · {String(item.key)} · +{Number(item.delta).toFixed(2)}{item.noisy ? ' · low sample' : ''}</p>) : <p className="mt-2 text-xs text-text-muted">No material improvements.</p>}</div></div></Card>; }
function Metric({ label, value }: { label: string; value: string }) { return <Card className="p-4"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></Card>; }
function Signal({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ShieldCheck }) { return <div className="rounded-xl border border-white/10 bg-white/[0.07] p-3"><p className="flex items-center gap-1 text-white/55"><Icon className="h-3.5 w-3.5" />{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Gate({ value }: { value: string }) { return <span className={cn('rounded-full px-2 py-1 text-[10px] font-bold uppercase', value === 'fail' ? 'bg-danger/10 text-danger' : value === 'warn' ? 'bg-warning/15 text-warning-foreground' : 'bg-success/10 text-success')}>{value}</span>; }
function Filter({ value, onChange, label, values }: { value: string; onChange: (value: string) => void; label: string; values: string[] }) { return <label className="text-[11px] text-text-muted"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 max-w-48 rounded-lg border border-border bg-background px-2 text-xs text-text-primary"><option value="">All {label.toLowerCase()}s</option>{values.map((item) => <option key={item} value={item}>{item.replace(/_/g,' ')}</option>)}</select></label>; }
function usd(micros: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(micros / 1_000_000); }
