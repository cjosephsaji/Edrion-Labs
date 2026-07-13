/**
 * Cost accounting for Petros turns.
 *
 * This exists so the saving is *measurable* rather than asserted: every turn already reported
 * input / cached-input / output tokens from the Responses API, but nothing turned them into money,
 * so nobody could see what a conversation cost or whether a change helped.
 *
 * IMPORTANT: these rates price our own telemetry — they are not what OpenAI bills. Rates move, and
 * the deployed model is whatever `OPENAI_MODEL` says, so the table is overridable with
 * `OPENAI_PRICING_JSON` and the defaults are matched by model FAMILY (nano / mini / full) rather
 * than by exact model id. Keep them in step with the provider's published price list.
 */

/** USD per 1M tokens. */
export interface ModelRate {
  input: number;
  cachedInput: number;
  output: number;
}

export type ModelFamily = 'nano' | 'mini' | 'full';

/**
 * Defaults follow the GPT-5 family's published shape: cached input is an order of magnitude
 * cheaper than fresh input, and output is several times either — which is exactly why the levers
 * in this module's siblings are ordered the way they are (shrink the input, cache what repeats,
 * cap the output).
 */
export const DEFAULT_RATES: Record<ModelFamily, ModelRate> = {
  nano: { input: 0.05, cachedInput: 0.005, output: 0.4 },
  mini: { input: 0.25, cachedInput: 0.025, output: 2.0 },
  full: { input: 1.25, cachedInput: 0.125, output: 10.0 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

/** `gpt-5.4-nano` → nano, `gpt-5.4-mini` → mini, `gpt-5.4-2026-03-05` → full. */
export function familyOf(model: string): ModelFamily {
  const m = model.toLowerCase();
  if (m.includes('nano')) return 'nano';
  if (m.includes('mini')) return 'mini';
  return 'full';
}

export function rateFor(model: string, overrides?: Record<string, ModelRate>): ModelRate {
  return overrides?.[model] ?? overrides?.[familyOf(model)] ?? DEFAULT_RATES[familyOf(model)];
}

/**
 * Spend for one turn in millionths of a USD (integer — a turn costs far less than a cent, and
 * floats accumulate drift once you start summing thousands of them).
 *
 * `inputTokens` from the Responses API is the TOTAL input, cached portion included, so the cached
 * slice is billed at the cache rate and only the remainder at the full rate.
 */
export function costMicroUsd(usage: Usage, model: string, overrides?: Record<string, ModelRate>): number {
  const rate = rateFor(model, overrides);
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const usd =
    (fresh * rate.input + cached * rate.cachedInput + usage.outputTokens * rate.output) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

export function formatUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(6)}`;
}

/** Parse `OPENAI_PRICING_JSON`. A malformed override must never take the assistant down. */
export function parseRateOverrides(raw: string | undefined): Record<string, ModelRate> | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ModelRate>>;
    const out: Record<string, ModelRate> = {};
    for (const [model, rate] of Object.entries(parsed)) {
      if (typeof rate?.input !== 'number' || typeof rate?.output !== 'number') continue;
      out[model] = {
        input: rate.input,
        cachedInput: rate.cachedInput ?? rate.input / 10,
        output: rate.output,
      };
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}
