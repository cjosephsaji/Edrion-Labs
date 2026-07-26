import type { IntentResponseDto } from '@edrion/schemas';

/** Single-word topic-like input that could be quick answer or deep learn. */
export function isAmbiguousIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes(' ')) return false;
  if (trimmed.endsWith('?')) return false;
  return trimmed.length <= 40;
}

export function intentPreviewLabel(response: IntentResponseDto): string | null {
  if (response.intent === 'quick_question') return 'Looks like a quick question';
  if (response.intent === 'learn_topic') return 'Looks like a topic to learn';
  return null;
}
