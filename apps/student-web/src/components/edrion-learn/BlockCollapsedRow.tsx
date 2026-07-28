'use client';
import type { BlockV1, SessionBlockV1Dto } from '@edrion/schemas';
import { learnMoveIcon } from './learn-move-icons';

function blockLabel(block: BlockV1): string {
  switch (block.block_type) {
    case 'explanation':
      return block.title ?? 'Explanation';
    case 'question_set':
      return block.title ?? 'Question';
    case 'worked_example':
      return block.title ?? 'Worked example';
    case 'probe':
      return 'Quick question';
    case 'synthesis':
      return 'Synthesis';
    case 'canvas_embed':
      return block.caption ?? 'Diagram';
    case 'artifact_commit':
      return 'Save to Library';
    default:
      return 'Step';
  }
}

function stepStatus(blockRow: SessionBlockV1Dto): 'done' | 'skipped' | 'amber' | 'neutral' {
  const st = blockRow.interactionState as {
    skipped?: boolean;
    evaluation?: { correct?: boolean | null };
    answeredMap?: Record<string, { correct?: boolean | null }>;
  };
  if (st.skipped) return 'skipped';
  const ev = st.evaluation;
  if (ev?.correct === false) return 'amber';
  if (ev?.correct === true) return 'done';
  const map = st.answeredMap;
  if (map) {
    const vals = Object.values(map);
    if (vals.some((v) => v.correct === false)) return 'amber';
    if (vals.length && vals.every((v) => v.correct === true)) return 'done';
  }
  return 'neutral';
}

export function BlockCollapsedRow({
  blockRow,
  onExpand,
}: {
  blockRow: SessionBlockV1Dto;
  onExpand: () => void;
}) {
  const status = stepStatus(blockRow);
  const glyph = status === 'amber' ? '◐' : status === 'skipped' ? '↷' : '✓';

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-st-bd2 hover:bg-st-card/70"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-st-surface2 text-sm text-st-muted transition group-hover:bg-st-accentSoft group-hover:text-st-accentDeep"
        aria-hidden
      >
        {learnMoveIcon(blockRow.moveType)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-st-inkSoft">{blockLabel(blockRow.block)}</span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
          status === 'amber'
            ? 'bg-st-amberSoft text-st-amberInk'
            : status === 'skipped'
              ? 'bg-st-surface2 text-st-faint'
              : 'bg-st-accentSoft text-st-success'
        }`}
        aria-hidden
      >
        {glyph}
      </span>
    </button>
  );
}
