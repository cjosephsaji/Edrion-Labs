import { z } from 'zod';
import { InstitutionType, RegistrationStatus } from '@edrion/shared-types';
import {
  emailSchema,
  paginationQuerySchema,
  reasonSchema,
  sortQuerySchema,
  versionSchema,
  zEnumFromConst,
} from './common';
import {
  countryCodeSchema,
  timezoneSchema,
  optionalE164PhoneSchema,
  refineCountrySubdivision,
} from './geo/validators';

/**
 * Institution registration funnel + reviewer workflow schemas.
 *
 * Section schemas are the unit of autosave (each can be saved partially via `draftPatchSchema`);
 * `submitRegistrationSchema` composes them all and is re-validated server-side on submit regardless
 * of what the client sent. All text is trimmed + length-capped; emails are lowercased; no HTML is
 * accepted. A hidden `website` honeypot field is rejected by the service when filled (bot trap).
 */

export const registrationStatusSchema = zEnumFromConst(RegistrationStatus);
export const registrationTypeSchema = zEnumFromConst(InstitutionType);

const CURRENT_YEAR = new Date().getUTCFullYear();
const shortText = (max: number) => z.string().trim().max(max);
const optionalUrl = z.string().trim().url().max(300).optional().or(z.literal('').transform(() => undefined));

// ── Sections ─────────────────────────────────────────────────────────────────

export const institutionInfoSchema = z.object({
  legalName: z.string().trim().min(2, 'Legal name is required').max(200),
  displayName: z.string().trim().min(2, 'Display name is required').max(160),
  type: registrationTypeSchema,
  website: optionalUrl,
  yearEstablished: z.coerce
    .number()
    .int()
    .min(1800)
    .max(CURRENT_YEAR)
    .optional(),
  registrationNumber: shortText(80).optional(),
  logoUrl: optionalUrl,
});
export type InstitutionInfoInput = z.infer<typeof institutionInfoSchema>;

/** Base object (used for partial autosave); `locationSchema` adds cross-field rules. */
export const locationObjectSchema = z.object({
  country: countryCodeSchema,
  // ISO 3166-2 subdivision code (legacy free-text tolerated until backfilled).
  region: shortText(120).optional(),
  city: z.string().trim().min(1, 'City is required').max(120),
  address: z.string().trim().min(1, 'Address is required').max(300),
  postalCode: shortText(40).optional(),
  timezone: timezoneSchema.default('UTC'),
});
export const locationSchema = locationObjectSchema.superRefine(
  refineCountrySubdivision('country', 'region'),
);
export type LocationInput = z.infer<typeof locationSchema>;

export const campusInfoSchema = z.object({
  currentCampuses: z.coerce.number().int().min(1, 'At least one campus').max(10_000),
  expectedCampusesNextYear: z.coerce.number().int().min(0).max(10_000).optional(),
  firstCampusName: z.string().trim().min(1, 'First campus name is required').max(160),
  expectedStudents: z.coerce.number().int().min(0).max(10_000_000),
  expectedStaff: z.coerce.number().int().min(0).max(1_000_000).optional(),
});
export type CampusInfoInput = z.infer<typeof campusInfoSchema>;

export const preferredContactMethodSchema = z.enum(['email', 'phone', 'whatsapp']);

export const primaryContactSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(160),
  jobTitle: shortText(120).optional(),
  email: emailSchema,
  // Normalized to E.164; the phone component emits E.164 and the server re-validates.
  phone: optionalE164PhoneSchema,
  preferredContactMethod: preferredContactMethodSchema.optional(),
});
export type PrimaryContactInput = z.infer<typeof primaryContactSchema>;

export const subscriptionInfoSchema = z.object({
  /** Plan the institution chose from the public catalogue. Required — the institution picks. */
  planKey: z.string().trim().min(1, 'Please choose a plan'),
  launchTimeline: shortText(120).optional(),
  currentErp: shortText(120).optional(),
  hearAboutUs: shortText(160).optional(),
  additionalRequirements: shortText(2000).optional(),
});
export type SubscriptionInfoInput = z.infer<typeof subscriptionInfoSchema>;

/** A published plan as exposed to the public registration funnel (read-only catalogue view). */
export interface PublicPlanView {
  key: string;
  name: string;
  description: string | null;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  perCampusPriceMinor: number;
}

