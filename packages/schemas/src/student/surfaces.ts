import { z } from 'zod';

export const feeInvoiceSchema = z.object({
  invoiceNo: z.string(),
  label: z.string(),
  amountMinor: z.number().int(),
  paidMinor: z.number().int(),
  status: z.string(),
  dueDate: z.string().nullable(),
});

export const feesSurfaceSchema = z.object({
  currency: z.string(),
  invoices: z.array(feeInvoiceSchema),
});

export const transportSurfaceSchema = z.object({
  routeName: z.string().nullable(),
  stopName: z.string().nullable(),
  vehicleRegistration: z.string().nullable(),
  driverName: z.string().nullable(),
  driverPhone: z.string().nullable(),
});

export const hostelSurfaceSchema = z.object({
  blockName: z.string().nullable(),
  roomNo: z.string().nullable(),
  warden: z.string().nullable(),
});

export const documentSurfaceItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  url: z.string(),
});

export const documentsSurfaceSchema = z.object({
  items: z.array(documentSurfaceItemSchema),
});

export const contentPageListItemSchema = z.object({
  key: z.string(),
  title: z.string(),
});

export const contentPageDetailSchema = z.object({
  key: z.string(),
  title: z.string(),
  bodyRichtext: z.array(z.unknown()),
  attachmentIds: z.array(z.string().uuid()),
});

export const governanceDefaultSchema = z.object({
  homeworkDefaultPolicy: z.enum(['off', 'hints_only', 'full']),
});

export type FeesSurfaceDto = z.infer<typeof feesSurfaceSchema>;
export type TransportSurfaceDto = z.infer<typeof transportSurfaceSchema>;
export type HostelSurfaceDto = z.infer<typeof hostelSurfaceSchema>;
export type DocumentsSurfaceDto = z.infer<typeof documentsSurfaceSchema>;
export type DocumentSurfaceItemDto = z.infer<typeof documentSurfaceItemSchema>;
export type ContentPageListItemDto = z.infer<typeof contentPageListItemSchema>;
export type ContentPageDetailDto = z.infer<typeof contentPageDetailSchema>;
export type GovernanceDefaultDto = z.infer<typeof governanceDefaultSchema>;
