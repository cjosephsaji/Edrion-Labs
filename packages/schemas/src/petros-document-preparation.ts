import { z } from 'zod';
import {
  PETROS_DOCUMENT_MAX_PAGES,
  PETROS_DOCUMENT_MAX_TEXT_CHARS,
} from './petros-document-source';

export const petrosPreparationJobSchema = z
  .object({ id: z.string().uuid(), institutionId: z.string().uuid() })
  .strict();

export const PETROS_PDF_EXTRACTOR_VERSION = 'pdfjs-4.10.38-text-v1';
export const petrosPreparationStatusSchema = z
  .object({
    id: z.string().uuid(),
    materialId: z.string().uuid(),
    materialVersion: z.number().int().positive(),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    version: z.number().int().positive(),
    attempts: z.number().int().nonnegative(),
    pagesDone: z.number().int().min(0).max(PETROS_DOCUMENT_MAX_PAGES),
    errorCode: z.string().max(80).nullable(),
    retryable: z.boolean(),
    workerEnabled: z.boolean(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PetrosPreparationStatus = z.infer<typeof petrosPreparationStatusSchema>;
export const petrosPreparationCommandSchema = z
  .object({
    version: z.number().int().positive(),
  })
  .strict();
export type PetrosPreparationCommand = z.infer<typeof petrosPreparationCommandSchema>;

/** Child-process protocol. Validate again before committing any source text. */
export const petrosPdfWorkerResultSchema = z
  .object({
    pages: z
      .array(z.string().max(PETROS_DOCUMENT_MAX_TEXT_CHARS))
      .min(1)
      .max(PETROS_DOCUMENT_MAX_PAGES),
    fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.pages.reduce((sum, text) => sum + text.length, 0) > PETROS_DOCUMENT_MAX_TEXT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Extracted text exceeds the safety limit',
      });
    }
  });
export type PetrosPdfWorkerResult = z.infer<typeof petrosPdfWorkerResultSchema>;
