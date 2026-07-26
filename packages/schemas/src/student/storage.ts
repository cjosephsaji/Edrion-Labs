import { z } from 'zod';

export const storageObjectSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  filename: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  processingStatus: z.enum(['uploaded', 'processing', 'ready', 'failed']),
  derived: z.record(z.unknown()),
  createdAt: z.string(),
});

export type StorageObjectDto = z.infer<typeof storageObjectSchema>;
