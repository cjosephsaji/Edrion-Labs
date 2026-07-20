import { describe, expect, it } from 'vitest';
import { putStudentPortalConfigSchema, studentModuleKeys, terminologyKeys } from './portal-config';

const modules = Object.fromEntries(studentModuleKeys.map((key) => [key, true]));
const terminology = Object.fromEntries(terminologyKeys.map((key) => [key, 'Value']));

describe('student portal configuration schema', () => {
  it('accepts a complete institution configuration', () => {
    expect(putStudentPortalConfigSchema.safeParse({ revision: 0, scope: 'institution', modules, terminology }).success).toBe(true);
  });

  it('rejects empty, overlong, and unknown terminology', () => {
    expect(putStudentPortalConfigSchema.safeParse({ revision: 0, scope: 'institution', modules, terminology: { ...terminology, term_period: '' } }).success).toBe(false);
    expect(putStudentPortalConfigSchema.safeParse({ revision: 0, scope: 'institution', modules, terminology: { ...terminology, term_period: 'x'.repeat(31) } }).success).toBe(false);
    expect(putStudentPortalConfigSchema.safeParse({ revision: 0, scope: 'institution', modules, terminology: { ...terminology, unknown: 'Nope' } }).success).toBe(false);
  });
});
