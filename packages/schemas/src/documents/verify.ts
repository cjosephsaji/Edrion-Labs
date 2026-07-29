import { z } from 'zod';

export const VERIFY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' as const;
export const VERIFY_CODE_LENGTH = 12 as const;
export const SAMPLE_VERIFY_CODE = 'SAMPLE-0000' as const;

export const verifyStatusSchema = z.enum(['Valid', 'Revoked', 'Superseded']);

/** Constant-shape public verification projection — no PII beyond initials/optional name. */
export const documentVerifyProjectionSchema = z.object({
  issuerName: z.string(),
  issuerLogoUrl: z.string().nullable(),
  docTypeLabel: z.string(),
  studentInitials: z.string(),
  studentFullName: z.string().nullable(),
  issueDate: z.string(),
  status: verifyStatusSchema,
});
export type DocumentVerifyProjection = z.infer<typeof documentVerifyProjectionSchema>;

export const documentVerifyNotFoundSchema = z.object({
  code: z.literal('VERIFY_NOT_FOUND'),
  message: z.literal('Document not found'),
});
