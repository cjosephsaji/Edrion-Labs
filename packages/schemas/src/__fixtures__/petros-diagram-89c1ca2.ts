// Frozen actual HEAD (89c1ca2) diagram reader for S7 wire compatibility. Test-only.
import { z } from 'zod';
export const PETROS_RENDER_SCHEMA_VERSION = 'petros.render.v2';
const renderCommon = {
  schemaVersion: z.literal(PETROS_RENDER_SCHEMA_VERSION),
  title: z.string().trim().min(3).max(180),
};

export const previousPetrosDiagramSchema = z
  .object({
    ...renderCommon,
    type: z.literal('diagram'),
    diagramType: z.enum(['concept_map', 'flowchart', 'timeline', 'comparison']),
    nodes: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(240),
            description: z.string().max(600),
          })
          .strict(),
      )
      .min(2)
      .max(20),
    edges: z
      .array(
        z
          .object({
            from: z.string().min(1).max(80),
            to: z.string().min(1).max(80),
            label: z.string().max(160),
          })
          .strict(),
      )
      .max(30),
    altText: z.string().trim().min(12).max(1_200),
    editable: z.literal(true),
    fallbackText: z.string().trim().min(12).max(1_500),
  })
  .strict();
