'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Speech,
  TriangleAlert,
} from 'lucide-react';
import { Card, ErrorState, Skeleton } from '@edrion/ui';
import { useApiClient } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

type AggregateRow = {
  key: string;
  calls: number;
  failures: number;
  retries: number;
  fallbacks: number;
  estimatedCostMicros: number;
  actualCostMicros: number;
  averageMs: number;
  maximumMs: number;
};

type Dashboard = {
  privacy: 'aggregate_only';
  learnerSpeechExposed: false;
  sessions: {
    started: number;
    completed: number;
    repeatedVoluntarily: number;
    abandonedOrPaused: number;
    text: number;
    voice: number;
    averageDurationSeconds: number;
    averageFollowUps: number;
    helpUses: number;
    abandonPoints: Array<{ movesUsed: number; count: number }>;
  };
  gaps: Array<{ gapType: string; count: number }>;
  topicGapBuckets: Array<{ topicRef: string; gapType: string; count: number }>;
  verdicts: {
    generated: number;
    validationFailures: number;
    uncertainty: number;
  };
  learnerModelUpdates: number;
  learnerModelUpdateFailures: number;
  artifacts: { proposed: number; saved: number };
  twoProbePolicy: { capApplied: number; violations: number; target: 0 };
  functions: AggregateRow[];
  voiceFunctions: Array<AggregateRow & { providerModels: string[] }>;
  providerModels: AggregateRow[];
  latency: Array<{ key: string; averageMs: number; maximumMs: number }>;
  voiceReleaseGate: {
    optional: true;
    stage9PhysicalDeviceQaPassed: false;
    productionReady: false;
  };
};

const gapTypes = [
  '',
  'missing_causal_link',
  'undefined_term',
  'unhandled_exception',
  'weak_example',
  'contradiction',
  'misconception',
  'scope_gap',
];

