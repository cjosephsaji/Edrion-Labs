/**
 * Move library — hyperspec 1 §3 ("The 8 core moves — binding contracts") expressed as DATA.
 *
 * Every fact the planner needs about a move lives in one `MoveLibraryEntry`:
 * the block type it renders to, its entry conditions as structured predicates,
 * its parameter bounds, whether it needs a student response, and whether it may
 * advance a checkpoint. Nothing here is prose and nothing here is a comment-only
 * rule — `evaluateMove()` runs the predicates and returns a decision the planner
 * can act on, so a constraint that exists in this file is necessarily enforced.
 *
 * Deliberately free of NestJS DI: plain data + pure functions. Config knobs
 * (`move_cap`) arrive on the evaluation context, never by importing constants.
 */
import type { LearnPolicyV1, MoveType, SessionStateV1, TopicProfileV1 } from '@edrion/schemas';
import type { LearnConfig } from './learn-config.service';

export type LearnBlockType =
  | 'explanation'
  | 'worked_example'
  | 'question_set'
  | 'canvas_embed'
  | 'synthesis'
  | 'artifact_commit'
  | 'probe'
  | 'system_notice';

/** Hyperspec §3.8 hard caps. Local to the library so a predicate can never drift from its bound. */
export const PROBE_MAX_TURNS_PER_CHAIN = 2;
export const PROBE_MAX_CHAINS_PER_SESSION = 2;
/** §3.4 — prereq_pulse is legal in the first two moves only, and asks exactly 2 questions. */
export const PREREQ_PULSE_QUESTION_COUNT = 2;
export const PREREQ_PULSE_MAX_MOVE_INDEX = 2;
/** §4.2 — the closing pair (synthesis + artifact_commit) occupies the last two slots before the cap. */
export const CLOSING_PAIR_SIZE = 2;

/** Moves that never count as "exposition" for the retrieval_check entry condition (§3.3). */
export const NON_EXPOSITION_MOVE_TYPES: ReadonlySet<MoveType> = new Set<MoveType>([
  'retrieval_check',
  'prereq_pulse',
  'socratic_probe',
]);

/** Parameter bounds transcribed from §3 / §4.1. `undefined` fields simply do not apply to the move. */
export interface MoveParamBounds {
  /** Inclusive integer range for the move's countable parameter, when it has one. */
  count?: { param: string; min: number; max: number; exact?: number };
  /** Word ceilings per render depth (explanation only). */
  word_cap?: Record<string, number>;
}

export type PredicateOutcome =
  | { ok: true }
  | { ok: false; code: string; reason: string; rewrite_to?: MoveType };

export interface MoveEvalContext {
  state: SessionStateV1;
  profile: TopicProfileV1;
  policy?: LearnPolicyV1;
  config: Pick<LearnConfig, 'move_cap'>;
  /** Set when the planner explicitly justified an "or planner justifies" entry (§3.5). */
  plannerJustified?: boolean;
}

export interface MovePredicate {
  /** Stable identifier, surfaced in `plan_reasoning` / audit payloads when the move is rewritten. */
  code: string;
  /** Hyperspec clause this predicate implements. */
  clause: string;
  test: (ctx: MoveEvalContext) => PredicateOutcome;
}

export interface MoveLibraryEntry {
  move: MoveType;
  block_type: LearnBlockType;
  /** Counts as exposition for §3.3's "≥1 exposition move occurred" gate. */
  exposition: boolean;
  /** §3.6/§3.7 — belongs to the closing pair. */
  closing: boolean;
  requires_response: boolean;
  /** May carry `checkpoint_advance: true` (graded / committing moves only). */
  counts_toward_checkpoints: boolean;
  param_bounds: MoveParamBounds;
  entry_conditions: MovePredicate[];
  /** Server-side rewrite target when an entry condition fails. §4.2: always the safe fallback. */
  rewrite_to: MoveType;
}

// ---------------------------------------------------------------------------
// Derived state helpers (pure) — these read what the session actually recorded,
// so no predicate depends on a counter that some other service must remember
// to increment.
// ---------------------------------------------------------------------------

export interface ProbeChainState {
  /** Number of chains started this session, including one still open. */
  chains_used: number;
  /** Probes already asked in the currently open chain (0 when no chain is open). */
  turn: number;
  open: boolean;
}

/**
 * Reconstructs probe-chain usage from the move digest instead of trusting a
 * counter. A chain is a maximal run of consecutive `socratic_probe` moves; it
 * closes when a different move follows, when the student took the "Just explain
 * it" escape (`outcome.probe_escaped`), or when it reached its turn cap.
 */
