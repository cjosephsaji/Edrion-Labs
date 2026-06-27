import { z } from 'zod';
import { paginationQuerySchema, reasonSchema, sortQuerySchema } from './common';

/** Independent (B2C) users — people who signed up directly, not through an institution. */
export const listIndependentUsersQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .extend({
    search: z.string().trim().max(120).optional(),
    status: z.string().trim().max(40).optional(),
    country: z.string().trim().max(2).optional(),
  });
export type ListIndependentUsersQuery = z.infer<typeof listIndependentUsersQuerySchema>;

export const updateIndependentUserSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  country: z.string().trim().max(2).optional(),
  aiUsageLimit: z.number().int().nonnegative().nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateIndependentUserInput = z.infer<typeof updateIndependentUserSchema>;

/** Disable / restore an independent user. Disable is sensitive (recent auth required). */
export const independentUserStatusActionSchema = z.object({
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type IndependentUserStatusActionInput = z.infer<typeof independentUserStatusActionSchema>;
