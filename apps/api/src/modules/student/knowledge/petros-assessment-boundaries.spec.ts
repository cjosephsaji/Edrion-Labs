import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as publicSchemas from '@edrion/schemas';
import { privateAssessmentContractSchema, publicTaskFromPrivate } from './petros-assessment-contract.server';
const id = '30000000-0000-4000-8000-000000000001', hash = 'a'.repeat(64);
const task = { schemaVersion: 'petros.v2.public-task.v1', taskId: id, familyId: 'argument.v1', familyVersion: 1,
  scope: { id, version: 1, hash, curriculumRevision: 1, review: { reviewId: id, payloadHash: hash } },
  prompt: 'Identify the public claim.', sources: [], responseKind: 'text', choices: [], assessmentRef: id };
describe('M1 assessment package and serialization boundary', () => {
  it('validates the private server schema and projects only the public issued task', () => {
    const input = { schemaVersion: 'petros.v2.private-assessment.v1', id, task, reviewId: id, answer: 'PRIVATE_SENTINEL',
      referenceAnswers: ['PRIVATE_REFERENCE'], rubric: [{ criterionId: 'claim', privateRule: 'PRIVATE_RUBRIC' }],
      discriminators: ['PRIVATE_DISCRIMINATOR'], privateEvaluationPrompt: 'PRIVATE_PROMPT' };
    expect(privateAssessmentContractSchema.parse(input).answer).toBe('PRIVATE_SENTINEL');
    const projected = publicTaskFromPrivate(input);
    expect(projected).toEqual(task); expect(JSON.stringify(projected)).not.toContain('PRIVATE_');
    expect(publicSchemas.publicStudentTaskSchema.safeParse({ ...task, answer: input.answer }).success).toBe(false);
    expect(() => publicSchemas.projectPublicTask({ ...task, rubric: input.rubric } as never)).toThrow();
  });
  it('excludes every private assessment export from the browser-facing package', () => {
    expect(Object.keys(publicSchemas).filter(k => /privateAssessment|privateAnswer|privateRubric|publicTaskFromPrivate/i.test(k))).toEqual([]);
  });
  it('forbids private server imports in public schemas, frontend, companion and normal AI context', () => {
    const root = resolve(__dirname, '../../../../../..');
    const directories = ['packages/schemas/src', 'apps/student-web/src', 'apps/institution-web/src',
      'apps/api/src/modules/student/petros-companion', 'apps/api/src/modules/petros-ai-routing'];
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const p = resolve(dir, e.name);
      return e.isDirectory() ? files(p) : /\.[cm]?[jt]sx?$/.test(e.name) && !e.name.startsWith('._') ? [p] : [];
    });
    const offenders = directories.flatMap(d => files(resolve(root, d))).filter(p => /(?:from\s*|import\s*\()['"]([^'"]*assessment-contract\.server|[^'"]*private-assessment)/.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
