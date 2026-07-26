import { z } from 'zod';
import { CampusBillingStatus } from '@edrion/shared-types';
import { addressSchema, contactSchema } from './institutions';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';
import { optionalTimezoneSchema } from './geo/validators';

export const campusBillingStatusSchema = zEnumFromConst(CampusBillingStatus);

export const createCampusSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  // `code` is system-generated and immutable (see buildCampusCode) — never accepted from the client.
  address: addressSchema.optional(),
  contact: contactSchema.optional(),
  timezoneOverride: optionalTimezoneSchema,
  studentCapacity: z.number().int().positive().optional(),
  openingDate: z.string().datetime().optional(),
  /** Future-dated activation is allowed. */
  effectiveBillingDate: z.string().datetime().optional(),
  /** When true, charge as a paid add-on; when false, attempt to use base allowance. */
  forcePaidAddon: z.boolean().default(false),
  /** Optional per-campus custom discount, in basis points (e.g. 1000 = 10%). */
  customDiscountBps: z.number().int().min(0).max(10000).optional(),
});
export type CreateCampusInput = z.infer<typeof createCampusSchema>;

export const updateCampusSchema = createCampusSchema
  .omit({ institutionId: true })
  .partial()
  .extend({ version: z.number().int().nonnegative() });
export type UpdateCampusInput = z.infer<typeof updateCampusSchema>;

export const campusStatusActionSchema = z.object({
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type CampusStatusActionInput = z.infer<typeof campusStatusActionSchema>;

export const listCampusesQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  institutionId: z.string().uuid().optional(),
  billingStatus: campusBillingStatusSchema.optional(),
  active: z.coerce.boolean().optional(),
});
export type ListCampusesQuery = z.infer<typeof listCampusesQuerySchema>;

/** Inputs for a campus-charge preview shown before confirmation. */
export const campusChargePreviewSchema = z.object({
  institutionId: z.string().uuid(),
  effectiveDate: z.string().datetime().optional(),
  forcePaidAddon: z.boolean().default(false),
  customDiscountBps: z.number().int().min(0).max(10000).optional(),
});
export type CampusChargePreviewInput = z.infer<typeof campusChargePreviewSchema>;
