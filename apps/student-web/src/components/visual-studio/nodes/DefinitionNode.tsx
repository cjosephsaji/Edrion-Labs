'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function DefinitionNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Definition"
      eyebrowClassName="text-st-blue"
    />
  );
}

export const DefinitionNode = memo(DefinitionNodeComponent);
