'use client';

import { Button } from '@edrion/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { useAcademicStructureTerms } from '@/lib/academic-structure-terms';
import type { ProgrammeStructureDetail } from '@/lib/academics';

export function CreatedProgrammesPanel({
  items,
  onEdit,
  onDelete,
  disabled,
}: {
  items: ProgrammeStructureDetail[];
  onEdit?: (item: ProgrammeStructureDetail) => void;
  onDelete?: (item: ProgrammeStructureDetail) => void;
  disabled?: boolean;
}) {
  const { tp } = useAcademicStructureTerms();

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-background-secondary/50 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        Added so far
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((p) => (
          <li key={p.department.id} className="rounded-md bg-surface px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-text-primary">{p.department.name}</span>
              <span className="shrink-0 text-xs text-text-muted">
                {p.totals.levels} {tp('gradeLevel').toLowerCase()} · {p.totals.slots}{' '}
                {tp('term').toLowerCase()}
              </span>
            </div>
            {(onEdit || onDelete) && (
              <div className="mt-2 flex gap-2">
                {onEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => onEdit(p)}
                    aria-label={`Edit ${p.department.name}`}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                )}
                {onDelete && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled || p.department.structureLocked}
                    onClick={() => onDelete(p)}
                    aria-label={`Delete ${p.department.name}`}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                )}
              </div>
            )}
            <ul className="mt-2 space-y-1 border-l-2 border-primary/20 pl-3">
              {p.levels.map((level) => (
                <li key={level.id} className="text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">{level.name}</span>
                  {level.slots.length > 0 && (
                    <span className="text-text-muted">
                      {' '}
                      — {level.slots.map((s) => s.name).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
