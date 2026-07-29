import { z } from 'zod';

export const DOCUMENT_FAMILIES = [
  'certificate',
  'receipt',
  'hall_ticket',
  'id_card',
  'report_card',
  'individual_report',
] as const;
export type DocumentFamily = (typeof DOCUMENT_FAMILIES)[number];
export const documentFamilySchema = z.enum(DOCUMENT_FAMILIES);

export const DOCUMENT_SOURCES = ['request', 'batch', 'manual_upload', 'system'] as const;
export const documentSourceSchema = z.enum(DOCUMENT_SOURCES);

export const RENDER_PURPOSES = ['issuance', 'preview', 'batch', 'reissue', 'signature'] as const;
export const renderPurposeSchema = z.enum(RENDER_PURPOSES);

export const BATCH_KINDS = ['hall_ticket', 'id_card', 'report_card', 'manual_upload'] as const;
export const batchKindSchema = z.enum(BATCH_KINDS);

export const BATCH_STATUSES = [
  'draft',
  'generating',
  'review',
  'signing',
  'delivering',
  'completed',
  'completed_with_errors',
  'cancelled',
] as const;
export const batchStatusSchema = z.enum(BATCH_STATUSES);

export const BATCH_ITEM_STATUSES = [
  'pending',
  'rendering',
  'rendered',
  'failed',
  'excluded',
  'delivered',
] as const;
export const batchItemStatusSchema = z.enum(BATCH_ITEM_STATUSES);

/** Map legacy doc_type values onto catalog families. */
export function familyFromDocType(docType: string): DocumentFamily {
  switch (docType) {
    case 'receipt':
      return 'receipt';
    case 'hall_ticket':
      return 'hall_ticket';
    case 'id_card':
      return 'id_card';
    case 'report':
    case 'report_card':
      return 'report_card';
    case 'individual_report':
      return 'individual_report';
    default:
      return 'certificate';
  }
}
