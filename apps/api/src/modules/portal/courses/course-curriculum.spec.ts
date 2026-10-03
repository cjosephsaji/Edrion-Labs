import { describe, expect, it } from 'vitest';
import {
  requireCurriculumAlignmentTransitionReason,
  syllabusIdentityHash,
} from './course-curriculum.repository';

const alignment = (status: 'proposed' | 'approved' | 'rejected', overrideReason: string | null = null) => ({
  id: '00000000-0000-4000-8000-000000000001',
  version: 1,
  provenance: {
    method: 'manual' as const,
    sourceRef: 'synthetic',
    sourceHash: 'a'.repeat(64),
    observedAt: '2026-09-22T00:00:00.000Z',
    licence: 'synthetic-only',
  },
  objective: { id: '00000000-0000-4000-8000-000000000002', version: 1 },
  standard: { id: '00000000-0000-4000-8000-000000000003', version: 1 },
  relation: 'addresses' as const,
  rationale: 'Synthetic transition.',
  gaps: [],
  confidence: 1,
  status,
  effective: { from: '2026-09-22T00:00:00.000Z', until: null },
  overrideReason,
});

describe('course curriculum compatibility identity', () => {
  it('is stable across module order and coverage-only changes', () => {
    const modules = [
      { weekNo: 2, title: 'Elasticity', topics: ['scale down', 'scale up'], covered: false },
      { weekNo: 1, title: 'Scalability', topics: ['horizontal'], covered: true },
    ];
    const reordered = [
      { ...modules[1]!, covered: false },
      { ...modules[0]!, covered: true },
    ];
    expect(syllabusIdentityHash(modules)).toBe(syllabusIdentityHash(reordered));
  });

  it('becomes stale when curriculum-bearing syllabus identity changes', () => {
    const base = [{ weekNo: 1, title: 'Scalability', topics: ['horizontal'] }];
    expect(syllabusIdentityHash(base)).not.toBe(syllabusIdentityHash([{ ...base[0]!, title: 'Elasticity' }]));
    expect(syllabusIdentityHash(base)).not.toBe(syllabusIdentityHash([{ ...base[0]!, topics: ['vertical'] }]));
    expect(syllabusIdentityHash(base)).not.toBe(syllabusIdentityHash([{ ...base[0]!, weekNo: 2 }]));
  });

  it('requires an explicit reason when rejecting a proposal', () => {
    expect(() => requireCurriculumAlignmentTransitionReason(alignment('proposed'), alignment('rejected')))
      .toThrowError(expect.objectContaining({ response: { code: 'CURRICULUM_OVERRIDE_REASON_REQUIRED' } }));
    expect(() => requireCurriculumAlignmentTransitionReason(
      alignment('proposed'),
      alignment('rejected', 'Publisher reference was withdrawn.'),
    )).not.toThrow();
  });

  it('retains the reason requirement when replacing an approved decision', () => {
    expect(() => requireCurriculumAlignmentTransitionReason(alignment('approved'), alignment('proposed')))
      .toThrowError(expect.objectContaining({ response: { code: 'CURRICULUM_OVERRIDE_REASON_REQUIRED' } }));
  });
});
