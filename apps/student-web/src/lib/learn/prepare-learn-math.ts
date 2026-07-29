/**
 * Normalize Learn prose so matrices/vectors render via KaTeX.
 * Converts ASCII nesting like [[2,1],[4,3]] → $\begin{pmatrix}2 & 1 \\ 4 & 3\end{pmatrix}$
 * when not already inside math delimiters.
 */
export function prepareLearnMath(text: string): string {
  if (!text) return text;
  return liftAsciiMatrices(text);
}

/** [[2,1],[4,3]] or [[2, 1], [4, 3]] → LaTeX pmatrix (wrapped in $…$). */
export function liftAsciiMatrices(text: string): string {
  // Skip spans already inside $…$ / $$…$$ / \(…\) / \[…\] by walking with a simple scanner.
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2);
      if (end === -1) {
        out.push(text.slice(i));
        break;
      }
      out.push(text.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1);
      if (end === -1) {
        out.push(text.slice(i));
        break;
      }
      out.push(text.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (text.startsWith('\\[', i) || text.startsWith('\\(', i)) {
      const close = text.startsWith('\\[', i) ? '\\]' : '\\)';
      const end = text.indexOf(close, i + 2);
      if (end === -1) {
        out.push(text.slice(i));
        break;
      }
      out.push(text.slice(i, end + close.length));
      i = end + close.length;
      continue;
    }

    if (text.startsWith('[[', i)) {
      const converted = tryConvertAsciiMatrixAt(text, i);
      if (converted) {
        out.push(converted.latex);
        i = converted.nextIndex;
        continue;
      }
    }

    out.push(text[i]!);
    i += 1;
  }
  return out.join('');
}

function tryConvertAsciiMatrixAt(
  text: string,
  start: number,
): { latex: string; nextIndex: number } | null {
  if (!text.startsWith('[[', start)) return null;
  let depth = 0;
  let end = -1;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  if (end < 0) return null;

  const raw = text.slice(start, end + 1);
  // Expect [[row],[row],...]
  if (!/^\[\[[\s\S]*\]\]$/.test(raw)) return null;
  const inner = raw.slice(1, -1); // drop outer []
  const rowMatches = [...inner.matchAll(/\[([^\[\]]*)\]/g)];
  if (rowMatches.length < 1) return null;

  const rows = rowMatches.map((m) =>
    m[1]!
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0),
  );
  if (rows.some((r) => r.length === 0)) return null;
  const width = rows[0]!.length;
  if (width < 1 || rows.some((r) => r.length !== width)) return null;

  const body = rows.map((r) => r.join(' & ')).join(' \\\\ ');
  return {
    latex: `$\\begin{pmatrix}${body}\\end{pmatrix}$`,
    nextIndex: end + 1,
  };
}
