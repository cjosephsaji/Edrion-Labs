import { z } from 'zod';
import {
  InstitutionStatus,
  InstitutionType,
  OnboardingStatus,
  SupportTier,
  Currency,
} from '@edrion/shared-types';
import { emailSchema, paginationQuerySchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';

export const institutionStatusSchema = zEnumFromConst(InstitutionStatus);
export const institutionTypeSchema = zEnumFromConst(InstitutionType);
export const onboardingStatusSchema = zEnumFromConst(OnboardingStatus);
export const supportTierSchema = zEnumFromConst(SupportTier);
export const currencySchema = zEnumFromConst(Currency);

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(40)
    .optional(),
  title: z.string().trim().max(120).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(40).optional(),
  country: z.string().trim().length(2, 'ISO 3166-1 alpha-2 country code'),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Create an institution. Starts as a lead/onboarding record; activation is separate. */
export const createInstitutionSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(160),
  type: institutionTypeSchema,
  country: z.string().trim().length(2),
  region: z.string().trim().max(120).optional(),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  currency: currencySchema.default(Currency.USD),
  primaryContact: contactSchema,
  billingContact: contactSchema.optional(),
  technicalContact: contactSchema.optional(),
  address: addressSchema.optional(),
  supportTier: supportTierSchema.default(SupportTier.Standard),
  dataRegion: z.string().trim().max(40).default('default'),
  customerSuccessOwnerId: z.string().uuid().optional(),
  internalNotes: z.string().trim().max(2000).optional(),
});
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;

/** Partial profile edit — never changes status (status has its own audited transitions). */
export const updateInstitutionSchema = createInstitutionSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;

/** Audited status transitions. Each carries a required reason. */
export const institutionStatusActionSchema = z.object({
  reason: reasonSchema,
  /** Optional support-case reference. */
  caseRef: z.string().trim().max(64).optional(),
  version: z.number().int().nonnegative(),
});
export type InstitutionStatusActionInput = z.infer<typeof institutionStatusActionSchema>;

export const extendTrialSchema = z.object({
  newTrialEndsAt: z.string().datetime(),
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;

/** Directory query — drives server-side filter/sort/paginate. URL-persisted on the client. */
export const listInstitutionsQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: institutionStatusSchema.optional(),
  type: institutionTypeSchema.optional(),
  country: z.string().trim().length(2).optional(),
  onboardingStatus: onboardingStatusSchema.optional(),
  planId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  riskOnly: z.coerce.boolean().optional(),
});
export type ListInstitutionsQuery = z.infer<typeof listInstitutionsQuerySchema>;

export const VALID_STATUS_TRANSITIONS: Record<InstitutionStatus, InstitutionStatus[]> = {
  [InstitutionStatus.Lead]: [InstitutionStatus.Onboarding, InstitutionStatus.Archived],
  [InstitutionStatus.Onboarding]: [
    InstitutionStatus.Trial,
    InstitutionStatus.Active,
    InstitutionStatus.Archived,
  ],
  [InstitutionStatus.Trial]: [
    InstitutionStatus.Active,
    InstitutionStatus.Restricted,
    InstitutionStatus.Cancelled,
    InstitutionStatus.Archived,
  ],
  [InstitutionStatus.Active]: [
    InstitutionStatus.PastDue,
    InstitutionStatus.Restricted,
    InstitutionStatus.Suspended,
    InstitutionStatus.Cancelled,
  ],
  [InstitutionStatus.PastDue]: [
    InstitutionStatus.Active,
    InstitutionStatus.Restricted,
    InstitutionStatus.Suspended,
    InstitutionStatus.Cancelled,
  ],
  [InstitutionStatus.Restricted]: [
    InstitutionStatus.Active,
    InstitutionStatus.Suspended,
    InstitutionStatus.Cancelled,
  ],
  [InstitutionStatus.Suspended]: [
    InstitutionStatus.Active,
    InstitutionStatus.Restricted,
    InstitutionStatus.Cancelled,
    InstitutionStatus.Archived,
  ],
  [InstitutionStatus.Cancelled]: [InstitutionStatus.Archived, InstitutionStatus.Active],
  [InstitutionStatus.Archived]: [],
};

/** Guard used by the service before persisting a transition. */
export function canTransition(from: InstitutionStatus, to: InstitutionStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
