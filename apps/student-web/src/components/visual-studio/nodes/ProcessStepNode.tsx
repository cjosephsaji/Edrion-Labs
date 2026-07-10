'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function ProcessStepNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Step"
      eyebrowClassName="text-st-blue"
      stepNumber={props.stepNumber}
    />
  );
}

export const ProcessStepNode = memo(ProcessStepNodeComponent);
