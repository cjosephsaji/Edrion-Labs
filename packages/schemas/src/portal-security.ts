import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/** Institution-Portal SECURITY module (Phase 13 — Security Staff) request contracts. */
const text = (max = 200) => z.string().trim().max(max).nullish();
const ts = z.coerce.date().nullish();
const listQuery = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: z.string().trim().max(40).optional(),
});

// --- gate passes -------------------------------------------------------------
export const gatePassesListQuerySchema = listQuery;
export type GatePassesListQuery = z.infer<typeof gatePassesListQuerySchema>;

export const createGatePassSchema = z.object({
  holderName: z.string().trim().min(1, 'Required').max(200),
  kind: z.enum(['visitor', 'student', 'staff', 'vehicle']).default('visitor'),
  reason: text(200),
  issuedAt: ts,
  expiresAt: ts,
  status: z.enum(['active', 'used', 'expired', 'revoked']).default('active'),
});
export type CreateGatePassInput = z.infer<typeof createGatePassSchema>;

export const updateGatePassSchema = createGatePassSchema.partial().extend({ version: versionSchema });
export type UpdateGatePassInput = z.infer<typeof updateGatePassSchema>;

// --- security incidents ------------------------------------------------------
export const securityIncidentsListQuerySchema = listQuery;
export type SecurityIncidentsListQuery = z.infer<typeof securityIncidentsListQuerySchema>;

export const createSecurityIncidentSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  description: text(2000),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
  location: text(160),
  occurredAt: ts,
  status: z.enum(['open', 'investigating', 'resolved']).default('open'),
});
export type CreateSecurityIncidentInput = z.infer<typeof createSecurityIncidentSchema>;

export const updateSecurityIncidentSchema = createSecurityIncidentSchema.partial().extend({ version: versionSchema });
export type UpdateSecurityIncidentInput = z.infer<typeof updateSecurityIncidentSchema>;

// --- emergency alerts --------------------------------------------------------
export const emergencyAlertsListQuerySchema = listQuery;
export type EmergencyAlertsListQuery = z.infer<typeof emergencyAlertsListQuerySchema>;

export const createEmergencyAlertSchema = z.object({
  title: z.string().trim().min(1, 'Required').max(200),
  message: text(2000),
  level: z.enum(['info', 'warning', 'critical']).default('info'),
  raisedAt: ts,
  status: z.enum(['active', 'resolved']).default('active'),
});
export type CreateEmergencyAlertInput = z.infer<typeof createEmergencyAlertSchema>;

export const updateEmergencyAlertSchema = createEmergencyAlertSchema.partial().extend({ version: versionSchema });
export type UpdateEmergencyAlertInput = z.infer<typeof updateEmergencyAlertSchema>;

// --- campus access logs ------------------------------------------------------
export const campusAccessLogsListQuerySchema = listQuery;
export type CampusAccessLogsListQuery = z.infer<typeof campusAccessLogsListQuerySchema>;

export const createCampusAccessLogSchema = z.object({
  subjectName: z.string().trim().min(1, 'Required').max(200),
  direction: z.enum(['in', 'out']).default('in'),
  gate: text(120),
  method: z.enum(['badge', 'manual']).default('badge'),
  occurredAt: ts,
  status: z.enum(['recorded', 'flagged']).default('recorded'),
});
export type CreateCampusAccessLogInput = z.infer<typeof createCampusAccessLogSchema>;

export const updateCampusAccessLogSchema = createCampusAccessLogSchema.partial().extend({ version: versionSchema });
export type UpdateCampusAccessLogInput = z.infer<typeof updateCampusAccessLogSchema>;
