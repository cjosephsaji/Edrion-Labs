export const RUBRIC_THRESHOLDS = {
  move_diversity_min: 0.6,
  pedagogical_fit_mean: 4.0,
  pedagogical_fit_floor: 3,
  content_correctness_mean: 4.2,
  content_correctness_floor: 3,
  content_answer_key_error_cap: 2,
  artifact_quality_mean: 4.0,
  latency_p95_first_token_ms: 3000,
  degraded_rate_max: 0.02,
  discard_rate_max: 0.3,
  baseline_drop_max: 0.3,
} as const;

export type TranscriptBlock = {
  id: string;
  moveType?: string | null;
  blockType?: string;
  degraded?: boolean;
  firstTokenMs?: number | null;
  content?: unknown;
  reasoning?: string | null;
};

export type SessionTranscript = {
  topicKey: string;
  persona: string;
  sessionId: string;
  goal: string;
  moves: string[];
  blocks: TranscriptBlock[];
  constraintViolations: string[];
  speculativeDiscards: number;
  speculativePlans: number;
  artifactCommitOffered: boolean;
  committedCards: Array<{ front: string; back: string }>;
  error?: string;
};

export function scoreMoveDiversity(t: SessionTranscript, applicableMoves = 8): number {
  const distinct = new Set(t.moves.filter(Boolean)).size;
  return applicableMoves > 0 ? distinct / applicableMoves : 0;
}

export function scoreLatency(t: SessionTranscript): {
  firstTokens: number[];
  degradedRate: number;
  discardRate: number;
} {
  const firstTokens = t.blocks
    .map((b) => b.firstTokenMs)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const degraded = t.blocks.filter((b) => b.degraded).length;
  const degradedRate = t.blocks.length ? degraded / t.blocks.length : 0;
  const discardRate =
    t.speculativePlans > 0 ? t.speculativeDiscards / t.speculativePlans : 0;
  return { firstTokens, degradedRate, discardRate };
}

export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)]!;
}

/** Deterministic structural checks approximating move-library hard constraints from the transcript. */
export function findConstraintViolations(t: SessionTranscript): string[] {
  const v: string[] = [...t.constraintViolations];
  if (t.moves.length > 14) v.push('move_cap_exceeded');
  const probes = t.moves.filter((m) => m === 'socratic_probe');
  // Loose transcript-level probe streak check (server also enforces).
  let streak = 0;
  for (const m of t.moves) {
    if (m === 'socratic_probe') {
      streak += 1;
      if (streak > 2) v.push('probe_turn_cap');
    } else streak = 0;
  }
  if (probes.length > 6) v.push('probe_chains_cap');
  const lastTwo = t.moves.slice(-2);
  if (t.moves.length >= 2 && t.error == null) {
    // Closing pair preferred at end when session completed without error — soft note only.
    void lastTwo;
  }
  return [...new Set(v)];
}
