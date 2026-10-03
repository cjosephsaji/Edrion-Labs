import { setImmediate } from 'node:timers/promises';
import {
  PETROS_DOCUMENT_RETRIEVAL_VERSION,
  PETROS_DOCUMENT_SOURCE_VERSION,
  PETROS_RETRIEVAL_MAX_TERMS,
  petrosDocumentRetrievalSchema,
  type PetrosDocumentSearch,
} from '@edrion/schemas';
import { documentTextHash, type SourcePage } from '../petros-session-intent/petros-document-source';

const STOP = new Set(
  'a an the and or of to in on for is are was were be been it this that these those i you my me we our do does did how what why when where can could would should please explain tell about from with as by at lesson document chapter page according'.split(
    ' ',
  ),
);
const terms = (text: string) => [
  ...new Set(
    (
      text
        .normalize('NFKC')
        .toLowerCase()
        .match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
    ).filter((word) => !STOP.has(word)),
  ),
];
type Unit = { page: SourcePage; start: number; end: number; clipped: boolean };

/** A transient index over already-authorized immutable pages. No cross-owner cache or external service. */
export async function retrieveDocumentSpans(
  sourceId: string,
  input: PetrosDocumentSearch,
  allPages: SourcePage[],
  totalPages: number,
  unavailablePages: number[],
  signal?: AbortSignal,
) {
  const allTerms = terms(input.query);
  const queryTerms = allTerms
    .filter((term) => term.length <= 80)
    .slice(0, PETROS_RETRIEVAL_MAX_TERMS);
  const requestedPages = [...input.pages].sort((a, b) => a - b);
  const searched = allPages.filter(
    (page) =>
      requestedPages.includes(page.pageIndex + 1) && !unavailablePages.includes(page.pageIndex + 1),
  );
  const indexed: Array<{ unit: Unit; matches: string[]; length: number }> = [];
  const frequency = new Map<string, number>();
  for (const page of searched) {
    signal?.throwIfAborted();
    for (const unit of sentenceWindows(page)) {
      const words = terms(page.text.slice(unit.start, unit.end));
      const vocabulary = new Set(words);
      const matches = queryTerms.filter((term) => vocabulary.has(term));
      for (const term of matches) frequency.set(term, (frequency.get(term) ?? 0) + 1);
      indexed.push({ unit, matches, length: words.length });
      if (indexed.length > 5_000) throw new Error('PETROS_RETRIEVAL_UNIT_LIMIT');
    }
    // Yield between physical pages so local retrieval observes cancellation and does not starve HTTP.
    await setImmediate();
  }
  signal?.throwIfAborted();
  const ranked = indexed
    .filter((row) => row.matches.length)
    .map((row) => ({
      ...row,
      score:
        row.matches.reduce(
          (sum, term) => sum + Math.log(1 + indexed.length / (frequency.get(term) ?? 1)),
          0,
        ) /
        (1 + row.length / 500),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.unit.page.pageIndex - b.unit.page.pageIndex ||
        a.unit.start - b.unit.start,
    );
  const hits = ranked.slice(0, input.limit).map(({ unit, matches }) => ({
    spanId: documentTextHash(
      `${PETROS_DOCUMENT_RETRIEVAL_VERSION}:${input.sourceVersion}:${unit.page.id}:${unit.start}:${unit.end}`,
    ),
    source: {
      locator: {
        schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION,
        kind: 'pdf_page_text' as const,
        sourceVersion: input.sourceVersion,
        objectId: unit.page.objectId,
        unitId: unit.page.id,
        page: unit.page.pageIndex + 1,
        textSha256: documentTextHash(unit.page.text),
        start: unit.start,
        end: unit.end,
        offsetEncoding: 'utf16' as const,
      },
      text: unit.page.text.slice(unit.start, unit.end),
    },
    matchedTerms: matches,
    boundaryClipped: unit.clipped,
  }));
  const returnedPages = [...new Set(hits.map((hit) => hit.source.locator.page))].sort(
    (a, b) => a - b,
  );
  return petrosDocumentRetrievalSchema.parse({
    schemaVersion: PETROS_DOCUMENT_RETRIEVAL_VERSION,
    sourceId,
    sourceVersion: input.sourceVersion,
    hits,
    trace: {
      purpose: input.purpose,
      querySha256: documentTextHash(input.query),
      index: 'per_query_lexical',
      unitization: 'sentence_windows_with_overlap',
      requestedPages,
      searchedPages: searched.map((page) => page.pageIndex + 1).sort((a, b) => a - b),
      unavailablePages,
      returnedPages,
      totalPages,
      unsearchedPageCount: totalPages - searched.length,
      unreturnedPageCount: totalPages - returnedPages.length,
      searchedTextChars: searched.reduce((n, page) => n + page.text.length, 0),
      matchedSpanCount: ranked.length,
      omittedMatchingSpanCount: ranked.length - hits.length,
      omittedQueryTermCount: allTerms.length - queryTerms.length,
      status: hits.length ? 'matches' : searched.length ? 'no_match' : 'no_searchable_text',
      sufficiency: hits.length ? 'unverified' : 'insufficient',
      coverage: 'extracted_text_only',
      structure: 'table_formula_figure_alignment_unverified',
    },
  });
}

/** Exact UTF-16 offsets; adjacent sentences overlap when they fit the 1,200-character bound. */
function* sentenceWindows(page: SourcePage): Generator<Unit> {
  type Piece = { start: number; end: number; clipped: boolean };
  const boundary = /[.!?](?=\s|$)|\n{2,}/gu;
  let start = 0;
  function* split(end: number): Generator<Piece> {
    const clipped = end - start > 1200;
    while (start < end) {
      let stop = Math.min(start + 1200, end);
      if (stop < end) {
        const space = page.text.lastIndexOf(' ', stop);
        if (space > start + 600) stop = space;
        // A forced boundary must not cut a surrogate pair.
        if (/[\uD800-\uDBFF]/u.test(page.text[stop - 1]!)) stop--;
      }
      yield { start, end: stop, clipped };
      start = stop;
    }
  }
  function* pieces(): Generator<Piece> {
    for (let match = boundary.exec(page.text); match; match = boundary.exec(page.text))
      yield* split(match.index + match[0].length);
    yield* split(page.text.length);
  }
  let current: Piece | undefined;
  let previous: Piece | undefined;
  for (const piece of pieces()) {
    if (current && piece.end - current.start > 1200) {
      if (page.text.slice(current.start, current.end).trim()) yield { page, ...current };
      current = previous && piece.end - previous.start <= 1200 ? { ...previous } : undefined;
    }
    current = current
      ? { start: current.start, end: piece.end, clipped: current.clipped || piece.clipped }
      : { ...piece };
    previous = piece;
  }
  if (current && page.text.slice(current.start, current.end).trim()) yield { page, ...current };
}
