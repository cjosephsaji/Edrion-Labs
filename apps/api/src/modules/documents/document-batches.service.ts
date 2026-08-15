import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createDocumentBatchSchema, reportCardReissueSchema, computeSchemeTermAggregate, presetSnapshot } from '@edrion/schemas';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from '../portal/portal-action-context';

function campusIdFromScope(scope: PortalActionContext['scope']): string | null {
  return scope.mode === 'campus' ? scope.campusId : null;
}

@Injectable()
export class DocumentBatchesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(ctx: PortalActionContext, body: unknown) {
    const input = createDocumentBatchSchema.parse(body);
    const [batch] = await this.db
      .insert(schema.documentBatches)
      .values({
        institutionId: ctx.principal.institutionId,
        campusId: input.campusId ?? campusIdFromScope(ctx.scope),
        kind: input.kind,
        templateId: input.templateId ?? null,
        scope: input.scope,
        status: 'draft',
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    if (input.kind === 'report_card') {
      await this.db.insert(schema.reportCardReviews).values({
        batchId: batch!.id,
        sectionId: 'class_teacher',
        status: 'pending',
      });
    }
    return batch!;
  }

  async get(ctx: PortalActionContext, batchId: string) {
    const [batch] = await this.db
      .select()
      .from(schema.documentBatches)
      .where(
        and(
          eq(schema.documentBatches.id, batchId),
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    if (!batch) throw new NotFoundException();
    const items = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(eq(schema.documentBatchItems.batchId, batchId));
    const reviews =
      batch.kind === 'report_card'
        ? await this.db
            .select()
            .from(schema.reportCardReviews)
            .where(eq(schema.reportCardReviews.batchId, batchId))
        : [];
    return { batch, items, reviews };
  }

  async lockForGeneration(ctx: PortalActionContext, batchId: string) {
    const [batch] = await this.db
      .update(schema.documentBatches)
      .set({ status: 'generating', lockedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.documentBatches.id, batchId),
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
          eq(schema.documentBatches.status, 'draft'),
        ),
      )
      .returning();
    if (!batch) throw new NotFoundException();
    return batch;
  }

  async reissueReportCard(ctx: PortalActionContext, body: unknown) {
    const input = reportCardReissueSchema.parse(body);
    const rows = await this.db
      .select({ item: schema.documentBatchItems, batch: schema.documentBatches })
      .from(schema.documentBatchItems)
      .innerJoin(schema.documentBatches, eq(schema.documentBatches.id, schema.documentBatchItems.batchId))
      .where(
        and(
          eq(schema.documentBatchItems.id, input.batchItemId),
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row?.item.vaultDocumentId) throw new NotFoundException({ code: 'NO_VAULT' });
    return { ok: true, batchItemId: row.item.id, vaultId: row.item.vaultDocumentId, reason: input.reason };
  }

  previewTermAggregate(
    standings: Array<{
      weighted_pct: number;
      grade_points: number | null;
      is_pass: boolean;
      credits: number | null;
      open_weight_pct: number;
    }>,
  ) {
    return computeSchemeTermAggregate(presetSnapshot('points_10'), standings);
  }
}
