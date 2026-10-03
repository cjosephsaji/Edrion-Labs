import { z } from 'zod';

export const PETROS_KNOWLEDGE_POLICY_VERSION = 'petros.knowledge-policy.v1' as const;
export const petrosKnowledgeModeSchema = z.enum([
  'source_bound',
  'source_primary',
  'general_learning',
]);
export type PetrosKnowledgeMode = z.infer<typeof petrosKnowledgeModeSchema>;
export const petrosAdmissionCategorySchema = z.enum([
  'safety_resource_limit',
  'product_plan_allowance',
  'abuse_control',
  'pedagogical_attempt_policy',
]);
export const petrosAdmissionDenialSchema = z
  .object({
    category: petrosAdmissionCategorySchema,
    code: z.string().min(1).max(80),
    correlationId: z.string().uuid(),
    retry: z.enum(['refresh', 'later', 'new_question', 'contact_institution', 'none']),
    message: z.string().min(1).max(500),
  })
  .strict();
export type PetrosAdmissionDenial = z.infer<typeof petrosAdmissionDenialSchema>;

export const petrosKnowledgePolicySchema = z
  .object({
    schemaVersion: z.literal(PETROS_KNOWLEDGE_POLICY_VERSION),
    mode: petrosKnowledgeModeSchema,
    requestedMode: petrosKnowledgeModeSchema.nullable(),
    policyVersionIds: z.array(z.string().uuid()).max(100),
    authorityHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceId: z.string().uuid(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    pages: z.array(z.number().int().positive().max(500)).min(1).max(500),
    subjectId: z.string().uuid().nullable(),
    maximumDepth: z.number().int().min(0).max(10),
    assignmentRestrictions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            version: z.number().int().nonnegative(),
            aiPolicy: z.enum(['off', 'hints_only', 'full']),
          })
          .strict(),
      )
      .max(100),
    retrieval: z.object({ designatedSource: z.literal(true), external: z.literal(false) }).strict(),
    authority: z.literal('designated_material_with_institution_restrictions'),
    explanation: z.string().min(1).max(500),
  })
  .strict();
export type PetrosKnowledgePolicy = z.infer<typeof petrosKnowledgePolicySchema>;

// Retrieved supplemental material is deliberately unsupported until an authorised retriever exists.
export const petrosKnowledgeAnswerSchema = z
  .object({
    units: z
      .array(
        z.discriminatedUnion('basis', [
          z
            .object({
              basis: z.literal('material_supported'),
              spanId: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .strict(),
          z
            .object({
              basis: z.enum(['general_knowledge', 'analogy', 'inference', 'uncertain']),
              text: z.string().trim().min(3).max(1200),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type PetrosKnowledgeAnswer = z.infer<typeof petrosKnowledgeAnswerSchema>;
