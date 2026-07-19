'use client';
import { MathText } from '@/components/learn/MathText';
import { Select } from '@edrion/ui';
import type { QuestionInputProps } from './types';

type Entry = { key: string; label: string };

export function MatchFollowing({ question, value, onChange, disabled }: QuestionInputProps) {
  const payload = question.payload ?? {};
  const left = ((payload.left as Entry[]) ?? []).filter(Boolean);
  const right = ((payload.right as Entry[]) ?? []).filter(Boolean);
  const pairs = value.pairs ?? {};

  const setPair = (leftKey: string, rightKey: string) => {
    const next = { ...pairs };
    if (!rightKey) delete next[leftKey];
    else next[leftKey] = rightKey;
    onChange({ pairs: Object.keys(next).length ? next : null });
  };

  return (
    <div className="grid gap-2.5">
      {left.map((l) => (
        <div
          key={l.key}
          className="flex flex-col gap-2 rounded-[13px] border border-st-bd2 bg-st-card p-3 sm:flex-row sm:items-center sm:gap-3"
        >
          <div className="flex items-start gap-2 sm:flex-1">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-st-surface2 font-mono-ui text-[11px] font-semibold uppercase text-st-muted">
              {l.key}
            </span>
            <span className="pt-0.5 text-sm text-st-ink">
              <MathText>{l.label}</MathText>
            </span>
          </div>
          <Select
            value={pairs[l.key] ?? ''}
            disabled={disabled}
            onChange={(e) => setPair(l.key, e.target.value)}
            className="sm:w-56"
            placeholder="Match…"
            options={[{ value: '', label: 'Match…' }, ...right.map((r) => ({ value: r.key, label: `${r.key.toUpperCase()} — ${r.label}` }))]}
          />
        </div>
      ))}
    </div>
  );
}
