import { z } from 'zod';
import { versionSchema } from '../common';
import { documentFamilySchema } from './catalog';

export const MERGE_RESOLVER_VERSION = 1 as const;

export const signatureSlotSchema = z.object({
  slotKey: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  mode: z.enum(['image_stamp', 'sign_step']),
  assetRef: z.string().max(500).optional(),
  signRole: z.string().max(120).optional(),
  order: z.number().int().min(0).max(20),
});
export type SignatureSlot = z.infer<typeof signatureSlotSchema>;

export const letterheadSchema = z.object({
  logoAssetRef: z.string().max(500).optional(),
  name: z.string().max(200).optional(),
  addressLines: z.array(z.string().max(200)).max(6).default([]),
  affiliationLine: z.string().max(200).optional(),
});

export const verificationBlockSchema = z.object({
  enabled: z.literal(true).default(true),
  position: z.enum(['bottom_left', 'bottom_right']).default('bottom_right'),
});

export const reportOptionsSchema = z
  .object({
    showClassAverage: z.boolean().default(false),
    showRank: z.boolean().default(false),
    coScholasticEnabled: z.boolean().default(false),
    attendanceBlock: z.boolean().default(true),
    remarksSource: z.enum(['class_teacher', 'none']).default('class_teacher'),
  })
  .partial();

/** Versioned header_config — additive over legacy exam-paper keys. */
export const documentHeaderConfigSchema = z
  .object({
    logoPosition: z.enum(['left', 'center', 'right', 'none']).optional(),
    showInstitutionName: z.boolean().optional(),
    subtitle: z.string().max(200).nullish(),
    letterhead: letterheadSchema.optional(),
    verificationBlock: verificationBlockSchema.optional(),
    signatureSlots: z.array(signatureSlotSchema).max(8).optional(),
    reportOptions: reportOptionsSchema.optional(),
    showDate: z.boolean().optional(),
    showTime: z.boolean().optional(),
    showDuration: z.boolean().optional(),
    showExaminer: z.boolean().optional(),
    showMaxMarks: z.boolean().optional(),
    showRollNumberBoxes: z.boolean().optional(),
    rollNumberBoxCount: z.number().int().min(0).max(16).optional(),
    instructions: z.string().max(4000).nullish(),
    labels: z.record(z.string(), z.string().max(80)).optional(),
  })
  .passthrough();
export type DocumentHeaderConfig = z.infer<typeof documentHeaderConfigSchema>;

export const fieldsSchemaDeclarationSchema = z.record(
  z.string(),
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'date', 'block', 'image']).default('string'),
    required: z.boolean().default(false),
    label: z.string().max(120).optional(),
  }),
);

export const upsertDocumentTemplateSchema = z.object({
  docType: z.string().min(1).max(64),
  family: documentFamilySchema.optional(),
  name: z.string().trim().min(1).max(160),
  html: z.string().min(1).max(200_000),
  css: z.string().max(100_000).default(''),
  fieldsSchema: fieldsSchemaDeclarationSchema.default({}),
  headerConfig: documentHeaderConfigSchema.default({}),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  requiresSignOff: z.boolean().default(false),
  platformTemplateKey: z.string().max(120).optional(),
  version: versionSchema.optional(),
});
export type UpsertDocumentTemplateInput = z.infer<typeof upsertDocumentTemplateSchema>;

export const previewTemplateSchema = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
});
