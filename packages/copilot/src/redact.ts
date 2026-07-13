/**
 * Secret redaction for AI-run logging (data-access boundaries + PII redaction — see
 * docs/AI-GUARDRAILS.md). The Copilot persists the employee prompt, gathered context, tool
 * arguments and results into `ai_runs` / `ai_tool_calls`, which are surfaced in the AI Audit
 * UI. Those surfaces must never carry a live secret. This pass scrubs:
 *
 *  - object/array entries whose KEY names a credential (token, password, secret, …);
 *  - free-text VALUES that match a high-confidence secret shape (Bearer tokens, JWTs,
 *    `sk-…` / AWS access keys, and `key = value` credential assignments inside a string).
 *
 * It is deliberately conservative — it targets credential shapes, not ordinary prose — so it
 * does not mangle the human-readable prompt. It is a pure function (no I/O), deep-clones its
 * input and is safe against cycles.
 */

export const REDACTED = '[REDACTED]';

/**
 * Object keys whose value is always a credential and must be masked wholesale.
 *
 * These are matched against the key's WORD SEGMENTS, never as a raw substring. The alternation
 * below contains some very short terms, and an unanchored substring test made them ravenous:
 * `className` contains the letters of `ssn` (cla-SSN-ame), `businessName` contains them too, and
 * `notPublished` contains `otp` (n-OTP-ublished). All three were being replaced with [REDACTED] —
 * so an AI run that looked up a class was shown a redacted class name and had to guess.
 *
 * Anchoring costs no coverage: keys in this codebase are camelCase or snake_case, and both
 * normalize cleanly (`apiKey`/`x-api-key` → `api_key`, `accessToken` → `access_token`). The
 * trailing `s?` keeps plurals (`credentials`, `tokens`) covered.
 */
const SENSITIVE_KEY = new RegExp(
  `(?:^|_)(?:${[
    'pass(?:word|phrase)?',
    'secret',
    'token',
    'api_?key',
    'access_?key',
    'client_?secret',
    'authorization',
    'cookie',
    'credential',
    'private_?key',
    'session_?(?:id|secret)',
    'otp',
    'mfa_?code',
    'cvv',
    'ssn',
  ].join('|')})s?(?:_|$)`,
  'i',
);

/** `apiKey` → `api_key`, `x-api-key` → `x_api_key`, `APIKey` → `api_key`, `SSN` → `ssn`. */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // apiKey  → api_Key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2') // APIKey  → API_Key
    .replace(/[^a-zA-Z0-9]+/g, '_') // x-api-key → x_api_key
    .toLowerCase();
}

/** True when a key names a credential — see SENSITIVE_KEY on why this is not a substring test. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(normalizeKey(key));
}

/** High-confidence secret shapes to scrub from inside free-text string values. */
const VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, // Authorization: Bearer <token>
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, // JWT
  /\bsk-[A-Za-z0-9]{16,}\b/g, // sk- style API key
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, // AWS access key id
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack token
];

/**
 * `password=…`, `api_key: …`, `token => …` assignments embedded in a longer string. Group 2
 * captures the separator with its original surrounding whitespace so it is preserved on
 * replacement.
 */
const ASSIGNMENT_PATTERN =
  /\b(pass(?:word|phrase)?|secret|token|api[-_]?key|access[-_]?key|client[-_]?secret|authorization|credential|private[-_]?key)\b(\s*(?:=|:|=>)\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;

function redactString(value: string): string {
  let out = value;
  for (const re of VALUE_PATTERNS) out = out.replace(re, REDACTED);
  out = out.replace(ASSIGNMENT_PATTERN, (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`);
  return out;
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(val, seen);
  }
  return out;
}

/** Deep-redact secrets from a value before it is persisted to an AI-run record. */
export function redactSecrets<T>(value: T): T {
  return redact(value, new WeakSet()) as T;
}
