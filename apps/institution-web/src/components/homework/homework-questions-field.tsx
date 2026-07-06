'use client';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label } from '@edrion/ui';
import type { HomeworkQuestionInput } from '@/lib/homework-types';

export function HomeworkQuestionsField({
  value,
  onChange,
}: {
  value: HomeworkQuestionInput[];
  onChange: (v: HomeworkQuestionInput[]) => void;
}) {
  const questions = value.length > 0 ? value : [{ promptText: '', maxMarks: 10 }];

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

  return (
    <div className="flex flex-col gap-3">
      <Label>Questions</Label>
      {questions.map((q, idx) => (
        <div key={idx} className="rounded-lg border border-border bg-background-secondary/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Question {idx + 1}</span>
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
