import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

export const createStreamPostSchema = z.object({
  contextType: z.enum(['class', 'course']),
  contextId: z.string().uuid(),
  kind: z.enum(['covered', 'announcement', 'pinned_next']),
  title: z.string().max(200).nullish(),
  body: z.string().max(10000).nullish(),
  topicKey: z.string().max(120).nullish(),
  requiresAck: z.boolean().default(false),
});

export const updateStreamPostSchema = createStreamPostSchema.partial().extend({ version: versionSchema });

export const createClassMaterialSchema = z.object({
  contextType: z.enum(['class', 'course']),
  contextId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  kindLabel: z.string().max(40).default('PDF'),
  objectId: z.string().uuid(),
  weekNo: z.number().int().min(1).max(52).nullish(),
});

export const streamListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  contextType: z.enum(['class', 'course']),
  contextId: z.string().uuid(),
});

export type CreateStreamPostInput = z.infer<typeof createStreamPostSchema>;
export type CreateClassMaterialInput = z.infer<typeof createClassMaterialSchema>;