export const consentSchema = z.object({
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms & Conditions' }),
  }),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Privacy Policy' }),
  }),
  marketingOptIn: z.boolean().optional().default(false),
});
export type ConsentInput = z.infer<typeof consentSchema>;

// ── Public funnel payloads ───────────────────────────────────────────────────

/** All section data. Server is source-of-truth and re-validates this on submit. */
export const registrationSectionsSchema = z.object({
  institutionInfo: institutionInfoSchema,
  location: locationSchema,
  campusInfo: campusInfoSchema,
  primaryContact: primaryContactSchema,
  subscription: subscriptionInfoSchema,
  consent: consentSchema,
});
export type RegistrationSectionsInput = z.infer<typeof registrationSectionsSchema>;

/** Hidden bot trap — must be absent/empty for a real human. */
const honeypot = z.string().max(0).optional();

/** Autosave one or more partial sections. */
export const draftPatchSchema = z.object({
  institutionInfo: institutionInfoSchema.partial().optional(),
  location: locationObjectSchema.partial().optional(),
  campusInfo: campusInfoSchema.partial().optional(),
  primaryContact: primaryContactSchema.partial().optional(),
  subscription: subscriptionInfoSchema.partial().optional(),
  consent: consentSchema.partial().optional(),
  website: honeypot,
});
export type DraftPatchInput = z.infer<typeof draftPatchSchema>;

/** Final submission. Full sections + honeypot. */
export const submitRegistrationSchema = registrationSectionsSchema.extend({ website: honeypot });
export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;

export const startRegistrationSchema = z.object({ website: honeypot }).default({});
export type StartRegistrationInput = z.infer<typeof startRegistrationSchema>;

export const otpRequestSchema = z.object({ email: emailSchema });
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/** Resume an existing draft cross-device: email + a code we send to it (no resume token needed). */
export const resumeRequestSchema = z.object({ email: emailSchema });
export type ResumeRequestInput = z.infer<typeof resumeRequestSchema>;

export const resumeVerifySchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export type ResumeVerifyInput = z.infer<typeof resumeVerifySchema>;

// ── Reviewer / admin payloads ────────────────────────────────────────────────

export const listRegistrationsQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: shortText(160).optional(),
  status: registrationStatusSchema.optional(),
  type: registrationTypeSchema.optional(),
  country: z.string().trim().length(2).optional(),
  reviewerId: z.string().uuid().optional(),
  minStudents: z.coerce.number().int().min(0).optional(),
  maxStudents: z.coerce.number().int().min(0).optional(),
  submittedFrom: z.string().datetime().optional(),
  submittedTo: z.string().datetime().optional(),
});
export type ListRegistrationsQuery = z.infer<typeof listRegistrationsQuerySchema>;

export const assignReviewerSchema = z.object({
  reviewerId: z.string().uuid(),
  version: versionSchema,
});
export type AssignReviewerInput = z.infer<typeof assignReviewerSchema>;

export const addRegistrationNoteSchema = z.object({
  note: z.string().trim().min(1, 'Note cannot be empty').max(2000),
});
export type AddRegistrationNoteInput = z.infer<typeof addRegistrationNoteSchema>;

export const startReviewSchema = z.object({ version: versionSchema });
export type StartReviewInput = z.infer<typeof startReviewSchema>;

/** First-time administrator access. An existing active institution account is always reused. */
export const credentialDeliverySchema = z.enum(['activation', 'temporary_password']);

export const approveRegistrationSchema = z.object({
  version: versionSchema,
  /** Institution provisioning. */
  supportTier: z.enum(['standard', 'priority', 'enterprise']).default('standard'),
  planKey: shortText(80).optional(),
  campus: z.object({
    name: z.string().trim().min(1).max(160),
    // `code` is system-generated on provisioning (see buildCampusCode) — not chosen at approval.
  }),
  /** Primary institution administrator. */
  admin: z.object({
    fullName: z.string().trim().min(2).max(160),
    email: emailSchema,
    roleKeys: z.array(z.string().trim().min(1)).min(1).default(['institution_owner']),
    credentialDelivery: credentialDeliverySchema.default('activation'),
  }),
  /** Optional internal note recorded with the approval. */
  note: shortText(2000).optional(),
});
export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;

export const rejectRegistrationSchema = z.object({
  version: versionSchema,
  reason: reasonSchema,
  internalNote: shortText(2000).optional(),
});
export type RejectRegistrationInput = z.infer<typeof rejectRegistrationSchema>;
