import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startM5Fixture, submitM5 } from '../src/modules/student/petros-v2/petros-m5.fixture';
import { m4Hash } from '../src/modules/student/petros-v2/petros-v2-contracts.server';
import { evaluateAdaptationRun } from '../../../packages/learn-evals/src/petros-v2/runner';
import type {
  AdaptationPair,
  AdaptationObservation,
} from '../../../packages/learn-evals/src/petros-v2/adaptation';
import type { M4Response } from '@edrion/schemas';
async function main() {
  if (
    !process.env.PETROS_M5_EVIDENCE_DIR ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_MIGRATION_URL
  )
    throw new Error('M5_ISOLATED_EVIDENCE_REQUIRED');
  const out = resolve(process.env.PETROS_M5_EVIDENCE_DIR);
  mkdirSync(out, { recursive: true });
  const f = await startM5Fixture(),
    pairs: AdaptationPair[] = [];
  try {
    for (const subject of ['cloud', 'argument'] as const) {
      const lesson = await f.m5Lesson(subject);
      for (let i = 0; i < 20; i++) {
        const observations: AdaptationObservation[] = [];
        for (const index of [0, 1]) {
          const conceptual = index === i % 2,
            p = index === 0 ? f.student : f.other;
          const response: M4Response =
            subject === 'cloud'
              ? {
                  kind: 'structured',
                  values: {
                    responsibility: conceptual ? 'provider' : 'consumer',
                    available: 48,
                    capacity: conceptual ? 6 : 7 + i,
                  },
                }
              : {
                  kind: 'structured',
                  values: {
                    survey: conceptual ? 'all_residents' : 'preference',
                    reason:
                      i % 2
                        ? 'The survey establishes a preference; the warrant for policy still needs review.'
                        : 'An alternative sample or interpretation could change the conclusion.',
                  },
                };
          let s = await f.command(await f.start(lesson.publication.id, p), 'next', {}, p);
          s = await submitM5(f, s, response, p);
          const submission = s.submission!,
            evaluation = s.evaluation!;
          s = await f.command(s, 'teach', {}, p);
          if (!s.teaching) throw new Error('M5_EXPECTED_TEACHING_ACTION_MISSING');
          observations.push({
            studentResponse: response,
            responseId: submission.id,
            responseHash: m4Hash(response),
            evaluation,
            actualDecision: s.teaching.decision,
            expectedStrategy:
              subject === 'cloud'
                ? conceptual
                  ? 'conceptual_contrast'
                  : 'method_repair'
                : conceptual
                  ? 'warrant_inspection'
                  : 'clarifying_question',
            scopeHash: m4Hash(lesson.publication.content),
            sourceHash: lesson.file.revision.source.originalHash,
            sourceRevisionId: lesson.file.revision.id,
            availableCapabilities: [
              'source',
              'diagram',
              'equation',
              'process',
              'simulation',
              'code_trace',
            ],
            expectedEducationalOutcome: s.teaching.decision.expectedObservation,
            expertJudgment: null,
          });
          await f.command(s, 'close', {}, p);
        }
        pairs.push({
          id: `${subject}-pair-${i + 1}`,
          subject,
          perturbation:
            i % 2
              ? 'Swap student responses; change numeric error or alternative interpretation.'
              : 'Change criterion outcome while preserving the source and objective.',
          observations: observations as [AdaptationObservation, AdaptationObservation],
        });
        writeFileSync(resolve(out, 'paired-cases-progress.json'), JSON.stringify(pairs, null, 2));
      }
    }
    const result = evaluateAdaptationRun(pairs);
    writeFileSync(resolve(out, 'paired-cases.json'), JSON.stringify({ result, pairs }, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.failures.length) process.exitCode = 1;
  } finally {
    await f.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
