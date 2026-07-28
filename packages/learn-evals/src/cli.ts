#!/usr/bin/env tsx
import { resolve } from 'node:path';
import {
  assertTopicCoverage,
  PERSONAS,
  TOPIC_FIXTURES,
  type EvalPersona,
} from './fixtures/topics';
import { runEvalSession, type EvalClientConfig } from './runner/session-driver';
import { judgeTranscript } from './rubrics/judge';
import { buildReport, scoreSession, writeReport } from './report';
import { P2_ENTRY_FIXTURES } from './fixtures/p2-entry-points';

const args = process.argv.slice(2);
const cmd = args[0] === 'run' ? 'run' : args[0] ?? 'run';
const suite = argValue('--suite') ?? 'core';
const provider = argValue('--provider') ?? 'live';
const baselineArg = argValue('--baseline');
const seed = Number(argValue('--seed') ?? process.env.LEARN_EVAL_SEED ?? 42);

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

assertTopicCoverage();

const canonical = TOPIC_FIXTURES.filter((t) => t.canonical);
const topics = suite === 'full' ? TOPIC_FIXTURES : canonical;
if (suite !== 'core' && suite !== 'full') {
  console.error(`Unknown suite "${suite}" — use core|full`);
  process.exit(2);
}

async function main() {
  if (cmd !== 'run') {
    console.error('Usage: learn-evals run [--suite core|full] [--baseline <path-or-run_id>] [--seed N]');
    process.exit(2);
  }

  const cfg: EvalClientConfig = {
    apiBase: process.env.LEARN_EVAL_API_BASE ?? 'http://localhost:3001/v1/student',
    authCookie: process.env.LEARN_EVAL_AUTH_TOKEN ?? '',
    evalSecret: process.env.LEARN_EVAL_SECRET ?? '',
    studentEmail: process.env.LEARN_EVAL_STUDENT_EMAIL,
  };

  if (!cfg.authCookie && !cfg.studentEmail) {
    console.error('LEARN_EVAL_AUTH_TOKEN or LEARN_EVAL_STUDENT_EMAIL is required to drive the live orchestrator.');
    process.exit(1);
  }
  if (!cfg.evalSecret) {
    console.error('LEARN_EVAL_SECRET is required to seed frozen topic profiles.');
    process.exit(1);
  }
  if (provider === 'stub') {
    console.error(
      'learn-evals: --provider stub is retired. The Learn engine was rebuilt; use fixtures, not a live driver.',
    );
    process.exit(2);
  }

  const runId = `learn-eval-${suite}-${seed}-${Date.now()}`;
  console.log(
    `learn-evals: suite=${suite} topics=${topics.length} personas=${PERSONAS.length} sessions=${topics.length * PERSONAS.length} seed=${seed}`,
  );

  const scores = [];
  for (const topic of topics) {
    for (const persona of PERSONAS as readonly EvalPersona[]) {
      process.stdout.write(`  → ${topic.key} × ${persona} … `);
      const transcript = await runEvalSession({ cfg, topic, persona, runSeed: seed });
      if (transcript.error) {
        console.log(`ERR ${transcript.error}`);
        // Still judge failure loudly for content dims — judge unavailable path is separate.
        try {
          const judge = await judgeTranscript(transcript, {});
          scores.push(scoreSession(transcript, judge));
        } catch (e) {
          console.error(`\n${e instanceof Error ? e.message : e}`);
          process.exit(1);
        }
        continue;
      }
      try {
        const judge = await judgeTranscript(transcript, {});
        scores.push(scoreSession(transcript, judge));
        console.log(`ok moves=${transcript.moves.length}`);
      } catch (e) {
        console.error(`\n${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    }
  }

  const baselinePath = baselineArg
    ? baselineArg.endsWith('.json')
      ? resolve(baselineArg)
      : resolve(process.cwd(), 'eval-runs', `${baselineArg}.json`)
    : null;

  const report = buildReport({
    runId,
    suite,
    seed,
    scores,
    baselinePath,
  });
  (report as { p2_fixtures?: number }).p2_fixtures = P2_ENTRY_FIXTURES.length;

  const outDir = resolve(process.cwd(), 'eval-runs');
  const { json, md } = writeReport(report, outDir);
  console.log(`learn-evals: wrote ${json}`);
  console.log(`learn-evals: wrote ${md}`);
  console.log(`learn-evals: gate=${report.gate} failures=${report.failures.join(',') || 'none'}`);
  if (report.gate === 'fail') process.exit(1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
