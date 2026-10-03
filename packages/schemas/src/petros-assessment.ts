import { z } from 'zod';

export const PETROS_ASSESSMENT_VERSION = 'petros.assessment.v1';
const ref = z.string().trim().min(1).max(180);
const timestamp = z.string().datetime();
const basis = z.enum(['required', 'self_reported', 'system_observed', 'independently_verified']);
const actor = z
  .object({ kind: z.enum(['system', 'learner', 'educator', 'external']), id: ref })
  .strict();

// Empty facts mean unknown. Requirements and assertions never become observations implicitly.
function facts<T extends z.ZodTypeAny>(value: T) {
  return z
    .array(z.object({ value, basis, actor, method: ref, recordedAt: timestamp }).strict())
    .max(4)
    .superRefine((claims, ctx) => {
      if (new Set(claims.map((c) => c.basis)).size !== claims.length)
        ctx.addIssue({ code: 'custom', message: 'DUPLICATE_CONDITION_BASIS' });
      for (const claim of claims) {
        if (
          (claim.basis === 'required' && claim.actor.kind === 'learner') ||
          (claim.basis === 'system_observed' && claim.actor.kind !== 'system') ||
          (claim.basis === 'self_reported' && claim.actor.kind !== 'learner') ||
          (claim.basis === 'independently_verified' &&
            !['educator', 'external'].includes(claim.actor.kind))
        )
          ctx.addIssue({ code: 'custom', message: 'INVALID_CONDITION_AUTHORITY' });
      }
    });
}
export const petrosAssessmentConditionsSchema = z
  .object({
    schemaVersion: z.literal('petros.assessment-conditions.v1'),
    collectedAt: timestamp,
    policyVersion: ref.nullable(),
    supervision: facts(z.enum(['supervised', 'unsupervised'])),
    timing: facts(z.enum(['timed', 'untimed'])),
    resources: facts(
      z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('open') }).strict(),
        z.object({ mode: z.literal('closed') }).strict(),
        z.object({ mode: z.literal('declared'), resources: z.array(ref).min(1).max(16) }).strict(),
      ]),
    ),
    modality: facts(z.enum(['oral', 'written', 'interactive'])),
    environment: facts(z.enum(['local', 'offline', 'controlled_sandbox'])),
    petrosAssistance: facts(
      z
        .object({ hintCount: z.number().int().min(0).max(100), suppliedAnswer: z.boolean() })
        .strict(),
    ),
    answerExposure: facts(z.enum(['exposed', 'not_observed'])),
    externalAssistance: facts(z.enum(['declared', 'not_declared'])),
    attempt: facts(z.enum(['first_observed', 'repeat_equivalent'])),
    attestations: facts(z.object({ statement: z.string().min(1).max(600) }).strict()),
  })
  .strict()
  .superRefine((conditions, ctx) => {
    for (const claims of Object.values(conditions))
      if (Array.isArray(claims))
        for (const claim of claims)
          if (Date.parse(claim.recordedAt) > Date.parse(conditions.collectedAt))
            ctx.addIssue({ code: 'custom', message: 'CONDITION_AFTER_COLLECTION' });
  });
export type PetrosAssessmentConditions = z.infer<typeof petrosAssessmentConditionsSchema>;
export function unknownAssessmentConditions(collectedAt: string): PetrosAssessmentConditions {
  return petrosAssessmentConditionsSchema.parse({
    schemaVersion: 'petros.assessment-conditions.v1',
    collectedAt,
    policyVersion: null,
    supervision: [],
    timing: [],
    resources: [],
    modality: [],
    environment: [],
    petrosAssistance: [],
    answerExposure: [],
    externalAssistance: [],
    attempt: [],
    attestations: [],
  });
}

const uncertainty = z.enum(['low', 'medium', 'high', 'unknown']);
const provenance = z
  .object({
    evaluator: z.enum(['deterministic', 'model', 'educator', 'legacy', 'unavailable']),
    evaluatorVersion: ref,
    evaluatedAt: timestamp,
    uncertainty,
    review: z.enum(['not_required', 'required']),
  })
  .strict();
