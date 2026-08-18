#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { QualitySessionResult } from './contracts';
import { assertQualityCorpusCoverage, QUALITY_CASES } from './fixtures/manifest';
import { PERSONAS, type EvalPersona } from './fixtures/topics';
import { buildQualityReport, readQualityReport, writeQualityReport } from './report';
import { evaluateTranscript } from './rubrics/structural';
import { judgeThroughGateway } from './rubrics/judge';
import { runFixtureSession, type FixtureMutation } from './runner/fixture-driver';
import { runLiveSession } from './runner/live-driver';
import type { QualityApiAuth } from './api-auth';

const args = process.argv.slice(2);
const command = args[0] ?? 'run';
const suite = value('--suite') ?? 'smoke';
const mode = (value('--mode') ?? 'fixture') as 'fixture' | 'live';
const seed = numberValue('--seed', 42);
const outDir = resolve(value('--out-dir') ?? 'eval-runs/petros-quality');
const maxCostMicros = numberValue('--max-cost-micros', mode === 'fixture' ? 0 : 500_000);
const maxTokens = numberValue('--max-tokens', mode === 'fixture' ? 0 : 100_000);
const maxDurationMs = numberValue('--max-duration-ms', 15 * 60_000);
const concurrency = Math.max(1, Math.min(8, numberValue('--concurrency', 2)));
const mutation = (value('--mutation') ?? 'none') as FixtureMutation;
const resume = flag('--resume');
const apiAuth: QualityApiAuth = {
  sessionCookie: process.env.PETROS_QUALITY_SESSION_COOKIE,
  sessionCookieName: process.env.PETROS_QUALITY_SESSION_COOKIE_NAME,
  employeeEmail: process.env.PETROS_QUALITY_EMPLOYEE_EMAIL,
};

