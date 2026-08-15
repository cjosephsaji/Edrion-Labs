import { describe, expect, it } from 'vitest';
import {
  PETROS_FUNCTION_CATALOG,
} from './petros-ai-routing';
import {
  PETROS_MOVE_RENDER_FUNCTION_KEYS,
  PETROS_MOVE_TYPES,
  PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
  petrosTopicProfileSchema,
} from './petros-topic-profiles';

function validProfile() {
  return {
    schemaVersion: PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
    identity: {
      topicKey: 'integration-by-parts',
      canonicalTitle: 'Integration by parts',
      subjectKey: 'mathematics',
      subjectLabel: 'Mathematics',
      gradeBand: '11-12',
      curriculumKey: 'stage-4-test',
      curriculumLabel: 'Stage 4 test curriculum',
      syllabusReferences: [],
    },
    dimensions: {
      knowledgeTypes: [{ type: 'procedural', weightBasisPoints: 10_000 }],
      abstractionLevel: 4,
      representations: [
        { type: 'symbolic', weightBasisPoints: 7_000 },
        { type: 'sequential', weightBasisPoints: 3_000 },
      ],
      prerequisiteDensity: 4,
      prerequisites: [
        {
          conceptKey: 'product-rule',
          label: 'Product rule',
          requiredness: 'mandatory',
          sourceReferences: [],
        },
      ],
      misconceptionRichness: 1,
      misconceptions: [],
      mathematicalLoad: 4,
      memorisationLoad: 1,
      realWorldAnchors: { availability: 2, quality: 2, examples: [] },
      moves: {
        required: ['prerequisite_check'],
        recommended: ['worked_example', 'contrast_case'],
        disallowed: ['story'],
        weights: Object.fromEntries(
          PETROS_MOVE_TYPES.map((move) => [move, move === 'story' ? 0 : 3_000]),
        ),
        openingPattern: ['prerequisite_check', 'goal_frame'],
        practicePattern: ['worked_example', 'contrast_case'],
        closingPattern: ['artifact_commit', 'forward_link'],
      },
    },
    provenance: {
      source: 'deterministic_seed',
      confidenceBasisPoints: 7_500,
      generatorVersion: 'stage4-test',
      promptVersion: 'stage4-test',
      sourceReferences: [],
      reviewer: null,
      reviewedAt: null,
    },
    cache: {
      key: 'integration-by-parts-stage4-test',
      version: 1,
      invalidationInputs: {
        curriculumVersion: '1',
        syllabusVersion: '1',
        schemaVersion: PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
        promptVersion: 'stage4-test',
        groundingHash: 'a'.repeat(64),
      },
    },
  };
}

describe('Petros topic profile contract', () => {
  it('accepts a complete bounded profile', () => {
    expect(petrosTopicProfileSchema.safeParse(validProfile()).success).toBe(true);
  });

  it('rejects scale, weight-total, and move-list contradictions', () => {
    const outOfBounds = structuredClone(validProfile());
    outOfBounds.dimensions.abstractionLevel = 5;
    expect(petrosTopicProfileSchema.safeParse(outOfBounds).success).toBe(false);

    const badRepresentationTotal = structuredClone(validProfile());
    badRepresentationTotal.dimensions.representations[0]!.weightBasisPoints = 6_999;
    expect(petrosTopicProfileSchema.safeParse(badRepresentationTotal).success).toBe(false);

    const contradicted = structuredClone(validProfile());
    contradicted.dimensions.moves.disallowed.push('prerequisite_check');
    expect(petrosTopicProfileSchema.safeParse(contradicted).success).toBe(false);
  });

  it('rejects high-density profiles without explicit evidence-bearing metadata', () => {
    const noPrerequisites = structuredClone(validProfile());
    noPrerequisites.dimensions.prerequisites = [];
    expect(petrosTopicProfileSchema.safeParse(noPrerequisites).success).toBe(false);

    const noMisconceptions = structuredClone(validProfile());
    noMisconceptions.dimensions.misconceptionRichness = 4;
    expect(petrosTopicProfileSchema.safeParse(noMisconceptions).success).toBe(false);
  });

  it('registers profile generation and one independently meterable renderer per move', () => {
    const keys = new Set(PETROS_FUNCTION_CATALOG.map((definition) => definition.key));
    expect(keys).toContain('topic.profile.generate');
    for (const move of PETROS_MOVE_TYPES) {
      expect(keys).toContain(PETROS_MOVE_RENDER_FUNCTION_KEYS[move]);
    }
  });
});
