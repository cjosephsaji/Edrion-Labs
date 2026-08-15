'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, BriefcaseBusiness, Building2, FileWarning, Landmark, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

type Dashboard = {
  privacy: 'aggregate_only'; contentExposed: false;
  policy: { totalVersions: number; drafts: number; scheduled: number; activeScopes: number };
  disclosure: { sessionSnapshots: number; driftDetected: number; stableMidSession: number };
  handoffs: Record<string, number>;
  classSignals: { shown: number; suppressed: number };
  digests: Record<string, number> & { retries: number };
  functions: Array<{ functionKey: string; calls: number; validationFailures: number; retries: number; fallbacks: number; averageLatencyMs: number; estimatedCostMicros: number; actualCostMicros: number }>;
  releaseGate: { stage9PhysicalDeviceAcceptancePassed: false; stage10HumanRepeatUsePassed: false; stage11HumanReflectionAcceptancePassed: false; stage12CrossRoleHumanAcceptancePassed: false; voiceRequired: false; productionReady: false };
};

export default function PetrosInstitutionalOperationsPage() {
  const api = useApiClient();
  const [institutionId, setInstitutionId] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams(); if (institutionId) query.set('institutionId', institutionId);
      setData(await api.get<Dashboard>(`/petros-institutional/dashboard${query.size ? `?${query}` : ''}`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Institutional operations could not load.'); }
    finally { setLoading(false); }
  }, [api, institutionId]);
  useEffect(() => { void load(); }, [load]);
  return <><Topbar title="Petros institutional loop" actions={<span className="hidden text-xs text-text-muted md:inline">Aggregate-only · audited access</span>} /><main className="page-enter space-y-5 p-4 md:p-6">
    <section className="rounded-2xl bg-[linear-gradient(125deg,#182b3a,#295b71_58%,#477a78)] p-5 text-white md:p-7"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em]"><Landmark className="h-4 w-4" /> Institutional boundary operations</p><h1 className="mt-3 text-2xl font-semibold">Policy health and human-loop delivery without student content.</h1><p className="mt-2 max-w-3xl text-sm text-white/70">Reconcile versioning, stable disclosures, privacy suppression, delivery jobs and independently routed function quality. Names, transcripts, answers, voice and images are excluded.</p></section>
    <Card className="border-amber-400/30 bg-amber-400/5 p-4"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Production readiness remains false</h2><p className="mt-2 text-sm text-text-muted">Stage 9 physical-device, Stage 10 repeat-use, Stage 11 reflection-review, and Stage 12 cross-role human acceptance gates remain explicitly false. Voice stays optional.</p></Card>
    <Card className="p-4"><form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void load(); }}><label className="grid flex-1 gap-1 text-xs font-semibold">Institution ID<input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="Optional UUID" className="min-h-11 rounded-lg border border-border bg-surface px-3" /></label><button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Refresh</button></form><p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4" /> Requires ai.view. The audit records filters and confirms no content was inspected.</p></Card>
    {loading ? <Skeleton className="h-72" /> : null}{error ? <Card className="p-8"><ErrorState description={`${error} Verify migration 0199 and ai.view.`} /></Card> : null}{data && !loading ? <Body data={data} /> : null}
  </main></>;
}

function Body({ data }: { data: Dashboard }) {
  return <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Building2} label="Policy versions" value={data.policy.totalVersions} detail={`${data.policy.drafts} drafts · ${data.policy.scheduled} scheduled · ${data.policy.activeScopes} active scopes`} /><Metric icon={ShieldCheck} label="Stable disclosures" value={data.disclosure.stableMidSession} detail={`${data.disclosure.sessionSnapshots} snapshots · ${data.disclosure.driftDetected} drift findings`} /><Metric icon={Users} label="Privacy signals" value={data.classSignals.shown} detail={`${data.classSignals.suppressed} small cohorts suppressed`} /><Metric icon={BriefcaseBusiness} label="Human-loop work" value={sum(data.handoffs)} detail={`${data.handoffs.delivered ?? 0} delivered handoffs · ${data.digests.delivered ?? 0} delivered digests`} /></div>
    <div className="grid gap-4 xl:grid-cols-2"><RecordCard title="Teacher handoffs" values={data.handoffs} /><RecordCard title="Parent digests" values={data.digests} /></div>
    <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-border p-4 font-semibold"><Activity className="h-4 w-4" /> Routed institutional functions</div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-surface-muted"><tr>{['Function','Calls','Validation failures','Retries','Fallbacks','Latency','Estimated / actual µ'].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{data.functions.map((row) => <tr className="border-t border-border" key={row.functionKey}><td className="px-4 py-3 font-mono">{row.functionKey}</td><td className="px-4 py-3">{row.calls}</td><td className="px-4 py-3">{row.validationFailures}</td><td className="px-4 py-3">{row.retries}</td><td className="px-4 py-3">{row.fallbacks}</td><td className="px-4 py-3">{row.averageLatencyMs} ms</td><td className="px-4 py-3">{row.estimatedCostMicros} / {row.actualCostMicros}</td></tr>)}</tbody></table></div></Card>
    <Card className="p-4"><p className="flex items-center gap-2 text-sm"><FileWarning className="h-4 w-4" /> Release gate: <strong>not passed</strong>. Aggregate-only: {String(data.privacy === 'aggregate_only' && !data.contentExposed)}.</p></Card></>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Landmark; label: string; value: number; detail: string }) { return <Card className="p-4"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted"><Icon className="h-4 w-4" />{label}</span><strong className="mt-3 block text-3xl">{value}</strong><p className="mt-1 text-xs text-text-muted">{detail}</p></Card>; }
function RecordCard({ title, values }: { title: string; values: Record<string, number> }) { return <Card className="p-4"><h2 className="font-semibold">{title}</h2><div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(values).map(([key, value]) => <div key={key} className="flex items-center justify-between rounded-lg bg-surface-muted p-3 text-sm"><span>{key.replaceAll('_',' ')}</span><strong>{value}</strong></div>)}</div></Card>; }
function sum(values: Record<string, number>) { return Object.values(values).reduce((total, value) => total + value, 0); }
