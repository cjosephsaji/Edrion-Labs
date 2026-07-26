'use client';
import type { QuestionInputProps } from './types';

export function Numerical({ question, value, onChange, disabled }: QuestionInputProps) {
  const payload = question.payload ?? {};
  const unitHint = (payload.unit as string) ?? value.unit ?? '';

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value.value ?? ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({ value: e.target.value === '' ? null : Number(e.target.value) })
          }
          placeholder="0"
          className="w-40 rounded-[13px] border border-st-bd2 bg-st-card px-4 py-3 font-mono-ui text-sm text-st-ink outline-none transition focus:border-st-accent disabled:opacity-70"
        />
        <input
          value={value.unit ?? unitHint ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ unit: e.target.value || null })}
          placeholder="unit"
          maxLength={32}
          className="w-28 rounded-[13px] border border-st-bd2 bg-st-cardAlt px-3 py-3 text-sm text-st-muted outline-none transition focus:border-st-accent disabled:opacity-70"
        />
      </div>
      <div>
        <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
          WORKING (OPTIONAL — EARNS STEP MARKS)
        </p>
        <textarea
          value={value.workingText ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ workingText: e.target.value || null })}
          rows={4}
          placeholder="Show your steps…"
          className="mt-2 w-full resize-y rounded-[13px] border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none transition focus:border-st-accent disabled:opacity-70"
        />
      </div>
    </div>
  );
}
