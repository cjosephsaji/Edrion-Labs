import { z } from 'zod';
import { cursorQuerySchema, versionSchema } from './common';

/**
 * PARENT-PORTAL (/v1/parent/*) request + response contracts, shared between the API and parent-web.
 * Every list is cursor (keyset) paginated. Student ids are NEVER trusted from the client for scoping
 * — the GuardianScopeGuard validates each `:studentId` against the caller's active guardian links —
 * but they still appear here as path/body params so the DTOs are self-describing.
 */

// ── Shared enums ──────────────────────────────────────────────────────────────
export const PARENT_NOTICE_PRIORITIES = ['normal', 'important'] as const;
export const PARENT_MESSAGE_CATEGORIES = [
  'callback_request',
  'class_teacher_note',
  'fees_query',
  'transport_query',
  'health_query',
  'general',
] as const;
export const PARENT_CONSENT_TYPES = ['photo_media', 'trip', 'medical_treatment', 'custom'] as const;
export const PARENT_ABSENCE_REASONS = ['illness', 'family', 'travel', 'other'] as const;
export const PICKUP_AUTH_RELATIONSHIPS = ['parent', 'grandparent', 'sibling', 'relative', 'driver', 'other'] as const;
export const EARLY_LEAVE_STATUSES = ['requested', 'approved', 'denied', 'completed'] as const;
export const HOSTEL_OUTING_TYPES = ['outing', 'leave', 'guardian_visit'] as const;
export const DOCUMENT_REQUEST_TYPES = [
  'bonafide',
  'transfer_certificate',
  'fee_receipt_duplicate',
  'character_certificate',
  'custom',
] as const;
export const PROFILE_FIELD_GROUPS = ['address', 'phone', 'email', 'photo', 'guardian_details', 'dietary', 'other'] as const;
export const PARENT_PAYMENT_PROVIDERS = ['razorpay', 'stripe', 'manual', 'mock'] as const;
export const PARENT_NOTIFICATION_CHANNELS = ['email', 'sms', 'whatsapp', 'push'] as const;
export const ASSIGNMENT_VIEW_STATUSES = ['pending', 'submitted', 'graded', 'overdue', 'all'] as const;

// ── Shared params ─────────────────────────────────────────────────────────────
/** Every list endpoint reuses cursor pagination. */
export const parentListQuerySchema = cursorQuerySchema;
export type ParentListQuery = z.infer<typeof parentListQuerySchema>;

export const studentIdParamSchema = z.object({ studentId: z.string().uuid() });
export type StudentIdParam = z.infer<typeof studentIdParamSchema>;

/** A [from,to] ISO-date window (attendance / calendar). */
export const dateRangeQuerySchema = z.object({
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
});
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

// ── Academics ─────────────────────────────────────────────────────────────────
export const attendanceQuerySchema = dateRangeQuerySchema;
export const assignmentsQuerySchema = parentListQuerySchema.extend({
  status: z.enum(ASSIGNMENT_VIEW_STATUSES).default('all'),
});
export type AssignmentsQuery = z.infer<typeof assignmentsQuerySchema>;
export const timetableQuerySchema = z.object({ week: z.string().trim().max(20).optional() });

// ── Communication: notices / consents / messages / preferences ─────────────────
export const respondConsentSchema = z.object({
  studentId: z.string().uuid(),
  response: z.string().trim().min(1).max(120),
  note: z.string().trim().max(2000).nullish(),
});
export type RespondConsentInput = z.infer<typeof respondConsentSchema>;

export const createParentThreadSchema = z.object({
  studentId: z.string().uuid(),
  category: z.enum(PARENT_MESSAGE_CATEGORIES).default('general'),
  subject: z.string().trim().min(1, 'Required').max(200),
  body: z.string().trim().min(1, 'Required').max(8000),
});
export type CreateParentThreadInput = z.infer<typeof createParentThreadSchema>;

export const replyParentMessageSchema = z.object({
  body: z.string().trim().min(1, 'Required').max(8000),
});
export type ReplyParentMessageInput = z.infer<typeof replyParentMessageSchema>;

export const notificationChannelsSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  push: z.boolean().optional(),
});
export const quietHoursSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM').optional(),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM').optional(),
  })
  .partial();
