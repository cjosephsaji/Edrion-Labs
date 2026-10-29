export const TREE = [
  [3, 5],
  [2, 9],
  [1, 4],
] as const;
export function minimax(tree: readonly (readonly number[])[] = TREE) {
  const children = tree.map((leaves) => Math.min(...leaves));
  const value = Math.max(...children);
  return { children, value, best: children.indexOf(value) };
}
export function alphaBeta(tree: readonly (readonly number[])[] = TREE) {
  let alpha = -Infinity;
  const events: {
    branch: number;
    leaf: number;
    value: number;
    skipped: boolean;
    alpha: number;
    beta: number;
  }[] = [];
  for (let b = 0; b < tree.length; b++) {
    let beta = Infinity;
    const leaves = tree[b]!;
    for (let l = 0; l < leaves.length; l++) {
      const skipped = beta <= alpha;
      if (!skipped) beta = Math.min(beta, leaves[l]!);
      events.push({
        branch: b,
        leaf: l,
        value: leaves[l]!,
        skipped,
        alpha,
        beta,
      });
    }
    alpha = Math.max(alpha, beta);
  }
  return {
    value: alpha,
    events,
    visited: events.filter((e) => !e.skipped).length,
    skipped: events.filter((e) => e.skipped).length,
  };
}
export function entail(
  facts: string[],
  query: string,
): { status: 'entailed' | 'not entailed'; path: string[] } {
  const entity = ['Tweety', 'Rio'].find(
    (x) => query === `HasWings(${x})` && facts.includes(`Bird(${x})`),
  );
  if (facts.includes(query)) return { status: 'entailed', path: [query] };
  return entity
    ? {
        status: 'entailed',
        path: [
          `Bird(${entity})`,
          `x := ${entity}`,
          'Bird(x) → HasWings(x)',
          query,
        ],
      }
    : {
        status: 'not entailed',
        path: [
          'No supporting rule or fact in this knowledge base. This does not establish falsehood.',
        ],
      };
}
export const HAZARDS = [
  {
    id: 'edge',
    label: 'Missing top guardrail',
    reason:
      'An exposed edge creates a fall-from-height risk. The safer illustration adds a top rail and barrier.',
    page: 9,
  },
  {
    id: 'tools',
    label: 'Loose tools at the edge',
    reason:
      'Unsecured tools can fall onto people below. The safer illustration stores them in a secured box away from the edge.',
    page: 7,
  },
  {
    id: 'ladder',
    label: 'Ladder on a mobile tower',
    reason:
      'The notes warn against using a tower to support a ladder. The safer illustration removes it and shows separate access.',
    page: 12,
  },
  {
    id: 'wheel',
    label: 'Unsecured castor / uneven base',
    reason:
      'Instability can lead to collapse. The safer illustration shows a firm, level base and locked supports.',
    page: 12,
  },
  {
    id: 'power',
    label: 'Overhead power line',
    reason:
      'Nearby overhead lines create an electrical hazard. The safer illustration separates the scaffold from the line; no exact clearance is implied.',
    page: 7,
  },
] as const;
export const POLLUTION = [
  {
    id: 'sewage',
    label: 'Untreated wastewater',
    control: 'Treat wastewater before discharge',
    reason:
      'Treatment before discharge controls the untreated sewage pathway in this illustration.',
    page: 44,
  },
  {
    id: 'runoff',
    label: 'Farm chemical runoff',
    control: 'Reduce agrochemical runoff',
    reason:
      'Avoid excessive fertilizers and pesticides to reduce the runoff pathway.',
    page: 45,
  },
  {
    id: 'waste',
    label: 'Dumped solid waste',
    control: 'Collect and dispose / recycle waste',
    reason:
      'Keep debris out of water bodies and use appropriate waste collection.',
    page: 47,
  },
  {
    id: 'oil',
    label: 'Oil / grease into drains',
    control: 'Prevent oil and grease entering drains',
    reason:
      'The notes say not to pour fat and grease down drains. Dispose of waste carefully.',
    page: 48,
  },
] as const;
export function tinyModel(input: number, weight: number) {
  return input * weight;
}
export function elapsedTime(earthYears: number, speedFraction: number) {
  if (earthYears < 0 || speedFraction < 0 || speedFraction >= 1)
    throw Error('Use 0 ≤ v/c < 1 and nonnegative years');
  return earthYears * Math.sqrt(1 - speedFraction ** 2);
}
