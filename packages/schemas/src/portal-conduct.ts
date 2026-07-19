import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema, academicScopeQuerySchema } from './common';

/**
 * Institution-portal student conduct (behaviour incidents + complaints) request contracts. Reads need
 * `student_conduct.view`; writes the sensitive `student_conduct.manage`. Feeds the student profile.
 */
export const STUDENT_INCIDENT_CATEGORIES = ['behavior', 'discipline', 'complaint', 'property_damage', 'bullying', 'other'] as const;
export const STUDENT_INCIDENT_SEVERITIES = ['low', 'medium', 'high'] as const;
export const STUDENT_INCIDENT_STATUSES = ['open', 'resolved', 'dismissed'] as const;

export const conductListQuerySchema = paginationQuerySchema
  .merge(sortQuerySchema)
  .merge(academicScopeQuerySchema)
  .extend({
  search: z.string().trim().max(160).optional(),
  studentId: z.string().uuid().optional(),
  category: z.enum(STUDENT_INCIDENT_CATEGORIES).optional(),
  severity: z.enum(STUDENT_INCIDENT_SEVERITIES).optional(),
  status: z.enum(STUDENT_INCIDENT_STATUSES).optional(),
});
export type ConductListQuery = z.infer<typeof conductListQuerySchema>;

export const createStudentIncidentSchema = z.object({
  studentId: z.string().uuid(),
  category: z.enum(STUDENT_INCIDENT_CATEGORIES).default('behavior'),
  title: z.string().trim().min(1, 'Required').max(200),
  description: z.string().trim().max(4000).nullish(),
  severity: z.enum(STUDENT_INCIDENT_SEVERITIES).default('medium'),
  status: z.enum(STUDENT_INCIDENT_STATUSES).default('open'),
  occurredOn: z.string().trim().max(20).nullish(),
  reporterName: z.string().trim().max(160).nullish(),
  notifyGuardians: z.coerce.boolean().default(false),
  resolutionNote: z.string().trim().max(4000).nullish(),
});
export type CreateStudentIncidentInput = z.infer<typeof createStudentIncidentSchema>;

export const updateStudentIncidentSchema = createStudentIncidentSchema.omit({ studentId: true }).partial().extend({
  version: versionSchema,
});
export type UpdateStudentIncidentInput = z.infer<typeof updateStudentIncidentSchema>;
