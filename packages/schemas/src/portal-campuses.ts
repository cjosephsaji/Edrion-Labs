import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';
import { optionalCountryCodeSchema, optionalTimezoneSchema } from './geo/validators';

/**
 * Institution-portal Campuses (Administration) request contracts. The tenant edits its OWN campuses;
 * the code is system-generated + immutable (never accepted here) and billing lives on the platform
 * control-plane. Address is entered as flat fields + assembled into the `address` jsonb server-side.
 */
const optText = (max = 200) => z.string().trim().max(max).nullish();

export const portalCampusesListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});
export type PortalCampusesListQuery = z.infer<typeof portalCampusesListQuerySchema>;

export const createPortalCampusSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(200),
  addressLine1: optText(200),
  addressCity: optText(120),
  addressRegion: optText(120),
  addressCountry: optionalCountryCodeSchema,
  timezoneOverride: optionalTimezoneSchema,
  studentCapacity: z.coerce.number().int().min(0).max(1_000_000).nullish(),
  status: z.enum(['active', 'inactive']).default('active'),
});
export type CreatePortalCampusInput = z.infer<typeof createPortalCampusSchema>;

export const updatePortalCampusSchema = createPortalCampusSchema.partial().extend({ version: versionSchema });
export type UpdatePortalCampusInput = z.infer<typeof updatePortalCampusSchema>;
