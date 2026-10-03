import { z } from 'zod';
import { petrosDocumentSearchSchema } from './petros-document-retrieval';

export const petrosSourceComparisonSchema = z.object({
  schemaVersion: z.literal('petros.source-comparison.v1'),
  question: z.string().trim().min(2).max(2000),
  sources: z.array(z.object({
    sourceId: z.string().uuid(),
    sourceVersion: petrosDocumentSearchSchema.shape.sourceVersion,
    pages: petrosDocumentSearchSchema.shape.pages,
  }).strict()).min(2).max(3),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sources.map(source => source.sourceId)).size !== value.sources.length)
    ctx.addIssue({code: z.ZodIssueCode.custom, message: 'Select distinct sources'});
});
export type PetrosSourceComparison = z.infer<typeof petrosSourceComparisonSchema>;
