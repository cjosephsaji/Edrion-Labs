import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SessionTranscript } from './rubrics/structural';
import {
  findConstraintViolations,
  percentile,
  RUBRIC_THRESHOLDS,
  scoreLatency,
  scoreMoveDiversity,
} from './rubrics/structural';
import type { JudgeScores } from './rubrics/judge';
import { CANONICAL_TOPIC_KEYS } from './fixtures/topics';

export type SessionScore = {
  transcript: SessionTranscript;
  move_diversity: number;
  constraint_violations: string[];
  pedagogical_fit: number;
  content_correctness: number;
  artifact_quality: number;
  first_token_ms: number[];
  degraded_rate: number;
  discard_rate: number;
  judge_notes?: string;
};

export type EvalReport = {
  run_id: string;
  suite: string;
  seed: number;
  sessions: number;
  gate: 'pass' | 'fail';
  failures: string[];
  dimensions: Record<string, unknown>;
  baseline_delta: Record<string, number> | null;
  worst_transcripts: SessionTranscript[];
  session_scores: SessionScore[];
};

export function buildReport(opts: {
  runId: string;
  suite: string;
  seed: number;
  scores: SessionScore[];
  baselinePath?: string | null;
}): EvalReport {
  const { scores } = opts;
  const failures: string[] = [];

  const moveDiv = scores.map((s) => s.move_diversity);
  const moveMean = avg(moveDiv);
  if (scores.some((s) => s.move_diversity < RUBRIC_THRESHOLDS.move_diversity_min && !s.transcript.error)) {
    failures.push('move_diversity_below_threshold');
  }

  const allViolations = scores.flatMap((s) => s.constraint_violations);
  if (allViolations.length) failures.push(`constraint_compliance:${allViolations[0]}`);

  // Canonical four pairwise-distinct under average_curious
  const canonSeqs = scores
    .filter((s) => s.transcript.persona === 'average_curious' && CANONICAL_TOPIC_KEYS.includes(s.transcript.topicKey))
    .map((s) => s.transcript.moves.join('>'));
  if (new Set(canonSeqs).size < canonSeqs.length) failures.push('canonical_sequences_not_distinct');

  const fit = scores.map((s) => s.pedagogical_fit);
  const content = scores.map((s) => s.content_correctness);
  const artifact = scores.map((s) => s.artifact_quality);
  if (avg(fit) < RUBRIC_THRESHOLDS.pedagogical_fit_mean || fit.some((n) => n < RUBRIC_THRESHOLDS.pedagogical_fit_floor)) {
    failures.push('pedagogical_fit');
  }
  if (
    avg(content) < RUBRIC_THRESHOLDS.content_correctness_mean ||
    content.some((n) => n < RUBRIC_THRESHOLDS.content_correctness_floor)
  ) {
    failures.push('content_correctness');
  }
  if (avg(artifact) < RUBRIC_THRESHOLDS.artifact_quality_mean) failures.push('artifact_quality');

  const allFirst = scores.flatMap((s) => s.first_token_ms).sort((a, b) => a - b);
  const p95 = percentile(allFirst, 95);
  const degradedMean = avg(scores.map((s) => s.degraded_rate));
  const discardMean = avg(scores.map((s) => s.discard_rate));
  if (p95 >= RUBRIC_THRESHOLDS.latency_p95_first_token_ms) failures.push('latency_p95');
  if (degradedMean > RUBRIC_THRESHOLDS.degraded_rate_max) failures.push('degraded_rate');
  if (discardMean >= RUBRIC_THRESHOLDS.discard_rate_max) failures.push('discard_rate');

  if (scores.some((s) => s.transcript.error)) {
    failures.push(`session_errors:${scores.filter((s) => s.transcript.error).length}`);
  }

  let baseline_delta: Record<string, number> | null = null;
  if (opts.baselinePath && existsSync(opts.baselinePath)) {
    const baseline = JSON.parse(readFileSync(opts.baselinePath, 'utf8')) as EvalReport;
    const dims = baseline.dimensions as Record<string, { mean?: number }>;
    baseline_delta = {
      move_diversity: moveMean - (dims.move_diversity?.mean ?? moveMean),
      pedagogical_fit: avg(fit) - (dims.pedagogical_fit?.mean ?? avg(fit)),
      content_correctness: avg(content) - (dims.content_correctness?.mean ?? avg(content)),
      artifact_quality: avg(artifact) - (dims.artifact_quality?.mean ?? avg(artifact)),
    };
    for (const [k, delta] of Object.entries(baseline_delta)) {
      if (delta < -RUBRIC_THRESHOLDS.baseline_drop_max) failures.push(`baseline_drop:${k}`);
    }
  }

  const ranked = [...scores].sort(
    (a, b) => a.pedagogical_fit + a.content_correctness - (b.pedagogical_fit + b.content_correctness),
  );

  return {
    run_id: opts.runId,
    suite: opts.suite,
    seed: opts.seed,
    sessions: scores.length,
    gate: failures.length ? 'fail' : 'pass',
    failures,
    dimensions: {
      move_diversity: { mean: moveMean, pass: !failures.includes('move_diversity_below_threshold') },
      constraint_compliance: {
        value: allViolations.length === 0 ? 1 : 0,
        pass: allViolations.length === 0,
      },
      pedagogical_fit: { mean: avg(fit), pass: !failures.includes('pedagogical_fit') },
      content_correctness: { mean: avg(content), pass: !failures.includes('content_correctness') },
      artifact_quality: { mean: avg(artifact), pass: !failures.includes('artifact_quality') },
      latency_robustness: {
        p95_first_token_ms: p95,
        degraded_rate: degradedMean,
        discard_rate: discardMean,
        pass: !failures.some((f) => f.startsWith('latency') || f === 'degraded_rate' || f === 'discard_rate'),
      },
    },
    baseline_delta,
    worst_transcripts: ranked.slice(0, 5).map((s) => s.transcript),
    session_scores: scores,
  };
}

