import { z } from 'zod';
import { v2Key, v2Uuid, v2Version } from './content';
/** Registration and kernel permission are server-owned; this DTO is data, never executable UI. */
export const educationalExperienceSchema = z.object({ schemaVersion: z.literal('petros.v2.experience.v1'),
  familyId: v2Key, familyVersion: v2Version, renderer: v2Key, trustedKernel: v2Key.nullable(),
  parameters: z.array(z.object({ id: v2Key, value: z.number().finite(), min: z.number().finite(),
    max: z.number().finite(), unit: z.string().max(80) }).strict()
    .refine(p => p.min <= p.value && p.value <= p.max, 'Parameter outside domain')).max(16),
  publicState: z.object({ caption: z.string().max(4000), semanticElements: z.array(v2Key).max(100),
    values: z.array(z.object({ elementId: v2Key, value: z.number().finite() }).strict()).max(100) }).strict(),
  allowedOperations: z.array(z.enum(['read', 'highlight', 'set_parameter', 'step', 'reset', 'submit'])).max(6),
  accessibility: z.object({ text: z.string().min(1).max(8000), keyboard: z.boolean(), reducedMotion: z.boolean() }).strict(),
  issuedTaskRef: v2Uuid.nullable(),
}).strict();
export function validateEducationalExperience(input: unknown, registry: ReadonlyMap<string, {
  renderer: string; kernel: string | null; operations: ReadonlySet<string>;
  parameters: ReadonlyMap<string, { min: number; max: number; unit: string }> }>) {
  if (new TextEncoder().encode(JSON.stringify(input)).length > 96 * 1024) throw new Error('EXPERIENCE_BUDGET_EXCEEDED');
  const e = educationalExperienceSchema.parse(input), family = registry.get(`${e.familyId}@${e.familyVersion}`);
  if (!family || e.renderer !== family.renderer || e.trustedKernel !== family.kernel || e.allowedOperations.some(o => !family.operations.has(o)))
    throw new Error('UNREGISTERED_EXPERIENCE_CAPABILITY');
  const ids = new Set<string>();
  for (const p of e.parameters) {
    const allowed = family.parameters.get(p.id);
    if (ids.has(p.id) || !allowed || p.min !== allowed.min || p.max !== allowed.max || p.unit !== allowed.unit) throw new Error('INVALID_EXPERIENCE_PARAMETER');
    ids.add(p.id);
  }
  if (e.publicState.values.some(v => !e.publicState.semanticElements.includes(v.elementId))) throw new Error('UNKNOWN_EXPERIENCE_ELEMENT');
  return e;
}
