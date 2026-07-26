import type { SttWord } from './stt/stt-provider';
import type { DebateQuoteRef } from '@edrion/schemas';

/** Normalise for fuzzy substring match (WER-tolerant gate uses canonical transcript). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function quoteMatchesTranscript(
  quote: Pick<DebateQuoteRef, 'verbatim' | 'start_ms' | 'end_ms'>,
  transcriptText: string,
  words: SttWord[],
): boolean {
  const q = norm(quote.verbatim);
  if (q.length < 3) return false;
  const body = norm(transcriptText);
  if (body.includes(q)) return true;

  const windowWords = words.filter(
    (w) => w.e_ms >= quote.start_ms - 250 && w.s_ms <= quote.end_ms + 250,
  );
  const windowText = norm(windowWords.map((w) => w.w).join(' '));
  if (windowText.includes(q)) return true;

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length < 2) return body.includes(tokens[0] ?? '');
  let hits = 0;
  for (const t of tokens) {
    if (body.includes(t)) hits++;
  }
  return hits / tokens.length >= 0.85;
}

export function stripInvalidQuotes<T extends { quote_ref: DebateQuoteRef | null }>(
  items: T[],
  transcriptText: string,
  words: SttWord[],
): T[] {
  return items.map((item) => {
    if (!item.quote_ref) return item;
    if (quoteMatchesTranscript(item.quote_ref, transcriptText, words)) return item;
    return { ...item, quote_ref: null };
  });
}
