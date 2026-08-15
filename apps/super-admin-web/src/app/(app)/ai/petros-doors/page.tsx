'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRightLeft, Clock3, DoorOpen, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

type Dashboard = {
  privacy: string;
  contentExposed: boolean;
  byDoor: Array<{ door: string; sessionTypes: string[]; metrics: Record<string, number> }>;
  failures: Array<{ reasonCode: string; count: number }>;
  firstContentLatency: { averageMs: number; maximumMs: number };
  usage: { attempts: number; estimatedCostMicros: number };
  intentFactors: Array<{ door: string; sessionType: string; emotionalRegister: string; count: number }>;
  initialMoves: Array<{ door: string; sessionType: string; moveType: string; count: number }>;
  grounding: { documentFailures: number; staleOrMissingSources: number };
  policy: { optimization: string; conversionRankings: boolean; manipulativeReengagement: boolean };
};

const doors = ['', 'result_repair', 'upcoming_exam', 'uploaded_document', 'learning_path', 'assistant_handoff'];
const sessionTypes = ['', 'learn', 'revise', 'repair', 'doubt'];

export default function PetrosDoorsPage() {
  const api = useApiClient();
  const [door, setDoor] = useState('');
  const [sessionType, setSessionType] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (door) query.set('door', door);
      if (sessionType) query.set('sessionType', sessionType);
      if (institutionId) query.set('institutionId', institutionId);
      setData(await api.get<Dashboard>(`/petros-doors/dashboard${query.size ? `?${query}` : ''}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Doors dashboard could not load.');
    } finally {
      setLoading(false);
    }
  }, [api, door, institutionId, sessionType]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <Topbar title="Petros Doors" actions={<span className="hidden text-xs text-text-muted md:inline">Privacy-safe origins · audited reads</span>} />
      <main className="page-enter space-y-5 p-4 md:p-6">
        <section className="rounded-2xl border border-emerald-400/20 bg-[linear-gradient(125deg,#10251d,#173a2d_58%,#1c4b3a)] p-5 text-white shadow-md md:p-7">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-emerald-200"><DoorOpen className="h-4 w-4" /> Session origins</p>
          <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Reconcile five contextual doors into one teaching engine.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Starts, learning completion, pause/abandon, artifact ownership, returns, source failures, handoff acceptance, initial move, first content, and cost—without student content or conversion-pressure ranking.</p>
        </section>
        <Card className="p-4 md:p-5">
          <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <label className="grid gap-1 text-xs text-text-muted">Door<select value={door} onChange={(event) => setDoor(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary">{doors.map((item) => <option key={item || 'all'} value={item}>{item ? item.replaceAll('_', ' ') : 'All doors'}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-text-muted">Session type<select value={sessionType} onChange={(event) => setSessionType(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary">{sessionTypes.map((item) => <option key={item || 'all'} value={item}>{item || 'All types'}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-text-muted">Institution ID<input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="Optional exact UUID" className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary" /></label>
            <button className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </form>
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4" /> Aggregate-only; no question, mark, page excerpt, learner identity, or provider detail is returned.</p>
        </Card>
        {loading ? <Skeleton className="h-64" /> : null}
        {error ? <Card className="p-8"><ErrorState description={`${error} Verify migration 0195 and ai.view permission.`} /></Card> : null}
        {data && !loading ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={DoorOpen} label="Door buckets" value={data.byDoor.length} detail={`${data.byDoor.reduce((sum, row) => sum + metricTotal(row.metrics, 'start'), 0)} starts`} />
              <Metric icon={ArrowRightLeft} label="Accepted handoffs" value={data.byDoor.reduce((sum, row) => sum + metricTotal(row.metrics, 'assistant_accepted'), 0)} detail="explicit acceptance only" />
              <Metric icon={Clock3} label="First content" value={`${data.firstContentLatency.averageMs} ms`} detail={`${Math.round(data.firstContentLatency.maximumMs)} ms max`} />
              <Metric icon={Activity} label="AI attempts" value={data.usage.attempts} detail={`${data.usage.estimatedCostMicros} µUSD estimated`} />
            </div>
            <Card className="overflow-x-auto p-4 md:p-5">
              <h2 className="font-semibold">Origin funnel by door and session type</h2>
              <table className="mt-4 w-full min-w-[820px] text-left text-xs"><thead><tr className="border-b border-border text-text-muted"><th className="py-2">Door</th><th>Types</th><th>Impressions</th><th>Starts</th><th>Complete</th><th>Pause/abandon</th><th>Artifacts</th><th>Returns</th><th>Failures</th></tr></thead><tbody>{data.byDoor.map((row) => <tr key={row.door} className="border-b border-border/60"><td className="py-2 font-medium">{row.door.replaceAll('_', ' ')}</td><td>{row.sessionTypes.join(', ')}</td><td>{metricTotal(row.metrics, 'impression')}</td><td>{metricTotal(row.metrics, 'start')}</td><td>{metricTotal(row.metrics, 'completed')}</td><td>{metricTotal(row.metrics, 'paused') + metricTotal(row.metrics, 'abandoned')}</td><td>{metricTotal(row.metrics, 'artifact_saved')}</td><td>{metricTotal(row.metrics, 'returned')}</td><td>{metricTotal(row.metrics, 'failure')}</td></tr>)}</tbody></table>
            </Card>
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Tone, goal, and scope selection</h2><div className="mt-3 space-y-2">{data.intentFactors.map((row) => <Signal key={`${row.door}:${row.sessionType}:${row.emotionalRegister}`} label={`${row.door.replaceAll('_', ' ')} · ${row.sessionType} · ${row.emotionalRegister.replaceAll('_', ' ')}`} value={row.count} />)}</div></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Initial PLAN move distribution</h2><div className="mt-3 space-y-2">{data.initialMoves.map((row) => <Signal key={`${row.door}:${row.sessionType}:${row.moveType}`} label={`${row.door.replaceAll('_', ' ')} · ${row.moveType.replaceAll('_', ' ')}`} value={row.count} />)}</div></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Source health</h2><dl className="mt-3 grid grid-cols-2 gap-3"><Signal label="Document grounding failures" value={data.grounding.documentFailures} /><Signal label="Stale/missing sources" value={data.grounding.staleOrMissingSources} /></dl><div className="mt-3 text-xs text-text-muted">{data.failures.map((row) => <p key={row.reasonCode}>{row.reasonCode}: {row.count}</p>)}</div></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Guardrail</h2><p className="mt-3 text-sm text-text-muted">Optimization: {data.policy.optimization.replaceAll('_', ' ')}. Conversion rankings: {String(data.policy.conversionRankings)}. Manipulative re-engagement: {String(data.policy.manipulativeReengagement)}.</p><a href="/ai/petros-routing" className="mt-4 inline-flex text-xs font-semibold text-primary">Trace registered functions by door/session metadata →</a></Card>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function metricTotal(metrics: Record<string, number>, suffix: string) { return Object.entries(metrics).filter(([key]) => key.endsWith(`:${suffix}`)).reduce((sum, [, value]) => sum + value, 0); }
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail: string }) { return <Card className="p-4"><p className="flex items-center gap-2 text-xs text-text-muted"><Icon className="h-4 w-4" />{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-text-muted">{detail}</p></Card>; }
function Signal({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-xs"><span className="text-text-muted">{label}</span><strong className="text-base">{value}</strong></div>; }