export function deriveProbeChains(state: SessionStateV1): ProbeChainState {
  let chains = 0;
  let turn = 0;
  let open = false;
  for (const m of state.moves) {
    if (m.move_type !== 'socratic_probe') {
      open = false;
      turn = 0;
      continue;
    }
    if (!open) {
      chains += 1;
      open = true;
      turn = 0;
    }
    turn += 1;
    if (m.outcome?.probe_escaped || turn >= PROBE_MAX_TURNS_PER_CHAIN) {
      open = false;
    }
  }
  return { chains_used: chains, turn: open ? turn : 0, open };
}

export function hasExpositionMove(state: SessionStateV1): boolean {
  return state.moves.some((m) => !NON_EXPOSITION_MOVE_TYPES.has(m.move_type));
}

/** §4.2 — the last `CLOSING_PAIR_SIZE` slots before `move_cap` are the closing phase. */
export function isClosingPhase(state: SessionStateV1, moveCap: number): boolean {
  return state.moves.length >= Math.max(0, moveCap - CLOSING_PAIR_SIZE);
}

/** §3.7 — artifact_commit's second legal entry: directly after a retrieval_check with ≥1 wrong. */
export function afterWrongRetrievalCheck(state: SessionStateV1): boolean {
  const last = state.moves[state.moves.length - 1];
  if (!last || last.move_type !== 'retrieval_check') return false;
  return (last.outcome?.answered?.wrong ?? 0) >= 1;
}

/** §3.4 — both prereq questions wrong forces remediation + one extra checkpoint. */
export function prereqPulseFailed(state: SessionStateV1): boolean {
  const last = state.moves[state.moves.length - 1];
  if (!last || last.move_type !== 'prereq_pulse') return false;
  return (last.outcome?.answered?.wrong ?? 0) >= PREREQ_PULSE_QUESTION_COUNT;
}

/** Weakest prerequisite by mastery snapshot; used for the forced remediation anchor. */
export function weakestPrerequisite(
  profile: TopicProfileV1,
  state: SessionStateV1,
): { atom_id: string | null; label: string } | null {
  if (!profile.prerequisites.length) return null;
  let weakest = profile.prerequisites[0]!;
  let weakestScore = Number.POSITIVE_INFINITY;
  for (const p of profile.prerequisites) {
    const score = p.atom_id ? (state.mastery_snapshot?.[p.atom_id] ?? 0) : 0;
    if (score < weakestScore) {
      weakestScore = score;
      weakest = p;
    }
  }
  return weakest;
}

// ---------------------------------------------------------------------------
// Predicate constructors
// ---------------------------------------------------------------------------

const requiresKnowledgeType = (
  clause: string,
  accepted: ReadonlyArray<TopicProfileV1['knowledge_type'][number]>,
): MovePredicate => ({
  code: 'knowledge_type_mismatch',
  clause,
  test: (ctx) =>
    ctx.profile.knowledge_type.some((k) => accepted.includes(k))
      ? { ok: true }
      : {
          ok: false,
          code: 'knowledge_type_mismatch',
          reason: `topic knowledge_type [${ctx.profile.knowledge_type.join(', ')}] does not include ${accepted.join('|')}`,
        },
});

const notInClosingPhase: MovePredicate = {
  code: 'closing_phase_reserved',
  clause: '§4.2',
  test: (ctx) =>
    isClosingPhase(ctx.state, ctx.config.move_cap)
      ? {
          ok: false,
          code: 'closing_phase_reserved',
          reason: 'session is in the closing phase; only synthesis and artifact_commit may run',
        }
      : { ok: true },
};

