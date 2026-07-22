import type { VisualArchetype, VisualNodeType } from '@edrion/schemas';

export type LayoutAlgorithm =
  | 'elk_radial'
  | 'elk_layered'
  | 'elk_mrtree'
  | 'custom_cycle'
  | 'custom_timeline'
  | 'custom_comparison';

export type LayoutNodeInput = {
  id: string;
  width: number;
  height: number;
  type: VisualNodeType;
  depth: number;
};

export type LayoutEdgeInput = {
  id: string;
  source: string;
  target: string;
  type: string;
};

export type LayoutRequestMessage = {
  requestId: number;
  archetype: VisualArchetype;
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  rootNodeId: string | null;
};

export type LayoutPositionMap = Record<string, { x: number; y: number }>;

export type LayoutSuccessMessage = {
  requestId: number;
  positions: LayoutPositionMap;
  algorithm: LayoutAlgorithm;
};

export type LayoutErrorMessage = {
  requestId: number;
  error: string;
};

export type LayoutResponseMessage = LayoutSuccessMessage | LayoutErrorMessage;

export function isLayoutErrorMessage(
  message: LayoutResponseMessage,
): message is LayoutErrorMessage {
  return 'error' in message;
}
