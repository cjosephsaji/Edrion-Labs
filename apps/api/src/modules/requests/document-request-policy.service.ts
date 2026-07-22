import { BadRequestException, Injectable } from '@nestjs/common';
import type { DocumentRequestPayload } from '@edrion/schemas';
import { DocumentCatalogService } from '../documents/document-catalog.service';
import type { ResolvedRequestType } from './request-registry.service';

/**
 * Resolves document_catalog rows for the single document_request type.
 * Keeps Zod package free of DB lookups while preserving fee draft+invoice flow.
 */
@Injectable()
export class DocumentRequestPolicyService {
  constructor(private readonly catalog: DocumentCatalogService) {}

  async applyToResolved(
    institutionId: string,
    payload: DocumentRequestPayload,
    resolved: ResolvedRequestType,
  ): Promise<ResolvedRequestType> {
    const entry = await this.resolveEntry(institutionId, payload);
    const routing = entry.slaRoutingConfig as { slaDays?: number } | null;
    return {
      ...resolved,
      slaDays: typeof routing?.slaDays === 'number' ? routing.slaDays : resolved.slaDays,
      config: {
        ...resolved.config,
        requiresPayment: entry.requiresPayment,
        feeLine: entry.requiresPayment
          ? {
              label: entry.title,
              amountMinor: entry.feeAmountMinor,
              category: 'other' as const,
            }
          : undefined,
      },
    };
  }

  async resolveEntry(institutionId: string, payload: DocumentRequestPayload) {
    const subtypeKey = payload.subtypeKey ?? payload.doc_type;
    const entry = await this.catalog.resolve(institutionId, subtypeKey);
    if (!entry) {
      throw new BadRequestException({
        code: 'DOCUMENT_TYPE_UNAVAILABLE',
        message: 'This document type is not available for your institution.',
      });
    }
    const deliveryMode = payload.deliveryMode ?? 'digital';
    const modes = (entry.deliveryModes as string[] | null) ?? ['digital'];
    if (!modes.includes(deliveryMode)) {
      throw new BadRequestException({
        code: 'DELIVERY_MODE_UNAVAILABLE',
        message: 'This delivery mode is not available for this document.',
      });
    }
    return entry;
  }
}
