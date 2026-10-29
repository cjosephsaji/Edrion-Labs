import type { ConceptVersionPayload } from '@edrion/schemas';
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { institutions } from './institutions';
import { courses } from './institutional-bridge';
import { institutionUsers } from './users';

export const petrosConcepts = pgTable('petros_concepts', {
  id: uuid('id').primaryKey().defaultRandom(), institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  courseId: uuid('course_id'), createdBy: uuid('created_by').notNull().references(() => institutionUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ tenantUq: uniqueIndex('petros_concepts_tenant_uq').on(t.id, t.institutionId),
  courseTenant: foreignKey({ columns: [t.courseId, t.institutionId], foreignColumns: [courses.id, courses.institutionId] }),
  tenantIdx: index('petros_concepts_namespace_idx').on(t.institutionId, t.courseId),
}));
export const petrosConceptVersions = pgTable('petros_concept_versions', {
  conceptId: uuid('concept_id').notNull(), institutionId: uuid('institution_id').notNull(), version: integer('version').notNull(),
  payload: jsonb('payload').$type<ConceptVersionPayload>().notNull(),
  contentHash: text('content_hash').notNull(), canonicalBody: text('canonical_body').notNull(),
  createdBy: uuid('created_by').notNull().references(() => institutionUsers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ identity: primaryKey({ columns: [t.conceptId, t.version] }),
  tenantUq: uniqueIndex('petros_concept_versions_tenant_uq').on(t.conceptId, t.version, t.institutionId),
  conceptTenant: foreignKey({ columns: [t.conceptId, t.institutionId], foreignColumns: [petrosConcepts.id, petrosConcepts.institutionId] }),
}));
