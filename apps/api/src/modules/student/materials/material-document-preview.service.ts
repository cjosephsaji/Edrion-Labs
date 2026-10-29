import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { convertPresentation } from './presentation-converter';

const MAX_PREVIEW_CHARS = 180_000;
const MAX_SPREADSHEET_ROWS = 250;
const MAX_SPREADSHEET_COLUMNS = 40;

export type MaterialPreviewFormat = 'word' | 'slides' | 'spreadsheet' | 'text' | 'document';

export type MaterialPreviewSection = {
  title: string | null;
  text: string | null;
  rows: string[][] | null;
};

export type MaterialDocumentPreview = {
  format: MaterialPreviewFormat;
  sections: MaterialPreviewSection[];
  truncated: boolean;
  note: string | null;
  /** UI fallback prose is not extracted source content. */
  readable: boolean;
};

type PreviewInput = {
  filename: string | null;
  mimeType: string;
  buffer: Buffer;
  extractedPages?: Array<{ pageIndex: number; text: string }>;
};

type PreviewBudget = { remaining: number; truncated: boolean };

/**
 * Produces a private, text-focused preview for formats browsers cannot render themselves.
 * It deliberately returns data rather than HTML so document content is always escaped by React.
 */
@Injectable()
export class MaterialDocumentPreviewService {
  async create(input: PreviewInput): Promise<MaterialDocumentPreview> {
    const format = previewFormat(input.filename, input.mimeType);
    const budget: PreviewBudget = { remaining: MAX_PREVIEW_CHARS, truncated: false };
    const extractedPages = (input.extractedPages ?? []).filter((page) => page.text.trim());

    if (extractedPages.length) {
      return {
        format,
        sections: extractedPages.map((page) => ({
          title: `Page ${page.pageIndex + 1}`,
          text: takeText(page.text, budget),
          rows: null,
        })),
        truncated: budget.truncated,
        note: officeNote(format),
        readable: true,
      };
    }

    let sections: MaterialPreviewSection[] = [];
    try {
      const extension = fileExtension(input.filename);
      if (extension === 'docx' || isDocx(input.mimeType)) {
        sections = await wordSections(input.buffer, budget);
      } else if (extension === 'pptx' || isPptx(input.mimeType)) {
        sections = await slideSections(input.buffer, budget);
      } else if (extension === 'ppt' || input.mimeType.toLowerCase() === 'application/vnd.ms-powerpoint') {
        // Legacy PPT strings include font/shape/master metadata. Read actual slide text instead.
        sections = await slideSections(await convertPresentation(input.buffer, 'ppt', 'pptx'), budget);
      } else if (extension === 'xlsx' || isXlsx(input.mimeType)) {
        sections = await spreadsheetSections(input.buffer, budget);
      } else if (['odt', 'odp', 'ods'].includes(extension)) {
        sections = await openDocumentSections(input.buffer, format, budget);
      } else if (['csv', 'tsv'].includes(extension) || isDelimitedText(input.mimeType)) {
        sections = delimitedSections(decodeText(input.buffer), extension === 'tsv' ? '\t' : undefined, budget);
      } else if (extension === 'rtf' || input.mimeType.toLowerCase() === 'application/rtf') {
        sections = textSections(stripRtf(decodeText(input.buffer)), budget);
      } else if (format === 'text') {
        sections = textSections(decodeText(input.buffer), budget);
      } else {
        // Older .doc/.xls files are OLE binaries. Their readable string records still
        // provide a useful in-app preview when an extracted Petros copy is not available.
        sections = textSections(extractBinaryStrings(input.buffer), budget);
      }
    } catch {
      sections = format === 'slides' ? [] : textSections(extractBinaryStrings(input.buffer), budget);
    }

    const readable = sections.some((section) => Boolean(section.text?.trim()) || section.rows?.some((row) => row.some((cell) => cell.trim())));
    if (!readable) {
      sections = [{
        title: null,
        text: 'No readable text was found in this file. Download it to see the original layout.',
        rows: null,
      }];
    }

    return {
      format,
      sections,
      truncated: budget.truncated,
      note: officeNote(format),
      readable,
    };
  }
}

