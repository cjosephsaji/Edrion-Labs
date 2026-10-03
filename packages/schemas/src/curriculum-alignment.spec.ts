import { describe, expect, it } from 'vitest';
import {
  curriculumAlignmentSchema,
  curriculumAlignmentView,
  curriculumReadSchema,
  readCurriculumCompatibility,
  studentCurriculumReadView,
} from './curriculum-alignment';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
const provenance = { method: 'manual' as const, sourceRef: 'synthetic', sourceHash: hash,
  observedAt: '2026-09-20T00:00:00.000Z', licence: 'synthetic-only' };
const effective = { from: '2026-01-01T00:00:00.000Z', until: null };

function payload(): any {
  return {
    schemaVersion: 'petros.curriculum-alignment.v1' as const,
    objectives: [
      { id: uuid(1), version: 1, provenance, descriptor: 'Explain elasticity.', effective },
      { id: uuid(2), version: 1, provenance, descriptor: 'Explain scalability.', effective },
    ],
    frameworks: [{ id: uuid(3), version: 1, provenance, title: 'Synthetic framework', jurisdiction: 'Test',
      subject: 'Computing', level: 'Intro', issuingBody: 'Test publisher', externalId: 'FW-1', uri: null }],
    releases: [{ id: uuid(4), version: 1, provenance, framework: { id: uuid(3), version: 1 },
      publisherVersion: '2026', effective, supersedes: null }],
    items: [{ id: uuid(5), version: 1, provenance, release: { id: uuid(4), version: 1 },
      externalId: 'STD-1', uri: null, descriptor: 'Explain elastic resource allocation.' }],
    relationships: [],
    alignments: [{ id: uuid(6), version: 1, provenance, objective: { id: uuid(1), version: 1 },
      standard: { id: uuid(5), version: 1 }, relation: 'addresses' as const, rationale: 'Directly addresses it.',
      gaps: [], confidence: 1, status: 'approved' as const, effective, overrideReason: null }],
    moduleObjectives: [{ weekNo: 1, objectives: [{ id: uuid(1), version: 1 }, { id: uuid(2), version: 1 }] }],
  };
}

describe('curriculum alignment compatibility contract', () => {
  it('validates exact version references and rejects duplicate identities', () => {
    expect(curriculumAlignmentSchema.parse(payload()).objectives).toHaveLength(2);
    const missing = payload();
    missing.alignments[0]!.standard.id = uuid(99);
    expect(curriculumAlignmentSchema.safeParse(missing).success).toBe(false);
    const duplicate = payload();
    duplicate.objectives.push({ ...duplicate.objectives[0]! });
    expect(curriculumAlignmentSchema.safeParse(duplicate).success).toBe(false);
  });

  it('rejects parent hierarchy and release supersession cycles', () => {
    const hierarchy = payload();
    hierarchy.items.push({ ...hierarchy.items[0]!, id: uuid(7), externalId: 'STD-2' });
    hierarchy.relationships.push(
      { id: uuid(8), version: 1, provenance, from: { id: uuid(5), version: 1 }, to: { id: uuid(7), version: 1 }, relation: 'parent_of', declaredRelation: null },
      { id: uuid(9), version: 1, provenance, from: { id: uuid(7), version: 1 }, to: { id: uuid(5), version: 1 }, relation: 'parent_of', declaredRelation: null },
    );
    expect(curriculumAlignmentSchema.safeParse(hierarchy).success).toBe(false);
    const releases = payload();
    releases.releases[0]!.supersedes = { id: uuid(10), version: 1 };
    releases.releases.push({ ...releases.releases[0]!, id: uuid(10), publisherVersion: '2025', supersedes: { id: uuid(4), version: 1 } });
    expect(curriculumAlignmentSchema.safeParse(releases).success).toBe(false);
  });

  it('does not infer learner evidence from an approved alignment', () => {
    const view = curriculumAlignmentView(curriculumAlignmentSchema.parse(payload()), Date.parse('2026-09-20T00:00:00Z'));
    expect(view.evidence).toBe('not_assessed');
    expect(view.alignments[0]!.state).toBe('approved');
    expect(view.unmappedObjectives).toEqual([uuid(2)]);
  });

  it('projects only approved current student-plan records and explicit unmapped objectives', () => {
    const data = curriculumAlignmentView(curriculumAlignmentSchema.parse(payload()), Date.parse('2026-09-20T00:00:00Z'));
    data.alignments.push({ ...data.alignments[0]!, id: uuid(11), objective: { id: uuid(2), version: 1 }, state: 'proposed' });
    const read = curriculumReadSchema.parse({ schemaVersion: 'petros.curriculum-alignment.v1', status: 'ready',
      revision: 1, revisionId: uuid(12), evidence: 'not_assessed', data });
    const student = studentCurriculumReadView(read, Date.parse('2026-09-20T00:00:00Z'));
    expect(student.status).toBe('ready');
    if (student.status !== 'ready') throw new Error('expected ready');
    expect(student.data.alignments).toHaveLength(1);
    expect(student.data.alignments[0]!.state).toBe('approved');
    expect(student.data.items.map((item) => item.id)).toEqual([uuid(5)]);
    expect(student.data.unmappedObjectives).toEqual([uuid(2)]);
    expect(student.data.evidence).toBe('not_assessed');
  });

  it('keeps legacy absence empty and unsupported states content-free', () => {
    expect(readCurriculumCompatibility(undefined)).toBeNull();
    expect(readCurriculumCompatibility({ schemaVersion: 'future', status: 'ready', data: {} })).toMatchObject({
      schemaVersion: 'petros.curriculum-alignment.v1', status: 'unsupported_version', revision: 0,
    });
    expect(studentCurriculumReadView(curriculumReadSchema.parse({ schemaVersion: 'petros.curriculum-alignment.v1',
      status: 'unmapped', revision: 0, evidence: 'not_assessed' }), Date.now())).not.toHaveProperty('data');
  });
});
