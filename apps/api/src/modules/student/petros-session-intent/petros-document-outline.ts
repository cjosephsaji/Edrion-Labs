import { documentStudyQuestions } from '../petros-document-grounding';

export type DocumentOutlinePage = {
  id: string;
  pageIndex: number;
  text: string;
  updatedAt: Date;
};

export type DocumentLessonTopic = {
  id: string;
  title: string;
  summary: string;
  pageStart: number;
  pageEnd: number;
  estimatedMinutes: number;
  keyTerms: string[];
  likelyDoubts: string[];
  excerpt: string;
};

export type DocumentLessonOutline = {
  schemaVersion: 'petros.document-outline.v1';
  documentId: string;
  documentVersion: number;
  sourceFingerprint: string;
  title: string;
  generatedAt: string;
  totalEstimatedMinutes: number;
  topics: DocumentLessonTopic[];
};

const STOP_WORDS = new Set(
  'about after again also among because been before being between both can could does each from have into more most other over same should some such than that their them then there these they this those through under very what when where which while will with would your'.split(' '),
);

/**
 * Builds a compact, extractive lesson map from authorized pages. It deliberately does not
 * call a model: preprocessing is bounded, deterministic, cheap, and safe to cache. The live
 * teaching engine may elaborate only the selected topic's excerpt later.
 */
export function buildDocumentLessonOutline(input: {
  documentId: string;
  documentVersion: number;
  sourceFingerprint: string;
  title: string;
  pages: DocumentOutlinePage[];
  generatedAt?: Date;
}): DocumentLessonOutline {
  const pages = [...input.pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const groupSize = Math.max(1, Math.ceil(pages.length / 12));
  const topics: DocumentLessonTopic[] = [];

  for (let offset = 0; offset < pages.length; offset += groupSize) {
    const group = pages.slice(offset, offset + groupSize);
    if (!group.length) continue;
    const text = group.map((page) => page.text.trim()).filter(Boolean).join('\n');
    if (!text) continue;
    const pageStart = group[0]!.pageIndex + 1;
    const pageEnd = group[group.length - 1]!.pageIndex + 1;
    const title = extractHeading(text) ?? (pageStart === pageEnd ? `Page ${pageStart}` : `Pages ${pageStart}–${pageEnd}`);
    const questionLines = text.replace(
      /([.!])\s+(?=(?:why|what|how|which|when|where|who|compare|differentiate|explain|describe|discuss|define|list|draw|illustrate|identify|state|outline|evaluate|analyse|analyze)\b)/gi,
      '$1\n',
    );
    const questions = documentStudyQuestions([questionLines], 3);
    const words = text.split(/\s+/).filter(Boolean).length;
    topics.push({
      id: `topic-${pageStart}-${pageEnd}`,
      title: title.slice(0, 160),
      summary: extractSummary(text, title),
      pageStart,
      pageEnd,
      estimatedMinutes: Math.max(5, Math.min(20, Math.ceil(words / 140) + 3)),
      keyTerms: extractKeyTerms(text),
      likelyDoubts: questions.length ? questions : [`How does ${title.slice(0, 120)} fit into the rest of the document?`],
      excerpt: text.replace(/\s+/g, ' ').trim().slice(0, 1_200),
    });
  }

  if (!topics.length) {
    topics.push({
      id: 'topic-1-1',
      title: input.title,
      summary: `A guided overview of ${input.title}.`,
      pageStart: 1,
      pageEnd: Math.max(1, pages.at(-1)?.pageIndex ? pages.at(-1)!.pageIndex + 1 : 1),
      estimatedMinutes: 5,
      keyTerms: [],
      likelyDoubts: [],
      excerpt: '',
    });
  }

  return {
    schemaVersion: 'petros.document-outline.v1',
    documentId: input.documentId,
    documentVersion: input.documentVersion,
    sourceFingerprint: input.sourceFingerprint,
    title: input.title,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    totalEstimatedMinutes: topics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0),
    topics,
  };
}

export function isDocumentLessonOutline(value: unknown): value is DocumentLessonOutline {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const outline = value as Partial<DocumentLessonOutline>;
  return (
    outline.schemaVersion === 'petros.document-outline.v1' &&
    typeof outline.documentId === 'string' &&
    typeof outline.documentVersion === 'number' &&
    typeof outline.sourceFingerprint === 'string' &&
    Array.isArray(outline.topics) &&
    outline.topics.every((topic) =>
      topic &&
      typeof topic.id === 'string' &&
      typeof topic.title === 'string' &&
      Number.isInteger(topic.pageStart) &&
      Number.isInteger(topic.pageEnd),
    )
  );
}

function extractHeading(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines.find((line) => {
    if (line.length < 3 || line.length > 120 || /[?.!]$/.test(line)) return false;
    const words = line.split(/\s+/);
    if (words.length > 14) return false;
    return /^(?:module|unit|chapter|section|topic|lesson)\b/i.test(line)
      || /^\d+(?:\.\d+)*[.)-]?\s+\S/.test(line)
      || (/[A-Za-z]/.test(line) && line === line.toUpperCase());
  }) ?? lines.find((line) => line.length >= 3 && line.length <= 80 && !/[?]$/.test(line));
}

function extractSummary(text: string, heading: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const withoutHeading = normalized.toLowerCase().startsWith(heading.toLowerCase())
    ? normalized.slice(heading.length).trim().replace(/^[:—–-]\s*/, '')
    : normalized;
  const sentence = withoutHeading.match(/^.{40,320}?(?:[.!?](?=\s|$)|$)/)?.[0] ?? withoutHeading;
  return (sentence.trim() || `A guided explanation of ${heading}.`).slice(0, 360);
}

function extractKeyTerms(text: string) {
  const counts = new Map<string, number>();
  for (const raw of text.match(/[A-Za-z][A-Za-z-]{3,}/g) ?? []) {
    const word = raw.toLowerCase();
    if (STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([word]) => word);
}
