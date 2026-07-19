import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal RECIPIENT TARGETING (admin-redesign Phase 3). A target is a `(kind, refId)` pair
 * used by announcements/notifications (and saved recipient groups) to address any mix of individuals,
 * structures, derived rules, broadcasts and saved groups. Tenancy + scope are never taken from the
 * body. The API's RecipientResolver expands a target list to concrete people.
 */

/** Kinds whose target needs an anchor entity id (refId). */
export const TARGET_ENTITY_KINDS = [
  'student',
  'parent',
  'teacher',
  'staff',
  /** A portal login (institution_users row) — for staff-to-staff messaging. */
  'user',
  'class',
  'grade',
  'department',
  'campus',
  'parents_of_class',
  'parents_of_grade',
  'parents_of_department',
  'teachers_of_class',
  'teachers_of_grade',
  'teachers_of_department',
  'students_of_class',
  'students_of_grade',
  'students_of_department',
  'students_of_subject',
  'group',
] as const;

/** Broadcast kinds — no refId. */
export const TARGET_BROADCAST_KINDS = [
  'all',
  'all_students',
  'all_parents',
  'all_teachers',
  'all_staff',
  /** Every portal user who can use messaging in the current scope. */
  'all_colleagues',
] as const;

export const TARGET_KINDS = [...TARGET_ENTITY_KINDS, ...TARGET_BROADCAST_KINDS] as const;
export const targetKindSchema = z.enum(TARGET_KINDS);
export type TargetKind = (typeof TARGET_KINDS)[number];

const ENTITY_KINDS = new Set<string>(TARGET_ENTITY_KINDS);

/** A single recipient target. Entity kinds require a uuid refId; broadcast kinds must omit it. */
export const targetSchema = z
  .object({
    kind: targetKindSchema,
    refId: z.string().uuid().nullish(),
  })
  .superRefine((t, ctx) => {
    if (ENTITY_KINDS.has(t.kind) && !t.refId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Target "${t.kind}" needs a refId`, path: ['refId'] });
    }
  });
export type TargetInput = z.infer<typeof targetSchema>;

export const targetsSchema = z.array(targetSchema).max(500);

// --- recipient groups (saved/custom) -----------------------------------------

export const recipientGroupsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
});
export type RecipientGroupsListQuery = z.infer<typeof recipientGroupsListQuerySchema>;

export const createRecipientGroupSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(160),
  description: z.string().trim().max(1000).nullish(),
  members: targetsSchema.default([]),
});
export type CreateRecipientGroupInput = z.infer<typeof createRecipientGroupSchema>;

export const updateRecipientGroupSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullish(),
  members: targetsSchema.optional(),
  version: versionSchema,
});
export type UpdateRecipientGroupInput = z.infer<typeof updateRecipientGroupSchema>;

// --- preview -----------------------------------------------------------------

/** Resolve a target list to a recipient count + sample, without sending anything. */
export const previewRecipientsSchema = z.object({
  targets: targetsSchema,
});
export type PreviewRecipientsInput = z.infer<typeof previewRecipientsSchema>;
