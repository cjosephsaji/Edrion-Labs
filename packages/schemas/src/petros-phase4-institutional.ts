import { z } from 'zod';

const uuid = z.string().uuid();

export const petrosMaterialCorrectionPreviewSchema = z.object({
  objectId: uuid,
  expectedMaterialVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(12).max(1000),
  meaningChanged: z.boolean(),
  commandId: uuid,
}).strict();
export type PetrosMaterialCorrectionPreviewInput = z.infer<typeof petrosMaterialCorrectionPreviewSchema>;

export const petrosMaterialCorrectionReviewSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(['approve', 'reject']),
  reviewReason: z.string().trim().min(8).max(1000),
}).strict();
export type PetrosMaterialCorrectionReviewInput = z.infer<typeof petrosMaterialCorrectionReviewSchema>;

export const petrosInterventionPreviewSchema = z.object({
  classId: uuid,
  subjectId: uuid,
  conceptKey: z.string().trim().min(1).max(160),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(8).max(1000),
  expiresAt: z.string().datetime().refine((value) => Date.parse(value) > Date.now(), 'Expiry must be in the future.'),
  commandId: uuid,
}).strict();
export type PetrosInterventionPreviewInput = z.infer<typeof petrosInterventionPreviewSchema>;

export const petrosInterventionActionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(8).max(1000),
}).strict();
export type PetrosInterventionActionInput = z.infer<typeof petrosInterventionActionSchema>;
