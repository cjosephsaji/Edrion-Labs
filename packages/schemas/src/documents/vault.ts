import { z } from 'zod';
import { documentFamilySchema, documentSourceSchema } from './catalog';

export const vaultListQuerySchema = z.object({
  cursor: z.string().optional(),
  family: documentFamilySchema.optional(),
  academicYear: z.string().max(32).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type VaultListQuery = z.infer<typeof vaultListQuerySchema>;

export const vaultDocumentProjectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  family: documentFamilySchema.nullable(),
  source: documentSourceSchema,
  issuedAt: z.string(),
  deliveredAt: z.string().nullable(),
  academicYear: z.string().nullable(),
  verifyCode: z.string(),
  revokedAt: z.string().nullable(),
  supersededBy: z.string().uuid().nullable(),
  updatedLabel: z.string().nullable().optional(),
});

export const documentVaultRevokeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative(),
});

export const documentVaultReissueSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  version: z.number().int().nonnegative(),
});
