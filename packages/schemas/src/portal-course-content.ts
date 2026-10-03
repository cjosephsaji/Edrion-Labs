import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

export const createStreamPostSchema = z.object({
  contextType: z.enum(['class', 'course']),
  contextId: z.string().uuid(),
  subjectId: z.string().uuid().nullish(),
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
  subjectId: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  kindLabel: z.string().max(40).default('PDF'),
  objectId: z.string().uuid(),
  weekNo: z.number().int().min(1).max(52).nullish(),
});

export const streamListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  contextType: z.enum(['class', 'course']),
  contextId: z.string().uuid(),
  subjectId: z.string().uuid().optional(),
  includeUnfiled: z.coerce.boolean().optional(),
  /** Comma-separated extra contexts (class + the course teaching the subject). */
  contextIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined)),
});

/**
 * Lesson notes. Unlike a material, the writing is the artifact: `body` is required
 * and attachments are optional. Notes are written as drafts and published explicitly,
 * so a half-finished note never reaches a student.
 */
export const createClassNoteSchema = z.object({
  contextType: z.enum(['class', 'course', 'subject']),
  contextId: z.string().uuid(),
  subjectId: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500).nullish(),
  body: z.string().trim().min(1).max(100000),
  topicKey: z.string().max(120).nullish(),
  weekNo: z.number().int().min(1).max(52).nullish(),
  attachmentObjectIds: z.array(z.string().uuid()).max(20).default([]),
});

export const updateClassNoteSchema = createClassNoteSchema
  .omit({ contextType: true, contextId: true })
  .partial()
  .extend({ version: versionSchema });

/** Publishing is its own action, not a status field a client can set directly. */
export const publishClassNoteSchema = z.object({
  version: versionSchema,
  status: z.enum(['published', 'draft', 'archived']),
});

export const noteListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  contextType: z.enum(['class', 'course', 'subject']),
  contextId: z.string().uuid(),
  subjectId: z.string().uuid().optional(),
  includeUnfiled: z.coerce.boolean().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  /** Comma-separated extra contexts (class + the course teaching the subject). */
  contextIds: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined)),
});

export type CreateStreamPostInput = z.infer<typeof createStreamPostSchema>;
export type CreateClassMaterialInput = z.infer<typeof createClassMaterialSchema>;
export type CreateClassNoteInput = z.infer<typeof createClassNoteSchema>;
export type UpdateClassNoteInput = z.infer<typeof updateClassNoteSchema>;
export type PublishClassNoteInput = z.infer<typeof publishClassNoteSchema>;

/** Republish an existing material from an already uploaded staff-owned object. */
export const republishClassMaterialSchema = z.object({
  objectId: z.string().uuid(),
  version: z.number().int().positive(),
}).strict();
export type RepublishClassMaterialInput = z.infer<typeof republishClassMaterialSchema>;
