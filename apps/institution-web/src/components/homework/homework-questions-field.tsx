'use client';
import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label, cn } from '@edrion/ui';
import { DragHandle, moveItem, setRowDragImage } from '@/components/common/drag-handle';
import type { HomeworkQuestionInput } from '@/lib/homework-types';

export function HomeworkQuestionsField({
  value,
  onChange,
}: {
  value: HomeworkQuestionInput[];
  onChange: (v: HomeworkQuestionInput[]) => void;
}) {
  const questions = value.length > 0 ? value : [{ promptText: '', maxMarks: 10 }];
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  function update(idx: number, patch: Partial<HomeworkQuestionInput>) {
    onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function add() {
    onChange([...questions, { promptText: '', maxMarks: 10 }]);
  }

  function remove(idx: number) {
    if (questions.length <= 1) return;
    onChange(questions.filter((_, i) => i !== idx));
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
    if (dragIdx !== toIdx) onChange(moveItem(questions, dragIdx, toIdx));
    clearDrag();
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Questions</Label>
      {questions.map((q, idx) => (
        <div
          key={idx}
          ref={(el) => {
            rowRefs.current[idx] = el;
          }}
          className={cn(
            'rounded-lg border border-border bg-background-secondary/40 p-3 transition-[opacity,border-color]',
            dragIdx === idx && 'opacity-40',
            overIdx === idx && dragIdx !== null && dragIdx !== idx && 'border-primary',
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
          <div className="mb-2 flex items-center gap-2">
            <DragHandle
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(idx));
                setRowDragImage(e, rowRefs.current[idx]);
                setDragIdx(idx);
              }}
              onDragEnd={clearDrag}
            />
            <span className="flex-1 text-xs font-semibold text-text-secondary">Question {idx + 1}</span>
            {questions.length > 1 && (
              <button type="button" onClick={() => remove(idx)} className="text-text-muted hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <Input
            value={q.promptText ?? ''}
            onChange={(e) => update(idx, { promptText: e.target.value })}
            placeholder="Prompt (LaTeX supported)"
          />
          <div className="mt-2">
            <Label className="text-xs">Max marks</Label>
            <Input
              type="number"
              min={0}
              value={q.maxMarks ?? ''}
              onChange={(e) => update(idx, { maxMarks: e.target.value === '' ? null : Number(e.target.value) })}
              className="mt-1 w-24"
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={add}>
        <Plus className="h-4 w-4" />
        Add question
      </Button>
    </div>
  );
}
