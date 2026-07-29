import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, or, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../../common/tokens';
import { LEARN_CONFIG_DEFAULTS, LEARN_CONFIG_KEYS } from './constants';

/**
 * Who is asking. `campusId` and `institutionUserId` are accepted so callers can
 * pass a principal-shaped object unchanged; neither is a resolution layer today
 * (see migration 0104 for why plan and campus were left out), so both are
 * ignored beyond forming the cache key.
 */
export type LearnConfigContext = {
  institutionId?: string;
  campusId?: string;
  independentUserId?: string;
  institutionUserId?: string;
};

export type LearnModelTier = 'small' | 'mid';

/** Hyperspec 3 §2. Defaults live in LEARN_CONFIG_DEFAULTS. */
export interface LearnConfig {
  move_cap: number;
  profile_ttl_days: number;
  plan_model_tier: LearnModelTier;
  render_model_tier: LearnModelTier;
  grade_model_tier: LearnModelTier;
  judge_model_tier: LearnModelTier;
  profiler_model_tier: LearnModelTier;
  max_free_questions_per_session: number;
  daily_session_cap_per_user: number;
  speculative_planning: boolean;
  default_session_minutes: number;
}

type KnobKey = keyof LearnConfig;

type ConfigRow = {
  id: string;
  key: string;
  scope: string;
  institutionId: string | null;
  independentUserId: string | null;
  valueType: string;
  value: string;
};

const MODEL_TIER_KNOBS = [
  'plan_model_tier',
  'render_model_tier',
  'grade_model_tier',
  'judge_model_tier',
  'profiler_model_tier',
] as const satisfies readonly KnobKey[];

const MODEL_TIERS: readonly string[] = ['small', 'mid'];

/** Reverse lookup: `learn.move_cap` -> `move_cap`. */
const KNOB_BY_CONFIG_KEY = new Map<string, KnobKey>(
  (Object.entries(LEARN_CONFIG_KEYS) as [KnobKey, string][]).map(([knob, key]) => [key, knob]),
);

/** Most specific wins. Higher rank overrides lower. */
const SCOPE_RANK: Record<string, number> = {
  global: 0,
  institution: 1,
  independent_user: 2,
};

/**
 * Resolves the `learn.*` namespace (hyperspec 3 §2) from the `learn_config`
 * table, layering global -> institution -> independent_user over the
 * compile-time defaults.
 *
 * AC-5: changing `move_cap` in the database takes effect within the cache TTL
 * with no redeploy. Nothing here can throw — a missing table, an unreachable
 * database, or a malformed row degrades to the defaults, so an empty
 * `learn_config` reproduces today's behaviour exactly.
 */
@Injectable()
export class LearnConfigService {
  private readonly logger = new Logger(LearnConfigService.name);
  private cache: { key: string; config: LearnConfig; at: number } | null = null;
  private readonly ttlMs = 30_000;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Resolves the whole knob set for a context. Callers take one object. */
  async getAll(ctx?: LearnConfigContext): Promise<LearnConfig> {
    const institutionId = ctx?.institutionId ?? null;
    const independentUserId = ctx?.independentUserId ?? null;
    const cacheKey = `${institutionId ?? '-'}|${independentUserId ?? '-'}`;
    const now = Date.now();
    if (this.cache && this.cache.key === cacheKey && now - this.cache.at < this.ttlMs) {
      return this.cache.config;
    }

    const config = await this.resolve(institutionId, independentUserId);
    this.cache = { key: cacheKey, config, at: now };
    return config;
  }

  private async resolve(institutionId: string | null, independentUserId: string | null): Promise<LearnConfig> {
    const resolved: LearnConfig = { ...LEARN_CONFIG_DEFAULTS };

    let rows: ConfigRow[];
    try {
      const t = schema.learnConfig;
      // One scan of the namespace: the global layer plus whichever owner layer
      // this context is entitled to. Rows for other tenants are excluded in SQL.
      rows = await this.db
        .select({
          id: t.id,
          key: t.key,
          scope: t.scope,
          institutionId: t.institutionId,
          independentUserId: t.independentUserId,
          valueType: t.valueType,
          value: t.value,
        })
        .from(t)
        .where(
          or(
            eq(t.scope, 'global'),
            institutionId ? eq(t.institutionId, institutionId) : undefined,
            independentUserId ? eq(t.independentUserId, independentUserId) : undefined,
          ),
        );
    } catch (error) {
      this.logger.warn(
        `learn_config unreadable (${error instanceof Error ? error.message : String(error)}); using compile-time defaults`,
      );
      return resolved;
    }

    // Track the rank that won each knob so a lower layer cannot overwrite a
    // higher one regardless of the order rows come back in.
    const winningRank = new Map<KnobKey, number>();

    for (const row of rows) {
      const knob = KNOB_BY_CONFIG_KEY.get(row.key);
      if (!knob) {
        this.logger.warn(`learn_config row ${row.id} has unknown key "${row.key}"; ignored`);
        continue;
      }
      const rank = SCOPE_RANK[row.scope];
      if (rank === undefined) {
        this.logger.warn(`learn_config row ${row.id} has unknown scope "${row.scope}"; ignored`);
        continue;
      }
      // Defence in depth against a row whose scope discriminator and owner
      // columns disagree; the DB CHECK already forbids this.
      if (row.scope === 'institution' && row.institutionId !== institutionId) continue;
      if (row.scope === 'independent_user' && row.independentUserId !== independentUserId) continue;

      const parsed = this.parse(knob, row.valueType, row.value, row.id);
      if (parsed === undefined) continue;

      const current = winningRank.get(knob);
      if (current !== undefined && current > rank) continue;
      winningRank.set(knob, rank);
      (resolved as unknown as Record<KnobKey, unknown>)[knob] = parsed;
    }

    return resolved;
  }

  /**
   * Coerces one stored value to the knob's declared shape. Returns `undefined`
   * — never throws — when the row is malformed, so the default stands.
   */
  private parse(knob: KnobKey, valueType: string, raw: string, rowId: string): number | string | boolean | undefined {
    const expected = typeof LEARN_CONFIG_DEFAULTS[knob];
    if (valueType !== expected) {
      this.logger.warn(
        `learn_config row ${rowId} (${knob}) declares value_type "${valueType}" but the knob is ${expected}; ignored`,
      );
      return undefined;
    }

    if (expected === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        this.logger.warn(`learn_config row ${rowId} (${knob}) has non-numeric value "${raw}"; ignored`);
        return undefined;
      }
      return n;
    }

    if (expected === 'boolean') {
      const v = raw.trim().toLowerCase();
      if (v === 'true' || v === 't' || v === '1') return true;
      if (v === 'false' || v === 'f' || v === '0') return false;
      this.logger.warn(`learn_config row ${rowId} (${knob}) has non-boolean value "${raw}"; ignored`);
      return undefined;
    }

    const v = raw.trim();
    if ((MODEL_TIER_KNOBS as readonly string[]).includes(knob) && !MODEL_TIERS.includes(v)) {
      this.logger.warn(`learn_config row ${rowId} (${knob}) has invalid model tier "${raw}"; ignored`);
      return undefined;
    }
    return v;
  }
}
