'use client';
import { MathText } from '@/components/learn/MathText';
import type { QuestionInputProps } from './types';

export function McqSingle({ question, value, onChange, disabled }: QuestionInputProps) {
  const options = question.options ?? [];
  return (
    <div className="grid gap-2.5">
      {options.map((opt) => {
        const active = value.choiceKey === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ choiceKey: active ? null : opt.key })}
            aria-pressed={active}
            className={`flex w-full items-start gap-3 rounded-[13px] border px-4 py-3 text-left text-sm transition disabled:cursor-default ${
              active
                ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                : 'border-st-bd2 bg-st-card text-st-ink hover:border-st-accent'
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono-ui text-[11px] font-semibold ${
                active ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
              }`}
            >
              {opt.key.toUpperCase()}
            </span>
            <span className="pt-0.5 leading-relaxed">
              <MathText>{opt.label}</MathText>
            </span>
          </button>
        );
      })}
    </div>
  );
}
