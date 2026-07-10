'use client';
import { ASSERTION_REASON_OPTIONS } from '@edrion/schemas';
import { MathText } from '@/components/learn/MathText';
import type { QuestionInputProps } from './types';

export function AssertionReason({ question, value, onChange, disabled }: QuestionInputProps) {
  const payload = question.payload ?? {};
  const assertion = (payload.assertion as string) ?? '';
  const reason = (payload.reason as string) ?? '';
  const options =
    question.options && question.options.length
      ? question.options
      : ASSERTION_REASON_OPTIONS.map((o) => ({ key: o.key, label: o.label }));

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-[13px] border border-st-bd1 bg-st-cardAlt p-4 text-sm text-st-ink">
        {assertion && (
          <p>
            <span className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
              ASSERTION (A)
            </span>
            <br />
            <MathText>{assertion}</MathText>
          </p>
        )}
        {reason && (
          <p className="mt-1">
            <span className="font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-faint">
              REASON (R)
            </span>
            <br />
            <MathText>{reason}</MathText>
          </p>
        )}
      </div>
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
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono-ui text-[11px] font-semibold uppercase ${
                  active ? 'bg-st-accent text-white' : 'bg-st-surface2 text-st-muted'
                }`}
              >
                {opt.key}
              </span>
              <span className="pt-0.5 leading-relaxed">
                <MathText>{opt.label}</MathText>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
