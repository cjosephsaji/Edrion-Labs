'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, BrainCircuit, FileText, Map, RefreshCw, ShieldCheck, Target } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

type FunctionRow = { functionKey: string; calls: number; validationFailures: number; retries: number; fallbacks: number; averageLatencyMs: number; estimatedCostMicros: number; actualCostMicros: number };
type Dashboard = {
  privacy: 'aggregate_only'; individualComparison: false; contentExposed: false;
  snapshots: { completed: number; failed: number; latestCompletedAt: string | null; algorithms: string[]; schemas: string[]; averageMissingSyllabusLinks: number; averageJobLagSeconds: number };
  mapCoverage: Record<string, number>;
  recommendations: { intentsCreated: number; outcomesCompleted: number };
  calibration: { eligible: number; hiddenLowEvidence: number; quieted: number; dismissed: number };
  recaps: { generated: number; corrected: number; dismissed: number; validationFailures: number };
  alarms: { candidates: number; active: number; snoozed: number; acceptedOrResolved: number; dismissed: number; falsePositiveReports: number; averageConfidenceBasisPoints: number };
  functions: FunctionRow[];
  releaseGate: { stage9PhysicalMicrophoneDeviceQaPassed: false; stage10HumanRepeatUsePassed: false; stage11HumanReflectionAcceptancePassed: false; productionReady: false };
};

export default function PetrosReflectionPage() {
  const api = useApiClient();
  const [institutionId, setInstitutionId] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (institutionId) query.set('institutionId', institutionId);
      setData(await api.get<Dashboard>(`/petros-reflection/dashboard${query.size ? `?${query}` : ''}`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Reflection operations could not load.'); }
    finally { setLoading(false); }
  }, [api, institutionId]);
  useEffect(() => { void load(); }, [load]);
  return <>
    <Topbar title="Petros reflection" actions={<span className="hidden text-xs text-text-muted md:inline">Aggregate operations · audited reads</span>} />
    <main className="page-enter space-y-5 p-4 md:p-6">
      <section className="rounded-2xl border border-emerald-400/20 bg-[linear-gradient(125deg,#122d26,#1f604a_60%,#517d67)] p-5 text-white shadow-md md:p-7">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-emerald-100"><Map className="h-4 w-4" /> Evidence-based reflection operations</p>
        <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Monitor usefulness and trust without ranking learners.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Coverage, eligibility, corrections, false-positive reports, rebuild lag, algorithm versions, and independently routed recap/gap functions. Learner content and names are excluded.</p>
      </section>
      <Card className="border-amber-400/30 bg-amber-400/5 p-4 md:p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Combined Stage 9–12 acceptance remains open</h2><p className="mt-2 text-sm leading-6 text-text-muted">Physical microphone/device QA, positive Teach-it-back human repeat-use evidence, and human reflection usefulness/accessibility review have not passed. Production readiness is false.</p></Card>
      <Card className="p-4 md:p-5"><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void load(); }}><label className="grid flex-1 gap-1 text-xs font-semibold">Institution ID<input className="min-h-10 rounded-lg border border-border bg-surface px-3" value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="Optional UUID" /></label><button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Refresh</button></form><p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4" /> Aggregate reads require ai.view and are audited. Individual evidence requires recent authentication and a separate audited endpoint.</p></Card>
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <Card className="p-8"><ErrorState description={`${error} Verify migration 0198 and ai.view permission.`} /></Card> : null}
      {data && !loading ? <DashboardBody data={data} /> : null}
    </main>
  </>;
}

function DashboardBody({ data }: { data: Dashboard }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={BrainCircuit} label="Rebuilds" value={data.snapshots.completed} detail={`${data.snapshots.failed} failed · ${data.snapshots.averageJobLagSeconds}s average lag`} />
      <Metric icon={Map} label="Map coverage" value={Object.values(data.mapCoverage).reduce((sum, value) => sum + value, 0)} detail={`${data.snapshots.averageMissingSyllabusLinks} average missing syllabus links`} />
      <Metric icon={Target} label="Calibration eligible" value={data.calibration.eligible} detail={`${data.calibration.hiddenLowEvidence} hidden for low evidence · ${data.calibration.quieted} quieted`} />
      <Metric icon={AlertTriangle} label="Gap candidates" value={data.alarms.candidates} detail={`${data.alarms.falsePositiveReports} false-positive reports · ${data.alarms.acceptedOrResolved} resolved`} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="p-4 md:p-5"><h2 className="font-semibold">Knowledge state coverage</h2><div className="mt-3 space-y-2">{Object.entries(data.mapCoverage).map(([key, value]) => <Signal key={key} label={key.replaceAll('_', ' ')} value={value} />)}</div></Card>
      <Card className="p-4 md:p-5"><h2 className="font-semibold">Student-controlled lifecycle</h2><div className="mt-3 grid gap-2 sm:grid-cols-2"><Signal label="Recaps generated" value={data.recaps.generated} /><Signal label="Recaps corrected" value={data.recaps.corrected} /><Signal label="Recaps dismissed" value={data.recaps.dismissed} /><Signal label="Alarm snoozes" value={data.alarms.snoozed} /><Signal label="Alarm dismissals" value={data.alarms.dismissed} /><Signal label="Recommendation intents" value={data.recommendations.intentsCreated} /></div></Card>
    </div>
    <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-border p-4 font-semibold"><Activity className="h-4 w-4" /> Independent AI functions</div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-surface-muted text-text-muted"><tr>{['Function','Calls','Validation failures','Retries','Fallbacks','Average latency','Estimated / actual µ'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{data.functions.map((row) => <tr key={row.functionKey} className="border-t border-border"><td className="px-4 py-3 font-mono">{row.functionKey}</td><td className="px-4 py-3">{row.calls}</td><td className="px-4 py-3">{row.validationFailures}</td><td className="px-4 py-3">{row.retries}</td><td className="px-4 py-3">{row.fallbacks}</td><td className="px-4 py-3">{row.averageLatencyMs} ms</td><td className="px-4 py-3">{row.estimatedCostMicros} / {row.actualCostMicros}</td></tr>)}</tbody></table></div></Card>
    <Card className="p-4 md:p-5"><h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Versions and release gate</h2><p className="mt-2 text-sm text-text-muted">Algorithms: {data.snapshots.algorithms.join(', ') || 'none'} · schemas: {data.snapshots.schemas.join(', ') || 'none'}. Production ready: <strong>no</strong>. No leaderboard or individual comparison exists.</p></Card>
  </>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Map; label: string; value: number | string; detail: string }) { return <Card className="p-4"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted"><Icon className="h-4 w-4" />{label}</span><strong className="mt-3 block text-3xl">{value}</strong><p className="mt-1 text-xs text-text-muted">{detail}</p></Card>; }
function Signal({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm"><span>{label}</span><strong>{value}</strong></div>; }
