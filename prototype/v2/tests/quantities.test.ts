import { it, expect } from 'vitest';
import { massFacts, validateMassClaims } from '../server/quantity-guards';
const facts = massFacts([
  {
    tool: 'sim_scale_mass',
    before: { mass: 1450, fuel: 450 },
    after: { mass: 2900, fuel: 450 },
  },
]);
it('derives dry mass from fuel and total mass in executed tool observations', () =>
  expect(facts).toEqual([
    { totalBefore: 1450, totalAfter: 2900, dryBefore: 1000, dryAfter: 2450 },
  ]));
it('rejects total-mass numbers mislabeled as dry mass', () => {
  expect(() =>
    validateMassClaims(
      'The dry mass changed from 1,450 kg to 2,900 kg.',
      facts,
    ),
  ).toThrow();
  expect(() =>
    validateMassClaims(
      'Doubling the dry mass changes the acceleration.',
      facts,
    ),
  ).toThrow();
});
it('accepts correctly labeled independent dry and total mass observations', () => {
  expect(() =>
    validateMassClaims('Total mass changed from 1,450 to 2,900 kg.', facts),
  ).not.toThrow();
  expect(() =>
    validateMassClaims('Dry mass changed from 1000 to 2450 kg.', facts),
  ).not.toThrow();
});
