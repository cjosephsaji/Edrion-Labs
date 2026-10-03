import { describe, expect, it } from 'vitest';
import {
  createPetrosProjectileView,
  resolvePetrosProjectileBinding,
  updatePetrosProjectileParameter,
} from './petros-projectile-binding';
import { evaluatePetrosProjectile, PETROS_PROJECTILE_ASSUMPTIONS, PETROS_PROJECTILE_CAPABILITY } from './petros-projectile-model';
import {
  projectileBinding,
  projectileLocator,
  projectilePack,
  projectileSourceVersion,
  projectileTrustedContext,
} from './__fixtures__/petros-phase2-projectile';

const state = evaluatePetrosProjectile({
  schemaVersion: 'petros.projectile-input.v1',
  capability: PETROS_PROJECTILE_CAPABILITY,
  assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
  launchVelocity: { x: 12, y: 20, unit: 'm/s' },
  gravity: { value: 10, unit: 'm/s^2' },
  elapsedTime: { value: 1, unit: 's' },
});

describe('isolated projectile binding candidate', () => {
  it('replays parameter updates and derives all linked views from one checkpoint', () => {
    const changed = updatePetrosProjectileParameter(state, { parameter: 'launch_velocity_y', value: 30, unit: 'm/s' });
    expect(changed.input.elapsedTime.value).toBe(0);
    expect(changed.readouts.maximumHeight.value).toBe(45);
    expect(updatePetrosProjectileParameter(state, { parameter: 'launch_velocity_y', value: 30, unit: 'm/s' })).toEqual(changed);

    const view = createPetrosProjectileView(projectileBinding, changed, projectilePack, projectileTrustedContext, projectileBinding.pack);
    expect(view).toMatchObject({ validationStatus: 'engineering_candidate_unverified', educatorApproval: 'not_established', createsLearningEvidence: false, state: changed });
    expect(view.views.map((item) => item.id)).toEqual(['motion', 'velocity', 'heightTime', 'readouts']);
    expect(view.controls).toHaveLength(4);
  });

  it('rejects stale source, objective, pack, unknown concept and a non-identical locator', () => {
    expect(() => resolvePetrosProjectileBinding(projectileBinding, projectilePack, projectileTrustedContext, { ...projectileBinding.pack, version: 2 }))
      .toThrow('PETROS_PROJECTILE_STALE_PACK');

    const staleObjectivePack = { ...projectilePack, objective: { ...projectilePack.objective, version: 2 } };
    const staleObjectiveContext = { ...projectileTrustedContext, currentObjective: staleObjectivePack.objective };
    expect(() => resolvePetrosProjectileBinding(projectileBinding, staleObjectivePack, staleObjectiveContext, projectileBinding.pack))
      .toThrow('PETROS_PROJECTILE_STALE_OBJECTIVE');

    const staleSource = { ...projectileBinding, source: { ...projectileLocator, sourceVersion: 'c'.repeat(64) } };
    expect(() => resolvePetrosProjectileBinding(staleSource, projectilePack, projectileTrustedContext, projectileBinding.pack))
      .toThrow('PETROS_PROJECTILE_STALE_SOURCE');

    const unknownConcept = { ...projectileBinding, conceptId: 'not-in-this-pack' };
    expect(() => resolvePetrosProjectileBinding(unknownConcept, projectilePack, projectileTrustedContext, projectileBinding.pack))
      .toThrow('PETROS_PROJECTILE_UNKNOWN_CONCEPT_SOURCE');

    const wrongLocator = { ...projectileBinding, source: { ...projectileLocator, end: projectileLocator.end + 1 } };
    expect(() => resolvePetrosProjectileBinding(wrongLocator, projectilePack, projectileTrustedContext, projectileBinding.pack))
      .toThrow('PETROS_PROJECTILE_UNKNOWN_CONCEPT_SOURCE');

    expect(projectileBinding.source.sourceVersion).toBe(projectileSourceVersion);
  });
});
