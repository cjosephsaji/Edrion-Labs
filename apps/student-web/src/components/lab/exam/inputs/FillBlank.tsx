'use client';
import type { QuestionInputProps } from './types';

export function FillBlank({ value, onChange, disabled }: QuestionInputProps) {
  return (
    <div>
      <input
        value={value.text ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Type your answer…"
        maxLength={500}
        className="w-full rounded-[13px] border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none transition focus:border-st-accent disabled:opacity-70"
      />
    </div>
  );
}
