'use client';
import { GripVertical } from 'lucide-react';
import { cn } from '@edrion/ui';

/** Six-dot grip used as the exclusive drag handle for reorderable rows. */
export function DragHandle({
  className,
  disabled,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drag to reorder"
      aria-disabled={disabled || undefined}
      className={cn(
        'flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-text-muted',
        'hover:bg-surface-muted hover:text-text-secondary active:cursor-grabbing',
        'touch-none select-none',
        disabled && 'pointer-events-none cursor-not-allowed opacity-40',
        className,
      )}
      {...props}
      draggable={disabled ? false : props.draggable}
    >
      <GripVertical className="h-4 w-4 pointer-events-none" aria-hidden />
    </div>
  );
}

/** Use the full row/bar as the drag ghost instead of just the grip. */
export function setRowDragImage(
  e: React.DragEvent,
  row: HTMLElement | null | undefined,
  offsetX = 24,
  offsetY = 18,
) {
  if (!row) return;
  try {
    e.dataTransfer.setDragImage(row, offsetX, offsetY);
  } catch {
    // Some browsers reject setDragImage in edge cases — native ghost is fine then.
  }
}

/** Reorder `list` by moving index `from` to `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
