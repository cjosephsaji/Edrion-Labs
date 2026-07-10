import type { VisualGraphNode } from '@edrion/schemas';

export type NavigableNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const NODE_ROLE_DESCRIPTION = 'knowledge graph node';

export const CANVAS_KEYBOARD_HELP = [
  'Arrow keys move between ideas.',
  'Enter opens actions for the selected idea.',
  'Space expands or collapses a branch.',
  'E edits the selected idea when editing is enabled.',
  'Delete removes the selected idea when editing is enabled.',
  'Escape closes open panels.',
].join(' ');

export function readSystemReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Honors both the student preference and the OS setting. */
export function shouldReduceMotion(userPreference: boolean): boolean {
  return userPreference || readSystemReducedMotion();
}

export function nodeCenter(node: NavigableNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function findNearestNodeInDirection(
  nodes: NavigableNode[],
  currentId: string | null,
  direction: 'up' | 'down' | 'left' | 'right',
): string | null {
  if (nodes.length === 0) return null;

  const current =
    (currentId ? nodes.find((node) => node.id === currentId) : null) ?? nodes[0]!;
  const center = nodeCenter(current);

  const candidates = nodes.filter((node) => node.id !== current.id);
  const scored = candidates
    .map((node) => {
      const other = nodeCenter(node);
      const dx = other.x - center.x;
      const dy = other.y - center.y;

      let primary = 0;
      let secondary = 0;
      switch (direction) {
        case 'up':
          if (dy >= -8) return null;
          primary = -dy;
          secondary = Math.abs(dx);
          break;
        case 'down':
          if (dy <= 8) return null;
          primary = dy;
          secondary = Math.abs(dx);
          break;
        case 'left':
          if (dx >= -8) return null;
          primary = -dx;
          secondary = Math.abs(dy);
          break;
        case 'right':
          if (dx <= 8) return null;
          primary = dx;
          secondary = Math.abs(dy);
          break;
      }

      return { node, primary, secondary };
    })
    .filter(
      (entry): entry is { node: NavigableNode; primary: number; secondary: number } => !!entry,
    )
    .sort(
      (a, b) => a.primary - b.primary || a.secondary - b.secondary || a.node.id.localeCompare(b.node.id),
    );

  return scored[0]?.node.id ?? null;
}

export function buildNodeAriaLabel(node: VisualGraphNode, hiddenCount = 0): string {
  const parts = [
    node.type.replace(/_/g, ' '),
    node.title,
    node.status === 'shaky' ? 'shaky' : node.status === 'resolved' ? 'resolved' : null,
    hiddenCount > 0 ? `${hiddenCount} hidden ideas` : null,
  ].filter(Boolean);
  return parts.join(', ');
}
