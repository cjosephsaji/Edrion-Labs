/**
 * Tool-result compaction — the single biggest lever on Petros' bill.
 *
 * Every Petros read tool delegates to an existing portal service, and `PortalCrudEngine.list` does
 * a `db.select()`: every row comes back with `institutionId`, `campusId`, `createdBy`, `updatedBy`,
 * `createdAt`, `updatedAt`, `version` and a spray of nulls, then gets `JSON.stringify`d — which
 * repeats every key name on every row. A 10-row student list lands at ~1.8k tokens, of which maybe
 * 250 carry information the model can actually use. And because the agent loop echoes the whole
 * `input` array back on each of up to 8 iterations, every wasted token is paid for repeatedly.
 *
 * This module turns a raw service result into the string that goes into `function_call_output`:
 *
 *   1. DROP provably-useless keys (tenant ids, audit columns, row version). The model can neither
 *      see nor act on them — every tool re-asserts scope and permissions server-side from the
 *      request context, never from an argument the model supplies.
 *   2. DROP nulls and empties. A permission-gated section that came back null is better expressed
 *      by its absence than by `"health": null`.
 *   3. COMPRESS ISO timestamps (`2010-05-02T00:00:00.000Z` → `2010-05-02`).
 *   4. TABULATE uniform object arrays as TSV, so key names are written once in a header rather
 *      than once per row.
 *
 * It is deliberately a DENYLIST, not an allowlist: anything we do not positively know to be noise
 * survives. Guessing at per-tool field allowlists would silently drop enriched columns (is it
 * `gradeLevelName` or `gradeName`?) and quietly degrade answers — the exact failure this whole
 * exercise must not cause.
 *
 * Pure and dependency-free so it can be unit-tested and reused (see `compact.spec.ts`).
 */

/** Columns that exist for the database's benefit, never the model's. */
const DROP_KEYS = new Set([
  'institutionId',
  'institution_id',
  'campusId',
  'campus_id',
  'institutionUserId',
  'institution_user_id',
  'createdBy',
  'created_by',
  'updatedBy',
  'updated_by',
  'updatedAt',
  'updated_at',
  'deletedAt',
  'deleted_at',
  'version',
  'searchVector',
  'search_vector',
  'embedding',
]);

/** `createdAt` survives only on rows that carry no other date — see `pruneObject`. */
const CREATED_AT_KEYS = ['createdAt', 'created_at'];
const DATE_LIKE = /(^|[a-z])(date|at)$/i;

const FULL_ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

export interface CompactOptions {
  /** Hard ceiling on rows rendered per table. The service's own page size usually bites first. */
  maxRows?: number;
  /** Cell truncation inside a table. Generous — the win comes from pruning, not from cutting text. */
  maxCellChars?: number;
  /** Leaf-string truncation outside a table (a single record's `body`, an extracted document…). */
  maxLeafChars?: number;
  /** Last-resort ceiling on the whole rendered result. */
  maxTotalChars?: number;
}

const DEFAULTS: Required<CompactOptions> = {
  maxRows: 40,
  maxCellChars: 1000,
  maxLeafChars: 6000,
  maxTotalChars: 14_000,
};

type Plain = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Plain =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

/**
 * Carries no information, so it should not carry any tokens either.
 *
 * An empty ARRAY is deliberately NOT blank. Dropping `subjects: []` would leave the model unable to
 * tell "this institution has no subjects" from "the subjects lookup failed" — it would have to
 * hedge, or guess. An empty list is a fact, and `(none)` states it in two tokens.
 */
const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (isPlainObject(v) && Object.keys(v).length === 0);

/** `2010-05-02T00:00:00.000Z` → `2010-05-02`; `2026-01-05T10:22:31.456Z` → `2026-01-05 10:22`. */
function compressDate(value: string): string {
  const m = FULL_ISO.exec(value);
  if (!m) return value;
  const [, day = '', time = ''] = m;
  if (!day) return value;
  return time === '00:00' ? day : `${day} ${time}`;
}

function pruneValue(value: unknown): unknown {
  if (value instanceof Date) return compressDate(value.toISOString());
  if (typeof value === 'string') return compressDate(value);
  if (Array.isArray(value)) return value.map(pruneValue).filter((v) => !isBlank(v));
  if (isPlainObject(value)) return pruneObject(value);
  return value;
}

