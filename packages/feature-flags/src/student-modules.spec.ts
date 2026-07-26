import { describe, expect, it } from 'vitest';
import {
  INDIVIDUAL_MODULES,
  STUDENT_MODULE_CATALOG,
  STUDENT_PORTAL_PRESETS,
  TERMINOLOGY_KEYS,
} from './student-modules';

describe('student module catalogue', () => {
  it('contains 23 stable unique modules', () => {
    expect(STUDENT_MODULE_CATALOG).toHaveLength(23);
    expect(new Set(STUDENT_MODULE_CATALOG.map((module) => module.key)).size).toBe(23);
  });

  it('keeps every preset total over modules and terminology', () => {
    for (const preset of Object.values(STUDENT_PORTAL_PRESETS)) {
      expect(Object.keys(preset.modules)).toHaveLength(23);
      expect(Object.keys(preset.terminology)).toHaveLength(14);
      expect(TERMINOLOGY_KEYS.every((key) => Boolean(preset.terminology[key]))).toBe(true);
    }
  });

  it('limits the individual preset to six individual-capable modules', () => {
    expect(INDIVIDUAL_MODULES).toEqual(['learn','library','lab','planner','progress','exam_prep']);
    expect(INDIVIDUAL_MODULES.every((key) => STUDENT_MODULE_CATALOG.find((m) => m.key === key)?.individualCapable)).toBe(true);
  });
});