const closingPhaseOnly: MovePredicate = {
  code: 'closing_phase_only',
  clause: '§3.6',
  test: (ctx) =>
    isClosingPhase(ctx.state, ctx.config.move_cap)
      ? { ok: true }
      : {
          ok: false,
          code: 'closing_phase_only',
          reason: 'closing-phase move requested mid-session',
        },
};

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const MOVE_LIBRARY: Readonly<Record<MoveType, MoveLibraryEntry>> = Object.freeze({
  // §3.1 — always legal; the universal fallback, so it carries no entry condition.
  direct_explanation: {
    move: 'direct_explanation',
    block_type: 'explanation',
    exposition: true,
    closing: false,
    requires_response: false,
    counts_toward_checkpoints: false,
    param_bounds: { word_cap: { base: 180, deeper: 250 } },
    entry_conditions: [],
    rewrite_to: 'direct_explanation',
  },

  // §3.2 — entry: knowledge_type ⊇ procedural|skill.
  worked_example: {
    move: 'worked_example',
    block_type: 'worked_example',
    exposition: true,
    closing: false,
    requires_response: true,
    counts_toward_checkpoints: false,
    param_bounds: { count: { param: 'step_count', min: 3, max: 6 } },
    entry_conditions: [requiresKnowledgeType('§3.2', ['procedural', 'skill']), notInClosingPhase],
    rewrite_to: 'direct_explanation',
  },

  // §3.3 — entry: ≥1 exposition move occurred (hard), or goal='revision'.
  retrieval_check: {
    move: 'retrieval_check',
    block_type: 'question_set',
    exposition: false,
    closing: false,
    requires_response: true,
    counts_toward_checkpoints: true,
    param_bounds: { count: { param: 'question_count', min: 1, max: 3 } },
    entry_conditions: [
      {
        code: 'no_prior_exposition',
        clause: '§3.3',
        test: (ctx) =>
          hasExpositionMove(ctx.state) || ctx.state.goal === 'revision'
            ? { ok: true }
            : {
                ok: false,
                code: 'no_prior_exposition',
                reason: 'no exposition move has run yet and the goal is not revision',
              },
      },
      notInClosingPhase,
    ],
    rewrite_to: 'direct_explanation',
  },

  // §3.4 — first two moves only, never when prerequisite_density is low, exactly 2 questions.
  prereq_pulse: {
    move: 'prereq_pulse',
    block_type: 'question_set',
    exposition: false,
    closing: false,
    requires_response: true,
    counts_toward_checkpoints: true,
    param_bounds: {
      count: {
        param: 'question_count',
        min: PREREQ_PULSE_QUESTION_COUNT,
        max: PREREQ_PULSE_QUESTION_COUNT,
        exact: PREREQ_PULSE_QUESTION_COUNT,
      },
    },
    entry_conditions: [
      {
        code: 'prereq_pulse_too_late',
        clause: '§3.4',
        test: (ctx) =>
          ctx.state.moves.length < PREREQ_PULSE_MAX_MOVE_INDEX
            ? { ok: true }
            : {
                ok: false,
                code: 'prereq_pulse_too_late',
                reason: 'prereq_pulse is legal in the first two moves only',
              },
      },
      {
        code: 'prereq_density_low',
        clause: '§3.4',
        test: (ctx) =>
          ctx.profile.prerequisite_density === 'low'
            ? {
                ok: false,
                code: 'prereq_density_low',
                reason: 'topic has low prerequisite density; a prereq pulse would waste a move',
              }
            : { ok: true },
      },
      {
        code: 'prereq_pulse_repeat',
        clause: '§3.4',
        test: (ctx) =>
          ctx.state.moves.some((m) => m.move_type === 'prereq_pulse')
            ? {
                ok: false,
                code: 'prereq_pulse_repeat',
                reason: 'a prereq pulse has already run this session',
              }
            : { ok: true },
      },
    ],
    rewrite_to: 'direct_explanation',
  },

  // §3.5 — entry: native_representation ∈ {visual_spatial, temporal_sequence, comparative_table},
  // or the planner justifies it. NOTE: the pre-rewrite code gated this on knowledge_type.
  visual_spawn: {
    move: 'visual_spawn',
    block_type: 'canvas_embed',
    exposition: true,
    closing: false,
    requires_response: false,
    counts_toward_checkpoints: false,
    param_bounds: {},
    entry_conditions: [
      {
        code: 'representation_not_visual',
        clause: '§3.5',
        test: (ctx) => {
          const visual: ReadonlyArray<TopicProfileV1['native_representation']> = [
            'visual_spatial',
            'temporal_sequence',
            'comparative_table',
          ];
          if (visual.includes(ctx.profile.native_representation)) return { ok: true };
          if (ctx.plannerJustified) return { ok: true };
          return {
            ok: false,
            code: 'representation_not_visual',
            reason: `native_representation is ${ctx.profile.native_representation} and the planner gave no justification`,
          };
        },
      },
      notInClosingPhase,
    ],
    rewrite_to: 'direct_explanation',
  },

  // §3.6 — closing phase only.
  synthesis: {
    move: 'synthesis',
    block_type: 'synthesis',
    exposition: false,
    closing: true,
    requires_response: true,
    counts_toward_checkpoints: true,
    param_bounds: {},
    entry_conditions: [closingPhaseOnly],
    rewrite_to: 'direct_explanation',
  },

  // §3.7 — closing phase, OR right after a retrieval_check with ≥1 wrong. ≤6 cards.
  artifact_commit: {
    move: 'artifact_commit',
    block_type: 'artifact_commit',
    exposition: false,
    closing: true,
    requires_response: true,
    counts_toward_checkpoints: true,
    param_bounds: { count: { param: 'max_cards', min: 1, max: 6 } },
    entry_conditions: [
      {
        code: 'artifact_commit_out_of_phase',
        clause: '§3.7',
        test: (ctx) =>
          isClosingPhase(ctx.state, ctx.config.move_cap) || afterWrongRetrievalCheck(ctx.state)
            ? { ok: true }
            : {
                ok: false,
                code: 'artifact_commit_out_of_phase',
                reason:
                  'artifact_commit is legal in the closing phase or straight after a retrieval_check with a wrong answer',
              },
      },
    ],
    rewrite_to: 'direct_explanation',
  },

  // §3.8 — entry: knowledge_type ⊇ conceptual. Hard cap 2 probes/chain, 2 chains/session.
  socratic_probe: {
    move: 'socratic_probe',
    block_type: 'probe',
    exposition: false,
    closing: false,
    requires_response: true,
    counts_toward_checkpoints: false,
    param_bounds: { count: { param: 'turn', min: 1, max: PROBE_MAX_TURNS_PER_CHAIN } },
    entry_conditions: [
      requiresKnowledgeType('§3.8', ['conceptual']),
      {
        code: 'probe_cap_reached',
        clause: '§3.8',
        test: (ctx) => {
          const chains = deriveProbeChains(ctx.state);
          if (chains.open) {
            return chains.turn < PROBE_MAX_TURNS_PER_CHAIN
              ? { ok: true }
              : {
                  ok: false,
                  code: 'probe_turn_cap',
                  reason: `probe chain already used ${chains.turn} of ${PROBE_MAX_TURNS_PER_CHAIN} turns`,
                };
          }
          return chains.chains_used < PROBE_MAX_CHAINS_PER_SESSION
            ? { ok: true }
            : {
                ok: false,
                code: 'probe_chain_cap',
                reason: `session already used ${chains.chains_used} of ${PROBE_MAX_CHAINS_PER_SESSION} probe chains`,
              };
        },
      },
      notInClosingPhase,
    ],
    rewrite_to: 'direct_explanation',
  },
} satisfies Record<MoveType, MoveLibraryEntry>);

