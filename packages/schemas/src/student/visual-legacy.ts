import { z } from 'zod';

/** @deprecated Migration-only — use Thinking Canvas schemas in ./visuals.ts */
export const legacyGraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().optional(),
  color: z.string().optional(),
  kind: z.enum(['process', 'decision', 'terminal', 'part']).optional(),
  shape: z.enum(['rect', 'ellipse']).optional(),
  x: z.number().min(0).max(100).optional(),
  y: z.number().min(0).max(100).optional(),
});

/** @deprecated Migration-only */
export const legacyGraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});

/** @deprecated Migration-only */
export const legacyGraphSpecSchema = z.object({
  layout: z.enum(['mind_map', 'flowchart', 'diagram']),
  center: z.object({ label: z.string() }).optional(),
  nodes: z.array(legacyGraphNodeSchema),
  edges: z.array(legacyGraphEdgeSchema),
});

/** @deprecated Migration-only */
export const legacyGenerateVisualSchema = z.object({
  topic: z.string().min(1).max(200),
  format: z.enum(['mind_map', 'flowchart', 'diagram']),
});

/** @deprecated Migration-only */
export const legacyRegenerateVisualSchema = z.object({
  spec: legacyGraphSpecSchema,
  direction: z.string().min(1).max(500),
});

/** @deprecated Migration-only */
export const legacySaveVisualSchema = z.object({
  spec: legacyGraphSpecSchema,
  title: z.string().min(1).max(200),
  topic: z.string().optional(),
});

export type LegacyGraphSpec = z.infer<typeof legacyGraphSpecSchema>;
export type LegacyGenerateVisualInput = z.infer<typeof legacyGenerateVisualSchema>;
