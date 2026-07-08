import type { BlockType, LearnSessionDto } from '@edrion/schemas';

const CONCEPT_BLOCK_TYPES: BlockType[] = [
  'concept_card',
  'visual_explainer',
  'worked_example',
  'note_card',
];

const PRACTICE_BLOCK_TYPES: BlockType[] = ['practice_item', 'checkpoint'];

export function nextBlockRoute(sessionId: string, session: LearnSessionDto): string {
  const next = session.blocks.find((b) => !b.completedAt);
  if (!next) return `/learn/session/${sessionId}`;
  if (CONCEPT_BLOCK_TYPES.includes(next.blockType)) {
    return `/learn/session/${sessionId}/concept/${next.id}`;
  }
  if (PRACTICE_BLOCK_TYPES.includes(next.blockType)) {
    return `/learn/session/${sessionId}/practice/${next.id}`;
  }
  return `/learn/session/${sessionId}`;
}

export function isReadThroughBlock(blockType: BlockType): boolean {
  return CONCEPT_BLOCK_TYPES.includes(blockType);
}
