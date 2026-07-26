'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
} from '@xyflow/react';
import type { VisualArchetype, VisualGraphEdge } from '@edrion/schemas';

export type SemanticEdgeData = {
  archetype: VisualArchetype;
  edgeType: VisualGraphEdge['type'];
  label?: string;
  dashed?: boolean;
  stroke?: string;
  showLabel?: boolean;
};

function SemanticEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = (data ?? {}) as SemanticEdgeData;
  const archetype = edgeData.archetype ?? 'mind_map';
  const dashed = edgeData.dashed || edgeData.edgeType === 'alternative_to';
  const stroke = edgeData.stroke ?? 'var(--st-canvasEdge)';
  const showLabel = edgeData.showLabel !== false && !!edgeData.label;

  const path =
    archetype === 'mind_map'
      ? getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
        })[0]
      : archetype === 'cycle'
        ? `M ${sourceX},${sourceY} L ${targetX},${targetY}`
        : getSmoothStepPath({
            sourceX,
            sourceY,
            targetX,
            targetY,
            sourcePosition,
            targetPosition,
            borderRadius: 12,
          })[0];

  const [, labelX, labelY] =
    archetype === 'mind_map'
      ? getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
        })
      : getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          borderRadius: 12,
        });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth: selected ? 2.4 : 1.6,
          strokeDasharray: dashed ? '6 5' : undefined,
        }}
        markerEnd={`url(#thinking-arrow-${dashed ? 'dashed' : 'solid'})`}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="thinking-edge__label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const SemanticEdge = memo(SemanticEdgeComponent);
