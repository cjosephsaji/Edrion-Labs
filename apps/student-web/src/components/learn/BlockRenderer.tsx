'use client';
import type { SessionBlockDto } from '@edrion/schemas';
import { parseBlockContent } from '@edrion/schemas';
import { ConceptCard } from './blocks/ConceptCard';
import { VisualExplainer } from './blocks/VisualExplainer';
import { WorkedExample } from './blocks/WorkedExample';
import { Checkpoint } from './blocks/Checkpoint';
import { PracticeLauncher } from './blocks/PracticeLauncher';
import { WrapUp } from './blocks/WrapUp';
import { NoteCard } from './blocks/NoteCard';

type BlockRendererProps = {
  block: SessionBlockDto;
  readOnly?: boolean;
  onAsk?: (q: string) => void;
  onCheckpointAnswer?: (choice: string, explanation?: string) => void;
  onPracticeSubmit?: (answer: string, hintsUsed: number) => void;
  onFinish?: () => void;
};

export function BlockRenderer({
  block,
  readOnly,
  onAsk,
  onCheckpointAnswer,
  onPracticeSubmit,
  onFinish,
}: BlockRendererProps) {
  switch (block.blockType) {
    case 'concept_card':
      return <ConceptCard content={parseBlockContent('concept_card', block.content)} onAsk={onAsk} />;
    case 'visual_explainer':
      return <VisualExplainer content={parseBlockContent('visual_explainer', block.content)} onAsk={onAsk} />;
    case 'worked_example':
      return <WorkedExample content={parseBlockContent('worked_example', block.content)} onAsk={onAsk} />;
    case 'checkpoint':
      return (
        <Checkpoint
          content={parseBlockContent('checkpoint', block.content)}
          onAnswer={(c, e) => onCheckpointAnswer?.(c, e)}
          readOnly={readOnly || !!block.completedAt}
        />
      );
    case 'practice_item':
      return (
        <PracticeLauncher
          content={parseBlockContent('practice_item', block.content)}
          onSubmit={(a, h) => onPracticeSubmit?.(a, h)}
          readOnly={readOnly || !!block.completedAt}
        />
      );
    case 'reflection_summary':
      return <WrapUp content={parseBlockContent('reflection_summary', block.content)} onFinish={onFinish} />;
    case 'note_card':
      return <NoteCard content={parseBlockContent('note_card', block.content)} />;
    default:
      return <p className="text-sm text-st-muted">Unsupported block type.</p>;
  }
}
