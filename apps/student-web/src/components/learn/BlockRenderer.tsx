'use client';
import type { SessionBlockDto } from '@edrion/schemas';
import { parseBlockContent } from '@edrion/schemas';
import type { BlockAnswerResult } from '@/lib/learn-session-types';
import { ConceptCard } from './blocks/ConceptCard';
import { VisualExplainer } from './blocks/VisualExplainer';
import { WorkedExample } from './blocks/WorkedExample';
import { Checkpoint } from './blocks/Checkpoint';
import { PracticeLauncher } from './blocks/PracticeLauncher';
import { WrapUp } from './blocks/WrapUp';
import { NoteCard } from './blocks/NoteCard';
import { BlockContinue } from './BlockContinue';
import { isReadThroughBlock } from '@/lib/learn-navigation';

type BlockRendererProps = {
  block: SessionBlockDto;
  readOnly?: boolean;
  sessionId?: string;
  onAsk?: (q: string) => void;
  onCheckpointAnswer?: (choice: string, explanation?: string) => Promise<BlockAnswerResult>;
  onPracticeSubmit?: (answer: string, hintsUsed: number) => Promise<BlockAnswerResult>;
  onFetchHint?: (blockId: string, rung: 2 | 3) => Promise<string>;
  onFinish?: () => void;
  onContinue?: () => void;
  continueLoading?: boolean;
};

export function BlockRenderer({
  block,
  readOnly,
  sessionId,
  onAsk,
  onCheckpointAnswer,
  onPracticeSubmit,
  onFetchHint,
  onFinish,
  onContinue,
  continueLoading,
}: BlockRendererProps) {
  const showReadThroughContinue =
    onContinue && !readOnly && !block.completedAt && isReadThroughBlock(block.blockType);

  switch (block.blockType) {
    case 'concept_card':
      return (
        <>
          <ConceptCard content={parseBlockContent('concept_card', block.content)} onAsk={onAsk} />
          {showReadThroughContinue && <BlockContinue onContinue={onContinue} loading={continueLoading} />}
        </>
      );
    case 'visual_explainer':
      return (
        <>
          <VisualExplainer content={parseBlockContent('visual_explainer', block.content)} onAsk={onAsk} />
          {showReadThroughContinue && <BlockContinue onContinue={onContinue} loading={continueLoading} />}
        </>
      );
    case 'worked_example':
      return (
        <>
          <WorkedExample content={parseBlockContent('worked_example', block.content)} onAsk={onAsk} />
          {showReadThroughContinue && <BlockContinue onContinue={onContinue} loading={continueLoading} />}
        </>
      );
    case 'checkpoint':
      return (
        <Checkpoint
          content={parseBlockContent('checkpoint', block.content)}
          onAnswer={(c, e) => onCheckpointAnswer!(c, e)}
          onContinue={onContinue}
          readOnly={readOnly}
          completed={!!block.completedAt}
        />
      );
    case 'practice_item':
      return (
        <PracticeLauncher
          content={parseBlockContent('practice_item', block.content)}
          sessionId={sessionId}
          blockId={block.id}
          onFetchHint={onFetchHint}
          onSubmit={(a, h) => onPracticeSubmit!(a, h)}
          onContinue={onContinue}
          readOnly={readOnly}
          completed={!!block.completedAt}
        />
      );
    case 'reflection_summary':
      return <WrapUp content={parseBlockContent('reflection_summary', block.content)} onFinish={onFinish} />;
    case 'note_card':
      return (
        <>
          <NoteCard content={parseBlockContent('note_card', block.content)} />
          {showReadThroughContinue && <BlockContinue onContinue={onContinue} loading={continueLoading} />}
        </>
      );
    default:
      return <p className="text-sm text-st-muted">Unsupported block type.</p>;
  }
}
