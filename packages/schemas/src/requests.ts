import { z } from 'zod';
import { REQUEST_EVENT_TYPES, REQUEST_STATUSES } from './request-types';
import { paginationQuerySchema, sortQuerySchema } from './common';

export const requestStatusSchema = z.enum(REQUEST_STATUSES);
export const requestEventTypeSchema = z.enum(REQUEST_EVENT_TYPES);

export const requestAttachmentSchema = z.object({
  storage_object_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  mime: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  bytes: z.number().int().positive().max(10 * 1024 * 1024),
});

export const submitStudentRequestSchema = z.object({
  type: z.string().trim().min(1).max(80),
  payload: z.record(z.string(), z.unknown()),
  attachments: z.array(requestAttachmentSchema).max(5).default([]),
});

export const studentRequestsListQuerySchema = z.object({
  type: z.string().trim().max(80).optional(),
  status: requestStatusSchema.optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const requestIsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Choose a valid date');

export const leaveRequestPreviewQuerySchema = z.object({
  start: requestIsoDateSchema,
  end: requestIsoDateSchema,
});

export const portalRequestsListQuerySchema = studentRequestsListQuerySchema.extend({
  sla: z.enum(['breached']).optional(),
  mine: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const requestVersionSchema = z.object({ version: z.number().int().min(0) });
export const requestReplySchema = requestVersionSchema.extend({
  text: z.string().trim().min(1).max(4000),
  attachments: z.array(requestAttachmentSchema).max(5).default([]),
});
export const requestApproveSchema = requestVersionSchema.extend({
  note: z.string().trim().max(4000).optional(),
  accepted_session_ids: z.array(z.string().uuid()).optional(),
  new_score: z.number().int().min(0).optional(),
  form: z.record(z.unknown()).optional(),
});
export const requestRejectSchema = requestVersionSchema.extend({
  note: z.string().trim().min(10, 'Use at least 10 characters').max(4000),
});
export const requestInfoSchema = requestVersionSchema.extend({
  question: z.string().trim().min(1).max(4000),
});
export const requestReassignSchema = requestVersionSchema
  .extend({
    to_role: z.string().trim().min(1).max(100).optional(),
    to_user_id: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.to_role) === Boolean(value.to_user_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to_role'],
        message: 'Choose exactly one role or user',
      });
    }
  });
export const requestNoteSchema = z.object({
  version: z.number().int().min(0),
  note: z.string().trim().min(1).max(4000),
});
export const requestBulkApproveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  version_map: z.record(z.string().uuid(), z.number().int().min(0)),
});

export const requestTypeConfigCreateSchema = z.object({
  typeKey: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  routingRoleOverride: z.string().trim().min(1).max(100).nullable().optional(),
  slaDaysOverride: z.number().int().min(0).max(365).nullable().optional(),
  labelOverride: z.string().trim().min(1).max(120).nullable().optional(),
});
export const requestTypeConfigListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(120).optional(),
});
export const requestTypeConfigUpdateSchema = requestTypeConfigCreateSchema.partial().extend({
  version: z.number().int().min(0),
});

export const issuanceActionSchema = z.object({ version: z.number().int().min(0).optional() });
export const issuanceSendBackSchema = z.object({ note: z.string().trim().min(1).max(4000) });
export const vaultRevokeSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

export type RequestAttachmentInput = z.infer<typeof requestAttachmentSchema>;
export type SubmitStudentRequestInput = z.infer<typeof submitStudentRequestSchema>;
export type StudentRequestsListQuery = z.infer<typeof studentRequestsListQuerySchema>;
export type LeaveRequestPreviewQuery = z.infer<typeof leaveRequestPreviewQuerySchema>;
export type PortalRequestsListQuery = z.infer<typeof portalRequestsListQuerySchema>;
export type RequestVersionInput = z.infer<typeof requestVersionSchema>;
export type RequestReplyInput = z.infer<typeof requestReplySchema>;
export type RequestApproveInput = z.infer<typeof requestApproveSchema>;
export type RequestRejectInput = z.infer<typeof requestRejectSchema>;
export type RequestInfoInput = z.infer<typeof requestInfoSchema>;
export type RequestReassignInput = z.infer<typeof requestReassignSchema>;
export type RequestNoteInput = z.infer<typeof requestNoteSchema>;
export type RequestBulkApproveInput = z.infer<typeof requestBulkApproveSchema>;
export type RequestTypeConfigCreateInput = z.infer<typeof requestTypeConfigCreateSchema>;
export type RequestTypeConfigUpdateInput = z.infer<typeof requestTypeConfigUpdateSchema>;
export type RequestTypeConfigListQuery = z.infer<typeof requestTypeConfigListQuerySchema>;
export type IssuanceSendBackInput = z.infer<typeof issuanceSendBackSchema>;
export type VaultRevokeInput = z.infer<typeof vaultRevokeSchema>;
