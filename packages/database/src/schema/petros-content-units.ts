import type { ContentUnit } from '@edrion/schemas';
import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { petrosDocumentSourceRevisions } from './petros-document-learning';

export const petrosContentUnits = pgTable('petros_content_units', {
  id: uuid('id').primaryKey().defaultRandom(), institutionId: uuid('institution_id').notNull(),
  sourceRevisionId: uuid('source_revision_id').notNull(), parentId: uuid('parent_id').references((): AnyPgColumn => petrosContentUnits.id),
  ordinal: integer('ordinal').notNull(), kind: text('kind').notNull(),
  manifest: jsonb('manifest').$type<ContentUnit>().notNull(), contentHash: text('content_hash').notNull(),
  canonicalBody: text('canonical_body').notNull(), searchableText: text('searchable_text').notNull(),
  createdBy: uuid('created_by').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ sourceTenant: foreignKey({ columns: [t.sourceRevisionId, t.institutionId],
  foreignColumns: [petrosDocumentSourceRevisions.id, petrosDocumentSourceRevisions.institutionId] }),
  identityUq: uniqueIndex('petros_content_units_identity_uq').on(t.id, t.institutionId, t.sourceRevisionId),
  parentTenant: foreignKey({ columns: [t.parentId, t.institutionId, t.sourceRevisionId],
    foreignColumns: [t.id, t.institutionId, t.sourceRevisionId] }),
  ordinalUq: uniqueIndex('petros_content_units_ordinal_uq').on(t.sourceRevisionId, t.ordinal),
  sourceIdx: index('petros_content_units_source_idx').on(t.institutionId, t.sourceRevisionId, t.ordinal),
}));
