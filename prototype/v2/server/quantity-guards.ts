/** Deterministic unit/identity checks for a common mass-label error; the teacher still writes its own explanation. */
export interface MassFact {
  totalBefore: number;
  totalAfter: number;
  dryBefore: number;
  dryAfter: number;
}
export function massFacts(
  events: {
    tool: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }[],
): MassFact[] {
  return events
    .filter((e) => e.tool === 'sim_scale_mass')
    .map((e) => ({
      totalBefore: Number(e.before.mass),
      totalAfter: Number(e.after.mass),
      dryBefore: Number(e.before.mass) - Number(e.before.fuel),
      dryAfter: Number(e.after.mass) - Number(e.after.fuel),
    }));
}
export function validateMassClaims(text: string, facts: MassFact[]) {
  for (const fact of facts) {
    if (
      Math.abs(fact.dryAfter - 2 * fact.dryBefore) > 0.01 &&
      /doubl(?:e|ed|ing|es)\s+(?:the\s+)?dry mass/i.test(text)
    )
      throw Error(
        'The tool doubled TOTAL mass, not dry mass. Use the supplied mass identity facts.',
      );
    for (const match of text.matchAll(/dry mass[^!?\n]{0,120}/gi)) {
      const segment = match[0];
      if (/total mass|including fuel/i.test(segment)) continue;
      const numbers = [...segment.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) =>
        Number(m[0].replaceAll(',', '')),
      );
      if (
        numbers.some((n) => Math.abs(n - fact.totalBefore) < 0.01) &&
        numbers.some((n) => Math.abs(n - fact.totalAfter) < 0.01) &&
        Math.abs(fact.dryBefore - fact.totalBefore) > 0.01
      )
        throw Error(
          'Total-mass values were mislabeled as dry mass. Correct the labels using mass identity facts.',
        );
    }
  }
}
