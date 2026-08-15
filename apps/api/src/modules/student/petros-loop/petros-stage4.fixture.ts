import {
  PETROS_MOVE_TYPES,
  PETROS_TOPIC_PROFILE_GENERATOR_VERSION,
  PETROS_TOPIC_PROFILE_PROMPT_VERSION,
  PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
  petrosResolvedTopicProfileSchema,
  type PetrosMoveType,
} from '@edrion/schemas';

const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export function stage4ProfileFixture(topic: string, institutionId: string) {
  const key = topic.toLowerCase();
  const integration = key.includes('integration');
  const photosynthesis = key.includes('photosynthesis');
  const history = key.includes('history') || key.includes('revolution');
  const programming = key.includes('programming') || key.includes('loops');
  const weights = Object.fromEntries(PETROS_MOVE_TYPES.map((move) => [move, 2_000])) as Record<
    PetrosMoveType,
    number
  >;
  let opening: PetrosMoveType[] = ['goal_frame', 'predict_then_reveal'];
  let practice: PetrosMoveType[] = ['layered_explanation', 'recall_check'];
  let closing: PetrosMoveType[] = ['synthesis', 'forward_link'];
  let prerequisites: Array<{
    conceptKey: string;
    label: string;
    requiredness: 'helpful' | 'strong' | 'mandatory';
    sourceReferences: Array<{ label: string; reference: string | null; licence: string | null }>;
  }> = [];
  let misconceptions: Array<{
    key: string;
    summary: string;
    correctionAnchor: string;
    sourceReferences: Array<{ label: string; reference: string | null; licence: string | null }>;
  }> = [];
  const source = { label: 'Stage 4 fixture', reference: null, licence: 'internal' };
  if (integration) {
    Object.assign(weights, { prerequisite_check: 10_000, worked_example: 9_000, contrast_case: 8_000, derivation: 6_000, story: 0, diagram: 500 });
    opening = ['prerequisite_check', 'goal_frame'];
    practice = ['worked_example', 'predict_then_reveal', 'contrast_case'];
    closing = ['artifact_commit', 'forward_link'];
    prerequisites = [{ conceptKey: 'product-rule', label: 'Product rule', requiredness: 'mandatory', sourceReferences: [source] }];
  } else if (photosynthesis) {
    Object.assign(weights, { misconception_demolition: 10_000, diagram: 9_500, layered_explanation: 8_000, recall_check: 7_000, derivation: 0 });
    opening = ['misconception_demolition', 'goal_frame'];
    practice = ['diagram', 'layered_explanation', 'recall_check'];
    misconceptions = [{ key: 'soil-food', summary: 'Plants take food directly from soil.', correctionAnchor: 'Plants assemble glucose from carbon dioxide and water using light energy.', sourceReferences: [source] }];
  } else if (history) {
    Object.assign(weights, { story: 10_000, contrast_case: 7_000, diagram: 6_000, derivation: 0, worked_example: 0 });
    opening = ['goal_frame', 'story'];
    practice = ['story', 'contrast_case', 'recall_check'];
  } else if (programming) {
    Object.assign(weights, { prerequisite_check: 8_000, predict_then_reveal: 10_000, worked_example: 8_000, apply_to_your_world: 8_500, story: 0, derivation: 0 });
    opening = ['prerequisite_check', 'predict_then_reveal'];
    practice = ['worked_example', 'contrast_case', 'apply_to_your_world'];
    prerequisites = [{ conceptKey: 'conditions', label: 'Boolean conditions', requiredness: 'strong', sourceReferences: [source] }];
  }
  const disallowed = PETROS_MOVE_TYPES.filter((move) => weights[move] === 0);
  return petrosResolvedTopicProfileSchema.parse({
    profileId: PROFILE_ID,
    canonicalVersionId: VERSION_ID,
    canonicalVersion: 1,
    overrideId: null,
    overrideVersion: null,
    resolvedForInstitutionId: institutionId,
    resolution: 'canonical',
    resolvedAt: '2026-08-08T08:00:00.000Z',
    profile: {
      schemaVersion: PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
      identity: {
        topicKey: key.replace(/[^a-z0-9]+/g, '-'),
        canonicalTitle: topic,
        subjectKey: integration ? 'mathematics' : photosynthesis ? 'biology' : history ? 'history' : programming ? 'computer-science' : 'general',
        subjectLabel: integration ? 'Mathematics' : photosynthesis ? 'Biology' : history ? 'History' : programming ? 'Computer Science' : 'General',
        gradeBand: 'secondary',
        curriculumKey: 'fixture',
        curriculumLabel: 'Stage 4 fixture curriculum',
        syllabusReferences: [source],
      },
      dimensions: {
        knowledgeTypes: integration
          ? [{ type: 'procedural', weightBasisPoints: 10_000 }]
          : programming
            ? [{ type: 'skill_performance', weightBasisPoints: 10_000 }]
            : history
              ? [{ type: 'factual_memorisation', weightBasisPoints: 10_000 }]
              : [{ type: 'conceptual', weightBasisPoints: 10_000 }],
        abstractionLevel: integration ? 4 : 2,
        representations: integration
          ? [{ type: 'symbolic', weightBasisPoints: 10_000 }]
          : photosynthesis
            ? [{ type: 'visual', weightBasisPoints: 10_000 }]
            : history
              ? [{ type: 'verbal', weightBasisPoints: 10_000 }]
              : [{ type: 'sequential', weightBasisPoints: 10_000 }],
        prerequisiteDensity: integration ? 4 : programming ? 3 : 1,
        prerequisites,
        misconceptionRichness: photosynthesis ? 4 : 1,
        misconceptions,
        mathematicalLoad: integration ? 4 : 0,
        memorisationLoad: history ? 4 : photosynthesis ? 3 : 1,
        realWorldAnchors: { availability: 3, quality: 3, examples: [`A fixture use of ${topic}`] },
        moves: {
          required: integration || programming ? ['prerequisite_check'] : [],
          recommended: [...new Set([...opening, ...practice, ...closing])],
          disallowed,
          weights,
          openingPattern: opening,
          practicePattern: practice,
          closingPattern: closing,
        },
      },
      provenance: {
        source: 'deterministic_seed',
        confidenceBasisPoints: 8_000,
        generatorVersion: PETROS_TOPIC_PROFILE_GENERATOR_VERSION,
        promptVersion: PETROS_TOPIC_PROFILE_PROMPT_VERSION,
        sourceReferences: [source],
        reviewer: 'fixture',
        reviewedAt: '2026-08-08T08:00:00.000Z',
      },
      cache: {
        key: `fixture:${key}`,
        version: 1,
        invalidationInputs: {
          curriculumVersion: '1',
          syllabusVersion: '1',
          schemaVersion: PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
          promptVersion: PETROS_TOPIC_PROFILE_PROMPT_VERSION,
          groundingHash: 'fixture',
        },
      },
    },
  });
}
