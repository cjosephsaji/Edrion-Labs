import { openAI, time } from '../lessons/topics';
import { integrals } from '../lessons/integrals';
import { tectonics } from '../lessons/tectonics';

export const preparedTopics = [openAI, time, integrals, tectonics];
/** Exact aliases only; an unrelated topic must never silently open another subject. */
export function preparedTopic(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[?!.]+$/, '')
    .replace(/\s+/g, ' ');
  if (['tectonic plates', 'plate tectonics', 'how do tectonic plates work', 'explain tectonic plates', 'teach me plate tectonics', 'tectonics'].includes(normalized)) return tectonics;
  if (
    [
      'how does artificial intelligence work',
      'artificial intelligence',
      'ai',
    ].includes(normalized)
  )
    return openAI;
  if (['is time travel possible', 'time travel'].includes(normalized))
    return time;
  return [
    'how do integrals work',
    'integrals',
    'integral calculus',
    'what are integrals',
    'what is an integral',
    'explain integrals',
    'teach me integrals',
    'numerical integration',
    'antiderivatives',
  ].includes(normalized)
    ? integrals
    : null;
}
