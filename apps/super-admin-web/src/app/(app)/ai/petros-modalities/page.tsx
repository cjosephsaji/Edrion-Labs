'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Clock3, HardDrive, Mic2, RefreshCw, ScanLine, ShieldCheck, TimerReset } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

type Dashboard = {
  privacy: 'aggregate_only';
  rawMediaExposed: false;
  learnerContentExposed: false;
  byMode: Array<{
    mode: string;
    volume: number;
    success: number;
    failures: number;
    lowConfidence: number;
    corrections: number;
    averageDurationMs: number;
    estimatedCostMicros: number;
    retries: number;
    fallbacks: number;
  }>;
  latencyByStage: Array<{ stage: string; count: number; averageMs: number; maximumMs: number }>;
  storage: Record<string, number>;
  jobs: Record<string, number>;
  voiceFailures: { permission: number; disconnect: number; noise: number; tts: number; backgroundStops: number };
  fiveMinute: { started: number; expansionOffered: number; expansionAccepted: number; actualDurationAverageMs: number };
  costByFunction: Array<{ key: string; estimatedCostMicros: number; actualCostMicros: number }>;
  costByProviderModel: Array<{ key: string; estimatedCostMicros: number; actualCostMicros: number }>;
  costByInstitution: Array<{ key: string; estimatedCostMicros: number; actualCostMicros: number }>;
  costByModeAndUnit: Array<{ mode: string; estimatedCostMicros: number; actualCostMicros: number; mediaUnits: Record<string, number> }>;
  cache: { hits: number; bypassedSensitiveMedia: number };
  capabilityMismatches: number;
  policy: { optimization: string; rawSupportAccess: boolean; conversionRankings: boolean; manipulativeEngagement: boolean };
};

const modes = ['', 'snap_question', 'handwriting', 'voice', 'five_minute'];

