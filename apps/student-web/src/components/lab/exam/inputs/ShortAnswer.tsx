'use client';
import type { QuestionInputProps } from './types';

export function ShortAnswer({ value, onChange, disabled }: QuestionInputProps) {
  const text = value.text ?? '';
  return (
    <div>
      <textarea
        value={text}
        disabled={disabled}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={5}
        maxLength={5000}
        placeholder="Write your answer…"
        className="w-full resize-y rounded-[13px] border border-st-bd2 bg-st-card px-4 py-3 text-sm leading-relaxed text-st-ink outline-none transition focus:border-st-accent disabled:opacity-70"
      />
      <p className="mt-1 text-right font-mono-ui text-[10px] text-st-faint">{text.length} / 5000</p>
    </div>
  );
}