export const updatePreferencesSchema = z.object({
  channels: notificationChannelsSchema.optional(),
  categoryOverrides: z.record(z.string(), notificationChannelsSchema).optional(),
  digestDay: z.coerce.number().int().min(0).max(6).optional(),
  digestEnabled: z.coerce.boolean().optional(),
  quietHours: quietHoursSchema.optional(),
  language: z.string().trim().min(2).max(8).optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// ── PTM ───────────────────────────────────────────────────────────────────────
export const bookPtmSlotSchema = z.object({
  studentId: z.string().uuid(),
  note: z.string().trim().max(1000).nullish(),
});
export type BookPtmSlotInput = z.infer<typeof bookPtmSlotSchema>;

// ── Absence notes ───────────────────────────────────────────────────────────
export const attachmentRefSchema = z.object({
  name: z.string().trim().max(240),
  url: z.string().trim().max(2000).optional(),
  storageKey: z.string().trim().max(2000).optional(),
  contentType: z.string().trim().max(160).optional(),
  bytes: z.number().int().nonnegative().optional(),
});
export const createAbsenceNoteSchema = z.object({
  studentId: z.string().uuid(),
  dateFrom: z.string().trim().max(20),
  dateTo: z.string().trim().max(20),
  reasonCategory: z.enum(PARENT_ABSENCE_REASONS).default('other'),
  note: z.string().trim().max(4000).nullish(),
  attachment: attachmentRefSchema.nullish(),
});
export type CreateAbsenceNoteInput = z.infer<typeof createAbsenceNoteSchema>;

// ── Wellbeing ─────────────────────────────────────────────────────────────────
export const medicationEntrySchema = z.object({
  name: z.string().trim().max(200),
  dose: z.string().trim().max(120).optional(),
  schedule: z.string().trim().max(200).optional(),
});
export const vaccinationEntrySchema = z.object({
  name: z.string().trim().max(200),
  date: z.string().trim().max(20).optional(),
  docRef: z.string().trim().max(2000).optional(),
});
export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  relationship: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(3).max(40),
});
export const putHealthProfileSchema = z.object({
  bloodGroup: z.string().trim().max(8).nullish(),
  allergies: z.array(z.string().trim().max(200)).max(50).default([]),
  chronicConditions: z.array(z.string().trim().max(200)).max(50).default([]),
  currentMedications: z.array(medicationEntrySchema).max(50).default([]),
  dietaryRestrictions: z.string().trim().max(1000).nullish(),
  doctorName: z.string().trim().max(200).nullish(),
  doctorPhone: z.string().trim().max(40).nullish(),
  insuranceRef: z.string().trim().max(200).nullish(),
  vaccinations: z.array(vaccinationEntrySchema).max(100).default([]),
  emergencyContacts: z.array(emergencyContactSchema).max(10).default([]),
});
export type PutHealthProfileInput = z.infer<typeof putHealthProfileSchema>;

// ── Safety / gate ─────────────────────────────────────────────────────────────
export const createPickupAuthorizationSchema = z.object({
  studentId: z.string().uuid(),
  personName: z.string().trim().min(1, 'Required').max(200),
  relationship: z.enum(PICKUP_AUTH_RELATIONSHIPS).default('relative'),
  phone: z.string().trim().max(40).nullish(),
  photoDocumentId: z.string().uuid().nullish(),
  idProofDocumentId: z.string().uuid().nullish(),
  validUntil: z.string().trim().max(20).nullish(),
});
export type CreatePickupAuthorizationInput = z.infer<typeof createPickupAuthorizationSchema>;
export const updatePickupAuthorizationSchema = createPickupAuthorizationSchema
  .omit({ studentId: true })
  .partial()
  .extend({ version: versionSchema });
export type UpdatePickupAuthorizationInput = z.infer<typeof updatePickupAuthorizationSchema>;

export const createEarlyLeaveRequestSchema = z.object({
  studentId: z.string().uuid(),
  leaveDate: z.string().trim().max(20),
  leaveTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM').nullish(),
  reason: z.string().trim().max(2000).nullish(),
  pickupAuthorizationId: z.string().uuid().nullish(),
});
export type CreateEarlyLeaveRequestInput = z.infer<typeof createEarlyLeaveRequestSchema>;

export const createHostelOutingRequestSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(HOSTEL_OUTING_TYPES).default('outing'),
  fromAt: z.string().trim().max(40),
  toAt: z.string().trim().max(40),
  reason: z.string().trim().max(2000).nullish(),
});
export type CreateHostelOutingRequestInput = z.infer<typeof createHostelOutingRequestSchema>;

// ── Money ─────────────────────────────────────────────────────────────────────
export const createPaymentIntentSchema = z.object({
  /** Minor units; omitted → the full invoice balance. */
  amount: z.coerce.number().int().positive().optional(),
  provider: z.enum(PARENT_PAYMENT_PROVIDERS).default('mock'),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

/** Generic settlement webhook body (mock/manual). Real providers verify via raw-body HMAC. */
export const paymentWebhookSchema = z.object({
  provider: z.enum(PARENT_PAYMENT_PROVIDERS),
  providerRef: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(80),
  status: z.enum(['succeeded', 'failed', 'expired']).default('succeeded'),
  amount: z.coerce.number().int().nonnegative().optional(),
});
export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;

// ── Documents ─────────────────────────────────────────────────────────────────
export const createDocumentRequestSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(DOCUMENT_REQUEST_TYPES).default('custom'),
  note: z.string().trim().max(2000).nullish(),
});
export type CreateDocumentRequestInput = z.infer<typeof createDocumentRequestSchema>;

