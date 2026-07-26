/**
 * Vector similarity and assignment helpers for memory node matching.
 */

export const MEMORY_EMBED_HIGH_THRESHOLD = 0.88;
export const MEMORY_EMBED_ASSIGN_THRESHOLD = 0.82;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type HungarianAssignment = { row: number; col: number };

/**
 * Maximum-weight bipartite matching via Hungarian algorithm (min-cost on negated weights).
 * Only returns assignments whose weight meets minAccept.
 */
export function hungarianMaximize(
  weights: number[][],
  minAccept: number,
): HungarianAssignment[] {
  const rowCount = weights.length;
  const colCount = weights[0]?.length ?? 0;
  if (rowCount === 0 || colCount === 0) return [];

  const size = Math.max(rowCount, colCount);
  const cost: number[][] = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const weight = row < rowCount && col < colCount ? weights[row]![col]! : 0;
      if (weight < minAccept) return 1;
      return 1 - weight;
    }),
  );

  const assignment = hungarianMinimize(cost);
  const matches: HungarianAssignment[] = [];
  for (let row = 0; row < rowCount; row++) {
    const col = assignment[row];
    if (col == null || col >= colCount) continue;
    const weight = weights[row]![col]!;
    if (weight >= minAccept) matches.push({ row, col });
  }
  return matches;
}

function hungarianMinimize(costMatrix: number[][]): Array<number | null> {
  const n = costMatrix.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Number.POSITIVE_INFINITY;
      let j1 = 0;

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = costMatrix[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]!]! += delta;
          v[j]! -= delta;
        } else {
          minv[j]! -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const match = new Array<number | null>(n).fill(null);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) match[p[j]! - 1] = j - 1;
  }
  return match;
}
