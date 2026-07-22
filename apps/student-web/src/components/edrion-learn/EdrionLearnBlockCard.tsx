'use client';
import { useState } from 'react';
import type { BlockV1, SessionBlockV1Dto } from '@edrion/schemas';
import { MathText } from '@/components/learn/MathText';

type BlockHandlers = {
  onAnswer?: (questionId: string, response: unknown) => void;
  onInteract?: (action: string, data?: Record<string, unknown>) => void;
  onCommit?: (cardIds: string[]) => void;
  answerPending?: boolean;
  lastEvaluation?: { correct?: boolean | null; feedback?: string };
};

export function EdrionLearnBlockCard({
  blockRow,
  handlers,
}: {
  blockRow: SessionBlockV1Dto;
  handlers: BlockHandlers;
}) {
  const { block, reasoning, degraded, interactionState } = blockRow;
  const [deeper, setDeeper] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(Boolean((interactionState as { answered?: string })?.answered));
  const [shortText, setShortText] = useState('');
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  const evaluation = (interactionState as { evaluation?: BlockHandlers['lastEvaluation'] })?.evaluation;

  return (
    <article className="rounded-[15px] border border-st-bd2 bg-st-card p-5 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-2">
        {block.title ? <h2 className="text-base font-semibold text-st-ink">{block.title}</h2> : <span />}
        <button
          type="button"
          title={degraded ? 'I improvised this one.' : reasoning ?? 'Why this step'}
          className="cursor-help text-xs text-st-muted"
        >
          ⓘ
        </button>
      </header>

      <BlockBody
        block={block}
        deeper={deeper}
        setDeeper={setDeeper}
        selectedOption={selectedOption}
        setSelectedOption={setSelectedOption}
        submitted={submitted}
        setSubmitted={setSubmitted}
        shortText={shortText}
        setShortText={setShortText}
        selectedCards={selectedCards}
        setSelectedCards={setSelectedCards}
        handlers={handlers}
        interactionState={interactionState}
        evaluation={evaluation ?? handlers.lastEvaluation}
      />
    </article>
  );
}

