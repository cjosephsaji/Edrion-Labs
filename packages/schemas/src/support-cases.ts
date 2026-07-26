import { z } from 'zod';
import { SupportCaseStatus } from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';

export const supportCaseStatusSchema = zEnumFromConst(SupportCaseStatus);
export const SUPPORT_CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const SUPPORT_CASE_CATEGORIES = ['general', 'billing', 'technical', 'onboarding', 'security', 'feature'] as const;

export const listSupportCasesQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(120).optional(),
  status: supportCaseStatusSchema.optional(),
  priority: z.enum(SUPPORT_CASE_PRIORITIES).optional(),
  institutionId: z.string().uuid().optional(),
  assignedEmployeeId: z.string().uuid().optional(),
});
export type ListSupportCasesQuery = z.infer<typeof listSupportCasesQuerySchema>;

export const createSupportCaseSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  category: z.enum(SUPPORT_CASE_CATEGORIES).default('general'),
  priority: z.enum(SUPPORT_CASE_PRIORITIES).default('normal'),
  institutionId: z.string().uuid().optional(),
  independentUserId: z.string().uuid().optional(),
  /** Optional opening message. */
  body: z.string().trim().max(8000).optional(),
});
export type CreateSupportCaseInput = z.infer<typeof createSupportCaseSchema>;

export const addSupportMessageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  /** Internal note (not visible to the customer) vs. a customer-facing reply. */
  internal: z.boolean().default(false),
});
export type AddSupportMessageInput = z.infer<typeof addSupportMessageSchema>;

export const changeSupportCaseStatusSchema = z.object({
  status: supportCaseStatusSchema,
  resolution: z.string().trim().max(2000).optional(),
  reason: reasonSchema,
});
export type ChangeSupportCaseStatusInput = z.infer<typeof changeSupportCaseStatusSchema>;

export const assignSupportCaseSchema = z.object({
  assignedEmployeeId: z.string().uuid().nullable(),
  reason: reasonSchema,
});
export type AssignSupportCaseInput = z.infer<typeof assignSupportCaseSchema>;
