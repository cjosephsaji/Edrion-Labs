'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function ExampleNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Example"
      eyebrowClassName="text-st-amberInk"
    />
  );
}

export const ExampleNode = memo(ExampleNodeComponent);
