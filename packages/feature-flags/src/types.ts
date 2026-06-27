import type {
  FeatureDefinitionStatus,
  FeatureResolutionLayer,
  FeatureRolloutType,
  FeatureScope,
} from '@edrion/shared-types';

/**
 * Pure inputs to the resolution engine. The API repository loads these rows; the engine never
 * does IO so it can be unit-tested exhaustively and run identically on the server and (mirrored)
 * the client for the Effective-Value preview.
 */

export interface FeatureDefinitionInput {
  key: string;
  /** Global default when no assignment or rollout applies. */
  defaultValue: boolean;
  status: FeatureDefinitionStatus;
  /** Informational — scopes the registry advertises as assignable. */
  availableScopes?: FeatureScope[];
}

export interface FeatureAssignmentInput {
  scope: FeatureScope;
  /** The id the assignment attaches to (plan/institution/campus/user id, role key). `null` for global. */
  scopeId: string | null;
  value: boolean;
  /** Soft on/off for the assignment row itself; a disabled assignment is ignored. */
  enabled: boolean;
  /** Scheduled activation — before this instant the assignment does not apply. */
  activatesAt?: string | Date | null;
  /** Scheduled expiry — at/after this instant the assignment no longer applies. */
  expiresAt?: string | Date | null;
  setByName?: string | null;
  setAt?: string | Date | null;
  reason?: string | null;
}

export interface FeatureRolloutInput {
  type: FeatureRolloutType;
  enabled: boolean;
  /** 0..100 — used by percentage rollouts. */
  percentage?: number | null;
  /** Subject ids force-enabled (allow_list) or force-disabled (block_list). */
  allowList?: string[] | null;
  blockList?: string[] | null;
  /** Environments this rollout applies in (e.g. ['production']). Empty/undefined = all. */
  environments?: string[] | null;
  /** Schedule window — the rollout only applies between these instants. */
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  setByName?: string | null;
  reason?: string | null;
}

/** The entity we are resolving the feature for. Any field may be absent. */
export interface FeatureResolutionContext {
  planId?: string | null;
  institutionId?: string | null;
  campusId?: string | null;
  institutionUserId?: string | null;
  independentUserId?: string | null;
  employeeRoleKeys?: string[];
  /** Defaults to 'production'. Gates environment rollouts. */
  environment?: string;
  /** ISO instant the resolution is evaluated at. Defaults to "now". */
  now?: string | Date;
  /**
   * Subject used for percentage bucketing and allow/block-list matching. Defaults to the most
   * specific id in the context (user → campus → institution → plan).
   */
  subjectId?: string | null;
}

export interface FeatureResolutionTraceEntry {
  layer: FeatureResolutionLayer;
  scope?: FeatureScope;
  scopeId?: string | null;
  /** Did this layer determine the result (true) or was it considered and skipped (false)? */
  applied: boolean;
  value?: boolean;
  note: string;
}

/** The full, explainable outcome — never just a boolean (see FEATURE-RESOLUTION.md). */
export interface FeatureResolution {
  key: string;
  value: boolean;
  layer: FeatureResolutionLayer;
  scope?: FeatureScope;
  scopeId?: string | null;
  /** Human-readable Effective-Value explanation, e.g. "OFF — kill switch active". */
  reason: string;
  killSwitchActive: boolean;
  /** Ordered record of every layer the engine considered, for the UI explainer. */
  trace: FeatureResolutionTraceEntry[];
}

export interface ResolveFeatureInput {
  definition: FeatureDefinitionInput;
  assignments: FeatureAssignmentInput[];
  rollouts: FeatureRolloutInput[];
  context: FeatureResolutionContext;
}
