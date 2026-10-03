'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';

type WorkCounts = { queued: number; running: number; expiredLeases: number; pendingDispatch: number };
type Operations = {
  sampledAt: string;
  window: { startedAt: string; endedAt: string; hours: number };
  queue: { status: 'available' | 'unavailable' | 'disabled'; reason?: 'timeout' | 'connection'; counts: Array<{ name: string; waiting: number; active: number; completed: number; failed: number; delayed: number }>; recoveryActions: string[] };
  durableWork: { questionExecution: WorkCounts; sourcePreparation: WorkCounts };
  last24Hours: {
    attempts: number; retries: number; failures: number; commandCancellations: number;
    costs: { estimatedMicros: number; actualMicros: number; accountedMicros: number; currentlyReservedAllTimeMicros: number };
    reservations: { createdLast24Hours: number; outstandingAllTime: number; settledLast24Hours: number; ambiguousLast24Hours: number };
    latencyMs: { p50: number | null; p95: number | null; sampleSize: number; limitation: string };
    failuresByCategory: Record<string, number>;
    deniedAdmissionsByCategory: Record<string, number>;
  };
  configuredIdentity?: { sourceStatus: string; releaseStatus: string; sourceVersion?: string; releaseVersion?: string; releaseDigest?: string };
  release?:{configured:boolean;admissions:string;pilotAcceptance:string;releases:Array<{id:string;digest:string;gate:string;expiresAt:string}>};
  ownerLatency?:{scope:string;limitation:string;operations:Array<{operation:string;recentSamples:number;p50Ms:number|null;p95Ms:number|null;totalFailures:number}>};
  privacy: { scope: 'aggregate_only'; contentExposed: false };
};