function BlockBody({
  block,
  deeper,
  setDeeper,
  selectedOption,
  setSelectedOption,
  submitted,
  setSubmitted,
  shortText,
  setShortText,
  selectedCards,
  setSelectedCards,
  handlers,
  interactionState,
  evaluation,
}: {
  block: BlockV1;
  deeper: boolean;
  setDeeper: (v: boolean) => void;
  selectedOption: string | null;
  setSelectedOption: (v: string | null) => void;
  submitted: boolean;
  setSubmitted: (v: boolean) => void;
  shortText: string;
  setShortText: (v: string) => void;
  selectedCards: Set<string>;
  setSelectedCards: (v: Set<string>) => void;
  handlers: BlockHandlers;
  interactionState: Record<string, unknown>;
  evaluation?: BlockHandlers['lastEvaluation'];
}) {
  switch (block.block_type) {
    case 'explanation':
      return (
        <div>
          <div className="prose prose-sm max-w-none text-st-inkSoft">
            <MathText>{block.body_md}</MathText>
          </div>
          {block.deeper_md && (
            <button
              type="button"
              className="mt-3 text-sm text-[#1f604a] hover:underline"
              onClick={() => setDeeper(!deeper)}
            >
              {deeper ? 'Show less' : 'Go deeper'}
            </button>
          )}
          {deeper && block.deeper_md && (
            <div className="mt-2 prose prose-sm max-w-none text-st-inkSoft">
              <MathText>{block.deeper_md}</MathText>
            </div>
          )}
        </div>
      );

    case 'worked_example': {
      const revealed = new Set((interactionState.revealedSteps as number[]) ?? [0]);
      return (
        <div className="space-y-3">
          <div className="prose prose-sm text-st-inkSoft">
            <MathText>{block.problem_md}</MathText>
          </div>
          {block.steps.map((step, i) => {
            if (!revealed.has(i) && i > 0) {
              return (
                <button
                  key={i}
                  type="button"
                  className="w-full rounded-lg border border-st-bd2 px-3 py-2 text-sm"
                  onClick={() => handlers.onInteract?.('reveal_step', { stepIndex: i })}
                >
                  {step.predict_prompt ?? `Show step ${i + 1}`}
                </button>
              );
            }
            return (
              <div key={i} className="rounded-lg bg-st-surface2 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-st-muted">Step {i + 1}</span>
                <MathText>{step.step_md}</MathText>
              </div>
            );
          })}
        </div>
      );
    }

    case 'question_set':
      return (
        <div className="space-y-4">
          {block.questions.map((q, qi) => (
            <div key={q.id}>
              <p className="mb-2 text-xs text-st-muted">
                {qi + 1}/{block.questions.length}
              </p>
              <MathText>{q.prompt_md}</MathText>
              {q.type === 'mcq_single' && q.options && (
                <div className="mt-3 space-y-2">
                  {q.options.map((opt) => {
                    const isSelected = selectedOption === opt.id;
                    const showResult = submitted && isSelected;
                    const isCorrect = evaluation?.correct === true && isSelected;
                    const isWrong = evaluation?.correct === false && isSelected;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={submitted || handlers.answerPending}
                        onClick={() => !submitted && setSelectedOption(opt.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                          isCorrect ? 'border-green-500 bg-green-50' : isWrong ? 'border-amber-400 bg-amber-50' : isSelected ? 'border-[#1f604a]' : 'border-st-bd2'
                        }`}
                      >
                        <MathText>{opt.label_md}</MathText>
                      </button>
                    );
                  })}
                  {!submitted && (
                    <button
                      type="button"
                      disabled={!selectedOption || handlers.answerPending}
                      className="mt-2 rounded-full bg-[#1f604a] px-4 py-2 text-sm text-white disabled:opacity-40"
                      onClick={() => {
                        setSubmitted(true);
                        handlers.onAnswer?.(q.id, { optionId: selectedOption });
                      }}
                    >
                      Submit
                    </button>
                  )}
                  {submitted && evaluation?.feedback && (
                    <p className="mt-2 text-sm text-st-muted">{evaluation.feedback}</p>
                  )}
                </div>
              )}
              {(q.type === 'short_text' || q.type === 'numeric') && !submitted && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={shortText}
                    onChange={(e) => setShortText(e.target.value)}
                    className="flex-1 rounded-lg border border-st-bd2 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={!shortText.trim() || handlers.answerPending}
                    className="rounded-full bg-[#1f604a] px-4 py-2 text-sm text-white"
                    onClick={() => {
                      setSubmitted(true);
                      handlers.onAnswer?.(q.id, q.type === 'numeric' ? { value: Number(shortText) } : { text: shortText });
                    }}
                  >
                    Submit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      );

    case 'probe':
      return (
        <div>
          <MathText>{block.question_md}</MathText>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="text-sm text-st-muted hover:underline"
              onClick={() => handlers.onInteract?.('probe_escape')}
            >
              Just explain it
            </button>
          </div>
        </div>
      );

    case 'synthesis':
      return (
        <div>
          <MathText>{block.prompt_md}</MathText>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-[#1f604a] px-4 py-2 text-sm text-white"
              onClick={() => handlers.onInteract?.('synthesis_submit', { text: 'done' })}
            >
              Submit
            </button>
            <button type="button" className="text-sm text-st-muted" onClick={() => handlers.onInteract?.('synthesis_skip')}>
              Skip
            </button>
          </div>
        </div>
      );

    case 'artifact_commit':
      return (
        <div className="space-y-2">
          {block.cards.map((card) => (
            <label key={card.source_block_id} className="flex items-start gap-2 rounded-lg border border-st-bd2 p-3 text-sm">
              <input
                type="checkbox"
                checked={selectedCards.has(card.source_block_id)}
                onChange={(e) => {
                  const next = new Set(selectedCards);
                  if (e.target.checked) next.add(card.source_block_id);
                  else next.delete(card.source_block_id);
                  setSelectedCards(next);
                }}
              />
              <span>
                <strong>{card.front_md}</strong>
                <span className="block text-st-muted">{card.back_md}</span>
              </span>
            </label>
          ))}
          <button
            type="button"
            className="mt-2 rounded-full bg-[#1f604a] px-4 py-2 text-sm text-white"
            onClick={() => handlers.onCommit?.([...selectedCards])}
          >
            Save {selectedCards.size || block.cards.length} to Library
          </button>
        </div>
      );

    case 'canvas_embed':
      return (
        <div>
          <p className="text-sm text-st-muted">{block.caption ?? 'Diagram'}</p>
          <p className="mt-2 rounded-lg border border-st-bd2 bg-st-surface2 px-3 py-6 text-center text-xs text-st-muted">
            Interactive diagram — open in Lab to explore fully.
          </p>
        </div>
      );

    case 'system_notice':
      return (
        <p className={`text-sm ${block.kind === 'budget' ? 'text-amber-700' : 'text-st-muted'}`}>
          <MathText>{block.body_md}</MathText>
        </p>
      );

    default:
      return null;
  }
}
