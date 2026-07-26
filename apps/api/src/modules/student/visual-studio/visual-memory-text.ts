/**
 * Text normalization for Visual Studio memory node matching.
 * Unicode NFKC, markdown/LaTeX stripping, whitespace collapse.
 */

const MARKDOWN_PATTERNS: RegExp[] = [
  /```[\s\S]*?```/g,
  /`([^`]+)`/g,
  /\*\*([^*]+)\*\*/g,
  /\*([^*]+)\*/g,
  /__([^_]+)__/g,
  /_([^_]+)_/g,
  /\[([^\]]+)\]\([^)]+\)/g,
  /^#{1,6}\s+/gm,
  /^>\s+/gm,
  /^[-*+]\s+/gm,
  /^\d+\.\s+/gm,
];

const LATEX_PATTERNS: RegExp[] = [
  /\$\$[\s\S]*?\$\$/g,
  /\$[^$\n]+\$/g,
  /\\\([\s\S]*?\\\)/g,
  /\\\[[\s\S]*?\\\]/g,
];

export function normalizeMemoryText(text: string): string {
  let value = text.normalize('NFKC').replace(/\r\n/g, '\n').replace(/\u0000/g, '');

  for (const pattern of MARKDOWN_PATTERNS) {
    value = value.replace(pattern, '$1');
  }
  for (const pattern of LATEX_PATTERNS) {
    value = value.replace(pattern, ' ');
  }

  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function memoryEmbedText(node: { title: string; body: string }): string {
  const title = normalizeMemoryText(node.title);
  const body = normalizeMemoryText(node.body);
  if (!body) return title;
  if (!title) return body;
  return `${title} ${body}`.trim();
}
