'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CircleDollarSign,
  Clock3,
  Coins,
  Gauge,
  Layers3,
  Lightbulb,
  Save,
} from 'lucide-react';
import { Badge, Button, Card, Input, Label, Select, Skeleton, cn } from '@edrion/ui';
import type { PetrosAiBudgetPolicyDto } from '@edrion/api-client';
import { usePetrosAiFunctions, usePetrosAiUsage, useUpdatePetrosBudget } from '@edrion/api-client';

const GROUPS = [
  { value: 'function', label: 'By function' },
  { value: 'provider', label: 'By provider' },
  { value: 'model', label: 'By model' },
  { value: 'institution', label: 'By institution' },
  { value: 'student', label: 'By student' },
  { value: 'day', label: 'By day' },
];

export function PetrosUsageBudgetPanel({
  budget,
  loading,
}: {
  budget?: PetrosAiBudgetPolicyDto;
  loading: boolean;
}) {
  const [group, setGroup] = useState('function');
  const [functionId, setFunctionId] = useState('');
  const [door, setDoor] = useState('');
  const [sessionType, setSessionType] = useState('');
  const functions = usePetrosAiFunctions();
  const usage = usePetrosAiUsage(group, functionId || undefined, {
    door: door || undefined,
    sessionType: sessionType || undefined,
  });
  const totals = usage.data?.totals;
  const maxCost = Math.max(
    ...(usage.data?.breakdown.map((row) => Number(row.costMicros)) ?? [0]),
    1,
  );
  const expensive = useMemo(
    () =>
      [...(usage.data?.breakdown ?? [])]
        .filter((row) => row.requests > 0)
        .sort((a, b) => b.costMicros / b.requests - a.costMicros / a.requests)
        .slice(0, 3),
    [usage.data],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)]">
        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Usage and cost metering</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Planning, rendering, answer evaluation, hints, retries and fallbacks are measured
                independently.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label="Filter usage by contextual door"
                className="w-52"
                value={door}
                onChange={(e) => setDoor(e.target.value)}
                options={[
                  { value: '', label: 'All contextual doors' },
                  { value: 'result_repair', label: 'Result repair' },
                  { value: 'upcoming_exam', label: 'Upcoming exam' },
                  { value: 'uploaded_document', label: 'Uploaded document' },
                  { value: 'learning_path', label: 'Learning path' },
                  { value: 'assistant_handoff', label: 'Assistant handoff' },
                  { value: 'student_portal', label: 'Direct portal' },
                ]}
              />
              <Select
                aria-label="Filter usage by session type"
                className="w-44"
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                options={[
                  { value: '', label: 'All session types' },
                  { value: 'learn', label: 'Learn' },
                  { value: 'repair', label: 'Repair' },
                  { value: 'revise', label: 'Revise' },
                  { value: 'doubt', label: 'Doubt' },
                ]}
              />
              <Select
                aria-label="Filter usage by Petros function"
                className="w-64"
                value={functionId}
                onChange={(e) => setFunctionId(e.target.value)}
                options={[
                  { value: '', label: 'All functions' },
                  ...(functions.data ?? [])
                    .filter((fn) =>
                      [
                        'teaching.next_action.select',
                        'teaching.block.render',
                        'answer.evaluate',
                        'hint.generate',
                        'artifact.flashcards.generate',
                        'artifact.notes.generate',
                        'artifact.diagram.generate',
                      ].includes(fn.key),
                    )
                    .map((fn) => ({ value: fn.id, label: fn.displayName })),
                ]}
              />
              <Select
                className="w-44"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                options={GROUPS}
              />
            </div>
          </div>
          {usage.isLoading ? (
            <Skeleton className="h-52" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  icon={CircleDollarSign}
                  label="30-day cost"
                  value={formatUsd(totals?.costMicros ?? 0)}
                />
                <Metric
                  icon={Layers3}
                  label="Requests / attempts"
                  value={`${totals?.requests ?? 0} / ${totals?.attempts ?? 0}`}
                />
                <Metric
                  icon={Clock3}
                  label="Average latency"
                  value={`${Math.round(totals?.averageResponseMs ?? 0)} ms`}
                />
                <Metric
                  icon={Gauge}
                  label="Fallbacks"
                  value={formatPercent(
                    (totals?.fallbacks ?? 0) / Math.max(totals?.attempts ?? 0, 1),
                  )}
                />
              </div>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Cost distribution</div>
                    <div className="text-xs text-text-muted">
                      {usage.data
                        ? `${new Date(usage.data.from).toLocaleDateString()} – ${new Date(usage.data.to).toLocaleDateString()}`
                        : 'Last 30 days'}
                    </div>
                  </div>
                  <Badge tone="neutral">micro-USD metering</Badge>
                </div>
                <div className="divide-y divide-border">
                  {usage.data?.breakdown.length ? (
                    usage.data.breakdown.map((row) => {
                      const successRate = row.attempts ? row.successes / row.attempts : 0;
                      return (
                        <div
                          key={row.label}
                          className="grid gap-3 px-5 py-3 text-xs md:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1.5fr)_6rem_6rem_6rem] md:items-center"
                        >
                          <div
                            className="truncate font-semibold text-text-primary"
                            title={row.label}
                          >
                            {row.label}
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-background-secondary">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--info))]"
                              style={{
                                width: `${Math.max(2, (Number(row.costMicros) / maxCost) * 100)}%`,
                              }}
                            />
                          </div>
                          <div className="text-right text-text-secondary">
                            {formatUsd(Number(row.costMicros))}
                          </div>
                          <div className="text-right text-text-muted">{row.requests} req</div>
                          <div
                            className={cn(
                              'text-right',
                              successRate >= 0.95
                                ? 'text-success'
                                : successRate >= 0.8
                                  ? 'text-warning'
                                  : 'text-danger',
                            )}
                          >
                            {formatPercent(successRate)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-10 text-center text-sm text-text-muted">
                      Usage appears here after Petros executes its first routed function.
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
        <BudgetEditor budget={budget} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-soft text-warning">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Cost optimization watchlist
              </h3>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Highest average cost among the current grouping. Compare completion and learning
                outcomes before moving traffic.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {expensive.length ? (
              expensive.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-lg border border-border bg-background-secondary/50 px-3 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-text-primary">{row.label}</div>
                    <div className="text-text-muted">
                      {row.requests} requests · {row.averageResponseMs} ms avg
                    </div>
                  </div>
                  <div className="ml-3 text-right">
                    <div className="font-semibold text-text-primary">
                      {formatUsd(row.costMicros / Math.max(row.requests, 1))}
                    </div>
                    <div className="text-text-muted">per request</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-text-muted">Not enough usage to recommend changes.</p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Experiment signals</h3>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Traffic splits record cost, latency, retries and fallback behaviour now. Student
                completion, correctness, satisfaction and learning improvement join through session
                outcome events.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Signal label="Input tokens" value={compact(totals?.inputTokens ?? 0)} />
            <Signal label="Output tokens" value={compact(totals?.outputTokens ?? 0)} />
            <Signal label="Cached tokens" value={compact(totals?.cachedTokens ?? 0)} />
            <Signal label="Failures" value={String(totals?.failures ?? 0)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function BudgetEditor({ budget, loading }: { budget?: PetrosAiBudgetPolicyDto; loading: boolean }) {
  const save = useUpdatePetrosBudget();
  const [monthly, setMonthly] = useState(
    budget?.monthlyBudgetMicros == null ? '' : String(budget.monthlyBudgetMicros / 1_000_000),
  );
  const [daily, setDaily] = useState(
    budget?.dailyBudgetMicros == null ? '' : String(budget.dailyBudgetMicros / 1_000_000),
  );
  const [preserve, setPreserve] = useState(budget?.preserveEssentialFunctions ?? true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!budget) return;
    setMonthly(
      budget.monthlyBudgetMicros == null ? '' : String(budget.monthlyBudgetMicros / 1_000_000),
    );
    setDaily(budget.dailyBudgetMicros == null ? '' : String(budget.dailyBudgetMicros / 1_000_000));
    setPreserve(budget.preserveEssentialFunctions);
  }, [budget]);
  const thresholds = budget?.thresholds ?? [
    { percent: 70, action: 'warn' },
    { percent: 90, action: 'restrict_expensive' },
    { percent: 95, action: 'route_to_lower_cost' },
    { percent: 100, action: 'stop_non_essential' },
  ];
  async function submit() {
    if (!budget) return;
    try {
      await save.mutateAsync({
        monthlyBudgetMicros: monthly === '' ? null : Math.round(Number(monthly) * 1_000_000),
        dailyBudgetMicros: daily === '' ? null : Math.round(Number(daily) * 1_000_000),
        thresholds,
        preserveEssentialFunctions: preserve,
        enabled: true,
        reason: 'Update Petros platform budget policy',
        version: budget.version,
      });
      setMessage('Budget policy saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save budget policy.');
    }
  }
  if (loading) return <Skeleton className="h-[34rem]" />;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-[linear-gradient(120deg,var(--surface-elevated),var(--primary-soft))] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Coins className="h-4 w-4 text-primary" /> Platform budget policy
        </div>
        <p className="mt-1 text-xs leading-5 text-text-muted">
          Automatic actions become progressively stricter while essential teaching and safety
          functions remain available.
        </p>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Monthly ceiling (USD)</Label>
            <Input
              type="number"
              min={0}
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              placeholder="No ceiling"
            />
          </div>
          <div>
            <Label>Daily ceiling (USD)</Label>
            <Input
              type="number"
              min={0}
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
              placeholder="No ceiling"
            />
          </div>
        </div>
        <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Threshold actions
        </div>
        <div className="mt-2 space-y-2">
          {thresholds.map((threshold) => (
            <div
              key={`${threshold.percent}-${threshold.action}`}
              className="grid grid-cols-[3.5rem_1fr] items-center gap-3 rounded-lg border border-border bg-background-secondary/60 p-3"
            >
              <div className="text-center">
                <div className="text-lg font-semibold text-text-primary">{threshold.percent}%</div>
                <div className="text-[10px] text-text-muted">of budget</div>
              </div>
              <div>
                <div className="text-xs font-semibold capitalize text-text-primary">
                  {threshold.action.replace(/_/g, ' ')}
                </div>
                <div className="mt-0.5 text-[11px] text-text-muted">
                  {thresholdCopy(threshold.action)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 rounded-lg border border-success/20 bg-success-soft p-3">
          <input
            type="checkbox"
            checked={preserve}
            onChange={(e) => setPreserve(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <div>
            <div className="text-xs font-semibold text-text-primary">
              Preserve essential teaching and safety
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-text-muted">
              Planning, hints, answer evaluation, grounding, assignment policy and teacher
              escalation remain eligible at 100%.
            </div>
          </div>
        </label>
        {message && (
          <p
            className={cn(
              'mt-3 text-xs',
              message.includes('saved') ? 'text-success' : 'text-danger',
            )}
          >
            {message}
          </p>
        )}
        <Button className="mt-4 w-full" onClick={submit} loading={save.isPending}>
          <Save className="h-4 w-4" /> Save budget policy
        </Button>
      </div>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-text-primary">{value}</div>
    </Card>
  );
}
function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background-secondary/50 p-3">
      <div className="text-text-muted">{label}</div>
      <div className="mt-1 text-base font-semibold text-text-primary">{value}</div>
    </div>
  );
}
function formatUsd(micros: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(Number(micros) / 1_000_000);
}
function formatPercent(value: number) {
  return `${(Number.isFinite(value) ? value * 100 : 0).toFixed(1)}%`;
}
function compact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(Number(value));
}
function thresholdCopy(action: string) {
  return action === 'warn'
    ? 'Notify administrators; routing remains unchanged.'
    : action === 'restrict_expensive'
      ? 'Avoid high-cost candidates when a capable alternative exists.'
      : action === 'route_to_lower_cost'
        ? 'Make cost the primary candidate preference.'
        : 'Pause non-essential AI functions until the budget resets.';
}