export default function PetrosModalitiesPage() {
  const api = useApiClient();
  const [mode, setMode] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [functionKey, setFunctionKey] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (mode) query.set('mode', mode);
      if (institutionId) query.set('institutionId', institutionId);
      if (functionKey) query.set('functionKey', functionKey);
      setData(await api.get<Dashboard>(`/petros-input-modes/dashboard${query.size ? `?${query}` : ''}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The input-mode dashboard could not load.');
    } finally {
      setLoading(false);
    }
  }, [api, functionKey, institutionId, mode]);

  useEffect(() => { void load(); }, [load]);

  const total = (field: keyof Dashboard['byMode'][number]) => data?.byMode.reduce((sum, row) => sum + Number(row[field]), 0) ?? 0;

  return (
    <>
      <Topbar title="Petros Modalities" actions={<span className="hidden text-xs text-text-muted md:inline">Aggregate operations · audited reads</span>} />
      <main className="page-enter space-y-5 p-4 md:p-6">
        <section className="rounded-2xl border border-sky-400/20 bg-[linear-gradient(125deg,#10233a,#153d5a_58%,#185470)] p-5 text-white shadow-md md:p-7">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-sky-200"><ScanLine className="h-4 w-4" /> Photo, handwriting, voice, finite sessions</p>
          <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Operate multimodal learning without exposing learner content.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">Monitor volume, confidence, corrections, latency, retries, fallbacks, retention state, voice failures, and five-minute expansion. Raw images, audio, transcripts, questions, learner names, and provider responses stay out; provider and model data is aggregate only.</p>
        </section>

        <Card className="p-4 md:p-5">
          <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <label className="grid gap-1 text-xs text-text-muted">Mode<select value={mode} onChange={(event) => setMode(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary">{modes.map((item) => <option key={item || 'all'} value={item}>{item ? item.replaceAll('_', ' ') : 'All modes'}</option>)}</select></label>
            <label className="grid gap-1 text-xs text-text-muted">Function key<input value={functionKey} onChange={(event) => setFunctionKey(event.target.value)} placeholder="Optional exact function" className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary" /></label>
            <label className="grid gap-1 text-xs text-text-muted">Institution ID<input value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} placeholder="Optional exact UUID" className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary" /></label>
            <button className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Refresh</button>
          </form>
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><ShieldCheck className="h-4 w-4" /> Raw support access is disabled. Dashboard reads are written to the audit trail.</p>
        </Card>

        {loading ? <Skeleton className="h-64" /> : null}
        {error ? <Card className="p-8"><ErrorState description={`${error} Verify migration 0196 and ai.view permission.`} /></Card> : null}
        {data && !loading ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={Activity} label="Input volume" value={total('volume')} detail={`${total('success')} successful outputs`} />
              <Metric icon={ScanLine} label="Corrections" value={total('corrections')} detail={`${total('lowConfidence')} low-confidence outputs`} />
              <Metric icon={Clock3} label="Average latency" value={`${mean(data.latencyByStage.map((row) => row.averageMs))} ms`} detail={`${data.latencyByStage.length} processing stages`} />
              <Metric icon={HardDrive} label="Retained objects" value={Object.values(data.storage).reduce((sum, value) => sum + value, 0)} detail={`${Object.values(data.jobs).reduce((sum, value) => sum + value, 0)} processing jobs`} />
            </div>

            <Card className="overflow-x-auto p-4 md:p-5">
              <h2 className="font-semibold">Quality and delivery by mode</h2>
              <table className="mt-4 w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-border text-text-muted"><th className="py-2">Mode</th><th>Volume</th><th>Success</th><th>Failures</th><th>Low confidence</th><th>Corrections</th><th>Average</th><th>Retries</th><th>Fallbacks</th><th>Cost</th></tr></thead><tbody>{data.byMode.map((row) => <tr key={row.mode} className="border-b border-border/60"><td className="py-2 font-medium">{row.mode.replaceAll('_', ' ')}</td><td>{row.volume}</td><td>{row.success}</td><td>{row.failures}</td><td>{row.lowConfidence}</td><td>{row.corrections}</td><td>{row.averageDurationMs} ms</td><td>{row.retries}</td><td>{row.fallbacks}</td><td>{row.estimatedCostMicros} µUSD</td></tr>)}</tbody></table>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4 md:p-5"><h2 className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" /> Processing latency</h2><div className="mt-3 space-y-2">{data.latencyByStage.map((row) => <Signal key={row.stage} label={`${row.stage.replaceAll('_', ' ')} · ${row.count} runs · ${row.maximumMs} ms max`} value={`${row.averageMs} ms`} />)}</div></Card>
              <Card className="p-4 md:p-5"><h2 className="flex items-center gap-2 font-semibold"><Mic2 className="h-4 w-4" /> Voice failure modes</h2><dl className="mt-3 grid gap-2 sm:grid-cols-2"><Signal label="Permission denied" value={data.voiceFailures.permission} /><Signal label="Disconnects" value={data.voiceFailures.disconnect} /><Signal label="Noise flags" value={data.voiceFailures.noise} /><Signal label="TTS failures" value={data.voiceFailures.tts} /><Signal label="Background stops" value={data.voiceFailures.backgroundStops} /></dl></Card>
              <Card className="p-4 md:p-5"><h2 className="flex items-center gap-2 font-semibold"><TimerReset className="h-4 w-4" /> Five-minute promise</h2><dl className="mt-3 grid gap-2 sm:grid-cols-2"><Signal label="Started" value={data.fiveMinute.started} /><Signal label="Expansion offered" value={data.fiveMinute.expansionOffered} /><Signal label="Expansion accepted" value={data.fiveMinute.expansionAccepted} /><Signal label="Average observed duration" value={`${data.fiveMinute.actualDurationAverageMs} ms`} /></dl></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Storage, jobs, and guardrail</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.entries(data.storage).map(([state, value]) => <Signal key={`storage:${state}`} label={`Media · ${state.replaceAll('_', ' ')}`} value={value} />)}{Object.entries(data.jobs).map(([state, value]) => <Signal key={`job:${state}`} label={`Job · ${state.replaceAll('_', ' ')}`} value={value} />)}</div><p className="mt-4 text-xs leading-5 text-text-muted">Optimization: {data.policy.optimization.replaceAll('_', ' ')}. Raw support access: {String(data.policy.rawSupportAccess)}. Conversion rankings: {String(data.policy.conversionRankings)}. Manipulative engagement: {String(data.policy.manipulativeEngagement)}.</p></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">AI cost by registered function</h2><div className="mt-3 space-y-2">{data.costByFunction.map((row) => <Signal key={row.key} label={row.key.replaceAll('_', ' ')} value={`${row.estimatedCostMicros} µUSD`} />)}</div></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Provider/model reconciliation</h2><div className="mt-3 space-y-2">{data.costByProviderModel.map((row) => <Signal key={row.key} label={row.key} value={`${row.estimatedCostMicros} µUSD`} />)}</div><p className="mt-4 text-xs text-text-muted">Cache hits: {data.cache.hits}. Sensitive-media calls bypassing cache: {data.cache.bypassedSensitiveMedia}. Capability mismatches: {data.capabilityMismatches}.</p></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Cost and media units by mode</h2><div className="mt-3 space-y-2">{data.costByModeAndUnit.map((row) => <Signal key={row.mode} label={`${row.mode.replaceAll('_', ' ')} · ${formatUnits(row.mediaUnits)}`} value={`${row.estimatedCostMicros} µUSD`} />)}</div></Card>
              <Card className="p-4 md:p-5"><h2 className="font-semibold">Institution reconciliation</h2><div className="mt-3 space-y-2">{data.costByInstitution.map((row) => <Signal key={row.key} label={row.key} value={`${row.estimatedCostMicros} µUSD`} />)}</div></Card>
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

function mean(values: number[]) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function formatUnits(units: Record<string, number>) { const values = Object.entries(units).map(([key, value]) => `${value} ${key}`); return values.length ? values.join(', ') : 'no raw unit'; }
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string | number; detail: string }) { return <Card className="p-4"><p className="flex items-center gap-2 text-xs text-text-muted"><Icon className="h-4 w-4" />{label}</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-text-muted">{detail}</p></Card>; }
function Signal({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-xs"><span className="text-text-muted">{label}</span><strong className="text-base">{value}</strong></div>; }
