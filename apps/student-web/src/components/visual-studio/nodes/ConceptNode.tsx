'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function ConceptNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Concept"
      className={props.className}
    />
  );
}

export const ConceptNode = memo(ConceptNodeComponent);
