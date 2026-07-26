import { z } from 'zod';
import { AuditResult, RiskLevel } from '@edrion/shared-types';
import { cursorQuerySchema, zEnumFromConst } from './common';

export const riskLevelSchema = zEnumFromConst(RiskLevel);
export const auditResultSchema = zEnumFromConst(AuditResult);

/** Advanced audit-log filters, cursor-paginated (audit is an unbounded stream). */
export const listAuditQuerySchema = cursorQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  module: z.string().trim().max(64).optional(),
  action: z.string().trim().max(120).optional(),
  actorId: z.string().trim().max(64).optional(),
  institutionId: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: z.string().trim().max(64).optional(),
  riskLevel: riskLevelSchema.optional(),
  result: auditResultSchema.optional(),
  supportSessionId: z.string().trim().max(64).optional(),
  /** Occurred-at window (ISO). `from` inclusive, `to` exclusive. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

/** Activity feed filters (human-readable stream). */
export const listActivityQuerySchema = cursorQuerySchema.extend({
  category: z.string().trim().max(64).optional(),
  institutionId: z.string().trim().max(64).optional(),
  riskLevel: riskLevelSchema.optional(),
});
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;

/** Export uses the same filter set as the audit list (sans cursor). */
export const exportAuditQuerySchema = listAuditQuerySchema.omit({ cursor: true, limit: true });
export type ExportAuditQuery = z.infer<typeof exportAuditQuerySchema>;
