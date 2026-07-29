import { z } from 'zod';

/** Declarative SVG element spec — whitelisted types only (no raw SVG strings). */
export const svgElementSchema: z.ZodType<SvgElement> = z.lazy(() =>
  z.object({
    type: z.enum(['rect', 'circle', 'line', 'path', 'text', 'group']),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    cx: z.number().optional(),
    cy: z.number().optional(),
    r: z.number().optional(),
    x1: z.number().optional(),
    y1: z.number().optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    d: z.string().optional(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    fontSize: z.number().optional(),
    text: z.string().optional(),
    transform: z.string().optional(),
    children: z.array(svgElementSchema).optional(),
  }),
);

export type SvgElement = {
  type: 'rect' | 'circle' | 'line' | 'path' | 'text' | 'group';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  d?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  text?: string;
  transform?: string;
  children?: SvgElement[];
};

export const svgSpecSchema = z.object({
  viewBox: z.string(),
  elements: z.array(svgElementSchema),
});