export function PetrosOperationsPanel() {
  const api = useApiClient();
  const [data, setData] = useState<Operations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try { setData(await api.get<Operations>('/petros-quality/operations')); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  return <section aria-labelledby="petros-operations-title" className="space-y-3">
    <Card className="p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 id="petros-operations-title" className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" /> Operations visibility</h2>
          <p className="mt-1 text-sm text-text-muted">Queue recovery and AI attempt health · aggregate-only · last 24 hours</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50" aria-label="Refresh operations visibility">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Only bounded counts, safe categories, latency summaries and cost totals are shown. Learner identifiers, source text, answers, memories and drafts are excluded.</p>
    </Card>
    {loading && !data ? <Skeleton className="h-64" /> : null}
    {error ? <Card className="p-5" role="alert"><ErrorState description="Operations visibility could not load. Check API and database availability, then refresh." /></Card> : null}
    {data && !loading ? <OperationsBody data={data} /> : null}
    {!loading && !error && !data ? <Card className="p-5"><p className="text-sm text-text-muted">No operations snapshot is available yet.</p></Card> : null}
  </section>;
}

function OperationsBody({ data }: { data: Operations }) {
  const recent = data.last24Hours;
  return <div className="space-y-3">
    {data.release ? <Card className="p-4"><h3 className="font-semibold">Release gate status</h3><p className="text-sm">Admissions {data.release.admissions} · pilot acceptance {data.release.pilotAcceptance}</p>{data.release.releases.length ? data.release.releases.slice(0,5).map(row=><div key={row.id} className="mt-2 break-all text-xs"><p>Release {row.id} · gate {row.gate} · expires {row.expiresAt}</p><p>SHA-256 {row.digest}</p></div>) : <p className="mt-2 text-sm text-text-muted">No evaluated release is registered. New prompt activation is blocked.</p>}</Card> : null}
    {data.ownerLatency ? <Card className="p-4"><h3 className="font-semibold">Retrieval and teaching latency</h3><p className="text-xs text-text-muted">{data.ownerLatency.limitation}</p>{data.ownerLatency.operations.map(row=><p key={row.operation} className="mt-2 text-sm">{row.operation}: {row.recentSamples} recent samples · p50 {row.p50Ms===null?'unavailable':`${row.p50Ms.toFixed(1)} ms`} · p95 {row.p95Ms===null?'unavailable':`${row.p95Ms.toFixed(1)} ms`} · failures {row.totalFailures}</p>)}</Card> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Provider attempts" value={recent.attempts} detail={`${recent.retries} retries · ${recent.failures} failures`} />
      <Metric label="Cancelled commands" value={recent.commandCancellations} detail={`${recent.reservations.outstandingAllTime} reservations outstanding · all ages`} />
      <Metric label="Accounted cost" value={money(recent.costs.accountedMicros)} detail={`Estimated ${money(recent.costs.estimatedMicros)} · actual ${money(recent.costs.actualMicros)}`} />
      <Metric label="Response latency" value={recent.latencyMs.p50 == null ? '—' : `${Math.round(recent.latencyMs.p50)} / ${Math.round(recent.latencyMs.p95 ?? 0)} ms`} detail={`p50 / p95 · n=${recent.latencyMs.sampleSize}`} />
    </div>
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Durable work and recovery</h3><span className={`rounded-full px-2 py-1 text-xs font-semibold ${data.queue.status === 'available' ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning-foreground'}`}>Queue {data.queue.status}</span></div>
      {data.queue.status !== 'available' ? <div role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> {data.queue.status === 'disabled' ? 'Queue service is disabled.' : `Queue counts are unavailable${data.queue.reason === 'timeout' ? ' after a bounded wait' : ''}.`}</p>
        <p className="mt-1 text-text-muted">Durable database work counts remain visible. Check Redis health and dispatch/recovery workers, then refresh after service recovers.</p>
      </div> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2"><WorkCard title="Question execution" values={data.durableWork.questionExecution} /><WorkCard title="Source preparation" values={data.durableWork.sourcePreparation} /></div>
      <p className="mt-3 text-xs text-text-muted">Reservations in 24h: {recent.reservations.createdLast24Hours} created · {recent.reservations.settledLast24Hours} settled · {recent.reservations.ambiguousLast24Hours} ambiguous. {recent.reservations.outstandingAllTime} outstanding holds and {money(recent.costs.currentlyReservedAllTimeMicros)} held cost include all ages so old unreconciled reservations remain visible.</p>
      {data.queue.status === 'available' ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[38rem] text-left text-xs"><caption className="sr-only">Background queue aggregate counts</caption><thead className="bg-surface-muted text-text-muted"><tr>{['Queue', 'Waiting', 'Active', 'Delayed', 'Failed'].map((label) => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{data.queue.counts.map((row) => <tr className="border-t border-border" key={row.name}><th scope="row" className="px-3 py-2 font-medium">{row.name}</th><td className="px-3 py-2">{row.waiting}</td><td className="px-3 py-2">{row.active}</td><td className="px-3 py-2">{row.delayed}</td><td className="px-3 py-2">{row.failed}</td></tr>)}</tbody></table></div> : null}
    </Card>
    <div className="grid gap-3 lg:grid-cols-2"><CategoryCard title="Failure categories" values={recent.failuresByCategory} /><CategoryCard title="Denied admission categories" values={recent.deniedAdmissionsByCategory} /></div>
    <Card className="p-4"><div className="flex items-start gap-2 text-xs text-text-muted"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><p>Sampled {new Date(data.sampledAt).toLocaleString()}. Latency includes completed provider attempts only and does not represent end-to-end lesson latency or a production SLO. {recent.latencyMs.limitation}</p></div>
      {data.configuredIdentity ? <p className="mt-2 text-xs text-text-muted">Configured source: {data.configuredIdentity.sourceStatus} · release: {data.configuredIdentity.releaseStatus}{data.configuredIdentity.releaseVersion ? ` · ${data.configuredIdentity.releaseVersion}` : ''}</p> : null}
    </Card>
  </div>;
}

function WorkCard({ title, values }: { title: string; values: WorkCounts }) {
  return <div className="rounded-xl border border-border p-3"><h4 className="text-sm font-semibold">{title}</h4><dl className="mt-2 grid grid-cols-2 gap-2 text-xs">{[['Queued', values.queued], ['Running', values.running], ['Expired leases', values.expiredLeases], ['Pending dispatch', values.pendingDispatch]].map(([label, value]) => <div key={label} className="rounded-lg bg-surface-muted p-2"><dt className="text-text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl></div>;
}
function CategoryCard({ title, values }: { title: string; values: Record<string, number> }) {
  const rows = Object.entries(values).filter(([, value]) => value > 0);
  return <Card className="p-4"><h3 className="font-semibold">{title}</h3>{rows.length ? <dl className="mt-3 grid grid-cols-2 gap-2">{rows.map(([category, value]) => <div className="flex justify-between gap-2 rounded-lg bg-surface-muted p-3 text-xs" key={category}><dt>{category.replaceAll('_', ' ')}</dt><dd className="font-semibold">{value}</dd></div>)}</dl> : <p className="mt-2 text-sm text-text-muted">No categorized events in this window.</p>}</Card>;
}
function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <Card className="p-4"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 break-words text-xl font-semibold">{value}</p><p className="mt-1 text-xs text-text-muted">{detail}</p></Card>; }
function money(micros: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(micros / 1_000_000); }
