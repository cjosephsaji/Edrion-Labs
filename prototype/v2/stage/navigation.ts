import type { Topic } from '../simulations/runtime';
export type StageTopic = Topic;
export const stageTopics: { id: Topic; label: string; enabled: boolean }[] = [
  { id: 'neural', label: 'Neural learning', enabled: true },
  { id: 'rocket', label: 'Rocket landing', enabled: true },
  { id: 'attention', label: 'Attention', enabled: true },
  { id: 'traffic', label: 'Traffic waves', enabled: true },
  { id: 'relativity', label: 'Time dilation', enabled: true },
];
export const isStageTopic = (id: unknown): id is StageTopic =>
  id === 'neural' ||
  id === 'rocket' ||
  id === 'attention' ||
  id === 'traffic' ||
  id === 'relativity';
export function stageTarget(topic: Topic, id: string): string {
  const aliases: Record<string, string> =
    topic === 'relativity'
      ? {
          whole: 'ship-clock',
          speed: 'gamma',
          timeline: 'ship-clock',
          'clock-step': 'ship-clock',
        }
      : topic === 'traffic'
        ? {
            whole: 'ring',
            gauge: 'ring',
            gap: 'car_0',
            headway: 'car_0',
            ribbon: 'ring',
            density: 'ring',
            brake: 'car_0',
            traces: 'jam-front',
          }
        : topic === 'attention'
          ? {
              whole: 'attention-matrix',
              query: 'attention-matrix',
              tokens: 'attention-matrix',
              weights: 'attention-matrix',
              mask: 'attention-matrix',
              vectors: 'context',
              'next-query': 'attention-matrix',
            }
          : topic === 'rocket'
            ? {
                whole: 'rocket',
                thrust: 'rocket',
                gravity: 'rocket',
                mass: 'rocket',
                throttle: 'rocket',
                'flight-step': 'rocket',
                acceleration: 'velocity',
                'altitude-line': 'altitude',
              }
            : {
                'number-line': 'prediction',
                'error-beam': 'loss',
                'train-step': 'weight',
                whole: 'prediction',
              };
  return aliases[id] ?? id;
}