export const MOVE_KEYS = Object.keys(MOVE_LIBRARY) as MoveType[];

export function moveEntry(move: MoveType): MoveLibraryEntry {
  return MOVE_LIBRARY[move] ?? MOVE_LIBRARY.direct_explanation;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type MoveDecision =
  | { legal: true; move: MoveType }
  | {
      legal: false;
      move: MoveType;
      rewrite_to: MoveType;
      code: string;
      reason: string;
      clause: string;
    };

/** `evaluate(entry, ctx) -> legal | illegal(reason)` — the planner's single legality question. */
export function evaluateMove(entry: MoveLibraryEntry, ctx: MoveEvalContext): MoveDecision {
  for (const predicate of entry.entry_conditions) {
    const outcome = predicate.test(ctx);
    if (!outcome.ok) {
      return {
        legal: false,
        move: entry.move,
        rewrite_to: outcome.rewrite_to ?? entry.rewrite_to,
        code: outcome.code,
        reason: outcome.reason,
        clause: predicate.clause,
      };
    }
  }
  return { legal: true, move: entry.move };
}

/** Clamps a planner's params to the entry's declared bounds. Silent correction, never rejection. */
export function clampParams(
  move: MoveType,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const bounds = moveEntry(move).param_bounds;
  const next = { ...params };
  const count = bounds.count;
  if (count) {
    if (count.exact !== undefined) {
      next[count.param] = count.exact;
    } else {
      const raw = Number(next[count.param]);
      const value = Number.isFinite(raw) ? Math.round(raw) : count.min;
      next[count.param] = Math.min(count.max, Math.max(count.min, value));
    }
  }
  if (bounds.word_cap && next.depth !== undefined && !(String(next.depth) in bounds.word_cap)) {
    next.depth = 'base';
  }
  return next;
}

/** The constraint text handed to the plan prompt, generated from the library so the two cannot drift. */
export function moveLibraryConstraintLines(): string[] {
  return [
    'direct_explanation → explanation. Always legal. {depth:base|deeper}. base ≤180 words, deeper ≤250 words.',
    'worked_example → worked_example. Entry: knowledge_type includes procedural or skill. step_count 3-6.',
    'retrieval_check → question_set. Entry: at least one exposition move has run, OR goal=revision. question_count 1-3.',
    `prereq_pulse → question_set. Entry: first two moves only AND prerequisite_density != low. EXACTLY ${PREREQ_PULSE_QUESTION_COUNT} questions on profile.prerequisites.`,
    'visual_spawn → canvas_embed. Entry: native_representation in {visual_spatial, temporal_sequence, comparative_table}, otherwise state a justification in reasoning.',
    'synthesis → synthesis. Entry: closing phase only.',
    'artifact_commit → artifact_commit. Entry: closing phase, OR immediately after a retrieval_check with at least one wrong answer. max_cards ≤6.',
    `socratic_probe → probe. Entry: knowledge_type includes conceptual. Hard cap ${PROBE_MAX_TURNS_PER_CHAIN} probes per chain and ${PROBE_MAX_CHAINS_PER_SESSION} chains per session; a third is rewritten server-side.`,
  ];
}
