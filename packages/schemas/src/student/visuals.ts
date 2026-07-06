import { z } from 'zod';

export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().optional(),
  color: z.string().optional(),
  kind: z.enum(['process', 'decision', 'terminal']).optional(),
});

export const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});

export const graphSpecSchema = z.object({
  layout: z.enum(['mind_map', 'flowchart']),
  center: z.object({ label: z.string() }).optional(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export const generateVisualSchema = z.object({
  topic: z.string().min(1).max(200),
  format: z.enum(['mind_map', 'flowchart', 'diagram']),
});

export const regenerateVisualSchema = z.object({
  spec: graphSpecSchema,
  direction: z.string().min(1).max(500),
});

export const saveVisualSchema = z.object({
  spec: graphSpecSchema,
  title: z.string().min(1).max(200),
  topic: z.string().optional(),
});

export type GraphSpec = z.infer<typeof graphSpecSchema>;
export type GenerateVisualInput = z.infer<typeof generateVisualSchema>;