function previewFormat(filename: string | null, mimeType: string): MaterialPreviewFormat {
  const extension = fileExtension(filename);
  const mime = mimeType.toLowerCase();
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension) || /word|opendocument\.text|rtf/.test(mime)) return 'word';
  if (['ppt', 'pptx', 'odp'].includes(extension) || /powerpoint|presentation/.test(mime)) return 'slides';
  if (['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(extension) || /excel|spreadsheet|csv|tab-separated/.test(mime)) return 'spreadsheet';
  if (['txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'log', 'tex'].includes(extension) || mime.startsWith('text/')) return 'text';
  return 'document';
}

function officeNote(format: MaterialPreviewFormat): string | null {
  return format === 'text'
    ? null
    : 'This readable preview may simplify the original layout. Download the file for exact formatting.';
}

function fileExtension(filename: string | null): string {
  const match = filename?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function isDocx(mime: string) {
  return mime.toLowerCase().includes('wordprocessingml');
}

function isPptx(mime: string) {
  return mime.toLowerCase().includes('presentationml');
}

function isXlsx(mime: string) {
  return mime.toLowerCase().includes('spreadsheetml');
}

function isDelimitedText(mime: string) {
  return /text\/(csv|tab-separated-values)/.test(mime.toLowerCase());
}

async function wordSections(buffer: Buffer, budget: PreviewBudget): Promise<MaterialPreviewSection[]> {
  const result = await mammoth.extractRawText({ buffer });
  return textSections(result.value, budget);
}

async function slideSections(buffer: Buffer, budget: PreviewBudget): Promise<MaterialPreviewSection[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => numberedPath(a) - numberedPath(b));
  const sections: MaterialPreviewSection[] = [];
  for (let index = 0; index < slides.length; index += 1) {
    const xml = await zip.file(slides[index]!)!.async('text');
    const paragraphs = xmlMatches(xml, /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi)
      .map((paragraph) => xmlMatches(paragraph, /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi).map(decodeXml).join(''))
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const fallback = xmlMatches(xml, /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi).map(decodeXml).join('\n');
    sections.push({
      title: `Slide ${index + 1}`,
      text: takeText(paragraphs.length ? paragraphs.join('\n') : fallback, budget),
      rows: null,
    });
  }
  return sections;
}

async function spreadsheetSections(buffer: Buffer, budget: PreviewBudget): Promise<MaterialPreviewSection[]> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await optionalZipText(zip, 'xl/sharedStrings.xml');
  const sharedStrings = sharedXml
    ? xmlMatches(sharedXml, /<si\b[^>]*>([\s\S]*?)<\/si>/gi).map((item) =>
        xmlMatches(item, /<t\b[^>]*>([\s\S]*?)<\/t>/gi).map(decodeXml).join(''),
      )
    : [];
  const sheetNames = await workbookSheetNames(zip);
  const sheetPaths = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => numberedPath(a) - numberedPath(b));
  const sections: MaterialPreviewSection[] = [];

  for (let sheetIndex = 0; sheetIndex < sheetPaths.length; sheetIndex += 1) {
    const xml = await zip.file(sheetPaths[sheetIndex]!)!.async('text');
    const rows: string[][] = [];
    for (const rowXml of xmlMatches(xml, /<row\b[^>]*>([\s\S]*?)<\/row>/gi).slice(0, MAX_SPREADSHEET_ROWS)) {
      const row: string[] = [];
      for (const cell of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const attributes = cell[1] ?? '';
        const content = cell[2] ?? '';
        const ref = /\br="([A-Z]+)\d+"/i.exec(attributes)?.[1] ?? '';
        const column = columnIndex(ref);
        if (column >= MAX_SPREADSHEET_COLUMNS) {
          budget.truncated = true;
          continue;
        }
        const type = /\bt="([^"]+)"/i.exec(attributes)?.[1] ?? '';
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(content)?.[1];
        const inline = xmlMatches(content, /<t\b[^>]*>([\s\S]*?)<\/t>/gi).map(decodeXml).join('');
        let value = inline || decodeXml(raw ?? '');
        if (type === 's') value = sharedStrings[Number(value)] ?? value;
        if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
        while (row.length < column) row.push('');
        if (column < MAX_SPREADSHEET_COLUMNS) row[column] = value;
      }
      if (row.some((cell) => cell.trim())) rows.push(row.map((cell) => takeText(cell, budget)));
      if (budget.remaining <= 0) break;
    }
    if (xmlMatches(xml, /<row\b/gi).length > MAX_SPREADSHEET_ROWS) budget.truncated = true;
    sections.push({
      title: sheetNames[sheetIndex] ?? `Sheet ${sheetIndex + 1}`,
      text: null,
      rows,
    });
  }
  return sections;
}

async function workbookSheetNames(zip: JSZip): Promise<string[]> {
  const xml = await optionalZipText(zip, 'xl/workbook.xml');
  if (!xml) return [];
  return [...xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*>/gi)].map((match) => decodeXml(match[1] ?? ''));
}

