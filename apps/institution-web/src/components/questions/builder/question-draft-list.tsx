'use client';
import { useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, cn } from '@edrion/ui';
import { DragHandle, moveItem, setRowDragImage } from '@/components/common/drag-handle';
import { QuestionDraftEditor } from '@/components/questions/builder/question-draft-editor';
import {
  QUESTION_TYPE_OPTIONS,
  emptyQuestionDraft,
  questionTypeLabel,
  summarizeQuestion,
  type QuestionDraft,
  type QuestionType,
} from '@/lib/question-types';

const GROUP_ORDER = ['objective', 'written', 'media', 'code'] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  objective: 'Objective',
  written: 'Written',
  media: 'Media',
  code: 'Code',
};

/** Sortable question list with inline expand editors — local draft only until Save. */
export function QuestionDraftList({
  questions,
  onChange,
  uploadPath,
}: {
  questions: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
  uploadPath: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(questions[0]?.clientKey ?? questions[0]?.id ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

  function renumber(list: QuestionDraft[]): QuestionDraft[] {
    return list.map((q, i) => ({ ...q, sequence: i + 1 }));
  }

  function removeAt(idx: number) {
    const removed = questions[idx]!;
    const removedKey = removed.clientKey ?? removed.id;
    const next = renumber(questions.filter((_, i) => i !== idx));
    onChange(next);
    if (expanded === removedKey) setExpanded(next[0]?.clientKey ?? next[0]?.id ?? null);
  }

  function add(qtype: QuestionType) {
    const next = renumber([...questions, emptyQuestionDraft(questions.length + 1, qtype)]);
    onChange(next);
    const last = next[next.length - 1]!;
    setExpanded(last.clientKey ?? last.id ?? null);
    setMenuOpen(false);
  }

  function updateAt(idx: number, draft: QuestionDraft) {
    const next = questions.slice();
    next[idx] = draft;
    onChange(next);
  }

  function clearDrag() {
    setDragIdx(null);
    setOverIdx(null);
  }

  function onDrop(toIdx: number) {
    if (dragIdx == null) {
      clearDrag();
      return;
    }
    if (dragIdx !== toIdx) {
      onChange(renumber(moveItem(questions, dragIdx, toIdx)));
    }
    clearDrag();
  }

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    options: QUESTION_TYPE_OPTIONS.filter((o) => o.group === group),
  })).filter((g) => g.options.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {questions.map((q, idx) => {
          const key = q.clientKey ?? q.id ?? `idx-${idx}`;
          const open = expanded === key;
          const isDragging = dragIdx === idx;
          const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          return (
            <li
              key={key}
              className={cn(
                'rounded-md border border-border bg-surface transition-[opacity,box-shadow,border-color]',
                isDragging && 'opacity-40',
                isOver && 'border-primary shadow-sm',
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (overIdx !== idx) setOverIdx(idx);
              }}
              onDragLeave={() => {
                if (overIdx === idx) setOverIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(idx);
              }}
            >
              <div
                ref={(el) => {
                  barRefs.current[idx] = el;
                }}
                className="flex items-center gap-1 px-2 py-2 sm:gap-2 sm:px-3"
              >
                <DragHandle
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                    setRowDragImage(e, barRefs.current[idx]);
                    setDragIdx(idx);
                  }}
                  onDragEnd={clearDrag}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setExpanded(open ? null : key)}
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? '' : '-rotate-90'}`}
                  />
                  <span className="shrink-0 text-xs font-medium text-text-muted">Q{q.sequence}</span>
                  <span className="truncate text-sm text-text-primary">{summarizeQuestion(q)}</span>
                  <span className="ml-auto shrink-0 text-xs text-text-muted">
                    {questionTypeLabel(q.qtype)} · {q.marks}m
                  </span>
                </button>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeAt(idx)} aria-label="Remove question">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {open && (
                <div className="px-3 pb-3">
                  <QuestionDraftEditor draft={q} onChange={(d) => updateAt(idx, d)} uploadPath={uploadPath} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="relative">
        <Button type="button" size="sm" variant="secondary" onClick={() => setMenuOpen((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add question
        </Button>
        {menuOpen && (
          <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-border bg-surface p-2 shadow-lg">
            {grouped.map(({ group, options }) => (
              <div key={group} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {GROUP_LABEL[group]}
                </p>
                {options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="flex w-full rounded px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-muted"
                    onClick={() => add(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ))}
            <div className="border-t border-border pt-2">
              <Combobox
                value=""
                onChange={(v) => {
                  if (v) add(v as QuestionType);
                }}
                options={QUESTION_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label, hint: o.group }))}
                placeholder="Search types…"
                searchPlaceholder="Search…"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
