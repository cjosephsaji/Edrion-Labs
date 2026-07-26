'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { MarkdownMath } from '../MarkdownMath';
import { BaseVisualNode, type VisualNodeData } from './BaseVisualNode';

function FormulaNodeComponent({ data, selected }: NodeProps) {
  const props = data as VisualNodeData;
  return (
    <BaseVisualNode
      {...props}
      selected={selected}
      eyebrow="Formula"
      eyebrowClassName="text-st-blue"
      showBody={false}
    >
      {props.node.body ? (
        <div className="mt-2 overflow-x-auto text-sm text-st-ink">
          <MarkdownMath display>{props.node.body}</MarkdownMath>
        </div>
      ) : null}
    </BaseVisualNode>
  );
}

export const FormulaNode = memo(FormulaNodeComponent);
