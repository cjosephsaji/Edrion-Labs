import { z } from 'zod';

export const debatePrepBlockSchema = z.object({
  key: z.enum(['claim', 'mechanism', 'example', 'impact', 'comparative', 'free']),
  text: z.string().max(4000).default(''),
});

export const debatePrepNotesSchema = z.object({
  blocks: z.array(debatePrepBlockSchema).default([]),
  scaffoldTemplateKey: z.string().max(64).nullable().optional(),
  version: z.number().int().positive(),
});

export const debatePrepNotesPutSchema = z.object({
  blocks: z.array(debatePrepBlockSchema).min(1).max(12),
  version: z.number().int().positive(),
  scaffoldTemplateKey: z.string().max(64).nullable().optional(),
});

export const debatePrepAssistSchema = z.object({
  prompt: z.string().min(3).max(500),
});

export type DebatePrepNotesInput = z.infer<typeof debatePrepNotesPutSchema>;
