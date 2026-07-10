'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function DecisionNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Decision"
      eyebrowClassName="text-st-violet"
      className="thinking-node--decision"
    />
  );
}

export const DecisionNode = memo(DecisionNodeComponent);
