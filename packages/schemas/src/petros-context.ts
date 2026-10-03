import { z } from 'zod';

/** Cache identity for data assembled under the learner's current authority. */
export const petrosContextCacheDimensionsSchema = z.object({
  institutionId: z.string().uuid(),
  studentId: z.string().uuid(),
  entitlementVersion: z.string().min(1).max(160),
  sourceVersion: z.string().max(240).optional(),
  learnerWatermark: z.string().max(240).optional(),
  memoryRevision: z.number().int().nonnegative(),
  policyVersion: z.string().max(240).optional(),
  promptVersion: z.string().min(1).max(160),
  schemaVersion: z.string().min(1).max(160),
  language: z.string().min(1).max(40),
  configVersion: z.string().min(1).max(160),
}).strict();

export type PetrosContextCacheDimensions = z.infer<typeof petrosContextCacheDimensionsSchema>;

export const PETROS_CONTEXT_CATEGORIES = [
  'request',
  'objective',
  'unresolved',
  'sources',
  'policy',
  'evidence',
  'workspace',
  'memories',
  'preferences',
] as const;

export const petrosContextCategorySchema = z.enum(PETROS_CONTEXT_CATEGORIES);
export type PetrosContextCategory = z.infer<typeof petrosContextCategorySchema>;

/** Per-category token accounting is retained with the assembled data envelope. */
export const petrosContextBudgetSchema = z.object({
  budgetTokens: z.number().int().nonnegative(),
  includedTokens: z.number().int().nonnegative(),
  omittedCount: z.number().int().nonnegative(),
  omissionReason: z.enum(['none', 'budget', 'unauthorized', 'unavailable', 'disabled']).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.includedTokens > value.budgetTokens) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Included context exceeds its category budget.' });
  }
  if (value.omittedCount > 0 && (!value.omissionReason || value.omissionReason === 'none')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Omitted context must record its reason.' });
  }
});

export const petrosContextOmissionSchema = z.object({
  category: petrosContextCategorySchema,
  count: z.number().int().positive(),
  reason: z.enum(['budget', 'unauthorized', 'unavailable', 'disabled']),
}).strict();

const dataSection = z.object({
  /** All values in this envelope are data, even when their text resembles instructions. */
  trust: z.literal('untrusted_data'),
  value: z.unknown(),
}).strict();

/**
 * Typed provider-input envelope. It deliberately contains no instruction field: system
 * guidance remains separate and the gateway marks this complete envelope as untrusted data.
 */
export const petrosDynamicContextSchema = z.object({
  schemaVersion: z.literal('petros.dynamic-context.v1'),
  cacheDimensions: petrosContextCacheDimensionsSchema,
  categories: z.object({
    request: dataSection,
    objective: dataSection,
    unresolved: dataSection,
    sources: dataSection,
    policy: dataSection,
    evidence: dataSection,
    workspace: dataSection,
    memories: dataSection,
    preferences: dataSection,
  }).strict(),
  budgets: z.object(Object.fromEntries(PETROS_CONTEXT_CATEGORIES.map(category => [category, petrosContextBudgetSchema])) as Record<PetrosContextCategory, typeof petrosContextBudgetSchema>).strict(),
  omissions: z.array(petrosContextOmissionSchema).max(9),
}).strict();

export type PetrosDynamicContext = z.infer<typeof petrosDynamicContextSchema>;

export type PetrosContextValues = Record<PetrosContextCategory, unknown>;
export type PetrosContextBudgets = Record<PetrosContextCategory, number>;

function estimatedTokens(value: unknown) {
  const serialized = JSON.stringify(value);
  return Math.ceil(new TextEncoder().encode(serialized).length / 4);
}

/** Build an auditable envelope, omitting whole category values when they exceed their budget. */
export function assemblePetrosDynamicContext(input: {
  cacheDimensions: PetrosContextCacheDimensions;
  values: PetrosContextValues;
  budgets: PetrosContextBudgets;
  unavailable?: Partial<Record<PetrosContextCategory, 'unauthorized' | 'unavailable' | 'disabled'>>;
}): PetrosDynamicContext {
  const categories = {} as Record<PetrosContextCategory, { trust: 'untrusted_data'; value: unknown }>;
  const accounting = {} as Record<PetrosContextCategory, z.infer<typeof petrosContextBudgetSchema>>;
  const omissions: z.infer<typeof petrosContextOmissionSchema>[] = [];
  for (const category of PETROS_CONTEXT_CATEGORIES) {
    const value = input.values[category];
    const budgetTokens = input.budgets[category];
    const includedTokens = estimatedTokens(value);
    const unavailable = input.unavailable?.[category];
    const reason = unavailable ?? (includedTokens > budgetTokens ? 'budget' : 'none');
    const omittedCount = reason === 'none' ? 0 : Array.isArray(value) ? value.length : value == null ? 0 : 1;
    categories[category] = { trust: 'untrusted_data', value: reason === 'none' ? value : null };
    accounting[category] = {
      budgetTokens,
      includedTokens: reason === 'none' ? includedTokens : 0,
      omittedCount,
      omissionReason: reason,
    };
    if (omittedCount > 0 && reason !== 'none') omissions.push({ category, count: omittedCount, reason });
  }
  return petrosDynamicContextSchema.parse({
    schemaVersion: 'petros.dynamic-context.v1',
    cacheDimensions: input.cacheDimensions,
    categories,
    budgets: accounting,
    omissions,
  });
}
