import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull, schema, type Database } from '@edrion/database';
import {
  createExamBlueprintInputSchema,
  deriveBlueprintOrigin,
  examBlueprintSchema,
  updateExamBlueprintInputSchema,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalMockBlueprintsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(institutionId: string) {
    const rows = await this.db
      .select()
      .from(schema.examBlueprints)
      .where(
        and(
          eq(schema.examBlueprints.institutionId, institutionId),
          isNull(schema.examBlueprints.studentId),
          isNull(schema.examBlueprints.independentUserId),
        ),
      )
      .orderBy(desc(schema.examBlueprints.updatedAt))
      .limit(100);
    return { items: rows.map((r) => this.dto(r)) };
  }

  async create(ctx: PortalActionContext, body: unknown) {
    const parsed = createExamBlueprintInputSchema.parse(body);
    const skin = parsed.skin ?? parsed.blueprint.skin ?? 'standard';
    const gradingStyle = parsed.gradingStyle ?? parsed.blueprint.gradingStyle ?? 'auto';
    const [row] = await this.db
      .insert(schema.examBlueprints)
      .values({
        institutionId: ctx.principal.institutionId,
        studentId: null,
        independentUserId: null,
        sourceKind: parsed.blueprint.sourceKind,
        paperPatternId: parsed.blueprint.paperPatternId ?? null,
        blueprint: { ...parsed.blueprint, skin, gradingStyle } as unknown as Record<string, unknown>,
        skin,
        gradingStyle,
        examProfileKey: parsed.examProfileKey ?? parsed.blueprint.examProfileKey ?? null,
        isPublished: false,
      })
      .returning();
    return this.dto(row!);
  }

  async update(ctx: PortalActionContext, id: string, body: unknown) {
    const parsed = updateExamBlueprintInputSchema.parse(body);
    const row = await this.requireOwned(ctx.principal.institutionId, id);
    if (row.version !== parsed.version) {
      throw new ForbiddenException({ code: 'VERSION_CONFLICT', message: 'Blueprint was updated elsewhere.' });
    }
    const skin = parsed.skin ?? parsed.blueprint.skin ?? row.skin;
    const gradingStyle = parsed.gradingStyle ?? parsed.blueprint.gradingStyle ?? row.gradingStyle;
    const [updated] = await this.db
      .update(schema.examBlueprints)
      .set({
        blueprint: { ...parsed.blueprint, skin, gradingStyle } as unknown as Record<string, unknown>,
        sourceKind: parsed.blueprint.sourceKind,
        paperPatternId: parsed.blueprint.paperPatternId ?? null,
        skin,
        gradingStyle,
        examProfileKey:
          parsed.examProfileKey !== undefined
            ? parsed.examProfileKey
            : (parsed.blueprint.examProfileKey ?? row.examProfileKey),
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.examBlueprints.id, id))
      .returning();
    return this.dto(updated!);
  }

  async publish(ctx: PortalActionContext, id: string, publish: boolean) {
    const perms = ctx.principal.permissions;
    if (!perms.hasWildcard && !perms.keys.has('lab.blueprints.publish') && !perms.keys.has('academics.manage')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'lab.blueprints.publish required' });
    }
    await this.requireOwned(ctx.principal.institutionId, id);
    const [updated] = await this.db
      .update(schema.examBlueprints)
      .set({
        isPublished: publish,
        archivedAt: publish ? null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.examBlueprints.id, id))
      .returning();
    return this.dto(updated!);
  }

  async archive(ctx: PortalActionContext, id: string) {
    await this.requireOwned(ctx.principal.institutionId, id);
    const [updated] = await this.db
      .update(schema.examBlueprints)
      .set({
        archivedAt: new Date(),
        isPublished: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.examBlueprints.id, id))
      .returning();
    return this.dto(updated!);
  }

  private async requireOwned(institutionId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.examBlueprints)
      .where(
        and(
          eq(schema.examBlueprints.id, id),
          eq(schema.examBlueprints.institutionId, institutionId),
          isNull(schema.examBlueprints.studentId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Blueprint not found' });
    return row;
  }

  private dto(row: typeof schema.examBlueprints.$inferSelect) {
    return {
      id: row.id,
      blueprint: examBlueprintSchema.parse(row.blueprint),
      version: row.version,
      skin: row.skin,
      gradingStyle: row.gradingStyle,
      examProfileKey: row.examProfileKey,
      isPublished: row.isPublished,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      origin: deriveBlueprintOrigin({
        institutionId: row.institutionId,
        studentId: row.studentId,
        independentUserId: row.independentUserId,
      }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
