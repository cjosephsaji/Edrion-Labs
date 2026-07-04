import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal COUNSELING module (Phase 13 — Counselor) request contracts. Notes are
 * sensitive: writes need sensitive keys and reads are audited at the service layer.
 */
const text = (max = 200) => z.string().trim().max(max).nullish();
const ts = z.coerce.date().nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- counseling records ------------------------------------------------------
export const counselingRecordsListQuerySchema = listQuery;
export type CounselingRecordsListQuery = z.infer<typeof counselingRecordsListQuerySchema>;

export const createCounselingRecordSchema = z.object({
  studentId: z.string().uuid().nullish(),
  sessionType: z.enum(['individual', 'group', 'family', 'intake']).default('individual'),
  title: z.string().trim().min(1, 'Required').max(200),
  notes: text(4000),
  sessionAt: ts,
  status: z.enum(['open', 'closed']).default('open'),
});
export type CreateCounselingRecordInput = z.infer<typeof createCounselingRecordSchema>;

export const updateCounselingRecordSchema = createCounselingRecordSchema.partial().extend({ version: versionSchema });
export type UpdateCounselingRecordInput = z.infer<typeof updateCounselingRecordSchema>;

// --- counseling cases --------------------------------------------------------
export const counselingCasesListQuerySchema = listQuery;
export type CounselingCasesListQuery = z.infer<typeof counselingCasesListQuerySchema>;

export const createCounselingCaseSchema = z.object({
  studentId: z.string().uuid().nullish(),
  title: z.string().trim().min(1, 'Required').max(200),
  summary: text(2000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['open', 'in_progress', 'closed']).default('open'),
});
export type CreateCounselingCaseInput = z.infer<typeof createCounselingCaseSchema>;

export const updateCounselingCaseSchema = createCounselingCaseSchema.partial().extend({ version: versionSchema });
export type UpdateCounselingCaseInput = z.infer<typeof updateCounselingCaseSchema>;

/**
 * Restricted cross-role referral payload (`counseling.refer`): any staff member with the key may
 * open a triage case, but never sets status or reads cases. Shared by the REST endpoint and the
 * Petros `counseling_case_create` tool — one audited path.
 */
export const counselingReferralSchema = z.object({
  studentId: z.string().uuid().nullish(),
  title: z.string().trim().min(1, 'Required').max(200),
  summary: text(2000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});
export type CounselingReferralInput = z.infer<typeof counselingReferralSchema>;
