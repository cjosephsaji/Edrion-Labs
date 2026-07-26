#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCoreSuite, runFullSuite } from './run-core.js';

const args = process.argv.slice(2);
const command = args[0] ?? 'run';
const suite = args.includes('--suite')
  ? args[args.indexOf('--suite') + 1] ?? 'core'
  : 'core';
const writeBaseline = args.includes('--baseline');

if (command !== 'run') {
  console.error('Usage: learn-evals run [--suite core|full] [--baseline]');
  process.exit(2);
}

if (suite === 'full') {
  const report = runFullSuite();
  const outDir = join(process.cwd(), 'reports');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = join(outDir, `learn-evals-full-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, artifact: jsonPath }));
  process.exit(report.passed ? 0 : 1);
}

const report = runCoreSuite();
const outDir = join(process.cwd(), 'reports');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = join(outDir, `learn-evals-${suite}-${stamp}.json`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
writeFileSync(
  join(outDir, `learn-evals-${suite}-${stamp}.md`),
  `# Learn evals (${suite})\n\n- sessions: ${report.sessions}\n- moves: ${report.uniqueMoves.join(', ')}\n- passed: ${report.passed}\n`,
);

if (writeBaseline) {
  writeFileSync(join(process.cwd(), 'baseline/core-baseline.json'), JSON.stringify(report, null, 2));
}

console.log(JSON.stringify({ ...report, artifact: jsonPath }));
process.exit(report.passed ? 0 : 1);
