import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_QUALITY_THRESHOLDS,
  QUALITY_DIMENSIONS,
  type QualityComparison,
  type QualityDimension,
  type QualityRunReport,
  type QualitySessionResult,
  type QualityThresholds,
} from './contracts';

export function buildQualityReport(input: {
  runId: string;
  label: string;
  suite: string;
  seed: number;
  mode: 'fixture' | 'live';
  sessions: QualitySessionResult[];
  caseIds: string[];
  personaIds: string[];
  functionKeys: string[];
  limits: QualityRunReport['limits'];
  baseline?: QualityRunReport | null;
  stateFile?: string | null;
  thresholds?: QualityThresholds;
  startedAt?: string;
}): QualityRunReport {
  const thresholds = input.thresholds ?? DEFAULT_QUALITY_THRESHOLDS;
  const completedAt = new Date().toISOString();
  const usage = input.sessions.flatMap((session) => session.transcript.usage);
  const dimensions = Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => {
    const values = input.sessions.flatMap((session) => session.scores.filter((score) => score.dimension === dimension).map((score) => score.score));
    return [dimension, { mean: average(values), count: values.length }];
  })) as Record<QualityDimension, { mean: number; count: number }>;
  const blockingFailures = [...new Set(input.sessions.flatMap((session) => session.blockingFailures))];
  const warnings = [...new Set(input.sessions.flatMap((session) => session.warnings))];
  const provisional: QualityRunReport = {
    schemaVersion: input.sessions[0]?.transcript.versions.schema ?? 'petros-quality-report.v1',
    runId: input.runId,
    label: input.label,
    status: blockingFailures.length ? 'failed' : 'completed',
    mode: input.mode,
    source: 'evaluation',
    suite: input.suite,
    seed: input.seed,
    createdAt: input.startedAt ?? completedAt,
    completedAt,
    versions: input.sessions[0]?.transcript.versions ?? {
      corpus: 'unknown', rubric: 'unknown', runner: 'unknown', prompt: 'unknown', schema: 'unknown', profile: 'unknown', routing: 'unknown', code: 'unknown',
    },
    selection: { caseIds: input.caseIds, personaIds: input.personaIds, functionKeys: input.functionKeys },
    limits: input.limits,
    totals: {
      sessions: input.sessions.length,
      completed: input.sessions.filter((session) => session.transcript.ended !== 'failed').length,
      failed: input.sessions.filter((session) => session.transcript.ended === 'failed').length,
      score: average(input.sessions.map((session) => session.totalScore)),
      costMicros: sum(usage.map((item) => item.costMicros)),
      inputTokens: sum(usage.map((item) => item.inputTokens)),
      outputTokens: sum(usage.map((item) => item.outputTokens)),
      latencyMs: sum(usage.map((item) => item.latencyMs)),
    },
    dimensions,
    sessions: input.sessions,
    comparison: null,
    gate: blockingFailures.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    blockingFailures,
    warnings,
    resume: { supported: true, stateFile: input.stateFile ?? null, resumedSessions: input.sessions.filter((session) => session.transcript.resumed).length },
    isolation: { syntheticOnly: true, productionWrites: sum(input.sessions.map((session) => session.transcript.productionWrites)), analyticsSource: 'evaluation' },
  };
  if (input.baseline) {
    provisional.comparison = compareQualityRuns(input.baseline, provisional, thresholds);
    const blocking = provisional.comparison.regressions.filter((item) => item.severity === 'blocking').map((item) => `regression:${item.scope}:${item.key}:${item.delta}`);
    const regressionWarnings = provisional.comparison.regressions.filter((item) => item.severity === 'warning').map((item) => `regression:${item.scope}:${item.key}:${item.delta}`);
    provisional.blockingFailures.push(...blocking);
    provisional.warnings.push(...regressionWarnings);
    provisional.gate = provisional.blockingFailures.length ? 'fail' : provisional.warnings.length ? 'warn' : 'pass';
    provisional.status = provisional.blockingFailures.length ? 'failed' : 'completed';
  }
  return provisional;
}

