import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY, RECENT_AUTH_KEY } from '../../../common/decorators';
import { PetrosReflectionOperationsController } from './petros-reflection.controller';

describe('Petros reflection privileged access', () => {
  it('gates the aggregate dashboard and requires recent auth for identifiable evidence', () => {
    const prototype = PetrosReflectionOperationsController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.dashboard)).toEqual(['ai.view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, prototype.evidence)).toEqual(['ai.view']);
    expect(Reflect.getMetadata(RECENT_AUTH_KEY, prototype.evidence)).toBe(true);
  });
});