export default function PetrosTeachBackPage() {
  const api = useApiClient();
  const [mode, setMode] = useState('');
  const [gapType, setGapType] = useState('');
  const [functionKey, setFunctionKey] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (mode) query.set('mode', mode);
      if (gapType) query.set('gapType', gapType);
      if (functionKey) query.set('functionKey', functionKey);
      if (institutionId) query.set('institutionId', institutionId);
      setData(
        await api.get<Dashboard>(`/petros-teach-back/dashboard${query.size ? `?${query}` : ''}`),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The Teach-it-back dashboard could not load.',
      );
    } finally {
      setLoading(false);
    }
  }, [api, functionKey, gapType, institutionId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Topbar
        title="Teach-it-back"
        actions={
          <span className="hidden text-xs text-text-muted md:inline">
            Aggregate operations · audited reads
          </span>
        }
      />
      <main className="page-enter space-y-5 p-4 md:p-6">
        <section className="rounded-2xl border border-violet-400/20 bg-[linear-gradient(125deg,#1b1735,#312359_58%,#4b3275)] p-5 text-white shadow-md md:p-7">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-violet-200">
            <Speech className="h-4 w-4" /> Student-generated explanation quality
          </p>
          <h1 className="mt-3 text-2xl font-semibold md:text-3xl">
            Operate the reversed learning loop without reading learner speech.
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
            Track explanation sessions, grounded gaps, the two-probe cap, non-numeric verdicts,
            conservative learner-model updates, editable artifact proposals, AI reliability,
            latency, and cost. Learner text, transcripts, audio, evidence excerpts, and names are
            excluded.
          </p>
        </section>

        <Card className="border-amber-400/30 bg-amber-400/5 p-4 md:p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4 text-amber-500" /> Voice release gate remains closed
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Voice is an optional equivalent input. Stage 9 physical microphone, headset,
            interruption, background-stop, pronunciation, and mixed-language device QA is deferred,
            so this surface does not claim production readiness.
          </p>
        </Card>

        <Card className="p-4 md:p-5">
          <form
            className="grid gap-3 md:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <Field label="Mode">
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="">All modes</option>
                <option value="text">Text</option>
                <option value="voice">Optional voice</option>
              </select>
            </Field>
            <Field label="Gap type">
              <select value={gapType} onChange={(event) => setGapType(event.target.value)}>
                {gapTypes.map((gap) => (
                  <option key={gap || 'all'} value={gap}>
                    {gap ? gap.replaceAll('_', ' ') : 'All gaps'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Function key">
              <input
                value={functionKey}
                onChange={(event) => setFunctionKey(event.target.value)}
                placeholder="Optional exact function"
              />
            </Field>
            <Field label="Institution ID">
              <input
                value={institutionId}
                onChange={(event) => setInstitutionId(event.target.value)}
                placeholder="Optional UUID"
              />
            </Field>
            <button className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </form>
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <ShieldCheck className="h-4 w-4" /> Aggregate only. Every dashboard read is audited.
          </p>
        </Card>

        {loading ? <Skeleton className="h-64" /> : null}
        {error ? (
          <Card className="p-8">
            <ErrorState description={`${error} Verify migration 0197 and ai.view permission.`} />
          </Card>
        ) : null}
        {data && !loading ? <DashboardBody data={data} /> : null}
      </main>
    </>
  );
}

function DashboardBody({ data }: { data: Dashboard }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Activity}
          label="Sessions"
          value={data.sessions.started}
          detail={`${data.sessions.completed} closed · ${data.sessions.repeatedVoluntarily} voluntary repeats`}
        />
        <Metric
          icon={Speech}
          label="Input split"
          value={`${data.sessions.text} / ${data.sessions.voice}`}
          detail="text / optional voice"
        />
        <Metric
          icon={Clock3}
          label="Average duration"
          value={`${data.sessions.averageDurationSeconds}s`}
          detail={`${data.sessions.averageFollowUps} average follow-ups · ${data.sessions.helpUses} help uses`}
        />
        <Metric
          icon={BrainCircuit}
          label="Conservative updates"
          value={data.learnerModelUpdates}
          detail={`${data.learnerModelUpdateFailures} failed · ${data.artifacts.proposed} proposals · ${data.artifacts.saved} explicitly saved`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4 md:p-5">
          <h2 className="font-semibold">Gap distribution</h2>
          <div className="mt-3 space-y-2">
            {data.gaps.length ? (
              data.gaps.map((row) => (
                <Signal
                  key={row.gapType}
                  label={row.gapType.replaceAll('_', ' ')}
                  value={row.count}
                />
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="font-semibold">Verdict and probe guardrails</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Signal label="Verdicts generated" value={data.verdicts.generated} />
            <Signal label="Verdict validation failures" value={data.verdicts.validationFailures} />
            <Signal label="Verdicts with uncertainty" value={data.verdicts.uncertainty} />
            <Signal label="Two-probe cap applied" value={data.twoProbePolicy.capApplied} />
            <Signal label="Two-probe violations" value={data.twoProbePolicy.violations} />
            <Signal label="Violation target" value={data.twoProbePolicy.target} />
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="font-semibold">Privacy-safe topic/gap buckets</h2>
          <p className="mt-1 text-xs text-text-muted">
            Topic labels are one-way references; learner-entered topic text is not exposed.
          </p>
          <div className="mt-3 space-y-2">
            {data.topicGapBuckets.length ? (
              data.topicGapBuckets.map((row) => (
                <Signal
                  key={`${row.topicRef}:${row.gapType}`}
                  label={`${row.topicRef} · ${row.gapType.replaceAll('_', ' ')}`}
                  value={row.count}
                />
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <h2 className="font-semibold">Pause/abandon point</h2>
          <div className="mt-3 space-y-2">
            {data.sessions.abandonPoints.length ? (
              data.sessions.abandonPoints.map((row) => (
                <Signal
                  key={row.movesUsed}
                  label={`Paused after move ${row.movesUsed}`}
                  value={row.count}
                />
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-4 md:p-5">
        <h2 className="font-semibold">Dedicated AI functions</h2>
        <table className="mt-4 w-full min-w-[860px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2">Function</th>
              <th>Calls</th>
              <th>Failures</th>
              <th>Retries</th>
              <th>Fallbacks</th>
              <th>Average</th>
              <th>Maximum</th>
              <th>Estimated cost</th>
            </tr>
          </thead>
          <tbody>
            {data.functions.map((row) => (
              <tr key={row.key} className="border-b border-border/60">
                <td className="py-2 font-medium">{row.key}</td>
                <td>{row.calls}</td>
                <td>{row.failures}</td>
                <td>{row.retries}</td>
                <td>{row.fallbacks}</td>
                <td>{row.averageMs} ms</td>
                <td>{row.maximumMs} ms</td>
                <td>{row.estimatedCostMicros} µUSD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Linked voice STT/TTS operations</h2>
        <p className="mt-1 text-xs text-text-muted">
          Only aggregate modality events linked by owner-private media IDs; no audio or transcript
          content is exposed.
        </p>
        <div className="mt-3 space-y-2">
          {data.voiceFunctions.length ? (
            data.voiceFunctions.map((row) => (
              <Signal
                key={row.key}
                label={`${row.key} · ${row.calls} calls · ${row.failures} failures · ${row.retries} retries · ${row.fallbacks} fallbacks · ${row.providerModels.join(', ')}`}
                value={`${row.averageMs} ms`}
              />
            ))
          ) : (
            <Empty />
          )}
        </div>
      </Card>

      <Card className="p-4 md:p-5">
        <h2 className="font-semibold">Provider/model reconciliation</h2>
        <div className="mt-3 space-y-2">
          {data.providerModels.length ? (
            data.providerModels.map((row) => (
              <Signal
                key={row.key}
                label={`${row.key} · ${row.calls} calls · ${row.failures} failures · ${row.fallbacks} fallbacks`}
                value={`${row.estimatedCostMicros} µUSD`}
              />
            ))
          ) : (
            <Empty />
          )}
        </div>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-text-muted">
      {label}
      <span className="contents [&_input]:rounded-lg [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:text-text-primary [&_select]:rounded-lg [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:text-text-primary">
        {children}
      </span>
    </label>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{detail}</p>
    </Card>
  );
}
function Signal({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-xs">
      <span className="text-text-muted">{label}</span>
      <strong className="text-base">{value}</strong>
    </div>
  );
}
function Empty() {
  return <p className="text-sm text-text-muted">No aggregate observations match these filters.</p>;
}
