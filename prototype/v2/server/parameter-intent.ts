import {
  validateParams,
  type Simulation,
  type Params,
} from '../simulations/runtime';
/** Protect explicit numeric setting requests from confusing parameter units with run duration.
 * Only imperative setting clauses are recognized; open questions remain the teacher's job.
 */
export function explicitParameterPatch(
  question: string,
  sim: Simulation,
): Params {
  if (
    /\b(?:do not|don't|never)\s+(?:set|change|make|adjust|try|replace)/i.test(
      question,
    )
  )
    return {};
  const aliases: Record<string, string> =
    sim.id === 'traffic'
      ? {
          headway: '(?:following (?:time|gap)|time headway|headway)',
          count: '(?:car count|number of cars)',
          desiredSpeed: 'desired speed',
        }
      : sim.id === 'neural'
        ? {
            x1: '(?:input ?x[₁1]|x[₁1])',
            x2: '(?:input ?x[₂2]|x[₂2])',
            weight: '(?:connection )?weight',
            target: 'target',
            learningRate: 'learning rate',
          }
        : sim.id === 'rocket'
          ? {
              dryMass: 'dry mass',
              altitude: '(?:altitude|height)',
              gravity: 'gravity',
            }
          : sim.id === 'relativity'
            ? { duration: '(?:Earth interval|Earth duration)' }
            : {};
  const patch: Params = {};
  for (const [key, alias] of Object.entries(aliases)) {
    const match = question.match(
      new RegExp(
        `\\b(?:set|change|adjust|make)\\s+(?:the\\s+)?${alias}\\s+(?:to|=)\\s*(-?\\d+(?:\\.\\d+)?)`,
        'i',
      ),
    );
    if (match) patch[key] = Number(match[1]);
  }
  if (sim.id === 'relativity') {
    const speed = question.match(
      /\b(?:try|set\s+(?:the\s+)?(?:speed|velocity)\s+to|change\s+(?:the\s+)?(?:speed|velocity)\s+to)\s+(0?\.\d+|0|1)\s*c\b/i,
    );
    if (speed) patch.beta = Number(speed[1]);
  }
  if (
    sim.id === 'attention' &&
    !/\b(?:do not|don't|never)\s+replace/i.test(question)
  ) {
    const replacement = question.match(
      /\breplace\s+(?:the\s+(?:noun|word|token)\s+)?["“']?([a-z0-9-]{1,20})["”']?\s+with\s+["“']?([a-z0-9-]{1,20})/i,
    );
    if (replacement) {
      const tokens = String(sim.params.tokens).trim().split(/\s+/);
      if (!tokens.some((t) => t.toLowerCase() === replacement[1].toLowerCase()))
        throw Error(
          `The current sentence has no “${replacement[1]}” token. Choose a word from the visible sentence.`,
        );
      patch.tokens = tokens
        .map((t) =>
          t.toLowerCase() === replacement[1].toLowerCase() ? replacement[2] : t,
        )
        .join(' ');
    }
  }
  return validateParams(sim.id, patch);
}
