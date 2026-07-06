import type { WorkedExampleBlock } from '@edrion/schemas';
import { MathText } from '../MathText';

export function WorkedExample({
  content,
  onAsk,
}: {
  content: WorkedExampleBlock;
  onAsk?: (q: string) => void;
}) {
  return (
    <article className="space-y-4 animate-st-block-in">
      <h2 className="font-display text-xl font-semibold text-st-ink">Worked example</h2>
      {content.equation && (
        <div className="rounded-xl bg-st-surface2 p-4">
          <MathText display>{content.equation}</MathText>
        </div>
      )}
      <p className="text-sm text-st-ink">{content.problem}</p>
      <ol className="space-y-4">
        {content.steps.map((step, i) => (
          <li key={i} className="rounded-xl border border-st-bd1 p-4">
            <p className="text-xs font-semibold tracking-wide text-st-faint">{step.label}</p>
            {step.math && (
              <div className="mt-2">
                <MathText display>{step.math}</MathText>
              </div>
            )}
            <p className="mt-2 text-sm text-st-ink">{step.explanation}</p>
            {step.why && <p className="mt-1 text-xs text-st-muted">Why: {step.why}</p>}
          </li>
        ))}
      </ol>
      {onAsk && content.suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {content.suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk(q)}
              className="rounded-full border border-st-bd1 px-3 py-1.5 text-xs text-st-muted"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