export function compareQualityRuns(baseline: QualityRunReport, candidate: QualityRunReport, thresholds = DEFAULT_QUALITY_THRESHOLDS): QualityComparison {
  const dimensionDeltas = Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, round2(candidate.dimensions[dimension].mean - baseline.dimensions[dimension].mean)])) as Record<QualityDimension, number>;
  const topicDeltas = groupedDelta(baseline, candidate, (session) => session.transcript.topicKey);
  const personaDeltas = groupedDelta(baseline, candidate, (session) => session.transcript.personaId);
  const functionDeltas = { plan_render_observe: round2(candidate.totals.score - baseline.totals.score) };
  const failureTypeDeltas = groupedFailureDelta(baseline, candidate);
  const regressions: QualityComparison['regressions'] = [];
  const improvements: QualityComparison['improvements'] = [];
  const blockingDimensions = new Set<QualityDimension>(['correctness', 'stuck_recovery', 'safety_boundaries', 'socratic_cap']);
  for (const [key, delta] of Object.entries(dimensionDeltas) as Array<[QualityDimension, number]>) {
    const count = Math.min(baseline.dimensions[key].count, candidate.dimensions[key].count);
    if (delta <= (blockingDimensions.has(key) ? thresholds.blockingRegressionDelta : thresholds.warningRegressionDelta)) {
      regressions.push({ scope: 'dimension', key, delta, severity: blockingDimensions.has(key) ? 'blocking' : 'warning', noisy: count < thresholds.lowSampleSize });
    } else if (delta >= 0.25) improvements.push({ scope: 'dimension', key, delta, noisy: count < thresholds.lowSampleSize });
  }
  for (const [scope, values] of [['topic', topicDeltas], ['persona', personaDeltas]] as const) {
    for (const [key, delta] of Object.entries(values)) {
      const sample = candidate.sessions.filter((session) => (scope === 'topic' ? session.transcript.topicKey : session.transcript.personaId) === key).length;
      if (delta <= thresholds.warningRegressionDelta) regressions.push({ scope, key, delta, severity: 'warning', noisy: sample < thresholds.lowSampleSize });
      else if (delta >= 0.25) improvements.push({ scope, key, delta, noisy: sample < thresholds.lowSampleSize });
    }
  }
  return {
    baselineRunId: baseline.runId,
    candidateRunId: candidate.runId,
    overallDelta: round2(candidate.totals.score - baseline.totals.score),
    dimensionDeltas,
    topicDeltas,
    personaDeltas,
    functionDeltas,
    failureTypeDeltas,
    regressions,
    improvements,
  };
}

export function writeQualityReport(report: QualityRunReport, outDir: string): { json: string; markdown: string; csv: string } {
  mkdirSync(outDir, { recursive: true });
  const json = join(outDir, `${report.runId}.json`);
  const markdown = join(outDir, `${report.runId}.md`);
  const csv = join(outDir, `${report.runId}.csv`);
  writeFileSync(json, JSON.stringify(report, null, 2));
  writeFileSync(markdown, renderMarkdown(report));
  const rows = ['run_id,case_id,topic,persona,total_score,gate,cost_micros,latency_ms'];
  for (const session of report.sessions) {
    rows.push([report.runId, session.transcript.caseId, session.transcript.topicKey, session.transcript.personaId, session.totalScore, session.blockingFailures.length ? 'fail' : session.warnings.length ? 'warn' : 'pass', sum(session.transcript.usage.map((item) => item.costMicros)), sum(session.transcript.usage.map((item) => item.latencyMs))].map(csvCell).join(','));
  }
  writeFileSync(csv, rows.join('\n'));
  return { json, markdown, csv };
}

export function readQualityReport(path: string): QualityRunReport {
  return JSON.parse(readFileSync(path, 'utf8')) as QualityRunReport;
}

function renderMarkdown(report: QualityRunReport): string {
  const lines = [
    `# Petros Quality — ${report.label}`,
    '',
    `- Run: \`${report.runId}\``,
    `- Gate: **${report.gate}**`,
    `- Mode/source: ${report.mode} / ${report.source}`,
    `- Sessions: ${report.totals.completed}/${report.totals.sessions} completed`,
    `- Mean score: ${report.totals.score.toFixed(2)} / 5`,
    `- Cost: ${(report.totals.costMicros / 1_000_000).toFixed(6)} USD`,
    `- Production writes: ${report.isolation.productionWrites}`,
    '',
    '## Dimensions',
    '',
    '| Dimension | Mean | N |',
    '|---|---:|---:|',
    ...QUALITY_DIMENSIONS.map((dimension) => `| ${dimension.replace(/_/g, ' ')} | ${report.dimensions[dimension].mean.toFixed(2)} | ${report.dimensions[dimension].count} |`),
    '',
    '## Regressions and failures',
    '',
    ...(report.blockingFailures.length ? report.blockingFailures.map((item) => `- BLOCKING: ${item}`) : ['- No blocking failures.']),
    ...report.warnings.map((item) => `- Warning: ${item}`),
    '',
    '## Session evidence',
    '',
    ...report.sessions.map((session) => {
      const transcript = session.transcript;
      return `### ${transcript.topicTitle} × ${transcript.personaId}\n\nMoves: ${transcript.moves.map((move) => `${move.type} (${move.id})`).join(' → ')}\n\nScore: ${session.totalScore.toFixed(2)} / 5`;
    }),
  ];
  return lines.join('\n');
}

function groupedDelta(baseline: QualityRunReport, candidate: QualityRunReport, key: (session: QualitySessionResult) => string): Record<string, number> {
  const result: Record<string, number> = {};
  const keys = new Set([...baseline.sessions.map(key), ...candidate.sessions.map(key)]);
  for (const value of keys) {
    result[value] = round2(average(candidate.sessions.filter((session) => key(session) === value).map((session) => session.totalScore)) - average(baseline.sessions.filter((session) => key(session) === value).map((session) => session.totalScore)));
  }
  return result;
}

function groupedFailureDelta(baseline: QualityRunReport, candidate: QualityRunReport): Record<string, number> {
  const count = (report: QualityRunReport, type: string) => report.sessions.flatMap((session) => session.transcript.errors).filter((error) => error.class === type).length;
  return Object.fromEntries(['product', 'judge', 'infrastructure'].map((type) => [type, count(candidate, type) - count(baseline, type)]));
}

function average(values: number[]): number { return values.length ? round2(sum(values) / values.length) : 0; }
function sum(values: number[]): number { return values.reduce((total, value) => total + value, 0); }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function csvCell(value: string | number): string { const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
