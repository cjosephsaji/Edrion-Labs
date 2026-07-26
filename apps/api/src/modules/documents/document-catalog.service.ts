import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { documentCatalogEntrySchema } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from '../portal/portal-action-context';

@Injectable()
export class DocumentCatalogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listForInstitution(ctx: PortalActionContext) {
    const rows = await this.db
      .select()
      .from(schema.documentCatalog)
      .where(
        and(
          eq(schema.documentCatalog.institutionId, ctx.principal.institutionId),
          eq(schema.documentCatalog.active, true),
        ),
      );
    return rows.map((row) =>
      documentCatalogEntrySchema.parse({
        id: row.id,
        institution_id: row.institutionId,
        subtype_key: row.subtypeKey,
        family: row.family,
        doc_type: row.docType,
        title: row.title,
        description: row.description,
        active: row.active,
        fee_amount_minor: row.feeAmountMinor,
        requires_payment: row.requiresPayment,
      }),
    );
  }

  async upsertEntry(
    ctx: PortalActionContext,
    input: {
      subtypeKey: string;
      family: string;
      docType: string;
      title: string;
      templateId?: string;
      feeAmountMinor?: number;
      requiresPayment?: boolean;
    },
  ) {
    const [row] = await this.db
      .insert(schema.documentCatalog)
      .values({
        institutionId: ctx.principal.institutionId,
        subtypeKey: input.subtypeKey,
        family: input.family,
        docType: input.docType,
        title: input.title,
        templateId: input.templateId ?? null,
        feeAmountMinor: input.feeAmountMinor ?? 0,
        requiresPayment: input.requiresPayment ?? false,
      })
      .onConflictDoUpdate({
        target: [schema.documentCatalog.institutionId, schema.documentCatalog.subtypeKey],
        set: {
          family: input.family,
          docType: input.docType,
          title: input.title,
          templateId: input.templateId ?? null,
          feeAmountMinor: input.feeAmountMinor ?? 0,
          requiresPayment: input.requiresPayment ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row!;
  }

  async getById(ctx: PortalActionContext, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.documentCatalog)
      .where(and(eq(schema.documentCatalog.id, id), eq(schema.documentCatalog.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException();
    return row;
  }
}
