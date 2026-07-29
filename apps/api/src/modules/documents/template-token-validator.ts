import Handlebars from 'handlebars';

const ALLOWED_HELPERS = new Set(['upper', 'lower', 'date', 'eq', 'inc', 'each', 'if', 'unless', 'with']);

/**
 * Parse Handlebars AST and collect every path / helper reference.
 * Unknown tokens relative to fields_schema → 422 UNKNOWN_MERGE_FIELD.
 */
export function extractMergePaths(html: string): string[] {
  const ast = Handlebars.parse(html);
  const paths = new Set<string>();
  walk(ast, paths);
  return [...paths].sort();
}

export function validateTemplateTokens(
  html: string,
  fieldsSchema: Record<string, unknown>,
): { ok: true } | { ok: false; unknown: string[] } {
  const declared = new Set(Object.keys(fieldsSchema));
  // Always-available ambient fields
  for (const ambient of [
    'title',
    'today',
    'institution',
    'institution.name',
    'institution.logo',
    'header',
    'verify',
    'verify.code',
    'verify.qr',
    'issue',
    'issue.date',
    'student',
    'student.name',
  ]) {
    declared.add(ambient);
  }
  const paths = extractMergePaths(html);
  const unknown = paths.filter((p) => {
    if (ALLOWED_HELPERS.has(p)) return false;
    if (declared.has(p)) return false;
    // Allow nested under a declared root (e.g. student.reg_no when student declared)
    const root = p.split('.')[0]!;
    if (declared.has(root)) return false;
    return true;
  });
  return unknown.length ? { ok: false, unknown } : { ok: true };
}

function walk(node: unknown, paths: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  const type = n.type as string | undefined;
  if (type === 'PathExpression' && typeof n.original === 'string') {
    paths.add(n.original);
  }
  if (type === 'MustacheStatement' || type === 'BlockStatement' || type === 'SubExpression') {
    const path = (n.path as { original?: string } | undefined)?.original;
    if (path) paths.add(path);
  }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((c) => walk(c, paths));
    else if (v && typeof v === 'object') walk(v, paths);
  }
}
