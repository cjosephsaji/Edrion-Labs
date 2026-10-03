import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { institutions } from './institutions';
import { classes, subjects } from './academics';
import { institutionUsers } from './users';
import { classMaterials } from './institutional-bridge';

/** Audit-bearing correction workflow. The source itself remains owned by classMaterials/knowledge. */
export const petrosMaterialCorrections = pgTable('petros_material_corrections', {
  id: uuid('id').primaryKey(), institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  materialId: uuid('material_id').notNull().references(() => classMaterials.id, { onDelete: 'cascade' }),
  proposedObjectId: uuid('proposed_object_id').notNull(), expectedMaterialVersion: integer('expected_material_version').notNull(),
  proposedBy: uuid('proposed_by').notNull().references(() => institutionUsers.id), reviewedBy: uuid('reviewed_by').references(() => institutionUsers.id),
  reason: text('reason').notNull(), reviewReason: text('review_reason'), meaningChanged: boolean('meaning_changed').notNull().default(false),
  requestHash: text('request_hash').notNull(),
  status: text('status').notNull().default('preview'), version: integer('version').notNull().default(1),
  preview: jsonb('preview').$type<Record<string, unknown>>().notNull(),
  publishedMaterialVersion: integer('published_material_version'), commandId: uuid('command_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (t) => ({ commandUniq: uniqueIndex('petros_material_correction_command_uniq').on(t.institutionId, t.commandId), ownerIdx: index('petros_material_correction_owner_idx').on(t.institutionId, t.materialId, t.createdAt) }));

/** Approval never invokes an external transport; assignment/audience owners consume approved rows later. */
export const petrosInstitutionalInterventions = pgTable('petros_institutional_interventions', {
  id: uuid('id').primaryKey(), institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => institutionUsers.id), approvedBy: uuid('approved_by').references(() => institutionUsers.id),
  title: text('title').notNull(), description: text('description').notNull(), conceptKey: text('concept_key').notNull(),
  assignmentId: uuid('assignment_id'), deliveryStatus: text('delivery_status').notNull().default('preview'),
  requestHash: text('request_hash').notNull(),
  status: text('status').notNull().default('preview'), version: integer('version').notNull().default(1),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), commandId: uuid('command_id').notNull(),
  audiencePreview: jsonb('audience_preview').$type<Record<string, unknown>>().notNull(),
  reason: text('reason').notNull().default(''), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp('approved_at', { withTimezone: true }), cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
}, (t) => ({ commandUniq: uniqueIndex('petros_intervention_command_uniq').on(t.institutionId, t.commandId), statusIdx: index('petros_intervention_status_idx').on(t.institutionId, t.status, t.expiresAt) }));