function pruneObject(row: Plain): Plain {
  const out: Plain = {};
  // `createdAt` is noise on a row that already says when the thing happened (`date`, `dueDate`,
  // `publishAt`…) — but on a row with no other date it is the only temporal anchor there is.
  const hasOtherDate = Object.keys(row).some(
    (k) => !CREATED_AT_KEYS.includes(k) && !DROP_KEYS.has(k) && DATE_LIKE.test(k) && !isBlank(row[k]),
  );
  for (const [key, raw] of Object.entries(row)) {
    if (DROP_KEYS.has(key)) continue;
    if (CREATED_AT_KEYS.includes(key) && hasOtherDate) continue;
    const value = pruneValue(raw);
    if (isBlank(value)) continue;
    out[key] = value;
  }
  return out;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[+${text.length - max} chars]`;
}

/** One TSV cell: never contains a tab or a newline, so the table stays parseable. */
function cell(value: unknown, maxChars: number): string {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return truncate(text, maxChars).replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * Worth tabulating? Only a run of plain objects — and only when the header pays for itself. A
 * single row would spend a header line to save one set of key names, which is a wash.
 */
function isTabular(rows: unknown[]): rows is Plain[] {
  if (rows.length < 2 || !rows.every(isPlainObject)) return false;
  const keys = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) keys.add(k);
  // A very wide, very sparse table degenerates into mostly-empty cells; JSON is honest there.
  return keys.size > 0 && keys.size <= 24;
}

/** Header order: `id` first (the model needs it to act), then first-seen order — deterministic, so the serialized prefix stays cacheable. */
function headerFor(rows: Plain[]): string[] {
  const keys: string[] = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  return keys.sort((a, b) => (a === 'id' ? -1 : b === 'id' ? 1 : 0));
}

function renderTable(rows: Plain[], opts: Required<CompactOptions>): string {
  const shown = rows.slice(0, opts.maxRows);
  const header = headerFor(shown);
  const lines = [header.join('\t')];
  for (const row of shown) {
    lines.push(header.map((k) => cell(row[k], opts.maxCellChars)).join('\t'));
  }
  if (rows.length > shown.length) {
    lines.push(`…+${rows.length - shown.length} more rows (narrow the search to see them)`);
  }
  return lines.join('\n');
}

function renderValue(value: unknown, opts: Required<CompactOptions>): string {
  if (typeof value === 'string') return truncate(value, opts.maxLeafChars);
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    if (isTabular(value)) return renderTable(value, opts);
    return truncate(JSON.stringify(value.slice(0, opts.maxRows)), opts.maxLeafChars);
  }
  if (isPlainObject(value)) return renderObject(value, opts);
  return String(value);
}

/**
 * An object renders as sections. The common portal list envelope (`{items,total,page,hasMore}`)
 * gets a one-line count header instead of four separate scalar lines, because "143 total, showing
 * 10" is the thing the model has to reason about when it decides whether to narrow its search.
 */
function renderObject(obj: Plain, opts: Required<CompactOptions>): string {
  if (Array.isArray(obj.items)) {
    const total = typeof obj.total === 'number' ? obj.total : obj.items.length;
    const rest = Object.fromEntries(
      Object.entries(obj).filter(([k]) => !['items', 'total', 'page', 'pageSize', 'hasMore'].includes(k)),
    );
    const extra = Object.keys(rest).length ? `\n${renderObject(rest, opts)}` : '';
    if (obj.items.length === 0) return `(no results)${extra}`;
    const head = `${total} total, showing ${Math.min(obj.items.length, opts.maxRows)}`;
    return `${head}\n${renderValue(obj.items, opts)}${extra}`;
  }

  const scalars: string[] = [];
  const sections: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) || isPlainObject(value)) {
      const count = Array.isArray(value) ? ` (${value.length})` : '';
      sections.push(`## ${key}${count}\n${renderValue(value, opts)}`);
    } else {
      scalars.push(`${key}: ${cell(value, opts.maxCellChars)}`);
    }
  }
  return [scalars.join('\n'), ...sections].filter(Boolean).join('\n\n');
}

/**
 * Turn a raw tool result into the string handed back to the model. Falls back to plain JSON for
 * anything that is not an object or array — a bare scalar is already as small as it gets.
 */
export function compactToolResult(value: unknown, options: CompactOptions = {}): string {
  const opts = { ...DEFAULTS, ...options };
  const pruned = pruneValue(value);
  if (isBlank(pruned) || (Array.isArray(pruned) && pruned.length === 0)) return '(no results)';
  const rendered =
    Array.isArray(pruned) || isPlainObject(pruned) ? renderValue(pruned, opts) : String(pruned);
  return truncate(rendered, opts.maxTotalChars);
}

/**
 * Token estimate without pulling in a tokenizer. ~4 chars/token is the standard rule of thumb for
 * English + JSON; it is only ever used for budgeting and reporting, never for billing, so being a
 * few percent off is fine.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