const objective = z
  .object({
    kind: z.literal('objective'),
    judgment: z.discriminatedUnion('status', [
      z
        .object({
          status: z.literal('evaluated'),
          outcome: z.enum(['correct', 'partial', 'wrong']),
          creditBasisPoints: z.number().int().min(0).max(10_000),
        })
        .strict(),
      z
        .object({
          status: z.literal('not_evaluated'),
          reason: z.enum(['evaluator_unavailable', 'invalid_response', 'skipped']),
        })
        .strict(),
    ]),
    feedback: z.string().min(1).max(1_000),
    evidence: z.array(z.string().min(1).max(600)).max(12),
    provenance,
  })
  .strict();
const workSpan = z
  .object({
    workId: ref,
    revisionId: ref,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    start: z.number().int().min(0).max(2_000_000),
    end: z.number().int().min(1).max(2_000_000),
  })
  .strict()
  .refine((s) => s.end > s.start, 'INVALID_WORK_SPAN');
const scale = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('narrative') }).strict(),
  z.object({ kind: z.literal('ordinal'), levels: z.array(ref).min(2).max(12) }).strict(),
  z
    .object({
      kind: z.literal('numeric'),
      min: z.number().finite().min(-1e6).max(1e6),
      max: z.number().finite().min(-1e6).max(1e6),
    })
    .strict(),
]);
const criterionProfile = z
  .object({
    kind: z.literal('criterion_profile'),
    rubric: z
      .object({
        id: ref,
        version: ref,
        aggregation: z.enum(['none', 'weighted_sum']),
        references: z.array(ref).max(16),
        criteria: z
          .array(
            z
              .object({
                id: ref,
                descriptor: z.string().min(1).max(1_000),
                scale,
                weight: z.number().finite().positive().max(1_000).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(24),
      })
      .strict(),
    criteria: z
      .array(
        z
          .object({
            criterionId: ref,
            observation: z.discriminatedUnion('status', [
              z.object({ status: z.literal('not_observed') }).strict(),
              z
                .object({
                  status: z.literal('observed'),
                  level: z.union([ref, z.number().finite().min(-1e6).max(1e6)]).nullable(),
                  workSpans: z.array(workSpan).min(1).max(8),
                })
                .strict(),
            ]),
            feedback: z.string().min(1).max(1_000),
            uncertainty,
            review: z.enum(['not_required', 'required']),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    provenance,
  })
  .strict();
const resultShape = z.discriminatedUnion('kind', [
  objective,
  criterionProfile,
  z.object({ kind: z.literal('mixed'), objective, criteria: criterionProfile }).strict(),
]);
export const petrosAssessmentResultSchema = resultShape.superRefine((result, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const checkObjective =
    result.kind === 'objective' ? result : result.kind === 'mixed' ? result.objective : null;
  if (
    checkObjective?.provenance.evaluator === 'unavailable' &&
    checkObjective.judgment.status !== 'not_evaluated'
  )
    fail('UNAVAILABLE_EVALUATOR_CANNOT_SCORE');
  const profile =
    result.kind === 'criterion_profile' ? result : result.kind === 'mixed' ? result.criteria : null;
  if (!profile) return;
  if (
    new Set(profile.rubric.criteria.map((c) => c.id)).size !== profile.rubric.criteria.length ||
    new Set(profile.criteria.map((c) => c.criterionId)).size !== profile.criteria.length ||
    profile.criteria.length !== profile.rubric.criteria.length
  )
    fail('INVALID_CRITERION_REFERENCES');
  for (const definition of profile.rubric.criteria) {
    const s = definition.scale;
    if (s.kind === 'ordinal' && new Set(s.levels).size !== s.levels.length)
      fail('DUPLICATE_ORDINAL_LEVEL');
    if (s.kind === 'numeric' && s.min >= s.max) fail('INVALID_SCALE');
    if (
      profile.rubric.aggregation === 'weighted_sum'
        ? s.kind !== 'numeric' || definition.weight == null
        : definition.weight != null
    )
      fail('UNSUPPORTED_AGGREGATION');
    const firstScale = profile.rubric.criteria[0]!.scale;
    if (
      profile.rubric.aggregation === 'weighted_sum' &&
      s.kind === 'numeric' &&
      firstScale.kind === 'numeric' &&
      (s.min !== firstScale.min || s.max !== firstScale.max)
    )
      fail('INCOMPATIBLE_AGGREGATION_SCALES');
  }
  for (const c of profile.criteria) {
    const definition = profile.rubric.criteria.find((d) => d.id === c.criterionId);
    if (!definition) {
      fail('INVALID_CRITERION_REFERENCE');
      continue;
    }
    if (c.observation.status !== 'observed') continue;
    const level = c.observation.level;
    const s = definition.scale;
    if (
      s.kind === 'narrative'
        ? level !== null
        : s.kind === 'ordinal'
          ? typeof level !== 'string' || !s.levels.includes(level)
          : typeof level !== 'number' || level < s.min || level > s.max
    )
      fail('INVALID_CRITERION_LEVEL');
  }
});
export type PetrosAssessmentResult = z.infer<typeof petrosAssessmentResultSchema>;
const assessmentShape = z
  .object({
    schemaVersion: z.literal(PETROS_ASSESSMENT_VERSION),
    origin: z.enum(['petros_objective', 'legacy_adapter', 'declared_assessment']),
    conditions: petrosAssessmentConditionsSchema,
    result: petrosAssessmentResultSchema,
  })
  .strict();
export type PetrosAssessment = z.infer<typeof assessmentShape>;
export const petrosAssessmentSchema = z.unknown().transform((input, ctx): PetrosAssessment => {
  try {
    const queue: Array<[unknown, number]> = [[input, 0]];
    const seen = new Set<object>();
    let count = 0;
    let bytes = 0;
    while (queue.length) {
      const [v, depth] = queue.pop()!;
      if (++count > 12_000 || depth > 16) throw new Error('PETROS_ASSESSMENT_RESOURCE_LIMIT');
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) throw new Error('PETROS_ASSESSMENT_INVALID_STRUCTURE');
        seen.add(v);
        const entries = Object.entries(v);
        if (entries.length > 12_000) throw new Error('PETROS_ASSESSMENT_RESOURCE_LIMIT');
        for (const [k, child] of entries) {
          bytes += k.length * 6 + 4;
          queue.push([child, depth + 1]);
        }
      } else if (typeof v === 'string') bytes += v.length * 6 + 2;
      else if (
        typeof v === 'number' ? !Number.isFinite(v) : !['boolean'].includes(typeof v) && v !== null
      )
        throw new Error('PETROS_ASSESSMENT_INVALID_VALUE');
      else bytes += 24;
      if (bytes > 96_000 || queue.length > 12_000)
        throw new Error('PETROS_ASSESSMENT_RESOURCE_LIMIT');
    }
    return assessmentShape.parse(input);
  } catch (error) {
    ctx.addIssue({
      code: 'custom',
      message: error instanceof z.ZodError ? 'PETROS_ASSESSMENT_INVALID' : String(error),
    });
    return z.NEVER;
  }
});

/** Admission is deliberately narrower than the future-compatible result vocabulary. */
export function assessmentAdmission(assessment: PetrosAssessment): string | null {
  const a = petrosAssessmentSchema.parse(assessment);
  if (a.result.kind !== 'objective') return 'qualitative_assessment_disabled';
  if (a.result.judgment.status !== 'evaluated') return 'assessment_not_evaluated';
  if (a.result.provenance.review === 'required') return 'assessment_review_required';
  const observed = <T>(claims: Array<{ basis: string; value: T }>) =>
    claims.filter((c) => c.basis !== 'required');
  if (
    observed(a.conditions.petrosAssistance).some(
      (c) => c.value.hintCount > 0 || c.value.suppliedAnswer,
    ) ||
    observed(a.conditions.answerExposure).some((c) => c.value === 'exposed') ||
    observed(a.conditions.externalAssistance).some((c) => c.value === 'declared')
  )
    return 'assisted_assessment';
  if (observed(a.conditions.attempt).some((c) => c.value === 'repeat_equivalent'))
    return 'repeated_assessment';
  // Unknown external assistance is NOT a claim of independence or misconduct.
  return null;
}