export const createProfileChangeRequestSchema = z.object({
  studentId: z.string().uuid(),
  fieldGroup: z.enum(PROFILE_FIELD_GROUPS).default('other'),
  proposedChanges: z.record(z.string(), z.unknown()),
});
export type CreateProfileChangeRequestInput = z.infer<typeof createProfileChangeRequestSchema>;

// ── Institution-side (staff) counterpart contracts ─────────────────────────────
export const reviewAbsenceNoteSchema = z.object({
  decision: z.enum(['acknowledged', 'rejected']),
  reviewNote: z.string().trim().max(2000).nullish(),
});
export type ReviewAbsenceNoteInput = z.infer<typeof reviewAbsenceNoteSchema>;

export const recordMedicalIncidentSchema = z.object({
  studentId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullish(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  location: z.string().trim().max(200).nullish(),
  actionTaken: z.string().trim().max(2000).nullish(),
});
export type RecordMedicalIncidentInput = z.infer<typeof recordMedicalIncidentSchema>;

export const staffReplySchema = z.object({ body: z.string().trim().min(1).max(8000), closeThread: z.coerce.boolean().default(false) });
export type StaffReplyInput = z.infer<typeof staffReplySchema>;

export const fulfilDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fileRef: z.string().trim().min(1).max(2000),
  contentType: z.string().trim().max(160).default('application/pdf'),
});
export type FulfilDocumentRequestInput = z.infer<typeof fulfilDocumentRequestSchema>;

export const staffRecognitionSchema = z.object({
  studentId: z.string().uuid(),
  type: z.enum(['merit', 'award', 'certificate', 'badge', 'sports', 'arts', 'academics']).default('merit'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
});
export type StaffRecognitionInput = z.infer<typeof staffRecognitionSchema>;

export const decideRequestSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  note: z.string().trim().max(2000).nullish(),
});
export type DecideRequestInput = z.infer<typeof decideRequestSchema>;

export const publishNoticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  priority: z.enum(PARENT_NOTICE_PRIORITIES).default('normal'),
  requiresAcknowledgement: z.coerce.boolean().default(false),
});
export type PublishNoticeInput = z.infer<typeof publishNoticeSchema>;

export const emergencyBroadcastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  severity: z.enum(['urgent', 'critical']).default('urgent'),
  /** Must equal "SEND EMERGENCY" — a typed confirmation phrase. */
  confirmPhrase: z.string(),
});
export type EmergencyBroadcastInput = z.infer<typeof emergencyBroadcastSchema>;

// ── Response shapes (typed for the api-client) ──────────────────────────────────
export interface ParentChildSummary {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  className: string | null;
  campusId: string | null;
  photoUrl: string | null;
  isBoarder: boolean;
  onTransport: boolean;
  /** Sections hidden for this guardian (from visibility_overrides). */
  hiddenSections: string[];
}

export interface ParentMeResponse {
  guardian: { id: string; fullName: string; email: string };
  children: ParentChildSummary[];
  preferences: {
    channels: Record<string, boolean>;
    digestDay: number;
    digestEnabled: boolean;
    quietHours: Record<string, string>;
    language: string;
  };
  unread: { notifications: number; notices: number; messages: number; pendingConsents: number };
}

export interface ConversationPrompt {
  studentId: string;
  text: string;
}

export interface ParentDashboardResponse {
  studentId: string;
  needsAttention: Array<{ type: string; title: string; detail: string | null; deepLink: string | null }>;
  attendance: { last30Pct: number | null; lastFive: Array<{ date: string; status: string }> };
  timetableToday: Array<{ subject: string; startTime: string | null; endTime: string | null; room: string | null }>;
  timetableTomorrow: Array<{ subject: string; startTime: string | null; endTime: string | null; room: string | null }>;
  assignmentsDue: Array<{ id: string; title: string; dueDate: string | null; subject: string | null }>;
  upcomingExams: Array<{ id: string; subject: string | null; examDate: string | null; hall: string | null }>;
  outstandingFees: { totalMinor: number; currency: string; count: number };
  recognitions: Array<{ id: string; title: string; type: string; awardedAt: string }>;
  notices: Array<{ id: string; title: string; priority: string; publishedAt: string | null }>;
  activePtm: { id: string; title: string } | null;
  libraryDue: Array<{ id: string; title: string; dueDate: string | null; overdue: boolean }>;
  transportStatus: { routeName: string | null; activeIncident: string | null } | null;
  conversationPrompts: ConversationPrompt[];
}
