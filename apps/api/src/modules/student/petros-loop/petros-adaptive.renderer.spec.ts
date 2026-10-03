import { describe, expect, it } from 'vitest';
import {
  petrosAdaptiveSnapshotSchema,
  petrosConceptPackCandidateSchema,
  type PetrosAdaptiveSnapshot,
  type PetrosConceptPackCandidate,
} from '@edrion/schemas';
import { phase2PackCandidate, phase2PackIds } from '../../../../../../packages/schemas/src/__fixtures__/petros-phase2-pack';
import {
  assertPetrosAdaptivePackRenderable,
  renderAdaptiveContent,
} from './petros-adaptive.renderer';

const candidate = (change?: (value: PetrosConceptPackCandidate) => void) => {
  const value = structuredClone(phase2PackCandidate) as unknown as PetrosConceptPackCandidate;
  change?.(value);
  return petrosConceptPackCandidateSchema.parse(value);
};

function snapshot(
  pack: PetrosConceptPackCandidate,
  selectedMove: Extract<PetrosAdaptiveSnapshot['output']['decision'], { status: 'proposed' }>['selectedMove'],
): PetrosAdaptiveSnapshot {
  const signal = selectedMove === 'socratic_probe'
    ? { kind: 'misconception' as const, misconceptionId: pack.misconceptions[0]!.id,
      diagnosis: 'uncertain' as const, evidenceEventIds: ['evidence-1'] }
    : { kind: 'new_topic' as const };
  const input = {
    schemaVersion: 'petros.adaptive-policy.v1' as const,
    objective: pack.objective,
    pack: pack.pack,
    policyVersion: 'reviewed-policy',
    sourceVersion: pack.sourceVersion,
    curriculumRevision: pack.curriculumRevision,
    assignmentVersions: [],
    signal,
    availableTasks: pack.assessments.map(({ id, variant, unseenContext }) => ({ id, variant, unseenContext })),
    constraints: { sourceReady: true as const, sourceGrounding: 'supported' as const,
      explanationPresented: true, remainingSeconds: 600, diagramAvailable: true, assistance: 'ordinary_study' as const },
  };
  return petrosAdaptiveSnapshotSchema.parse({
    schemaVersion: 'petros.adaptive-snapshot.v1', candidateHash: 'd'.repeat(64), reviewId: phase2PackIds.receipt,
    policy: { schemaVersion: 'petros.knowledge-policy.v1', mode: 'source_bound', requestedMode: null,
      policyVersionIds: [], authorityHash: 'e'.repeat(64), sourceId: phase2PackIds.object,
      sourceFingerprint: pack.sourceVersion, pages: [1], subjectId: pack.subject, maximumDepth: 1,
      assignmentRestrictions: [], retrieval: { designatedSource: true, external: false },
      authority: 'designated_material_with_institution_restrictions', explanation: 'Reviewed source policy.' },
    input,
    output: { schemaVersion: 'petros.adaptive-policy.v1', objective: pack.objective, pack: pack.pack,
      policyVersion: input.policyVersion, sourceVersion: pack.sourceVersion,
      curriculumRevision: pack.curriculumRevision, assignmentVersions: [], signal,
      selectedTask: selectedMove === 'recall_check'
        ? { id: pack.assessments[0]!.id, variant: pack.assessments[0]!.variant }
        : null,
      decision: { status: 'proposed', selectedMove, reason: 'new_topic', expectedEvidence: 'none',
        diagnosis: 'none', progress: 'coverage_only', studentSafeReason: 'Use reviewed content.' } },
  });
}

describe('Petros adaptive pack renderer', () => {
  it('preflights and renders every supported adaptive move', () => {
    const pack = candidate();
    assertPetrosAdaptivePackRenderable(pack);
    const moves = [
      'layered_explanation', 'contrast_case', 'socratic_probe', 'diagram',
      'worked_example', 'recall_check', 'synthesis', 'artifact_commit',
    ] as const;
    for (const move of moves)
      expect(renderAdaptiveContent(pack, snapshot(pack, move)).type).toBe(move);
  });

  it('preserves a 2,001-character explanation without a short deeper layer', () => {
    const pack = candidate(value => { value.coreExplanation = 'x'.repeat(2_001); });
    const rendered = renderAdaptiveContent(pack, snapshot(pack, 'layered_explanation'));
    if (rendered.type !== 'layered_explanation') throw new Error('Expected layered explanation.');
    expect(rendered.firstLayer.length).toBe(1_981);
    expect(rendered.deeperLayers.map(layer => layer.content).join('')).toBe('x'.repeat(20));
    expect(`${rendered.firstLayer}${rendered.deeperLayers.map(layer => layer.content).join('')}`).toBe(pack.coreExplanation);
  });

  it.each([
    ['tiny layered explanation', (value: PetrosConceptPackCandidate) => { value.coreExplanation = 'x'.repeat(19); }],
    ['tiny objective statement', (value: PetrosConceptPackCandidate) => { value.objectiveStatement = 'xx'; }],
    ['layered key idea', (value: PetrosConceptPackCandidate) => { value.objectiveStatement = 'x'.repeat(501); }],
    ['Socratic fallback', (value: PetrosConceptPackCandidate) => { value.coreExplanation = 'x'.repeat(1_201); }],
    ['worked example step', (value: PetrosConceptPackCandidate) => { value.examples[0]!.explanation = 'x'.repeat(1_001); }],
    ['misconception discriminator', (value: PetrosConceptPackCandidate) => { value.misconceptions[0]!.discriminator = 'x'.repeat(701); }],
    ['recall task prompt', (value: PetrosConceptPackCandidate) => { value.assessments[0]!.prompt = 'x'.repeat(701); }],
  ])('rejects a candidate whose %s exceeds a render field bound', (_name, change) => {
    expect(() => assertPetrosAdaptivePackRenderable(candidate(change))).toThrow('PETROS_PACK_NOT_RENDERABLE');
  });

  it('maps an empty legacy render field to the bounded admission error', () => {
    const pack = candidate();
    pack.coreExplanation = '';
    expect(() => assertPetrosAdaptivePackRenderable(pack)).toThrow('PETROS_PACK_NOT_RENDERABLE');
  });
});
