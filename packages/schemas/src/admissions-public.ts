import { z } from 'zod';
import { emailSchema, uuidSchema } from './common';
import { optionalCountryCodeSchema, optionalE164PhoneSchema } from './geo';

/**
 * PUBLIC parent admission-apply funnel payloads. Unauthenticated + cross-tenant at creation (the
 * parent chooses the institution), mirroring the institution-registration funnel: a signed resume
 * token, an OTP-verified contact email, per-IP rate limiting and full server re-validation on
 * submit. Sections autosave individually (`admissionDraftPatchSchema`); everything is re-checked at
 * submit (`submitAdmissionSchema`). Phone/country fields reuse the shared geo validators.
 */

/** Start a draft — pick the institution and the email that will receive the verification code. */
export const startAdmissionSchema = z.object({
  institutionId: uuidSchema,
  contactEmail: emailSchema,
});
export type StartAdmissionInput = z.infer<typeof startAdmissionSchema>;

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional();

/** Which campus / year / grade the application is aimed at. All optional until submit. */
const targetSection = z
  .object({
    campusId: uuidSchema.optional(),
    academicYearId: uuidSchema.optional(),
    gradeLevelId: uuidSchema.optional(),
    programme: optionalText(120),
  })
  .partial();

const studentSection = z
  .object({
    firstName: optionalText(120),
    middleName: optionalText(80),
    lastName: optionalText(120),
    gender: optionalText(30),
    dateOfBirth: optionalText(20),
    previousSchool: optionalText(200),
  })
  .partial();

const guardianSection = z
  .object({
    name: optionalText(160),
    email: emailSchema.optional().or(z.literal('')),
    phone: optionalE164PhoneSchema,
    relationship: optionalText(60),
  })
  .partial();

const contactSection = z
  .object({
    email: emailSchema.optional().or(z.literal('')),
    phone: optionalE164PhoneSchema,
  })
  .partial();

const addressSection = z
  .object({
    line1: optionalText(200),
    line2: optionalText(200),
    city: optionalText(120),
    region: optionalText(120),
    postalCode: optionalText(30),
    country: optionalCountryCodeSchema,
  })
  .partial();

/** Selectable blood groups (plus an explicit "unknown"); empty string = not answered. */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;

/** Health + additional info the institution asks for (all optional; free text unless noted). */
const additionalSection = z
  .object({
    medicalConditions: optionalText(2000),
    allergies: optionalText(2000),
    medications: optionalText(2000),
    bloodGroup: z.enum(BLOOD_GROUPS).or(z.literal('')).optional(),
    emergencyContactName: optionalText(160),
    emergencyContactPhone: optionalE164PhoneSchema,
    specialNeeds: optionalText(2000),
    notes: optionalText(2000),
  })
  .partial();

/** Autosave one or more sections. Every field is optional; the shape mirrors AdmissionDraftPayload. */
export const admissionDraftPatchSchema = z
  .object({
    target: targetSection,
    student: studentSection,
    guardian: guardianSection,
    contact: contactSection,
    address: addressSection,
    additional: additionalSection,
  })
  .partial();
export type AdmissionDraftPatchInput = z.infer<typeof admissionDraftPatchSchema>;

/** Final submission. Student name + a contact email are required; the rest stays optional. */
export const submitAdmissionSchema = z.object({
  target: targetSection.optional(),
  student: studentSection.extend({
    firstName: trimmed(120).min(1, 'First name is required'),
    lastName: trimmed(120).min(1, 'Last name is required'),
  }),
  guardian: guardianSection.optional(),
  contact: z.object({
    email: emailSchema,
    phone: optionalE164PhoneSchema,
  }),
  address: addressSection.optional(),
  additional: additionalSection.optional(),
});
export type SubmitAdmissionInput = z.infer<typeof submitAdmissionSchema>;

// Cross-device resume reuses resumeRequestSchema / resumeVerifySchema from `./registration`.