async function openDocumentSections(
  buffer: Buffer,
  format: MaterialPreviewFormat,
  budget: PreviewBudget,
): Promise<MaterialPreviewSection[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await optionalZipText(zip, 'content.xml');
  if (!xml) return [];
  const paragraphs = xmlMatches(xml, /<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/gi)
    .map((item) => decodeXml(stripXmlTags(item)).trim())
    .filter(Boolean);
  if (format === 'slides') {
    const pages = xmlMatches(xml, /<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/gi);
    return pages.map((page, index) => ({
      title: `Slide ${index + 1}`,
      text: takeText(
        xmlMatches(page, /<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)>/gi)
          .map((item) => decodeXml(stripXmlTags(item)).trim())
          .filter(Boolean)
          .join('\n'),
        budget,
      ),
      rows: null,
    }));
  }
  return textSections(paragraphs.join('\n'), budget);
}

function delimitedSections(text: string, forcedDelimiter: string | undefined, budget: PreviewBudget): MaterialPreviewSection[] {
  const delimiter = forcedDelimiter ?? detectDelimiter(text);
  const parsed = parseDelimited(text, delimiter);
  const truncatedRows = parsed.length > MAX_SPREADSHEET_ROWS;
  const rows = parsed.slice(0, MAX_SPREADSHEET_ROWS).map((row) =>
    row.slice(0, MAX_SPREADSHEET_COLUMNS).map((cell) => takeText(cell, budget)),
  );
  if (truncatedRows || parsed.some((row) => row.length > MAX_SPREADSHEET_COLUMNS)) budget.truncated = true;
  return rows.length ? [{ title: null, text: null, rows }] : [];
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/, 5).join('\n');
  const options = [',', '\t', ';'];
  return options.sort((a, b) => sample.split(b).length - sample.split(a).length)[0] ?? ',';
}

function textSections(text: string, budget: PreviewBudget): MaterialPreviewSection[] {
  const clean = cleanText(text);
  if (!clean) return [];
  return [{ title: null, text: takeText(clean, budget), rows: null }];
}

function takeText(value: string, budget: PreviewBudget): string {
  const clean = cleanText(value);
  if (clean.length <= budget.remaining) {
    budget.remaining -= clean.length;
    return clean;
  }
  const result = clean.slice(0, Math.max(0, budget.remaining));
  budget.remaining = 0;
  budget.truncated = true;
  return result;
}

function cleanText(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function stripRtf(value: string): string {
  return value
    .replace(/\\'([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\(?:par|line)\b ?/gi, '\n')
    .replace(/\\tab\b ?/gi, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/\\[{}\\]/g, '')
    .replace(/[{}]/g, '');
}

function extractBinaryStrings(buffer: Buffer): string {
  const unicode = [...collectUtf16Strings(buffer, 0), ...collectUtf16Strings(buffer, 1)];
  const ascii = collectAsciiStrings(buffer);
  const seen = new Set<string>();
  return [...unicode, ...ascii]
    .map((value) => value.trim())
    .filter((value) => /[a-z]{2}/i.test(value) && !seen.has(value) && Boolean(seen.add(value)))
    .join('\n');
}

function collectUtf16Strings(buffer: Buffer, offset: 0 | 1): string[] {
  const strings: string[] = [];
  let current = '';
  for (let index = offset; index + 1 < buffer.length; index += 2) {
    const value = buffer[index]!;
    if (value >= 32 && value <= 126 && buffer[index + 1] === 0) {
      current += String.fromCharCode(value);
    } else {
      if (current.length >= 4) strings.push(current);
      current = '';
    }
  }
  if (current.length >= 4) strings.push(current);
  return strings;
}

function collectAsciiStrings(buffer: Buffer): string[] {
  const strings: string[] = [];
  let current = '';
  for (const value of buffer) {
    if (value >= 32 && value <= 126) {
      current += String.fromCharCode(value);
    } else {
      if (current.length >= 5) strings.push(current);
      current = '';
    }
  }
  if (current.length >= 5) strings.push(current);
  return strings;
}

function xmlMatches(xml: string, pattern: RegExp): string[] {
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? match[0] ?? '');
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function numberedPath(path: string): number {
  return Number(/(\d+)(?=\.xml$)/i.exec(path)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function columnIndex(reference: string): number {
  let value = 0;
  for (const char of reference.toUpperCase()) value = value * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, value - 1);
}

async function optionalZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  return file ? file.async('text') : null;
}