function value(name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function flag(name: string): boolean { return args.includes(name); }
function numberValue(name: string, fallback: number): number { const parsed = Number(value(name) ?? fallback); if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative number`); return parsed; }

assertQualityCorpusCoverage();

async function main(): Promise<void> {
  if (command === 'estimate') return estimate();
  if (command === 'promote') return promote();
  if (command !== 'run') return usage(2);
  if (!['smoke', 'core', 'full'].includes(suite)) throw new Error(`Unknown suite ${suite}; use smoke|core|full`);
  if (!['fixture', 'live'].includes(mode)) throw new Error(`Unknown mode ${mode}; use fixture|live`);
  if (mode === 'live' && !flag('--confirm-live')) throw new Error('LIVE_MODE_REQUIRES_CONFIRMATION: review `estimate` output, then pass --confirm-live');
  if (mode === 'fixture' && mutation !== 'none' && !flag('--allow-deliberate-regression')) throw new Error('MUTATION_REQUIRES_CONFIRMATION: pass --allow-deliberate-regression for a safe synthetic defect');

  const selectedCases = selectCases();
  const selectedPersonas = selectPersonas();
  const codeVersion = gitVersion();
  const runId = value('--run-id') ?? `petros-quality-${suite}-${mode}-${seed}-${Date.now()}`;
  const stateFile = resolve(outDir, `${runId}.state.json`);
  const previous = resume && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) as { sessions: QualitySessionResult[] } : { sessions: [] as QualitySessionResult[] };
  const sessions = [...previous.sessions];
  const completedKeys = new Set(sessions.map((session) => `${session.transcript.caseId}:${session.transcript.personaId}`));
  const jobs = selectedCases.flatMap((qualityCase) => selectedPersonas.map((persona) => ({ qualityCase, persona }))).filter((job) => !completedKeys.has(`${job.qualityCase.id}:${job.persona}`));
  console.log(`Petros Quality: ${suite} ${mode}; ${selectedCases.length} cases × ${selectedPersonas.length} personas = ${selectedCases.length * selectedPersonas.length} sessions (${jobs.length} pending)`);

  mkdirSync(outDir, { recursive: true });
  for (let offset = 0; offset < jobs.length; offset += concurrency) {
    const batch = jobs.slice(offset, offset + concurrency);
    const results = await Promise.all(batch.map(async ({ qualityCase, persona }) => {
      const transcript = mode === 'fixture'
        ? runFixtureSession({ runId, case: qualityCase, persona, runSeed: seed, mutation, resumed: resume, codeVersion })
        : await runLiveSession({ apiBase: value('--api-base') ?? process.env.PETROS_QUALITY_API_BASE ?? 'http://localhost:3007/v1', auth: apiAuth, runId, qualityCase, persona, seed, limits: { maxCostMicros, maxTokens, maxDurationMs } });
      const deterministic = evaluateTranscript(transcript, qualityCase);
      let scores = deterministic.scores;
      if (mode === 'live' && !flag('--deterministic-only')) {
        try {
          const judged = await judgeThroughGateway(transcript, { apiBase: value('--api-base') ?? process.env.PETROS_QUALITY_API_BASE ?? 'http://localhost:3007/v1', auth: apiAuth });
          transcript.usage.push(judged.usage);
          scores = scores.map((score) => {
            const judge = judged.scores.find((item) => item.dimension === score.dimension);
            return judge ? { ...score, score: Math.round(((score.score + judge.score) / 2) * 100) / 100, rationale: `${score.rationale} Independent judge: ${judge.rationale}`, uncertainty: Math.max(score.uncertainty, judge.uncertainty), evaluator: 'gateway_judge' as const, evidence: [...score.evidence, ...judge.evidence].slice(0, 8) } : score;
          });
        } catch (error) {
          transcript.errors.push({ class: 'judge', code: 'judge_failed', message: error instanceof Error ? error.message : String(error) });
        }
      }
      const blockingFailures = [...deterministic.blockingFailures];
      const warnings = [...deterministic.warnings];
      if (transcript.errors.some((error) => error.class === 'judge')) warnings.push('judge_failed:product scores remain separate and deterministic');
      return { transcript, scores, totalScore: average(scores.map((score) => score.score)), blockingFailures, warnings } satisfies QualitySessionResult;
    }));
    sessions.push(...results);
    writeFileSync(stateFile, JSON.stringify({ runId, sessions }, null, 2));
    for (const result of results) console.log(`  ${result.transcript.caseId} × ${result.transcript.personaId}: ${result.totalScore.toFixed(2)} ${result.blockingFailures.length ? 'FAIL' : result.warnings.length ? 'WARN' : 'PASS'}`);
    enforceLimits(sessions);
  }

  const baseline = baselinePath() ? readQualityReport(baselinePath()!) : null;
  const report = buildQualityReport({
    runId,
    label: value('--label') ?? `${suite} ${mode}${mutation === 'none' ? '' : ` (${mutation})`}`,
    suite,
    seed,
    mode,
    sessions,
    caseIds: selectedCases.map((item) => item.id),
    personaIds: selectedPersonas,
    functionKeys: ['teaching.next_action.select', 'teaching.block.render', 'answer.evaluate', 'evaluation.teaching_quality.judge'],
    limits: { maxCostMicros, maxTokens, maxDurationMs, concurrency },
    baseline,
    stateFile,
  });
  const paths = writeQualityReport(report, outDir);
  console.log(`Petros Quality report: ${paths.json}`);
  console.log(`Human report: ${paths.markdown}`);
  console.log(`CSV export: ${paths.csv}`);
  console.log(`Gate: ${report.gate}; blocking=${report.blockingFailures.length}; warnings=${report.warnings.length}; cost=${report.totals.costMicros}µUSD`);
  if (report.gate === 'fail') process.exitCode = 1;
}

function selectCases() {
  const explicit = value('--cases')?.split(',').filter(Boolean);
  if (explicit?.length) return QUALITY_CASES.filter((item) => explicit.includes(item.id) || explicit.includes(item.topic.key));
  return suite === 'full' ? QUALITY_CASES : QUALITY_CASES.slice(0, 4);
}

function selectPersonas(): EvalPersona[] {
  const explicit = value('--personas')?.split(',').filter(Boolean) as EvalPersona[] | undefined;
  if (explicit?.length) {
    const unknown = explicit.filter((item) => !PERSONAS.includes(item));
    if (unknown.length) throw new Error(`Unknown personas: ${unknown.join(', ')}`);
    return explicit;
  }
  return suite === 'smoke' ? ['fast_confident', 'confidently_wrong', 'relevant_detour', 'repeated_struggle'] : [...PERSONAS];
}

function baselinePath(): string | null {
  const supplied = value('--baseline');
  if (!supplied) return null;
  const path = resolve(supplied);
  if (!existsSync(path)) throw new Error(`Baseline not found: ${path}`);
  return path;
}

function enforceLimits(sessions: QualitySessionResult[]): void {
  const usage = sessions.flatMap((session) => session.transcript.usage);
  const cost = usage.reduce((sum, item) => sum + item.costMicros, 0);
  const tokens = usage.reduce((sum, item) => sum + item.inputTokens + item.outputTokens, 0);
  if (cost > maxCostMicros) throw new Error(`BUDGET_EXCEEDED: ${cost}µUSD > ${maxCostMicros}µUSD`);
  if (tokens > maxTokens) throw new Error(`TOKEN_CAP_EXCEEDED: ${tokens} > ${maxTokens}`);
}

function estimate(): void {
  const sessions = selectCases().length * selectPersonas().length;
  const max = mode === 'fixture' ? 0 : maxCostMicros;
  console.log(JSON.stringify({ mode, suite, sessions, maximumCostMicros: max, maximumCostUsd: max / 1_000_000, maximumTokens: maxTokens, maximumDurationMs: maxDurationMs, concurrency, requiresExplicitLiveConfirmation: mode === 'live' }, null, 2));
}

function promote(): void {
  const candidatePath = value('--candidate');
  const targetPath = value('--target');
  const reason = value('--reason');
  if (!candidatePath || !targetPath || !reason || !flag('--approve-baseline')) throw new Error('PROMOTION_REQUIRES_REVIEW: --candidate, --target, --reason, and --approve-baseline are required');
  const candidate = readQualityReport(resolve(candidatePath));
  if (candidate.gate === 'fail') throw new Error('PROMOTION_FORBIDDEN: failing candidates cannot become baselines');
  const target = resolve(targetPath);
  if (existsSync(target) && !flag('--replace-selected-baseline')) throw new Error('BASELINE_IMMUTABLE: pass --replace-selected-baseline after deliberate review');
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, JSON.stringify({ ...candidate, baselineAudit: { promotedAt: new Date().toISOString(), reason, sourceFile: basename(resolve(candidatePath)), actor: process.env.USER ?? 'unknown' } }, null, 2));
  console.log(`Promoted ${candidate.runId} to ${target} with an audit record.`);
}

function gitVersion(): string {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() + (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() ? '+dirty' : ''); } catch { return 'unknown'; }
}

function average(values: number[]): number { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : 0; }

function usage(exitCode = 0): void {
  console.log('Usage: learn-evals <run|estimate|promote> [--suite smoke|core|full] [--mode fixture|live] [--baseline report.json] [--resume]');
  process.exitCode = exitCode;
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
