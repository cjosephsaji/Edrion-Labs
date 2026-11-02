/** Real scaled dot-product attention over an interpretable deterministic toy embedding table. NOT ChatGPT internals. */
export type Vector = number[];
export interface AttentionResult {
  tokens: string[];
  weights: number[][];
  contexts: number[][];
  queries: Vector[];
  keys: Vector[];
  values: Vector[];
  causal: boolean;
}
const EMBED: Record<string, [number, number, number, number]> = {
  the: [0.1, 0.1, 0.2, 0.1],
  cat: [1, 0.1, 0.2, 0],
  dog: [0.9, 0.1, 0.3, 0.1],
  it: [0.7, 0.1, 0.1, 0.1],
  chased: [0.1, 0.9, 0.2, 0.1],
  ran: [0.1, 0.8, 0.1, 0.2],
  ball: [0.5, 0.2, 0.5, 0.1],
  sat: [0.1, 0.7, 0.1, 0.2],
  on: [0.1, 0.1, 0.9, 0.2],
  mat: [0.4, 0.2, 0.6, 0.1],
};
function embed(word: string): Vector {
  const v = EMBED[word.toLowerCase()];
  if (v) return [...v];
  // Deterministic fallback for unseen tokens: not a semantic embedding.
  let hash = 2166136261;
  for (const ch of word) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  return Array.from(
    { length: 4 },
    (_, i) => ((hash >>> (i * 7)) & 127) / 63.5 - 1,
  );
}
function dot(a: Vector, b: Vector) {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}
export function attention(tokens: string[], causal = true): AttentionResult {
  if (
    !Array.isArray(tokens) ||
    tokens.length < 1 ||
    tokens.length > 24 ||
    tokens.some((t) => typeof t !== 'string' || !t.trim() || t.length > 40)
  )
    throw new Error('Invalid tokens');
  const values = tokens.map(embed);
  const queries = values.map((v) => [v[0], v[1], v[2], v[3]]);
  const keys = values.map((v) => [v[0], v[1], v[2], v[3]]);
  const weights = queries.map((q, i) => {
    const logits = keys.map((k, j) =>
      causal && j > i ? -Infinity : dot(q, k) / Math.sqrt(q.length),
    );
    const max = Math.max(...logits);
    const exp = logits.map((x) => (x === -Infinity ? 0 : Math.exp(x - max)));
    const total = exp.reduce((a, b) => a + b, 0);
    return exp.map((x) => x / total);
  });
  const contexts = weights.map((row) =>
    Array.from({ length: 4 }, (_, d) =>
      row.reduce((sum, w, j) => sum + w * values[j][d], 0),
    ),
  );
  return {
    tokens: [...tokens],
    weights,
    contexts,
    queries,
    keys,
    values,
    causal,
  };
}
