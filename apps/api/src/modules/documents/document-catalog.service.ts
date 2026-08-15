import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { and, eq, schema, type Database } from '@edrion/database';
import { documentFamilySchema } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from '../portal/portal-action-context';

const catalogUpsertSchema = z.object({
  subtypeKey: z.string().trim().min(1).max(120),
  family: documentFamilySchema,
  docType: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().optional(),
  deliveryModes: z.array(z.string()).optional(),
  templateId: z.string().uuid().nullable().optional(),
  feeAmountMinor: z.number().int().min(0).optional(),
  requiresPayment: z.boolean().optional(),
});

const DEFAULT_SUBTYPES = [
  { subtypeKey: 'bonafide', docType: 'bonafide', title: 'Bonafide Certificate', family: 'certificate' },
  { subtypeKey: 'transcript', docType: 'transcript', title: 'Transcript', family: 'certificate' },
  { subtypeKey: 'migration', docType: 'migration', title: 'Migration Certificate', family: 'certificate' },
  { subtypeKey: 'conduct', docType: 'conduct', title: 'Conduct Certificate', family: 'certificate' },
] as const;

/**
 * Institution document_catalog — zero-deploy subtypes for the single document_request type.
 * Fee/template/routing resolved here; Zod package never DB-looks up.
 */
@Injectable()
export class DocumentCatalogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async ensureDefaults(institutionId: string) {
    for (const row of DEFAULT_SUBTYPES) {
      await this.db
        .insert(schema.documentCatalog)
        .values({
          institutionId,
          subtypeKey: row.subtypeKey,
          family: row.family,
          docType: row.docType,
          title: row.title,
          active: true,
          deliveryModes: ['digital'],
          feeAmountMinor: 0,
          requiresPayment: false,
        })
        .onConflictDoNothing();
    }
  }

  async listActive(institutionId: string) {
    await this.ensureDefaults(institutionId);
    return this.db
      .select()
      .from(schema.documentCatalog)
      .where(
        and(
          eq(schema.documentCatalog.institutionId, institutionId),
          eq(schema.documentCatalog.active, true),
        ),
      );
  }

  /** Full catalog (active + inactive) for the settings UI. */
  async listForInstitution(ctx: PortalActionContext) {
    const institutionId = ctx.principal.institutionId;
    await this.ensureDefaults(institutionId);
    return this.db
      .select()
      .from(schema.documentCatalog)
      .where(eq(schema.documentCatalog.institutionId, institutionId));
  }

  /** Create or update a catalog entry keyed by (institution, subtypeKey). */
  async upsertEntry(ctx: PortalActionContext, body: unknown) {
    const input = catalogUpsertSchema.parse(body);
    const institutionId = ctx.principal.institutionId;
    const [row] = await this.db
      .insert(schema.documentCatalog)
      .values({
        institutionId,
        subtypeKey: input.subtypeKey,
        family: input.family,
        docType: input.docType,
        title: input.title,
        description: input.description ?? null,
        active: input.active ?? true,
        deliveryModes: input.deliveryModes ?? ['digital'],
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
          description: input.description ?? null,
          active: input.active ?? true,
          deliveryModes: input.deliveryModes ?? ['digital'],
          templateId: input.templateId ?? null,
          feeAmountMinor: input.feeAmountMinor ?? 0,
          requiresPayment: input.requiresPayment ?? false,
        },
      })
      .returning();
    return row;
  }

  async resolve(institutionId: string, subtypeKey: string) {
    await this.ensureDefaults(institutionId);
    const [row] = await this.db
      .select()
      .from(schema.documentCatalog)
      .where(
        and(
          eq(schema.documentCatalog.institutionId, institutionId),
          eq(schema.documentCatalog.subtypeKey, subtypeKey),
          eq(schema.documentCatalog.active, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
