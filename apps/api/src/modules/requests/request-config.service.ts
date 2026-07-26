import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import type {
  RequestTypeConfigCreateInput,
  RequestTypeConfigListQuery,
  RequestTypeConfigUpdateInput,
} from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { PortalCrudEngine, type CrudConfig } from '../portal/portal-crud.engine';
import { resourceConfig } from '../portal/portal-resource.service';
import type { PortalActionContext } from '../portal/portal-action-context';
import { RequestRegistryService } from './request-registry.service';

@Injectable()
export class RequestConfigService {
  private readonly config: CrudConfig = resourceConfig(schema.institutionRequestTypeConfig, {
    module: 'request-engine',
    entityType: 'institution_request_type_config',
    actionPrefix: 'request_type_config',
    scope: 'institution',
    search: [
      schema.institutionRequestTypeConfig.typeKey,
      schema.institutionRequestTypeConfig.labelOverride,
      schema.institutionRequestTypeConfig.routingRoleOverride,
    ],
    sortable: {
      typeKey: schema.institutionRequestTypeConfig.typeKey,
      createdAt: schema.institutionRequestTypeConfig.createdAt,
    },
    snapshot: (row) => ({
      typeKey: row.typeKey,
      enabled: row.enabled,
      routingRoleOverride: row.routingRoleOverride,
      slaDaysOverride: row.slaDaysOverride,
      labelOverride: row.labelOverride,
    }),
  });

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly crud: PortalCrudEngine,
    private readonly registry: RequestRegistryService,
  ) {}

  async list(ctx: PortalActionContext, query: RequestTypeConfigListQuery) {
    const [baseTypes, overrides] = await Promise.all([
      this.registry.list(ctx.principal.institutionId),
      this.crud.list(this.config, ctx, query),
    ]);
    return { baseTypes, overrides };
  }

  async create(ctx: PortalActionContext, input: RequestTypeConfigCreateInput) {
    await this.registry.resolve(ctx.principal.institutionId, input.typeKey);
    const [existing] = await this.db
      .select({ id: schema.institutionRequestTypeConfig.id })
      .from(schema.institutionRequestTypeConfig)
      .where(
        and(
          eq(schema.institutionRequestTypeConfig.institutionId, ctx.principal.institutionId),
          eq(schema.institutionRequestTypeConfig.typeKey, input.typeKey),
        ),
      )
      .limit(1);
    if (existing) {
      throw new ConflictException({ code: 'REQUEST_TYPE_CONFIG_EXISTS', message: 'An override already exists for this request type.' });
    }
    return this.crud.create(this.config, ctx, input);
  }

  update(ctx: PortalActionContext, id: string, input: RequestTypeConfigUpdateInput) {
    const { version, ...patch } = input;
    return this.crud.update(this.config, ctx, id, version, patch);
  }

  remove(ctx: PortalActionContext, id: string, version: number) {
    return this.crud.remove(this.config, ctx, id, version);
  }
}
