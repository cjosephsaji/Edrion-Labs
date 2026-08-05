import type { z } from 'zod';

export const REQUEST_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'needs_info',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
  'expired',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_EVENT_TYPES = [
  'created',
  'submitted',
  'claimed',
  'unclaimed',
  'reassigned',
  'info_requested',
  'info_provided',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
  'expired',
  'note_added',
] as const;

export type RequestEventType = (typeof REQUEST_EVENT_TYPES)[number];

export type RequestRouting = { role: string } | { classTeacherOf: 'student' };

export interface RequestTypeConfig<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  key: string;
  label: string;
  humanCodePrefix: string;
  category: string;
  entrySurface?: 'documents' | 'attendance' | 'results' | 'transport';
  /** Schema inputs may omit fields that are filled by Zod defaults; its parsed output is TPayload. */
  payloadSchema: z.ZodType<TPayload, z.ZodTypeDef, unknown>;
  payloadSchemaVersion: number;
  routing: RequestRouting;
  slaDays: number;
  cancellableStatuses: readonly RequestStatus[];
  requiresPayment: boolean;
  /** Required when requiresPayment is true; used to create the request-linked fee demand. */
  feeLine?: { label: string; amountMinor: number; category: 'tuition'|'exam'|'lab'|'transport'|'hostel'|'other' };
  /**
   * When set, the API resolves fee/template/routing/eligibility from a DB adapter
   * (e.g. document_catalog) instead of static package config.
   */
  dynamicPolicy?: 'document_catalog';
  producesDocument: boolean;
  bulkApprovable: boolean;
  approvalSideEffectKey?: string;
  approveFormSchema?: z.ZodType;
  notifications: Partial<Record<RequestEventType, { title: string; body: string }>>;
  summaryLine(payload: TPayload): string;
}
