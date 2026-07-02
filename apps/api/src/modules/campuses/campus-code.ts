/**
 * Campus codes are system-generated and immutable — never user-typed. The format is a short
 * name-derived alpha prefix, a hyphen, and a zero-padded sequence that is unique within the
 * institution (e.g. "United Indian School" → `UIS-01`, then `UIS-02`, …). Generation is pure: the
 * caller supplies the codes already taken for that institution, so it works identically inside a
 * provisioning transaction (approval) and a normal create.
 */

/** Derive a 2–5 char A–Z0–9 prefix: word-initials for multi-word names, else the leading chars. */
function codePrefix(name: string): string {
  const words = name
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
  let prefix = words.length >= 2 ? words.map((w) => w[0]).join('') : (words[0] ?? '');
  prefix = prefix.replace(/[^A-Z0-9]/g, '').slice(0, 5);
  if (prefix.length < 2) prefix = `${prefix}CMP`.slice(0, 3);
  return prefix;
}

/** Lowest unused `PREFIX-NN` for the institution; falls back to a random suffix past 99. */
export function buildCampusCode(name: string, existingCodes: string[]): string {
  const prefix = codePrefix(name);
  const taken = new Set(existingCodes.map((c) => c.toUpperCase()));
  for (let seq = 1; seq <= 99; seq++) {
    const code = `${prefix}-${String(seq).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
