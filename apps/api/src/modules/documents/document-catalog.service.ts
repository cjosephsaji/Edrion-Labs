import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

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
