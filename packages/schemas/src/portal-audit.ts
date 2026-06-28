import { z } from 'zod';
import { AuditResult, RiskLevel } from '@edrion/shared-types';
import { paginationQuerySchema, zEnumFromConst } from './common';

/**
 * Institution-Portal AUDIT viewer (Phase 11) request contracts — read-only, server-paginated reads
 * over the append-only `audit_events`, always confined to the principal's institution (the
 * institution filter is applied server-side, never taken from the body). Reads need `audit.view`;
 * the CSV export needs the sensitive `audit.export`.
 *
 * `portal*`/`PortalAudit*`-prefixed to avoid colliding with the platform `audit.ts` query schema.
 */

const portalAuditRiskSchema = zEnumFromConst(RiskLevel);
const portalAuditResultSchema = zEnumFromConst(AuditResult);
const isoDateTime = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const portalAuditListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(160).optional(),
  module: z.string().trim().max(80).optional(),
  action: z.string().trim().max(120).optional(),
  campusId: z.string().uuid().optional(),
  riskLevel: portalAuditRiskSchema.optional(),
  result: portalAuditResultSchema.optional(),
  aiInvolved: z.coerce.boolean().optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});
export type PortalAuditListQuery = z.infer<typeof portalAuditListQuerySchema>;

/** Export query — the same filters minus pagination (the export streams the matching window). */
export const portalAuditExportQuerySchema = portalAuditListQuerySchema
  .omit({ page: true, pageSize: true })
  .extend({ limit: z.coerce.number().int().min(1).max(10000).default(5000) });
export type PortalAuditExportQuery = z.infer<typeof portalAuditExportQuerySchema>;
