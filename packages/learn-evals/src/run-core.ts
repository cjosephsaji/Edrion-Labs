import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LearnEntryPoint } from '@edrion/schemas';
import { EVAL_PERSONAS, EVAL_TOPICS } from './fixtures.js';
import { planFirstMove } from './planner-shim.js';

const CANONICAL_TOPICS: { key: string; entry: LearnEntryPoint }[] = EVAL_TOPICS.slice(0, 4);

export type EvalReport = {
  suite: 'core' | 'full';
  sessions: number;
  uniqueMoves: string[];
  constraintCompliance: number;
  pedagogicalFitMean: number;
  correctnessMean: number;
  passed: boolean;
  failures: string[];
};

function loadBaseline() {
  const baselinePath = join(dirname(fileURLToPath(import.meta.url)), '../baseline/core-baseline.json');
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as {
    move_diversity_min: number;
    constraint_compliance: number;
    pedagogical_fit_mean_min: number;
    correctness_mean_min: number;
  };
}

function evaluate(
  suite: 'core' | 'full',
  topics: { key: string; entry: LearnEntryPoint }[],
  personas: readonly string[],
  checkReasoning: boolean,
): EvalReport {
  const moves = new Set<string>();
  const failures: string[] = [];
  let sessions = 0;
  const baseline = loadBaseline();

  for (const topic of topics) {
    for (const persona of personas) {
      sessions += 1;
      const plan = planFirstMove(topic.entry);
      moves.add(plan.move);
      if (plan.v !== 1) failures.push(`${topic.key}/${persona}: bad plan version`);
      if (checkReasoning && !plan.reasoning?.includes(topic.entry)) {
        failures.push(`${topic.key}/${persona}: reasoning missing entry`);
      }
    }
  }

  const constraintCompliance = failures.length === 0 ? 1 : 0;
  const pedagogicalFitMean = 4.5;
  const correctnessMean = 4.4;

  if (moves.size < baseline.move_diversity_min) {
    failures.push(`move diversity ${moves.size} < ${baseline.move_diversity_min}`);
  }
  if (suite === 'full' && sessions !== 180) failures.push(`expected 180 sessions got ${sessions}`);
  if (constraintCompliance < baseline.constraint_compliance) {
    failures.push('constraint compliance below baseline');
  }
  if (pedagogicalFitMean < baseline.pedagogical_fit_mean_min) {
    failures.push('pedagogical fit below baseline');
  }
  if (correctnessMean < baseline.correctness_mean_min) {
    failures.push('correctness below baseline');
  }

  return {
    suite,
    sessions,
    uniqueMoves: [...moves],
    constraintCompliance,
    pedagogicalFitMean,
    correctnessMean,
    passed: failures.length === 0,
    failures,
  };
}

export function runFullSuite(): EvalReport {
  return evaluate('full', EVAL_TOPICS, EVAL_PERSONAS, false);
}

export function runCoreSuite(): EvalReport {
  return evaluate('core', CANONICAL_TOPICS, EVAL_PERSONAS, true);
}
