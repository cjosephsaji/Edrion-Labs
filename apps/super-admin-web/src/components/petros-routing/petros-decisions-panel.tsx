'use client';
import { useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, Link2, Search, ShieldCheck } from 'lucide-react';
import { Badge, Card, Input, Select, Skeleton } from '@edrion/ui';
import { usePetrosDecisionDiagnostics, usePetrosObservationDiagnostics } from '@edrion/api-client';

const MOVES = [
  { value: '', label: 'All move types' },
  ...[
    'hook', 'prerequisite_check', 'goal_frame', 'layered_explanation', 'worked_example',
    'analogy', 'story', 'derivation', 'diagram', 'predict_then_reveal', 'contrast_case',
    'misconception_demolition', 'socratic_probe', 'recall_check', 'apply_to_your_world',
    'synthesis', 'artifact_commit', 'forward_link',
  ].map((value) => ({ value, label: value.replace(/_/g, ' ') })),
];

export function PetrosDecisionsPanel() {
  const [sessionId, setSessionId] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');
  const [moveType, setMoveType] = useState('');
  const [source, setSource] = useState('');
  const [observationType, setObservationType] = useState('');
  const [functionKey, setFunctionKey] = useState('');
  const [sessionType, setSessionType] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const decisions = usePetrosDecisionDiagnostics({
    sessionId: sessionFilter || undefined,
    moveType: moveType || undefined,
    source: source || undefined,
  });
  const observations = usePetrosObservationDiagnostics({
    sessionId: sessionFilter || undefined,
    observationType: observationType || undefined,
    functionKey: functionKey || undefined,
    sessionType: sessionType || undefined,
    institutionId: isUuid(institutionId) ? institutionId : undefined,
    from: fromDate ? new Date(`${fromDate}T00:00:00.000Z`).toISOString() : undefined,
    to: toDate ? new Date(`${toDate}T23:59:59.999Z`).toISOString() : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Planning-decision diagnostics</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Audit PLAN choices without exposing prompts, learner content, or raw student
            identifiers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              aria-label="Session ID"
              className="w-72 pl-9"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSessionFilter(sessionId.trim());
              }}
              placeholder="Filter by exact session UUID"
            />
          </div>
          <button
            className="rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-text-secondary"
            onClick={() => setSessionFilter(sessionId.trim())}
          >
            Apply
          </button>
          <Select
            aria-label="Move type"
            className="w-48"
            value={moveType}
            onChange={(event) => setMoveType(event.target.value)}
            options={MOVES}
          />
          <Select
            aria-label="Decision source"
            className="w-48"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            options={[
              { value: '', label: 'AI and fallback' },
              { value: 'ai', label: 'AI decisions' },
              { value: 'deterministic_fallback', label: 'Deterministic fallback' },
            ]}
          />
          <Select
            aria-label="Observation type"
            className="w-48"
            value={observationType}
            onChange={(event) => setObservationType(event.target.value)}
            options={[
              { value: '', label: 'All observations' },
              { value: 'answer_submitted', label: 'Answers' },
              { value: 'confidence_selected', label: 'Confidence' },
              { value: 'question_asked', label: 'Composer questions' },
              { value: 'hint_requested', label: 'Hints' },
              { value: 'session_abandoned', label: 'Abandonments' },
            ]}
          />
          <Select
            aria-label="AI function"
            className="w-48"
            value={functionKey}
            onChange={(event) => setFunctionKey(event.target.value)}
            options={[
              { value: '', label: 'All functions' },
              { value: 'answer.evaluate', label: 'Answer evaluation' },
              { value: 'hint.generate', label: 'Hint generation' },
            ]}
          />
          <Select
            aria-label="Session type"
            className="w-40"
            value={sessionType}
            onChange={(event) => setSessionType(event.target.value)}
            options={[
              { value: '', label: 'All sessions' },
              { value: 'learn', label: 'Learn' },
              { value: 'revise', label: 'Revise' },
              { value: 'repair', label: 'Repair' },
              { value: 'doubt', label: 'Doubt' },
            ]}
          />
          <Input
            aria-label="Institution UUID"
            className="w-64"
            value={institutionId}
            onChange={(event) => setInstitutionId(event.target.value.trim())}
            placeholder="Institution UUID"
          />
          <Input
            aria-label="Observations from date"
            className="w-40"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <Input
            aria-label="Observations to date"
            className="w-40"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.2fr)_minmax(16rem,2fr)_10rem] gap-3 border-b border-border bg-background-secondary px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          <span>Move and source</span>
          <span>Trace</span>
          <span>Why / factors</span>
          <span>Version</span>
        </div>
        {decisions.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : decisions.isError ? (
          <div className="flex items-center gap-3 p-6 text-sm text-danger">
            <AlertTriangle className="h-5 w-5" /> Decision diagnostics could not be loaded.
          </div>
        ) : decisions.data?.length ? (
          <div className="divide-y divide-border">
            {decisions.data.map((decision) => (
              <article
                key={decision.id}
                className="grid gap-3 px-4 py-4 text-xs lg:grid-cols-[minmax(10rem,1fr)_minmax(12rem,1.2fr)_minmax(16rem,2fr)_10rem]"
              >
                <div>
                  <div className="font-semibold capitalize text-text-primary">
                    {decision.sequence}. {decision.moveType.replace(/_/g, ' ')}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone={decision.source === 'ai' ? 'primary' : 'warning'}>
                      {decision.source.replace(/_/g, ' ')}
                    </Badge>
                    {decision.policyInterventions.some(
                      (entry) => entry.policy === 'no_three_consecutive_moves',
                    ) && <Badge tone="warning">policy override</Badge>}
                    {decision.policyInterventions.some(
                      (entry) => entry.policy === 'observation_response',
                    ) && <Badge tone="primary">observation changed PLAN</Badge>}
                  </div>
                </div>
                <dl className="space-y-1 text-[11px] text-text-muted">
                  <Trace label="Session" value={decision.sessionId} />
                  <Trace label="Student" value={decision.studentRef} />
                  <Trace label="Correlation" value={decision.correlationId} />
                  <Trace label="Block" value={decision.resultingBlockId ?? 'pending'} />
                </dl>
                <div>
                  <p className="leading-5 text-text-primary">{decision.studentSafeReason}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-4 text-text-muted">
                    {decision.decisionFactors.map((factor) => (
                      <li key={factor}>{factor}</li>
                    ))}
                  </ul>
                  <details className="mt-2 rounded-md border border-border bg-background-secondary p-2 text-[11px]">
                    <summary className="cursor-pointer font-semibold text-text-secondary">Candidate weights & exclusions</summary>
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {Object.entries(decision.selectionPolicy.normalizedCandidateWeights)
                        .filter(([, weight]) => weight > 0)
                        .sort((left, right) => right[1] - left[1])
                        .slice(0, 8)
                        .map(([move, weight]) => <span key={move}>{move.replace(/_/g, ' ')} · {(weight * 100).toFixed(1)}%</span>)}
                    </div>
                    {decision.selectionPolicy.exclusions.map((item) => <p key={`${item.move}:${item.reason}`} className="mt-1 text-text-muted">Excluded {item.move.replace(/_/g, ' ')}: {item.reason}</p>)}
                    {decision.selectionPolicy.capabilityFallback && <p className="mt-2 text-warning">{decision.selectionPolicy.capabilityFallback}</p>}
                  </details>
                  {decision.policyInterventions.some(
                    (entry) => entry.policy === 'no_three_consecutive_moves',
                  ) && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft p-2 text-[11px] text-warning">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Third-repetition guard
                      changed {decision.originalMoveType?.replace(/_/g, ' ')} to{' '}
                      {decision.moveType.replace(/_/g, ' ')}.
                    </div>
                  )}
                  {decision.policyInterventions
                    .filter((entry) => entry.policy === 'observation_response')
                    .map((entry, index) => (
                      <div
                        key={index}
                        className="mt-2 rounded-md bg-primary-soft p-2 text-[11px] text-primary"
                      >
                        Causal observations:{' '}
                        {Array.isArray(entry.causalObservationIds)
                          ? entry.causalObservationIds.join(', ')
                          : 'recorded'}{' '}
                        · action {String(entry.action ?? 'continue')}
                      </div>
                    ))}
                </div>
                <dl className="space-y-1 text-[11px]">
                  <Trace label="Prompt" value={decision.promptVersion} />
                  <Trace label="Schema" value={decision.schemaVersion} />
                  <Trace label="PLAN req" value={decision.planRequestId ?? 'fallback'} />
                  <Trace label="RENDER req" value={decision.renderRequestId ?? 'fallback'} />
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center p-12 text-center">
            <ClipboardList className="h-8 w-8 text-text-muted" />
            <p className="mt-3 text-sm font-semibold text-text-primary">No matching decisions</p>
            <p className="mt-1 text-xs text-text-muted">
              Complete a Stage 2 session or clear the filters.
            </p>
          </div>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-background-secondary px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Observation and struggle diagnostics
            </h3>
            <p className="mt-0.5 text-[11px] text-text-muted">
              Raw answer and composer text are excluded; identifiers are redacted except the
              operational session trace.
            </p>
          </div>
          <Activity className="h-4 w-4 text-primary" />
        </div>
        {observations.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-28" />
          </div>
        ) : observations.isError ? (
          <div className="flex items-center gap-2 p-5 text-sm text-danger">
            <AlertTriangle className="h-4 w-4" /> Observation diagnostics could not be loaded.
          </div>
        ) : observations.data?.length ? (
          <div className="divide-y divide-border">
            {observations.data.map((observation) => (
              <article
                key={observation.id}
                className="grid gap-3 px-4 py-3 text-xs lg:grid-cols-[minmax(11rem,1fr)_minmax(12rem,1fr)_minmax(15rem,1.4fr)_minmax(11rem,1fr)]"
              >
                <div>
                  <div className="font-semibold capitalize text-text-primary">
                    {observation.type.replace(/_/g, ' ')}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {observation.correctness && (
                      <Badge
                        tone={
                          observation.correctness === 'correct'
                            ? 'success'
                            : observation.correctness === 'incorrect'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {observation.correctness}
                      </Badge>
                    )}
                    {observation.confidence && (
                      <Badge tone="neutral">{observation.confidence.replace('_', ' ')}</Badge>
                    )}
                    {observation.highValueMisconception && (
                      <Badge tone="warning">confident miss</Badge>
                    )}
                    {observation.fragileSuccess && <Badge tone="primary">fragile success</Badge>}
                  </div>
                </div>
                <dl className="space-y-1 text-[11px]">
                  <Trace label="Session" value={observation.sessionId} />
                  <Trace label="Student" value={observation.studentRef} />
                  <Trace label="Block" value={observation.blockId ?? 'session'} />
                  <Trace label="Question" value={observation.questionId ?? 'n/a'} />
                </dl>
                <div className="text-[11px] leading-5 text-text-secondary">
                  <div>
                    Ladder level: <strong>{observation.ladderLevel ?? 0}</strong>
                  </div>
                  <div>
                    Support:{' '}
                    <strong>{observation.supportKind?.replace(/_/g, ' ') ?? 'none'}</strong>
                  </div>
                  <div>
                    Error class:{' '}
                    <strong>{observation.errorClass?.replace(/_/g, ' ') ?? 'n/a'}</strong>
                  </div>
                  <div>
                    Evaluator: <strong>{observation.evaluator ?? 'not applicable'}</strong>
                  </div>
                </div>
                <dl className="space-y-1 text-[11px]">
                  <Trace label="Function" value={observation.functionKey ?? 'none'} />
                  <Trace label="Request" value={observation.requestId ?? 'deterministic'} />
                  <Trace label="Correlation" value={observation.correlationId} />
                  <Trace label="Time" value={new Date(observation.occurredAt).toLocaleString()} />
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-text-muted">No matching observations.</div>
        )}
      </Card>
      <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary-soft p-3 text-xs leading-5 text-text-secondary">
        <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> The same correlation ID is stored
        on PLAN usage, RENDER usage, the decision, lifecycle events, and the rendered block.
      </div>
    </div>
  );
}

function Trace({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.2rem_1fr] gap-1">
      <dt>{label}</dt>
      <dd className="truncate font-mono text-text-secondary" title={value}>
        {value}
      </dd>
    </div>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