export function scoreSession(transcript: SessionTranscript, judge: JudgeScores): SessionScore {
  const violations = findConstraintViolations(transcript);
  const latency = scoreLatency(transcript);
  return {
    transcript,
    move_diversity: scoreMoveDiversity(transcript),
    constraint_violations: violations,
    pedagogical_fit: judge.pedagogical_fit,
    content_correctness: judge.content_correctness,
    artifact_quality: judge.artifact_quality,
    first_token_ms: latency.firstTokens,
    degraded_rate: latency.degradedRate,
    discard_rate: latency.discardRate,
    judge_notes: judge.notes,
  };
}

export function writeReport(report: EvalReport, outDir: string): { json: string; md: string } {
  mkdirSync(outDir, { recursive: true });
  const json = join(outDir, `${report.run_id}.json`);
  const md = join(outDir, `${report.run_id}.md`);
  writeFileSync(json, JSON.stringify(report, null, 2));
  const lines = [
    `# Learn eval ${report.run_id}`,
    '',
    `Suite: ${report.suite}`,
    `Seed: ${report.seed}`,
    `Sessions: ${report.sessions}`,
    `Gate: **${report.gate}**`,
    '',
    '## Failures',
    report.failures.length ? report.failures.map((f) => `- ${f}`).join('\n') : '- none',
    '',
    '## Dimensions',
    '```json',
    JSON.stringify(report.dimensions, null, 2),
    '```',
    '',
    '## Worst transcripts (5)',
    ...report.worst_transcripts.map(
      (t, i) =>
        `### ${i + 1}. ${t.topicKey} / ${t.persona}\nMoves: ${t.moves.join(' → ') || '(none)'}\nError: ${t.error ?? '—'}\n`,
    ),
  ];
  writeFileSync(md, lines.join('\n'));
  return { json, md };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
