'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function NoteNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Your note"
      eyebrowClassName="text-st-muted"
      className="thinking-node--note"
    />
  );
}

export const NoteNode = memo(NoteNodeComponent);
