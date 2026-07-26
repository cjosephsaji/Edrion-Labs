import { z } from 'zod';

export const pathItemSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  topicKey: z.string(),
  title: z.string(),
  sequence: z.number().int(),
  whyHere: z.string().nullable(),
  optionalBranch: z.boolean(),
  status: z.enum(['upcoming', 'current', 'completed', 'removed']),
  freshness: z.enum(['fresh', 'fading', 'due']).optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

export const learningPathSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  subjectLabel: z.string(),
  metaLine: z.string().nullable(),
  source: z.enum(['institution', 'ai_goal']),
  pathEditable: z.boolean(),
  status: z.enum(['active', 'archived']),
  items: z.array(pathItemSchema),
});

export const createPathInputSchema = z.object({
  goalStatement: z.string().min(3).max(2000),
  constraints: z.string().optional(),
  weeklyMinutes: z.number().int().min(15).max(600).optional(),
});

export const patchPathInputSchema = z.object({
  reorder: z.array(z.string().uuid()).optional(),
  removeItemId: z.string().uuid().optional(),
  restoreItemId: z.string().uuid().optional(),
  addItem: z.object({ topicTitle: z.string().min(1) }).optional(),
});

export type LearningPathDto = z.infer<typeof learningPathSchema>;
export type PathItemDto = z.infer<typeof pathItemSchema>;
export type CreatePathInput = z.infer<typeof createPathInputSchema>;
export type PatchPathInput = z.infer<typeof patchPathInputSchema>;
