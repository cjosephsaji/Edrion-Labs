import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import { SCHEME_PRESETS, type GradingSchemeUpsertInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';

@Injectable()
export class GradingSchemesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(ctx: PortalActionContext) {
    return this.db
      .select()
      .from(schema.gradingSchemes)
      .where(eq(schema.gradingSchemes.institutionId, ctx.principal.institutionId))
      .orderBy(desc(schema.gradingSchemes.isDefault), desc(schema.gradingSchemes.updatedAt));
  }

  async presets() {
    return Object.entries(SCHEME_PRESETS).map(([key, preset]) => ({ key, ...preset }));
  }

  async createFromPreset(ctx: PortalActionContext, kind: keyof typeof SCHEME_PRESETS) {
    const preset = SCHEME_PRESETS[kind];
    if (!preset) throw new BadRequestException({ code: 'INVALID_PRESET', message: 'Unknown preset.' });
    const [row] = await this.db
      .insert(schema.gradingSchemes)
      .values({
        institutionId: ctx.principal.institutionId,
        name: preset.name,
        kind: preset.kind,
        bands: preset.bands,
        gpaFormula: preset.gpa_formula,
        isDefault: false,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    return row;
  }

  async upsert(ctx: PortalActionContext, id: string | null, input: GradingSchemeUpsertInput) {
    if (input.bands.length < 1) {
      throw new BadRequestException({ code: 'INVALID_BANDS', message: 'At least one grade band is required.' });
    }

    if (!id) {
      const [created] = await this.db
        .insert(schema.gradingSchemes)
        .values({
          institutionId: ctx.principal.institutionId,
          name: input.name,
          kind: input.kind,
          bands: input.bands,
          gpaFormula: input.gpa_formula,
          isDefault: input.is_default ?? false,
          createdBy: ctx.principal.institutionUserId,
        })
        .returning();
      await this.snapshotVersion(ctx, created!);
      return created;
    }

    const [existing] = await this.db
      .select()
      .from(schema.gradingSchemes)
      .where(and(eq(schema.gradingSchemes.id, id), eq(schema.gradingSchemes.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!existing) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Scheme not found.' });

    const [updated] = await this.db
      .update(schema.gradingSchemes)
      .set({
        name: input.name,
        kind: input.kind,
        bands: input.bands,
        gpaFormula: input.gpa_formula,
        isDefault: input.is_default ?? existing.isDefault,
        version: existing.version + 1,
        updatedAt: new Date(),
        updatedBy: ctx.principal.institutionUserId,
      })
      .where(and(eq(schema.gradingSchemes.id, id), eq(schema.gradingSchemes.version, input.version ?? existing.version)))
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Scheme was updated elsewhere.' });
    await this.snapshotVersion(ctx, updated);
    return updated;
  }

  private async snapshotVersion(ctx: PortalActionContext, scheme: typeof schema.gradingSchemes.$inferSelect) {
    await this.db.insert(schema.gradingSchemeVersions).values({
      institutionId: ctx.principal.institutionId,
      schemeId: scheme.id,
      version: scheme.version,
      snapshot: {
        kind: scheme.kind,
        bands: scheme.bands,
        gpa_formula: scheme.gpaFormula,
        name: scheme.name,
      },
      createdBy: ctx.principal.institutionUserId,
    });
  }
}
