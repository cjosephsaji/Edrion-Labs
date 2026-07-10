'use client';

import type { ReactNode } from 'react';
import type { VisualGraphNode } from '@edrion/schemas';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { MarkdownMath } from '../MarkdownMath';

export type BaseVisualNodeProps = {
  node: VisualGraphNode;
  selected: boolean;
  hiddenCount: number;
  stepNumber?: number;
  onToggleCollapse?: () => void;
  showBody?: boolean;
  eyebrow: string;
  eyebrowClassName?: string;
  children?: ReactNode;
  className?: string;
  onTap?: () => void;
  onLongPress?: () => void;
  onDoubleActivate?: () => void;
};

export type VisualNodeData = Omit<BaseVisualNodeProps, 'eyebrow'> & {
  type: string;
  className?: string;
};

function statusLabel(node: VisualGraphNode): string | null {
  if (node.status === 'shaky') return 'Shaky';
  if (node.status === 'resolved') return 'Resolved';
  return null;
}

function originLabel(node: VisualGraphNode): string | null {
  if (node.origin === 'student') return node.type === 'note' ? 'Your note' : 'Edited by you';
  if (node.origin === 'alternative_path') return 'Alternative route';
  return null;
}

export function BaseVisualNode({
  node,
  selected,
  hiddenCount,
  stepNumber,
  onToggleCollapse,
  showBody = true,
  eyebrow,
  eyebrowClassName = 'text-st-accent',
  children,
  className = '',
  onTap,
  onLongPress,
  onDoubleActivate,
}: BaseVisualNodeProps) {
  const status = statusLabel(node);
  const origin = originLabel(node);
  const press = useLongPress({
    onClick: onTap,
    onLongPress: onLongPress ?? (() => undefined),
  });

  const surfaceClass =
    node.status === 'shaky'
      ? 'bg-st-goldSoftBg border-st-goldBd text-st-goldInk'
      : node.status === 'resolved'
        ? 'bg-st-mintBg border-st-success/40 text-st-ink'
        : node.origin === 'alternative_path'
          ? 'bg-st-violetSoft border-[color:var(--st-canvasAlternative)] text-st-ink'
          : 'bg-st-card border-st-bd1 text-st-ink';

  return (
    <div
      {...(onTap || onLongPress ? press : {})}
      onDoubleClick={onDoubleActivate}
      aria-roledescription="knowledge graph node"
      className={`thinking-node ${surfaceClass} ${selected ? 'thinking-node--selected' : ''} ${className}`}
      data-layout-transition
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${eyebrowClassName}`}>
              {eyebrow}
            </span>
            {stepNumber != null && (
              <span className="rounded-full bg-st-accentSoft px-2 py-0.5 font-mono text-[10px] font-semibold text-st-accentDeep">
                {stepNumber}
              </span>
            )}
          </div>
          <h3 className="mt-1 font-display text-[15px] font-semibold leading-snug text-st-ink">{node.title}</h3>
        </div>
        {hiddenCount > 0 && onToggleCollapse && (
          <button
            type="button"
            className="thinking-node__badge"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse();
            }}
            aria-label={`Expand ${hiddenCount} hidden ideas`}
          >
            +{hiddenCount}
          </button>
        )}
        {hiddenCount === 0 && node.collapsed && onToggleCollapse && (
          <button
            type="button"
            className="thinking-node__badge thinking-node__badge--muted"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse();
            }}
            aria-label="Expand branch"
          >
            ▸
          </button>
        )}
      </div>

      {children}

      {showBody && node.body ? (
        <div className="mt-2 line-clamp-4 text-xs leading-relaxed text-st-muted">
          <MarkdownMath>{node.body}</MarkdownMath>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium">
        {status && <span className="rounded-full bg-st-goldSoftBg px-2 py-0.5 text-st-goldInk">{status}</span>}
        {origin && <span className="text-st-faint">{origin}</span>}
      </div>
    </div>
  );
}
