import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import {
  getRequestTypeConfig,
  REQUEST_TYPE_REGISTRY,
  type RequestTypeConfig,
} from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

export interface ResolvedRequestType {
  config: RequestTypeConfig;
  enabled: boolean;
  label: string;
  routing: RequestTypeConfig['routing'];
  slaDays: number;
}

@Injectable()
export class RequestRegistryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(institutionId: string, key: string): Promise<ResolvedRequestType> {
    const config = getRequestTypeConfig(key);
    if (!config) {
      throw new NotFoundException({ code: 'UNKNOWN_REQUEST_TYPE', message: 'Request type not found.' });
    }
    const [override] = await this.db
      .select()
      .from(schema.institutionRequestTypeConfig)
      .where(
        and(
          eq(schema.institutionRequestTypeConfig.institutionId, institutionId),
          eq(schema.institutionRequestTypeConfig.typeKey, key),
        ),
      )
      .limit(1);

    return {
      config,
      enabled: override?.enabled ?? true,
      label: override?.labelOverride?.trim() || config.label,
      routing: override?.routingRoleOverride
        ? { role: override.routingRoleOverride }
        : config.routing,
      slaDays: override?.slaDaysOverride ?? config.slaDays,
    };
  }

  async requireEnabled(institutionId: string, key: string): Promise<ResolvedRequestType> {
    const resolved = await this.resolve(institutionId, key);
    if (!resolved.enabled) {
      throw new ForbiddenException({
        code: 'TYPE_DISABLED',
        message: 'Your institution has turned this request type off.',
      });
    }
    return resolved;
  }

  async list(institutionId: string) {
    return Promise.all(
      Object.keys(REQUEST_TYPE_REGISTRY).map(async (key) => {
        const resolved = await this.resolve(institutionId, key);
        return {
          key,
          label: resolved.label,
          category: resolved.config.category,
          entrySurface: resolved.config.entrySurface ?? null,
          payloadSchemaVersion: resolved.config.payloadSchemaVersion,
          slaDays: resolved.slaDays,
          enabled: resolved.enabled,
          producesDocument: resolved.config.producesDocument,
          bulkApprovable: resolved.config.bulkApprovable,
        };
      }),
    );
  }
}
