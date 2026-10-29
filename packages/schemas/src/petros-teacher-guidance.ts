import { z } from 'zod';

export const PETROS_GUIDANCE_MAX_FILES = 5;
export const PETROS_GUIDANCE_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const PETROS_GUIDANCE_FILE_ACCEPT = '.pdf,.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp';
export const petrosGuidanceAttachmentSchema = z.object({
  id: z.string().uuid(), filename: z.string(), mimeType: z.string(), sizeBytes: z.number().int(),
  textStatus: z.enum(['readable', 'unavailable']), textTruncated: z.boolean(),
});
export type PetrosGuidanceAttachment = z.infer<typeof petrosGuidanceAttachmentSchema>;

/** Teacher directions are learning goals, not reviewed lesson pack payloads. */
export const petrosTeacherGuidanceSchema = z.object({
  schemaVersion: z.literal('petros.teacher-guidance.v1'),
  focus: z.string().trim().min(3, 'Describe what the student should learn.').max(160),
  instructions: z.string().trim().max(2000).default(''),
  approach: z.enum(['understand', 'practice', 'review']).default('understand'),
  sessionMinutes: z.number().int().min(5).max(40).default(15),
  attachmentObjectIds: z.array(z.string().uuid()).max(PETROS_GUIDANCE_MAX_FILES).default([])
    .refine((ids) => new Set(ids).size === ids.length, 'Each file can be attached once.'),
}).strict();
export type PetrosTeacherGuidance = z.infer<typeof petrosTeacherGuidanceSchema>;

export const createPetrosTeacherGuidanceSchema = petrosTeacherGuidanceSchema.extend({
  commandId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a completion date.')
    .refine((date) => {
      const parsed = new Date(`${date}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    }, 'Choose a valid completion date.'),
  audience: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('class') }).strict(),
    z.object({ kind: z.literal('students'), studentIds: z.array(z.string().uuid()).min(1).max(500) }).strict(),
  ]),
}).strict();
export type CreatePetrosTeacherGuidance = z.infer<typeof createPetrosTeacherGuidanceSchema>;
