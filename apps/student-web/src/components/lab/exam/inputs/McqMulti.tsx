'use client';
import { MathText } from '@/components/learn/MathText';
import type { QuestionInputProps } from './types';

export function McqMulti({ question, value, onChange, disabled }: QuestionInputProps) {
  const options = question.options ?? [];
  const selected = value.choiceKeys ?? [];
  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    onChange({ choiceKeys: next.length ? next : null });
  };
  return (
    <div className="grid gap-2.5">
      <p className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
        SELECT ALL THAT APPLY
      </p>
      {options.map((opt) => {
        const active = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => toggle(opt.key)}
            aria-pressed={active}
            className={`flex w-full items-start gap-3 rounded-[13px] border px-4 py-3 text-left text-sm transition disabled:cursor-default ${
              active
                ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                : 'border-st-bd2 bg-st-card text-st-ink hover:border-st-accent'
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] font-mono-ui text-[11px] font-semibold ${
                active ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
              }`}
            >
              {active ? '✓' : opt.key.toUpperCase()}
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
