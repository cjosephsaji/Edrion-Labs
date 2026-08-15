import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY, RECENT_AUTH_KEY } from '../../common/decorators';
import { PORTAL_PERMISSIONS_KEY } from '../portal/portal.decorators';
import {
  PetrosInstitutionalOperationsController,
  PortalPetrosInstitutionalController,
} from './petros-institutional.controller';

describe('Petros Stage 12 privileged route metadata', () => {
  it('separates policy viewing, policy mutation, and teacher-support permissions', () => {
    const portal = PortalPetrosInstitutionalController.prototype;
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.policy)).toEqual(['petros.policy.view']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.preview)).toEqual(['petros.policy.view']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.draft)).toEqual(['petros.policy.configure']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.updateDraft)).toEqual(['petros.policy.configure']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.publish)).toEqual(['petros.policy.configure']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.rollback)).toEqual(['petros.policy.configure']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.handoffs)).toEqual(['petros.teacher_support.view']);
    expect(Reflect.getMetadata(PORTAL_PERMISSIONS_KEY, portal.signals)).toEqual(['petros.teacher_support.view']);
  });

  it('gates aggregate operations and requires recent authentication for job mutation', () => {
    const operations = PetrosInstitutionalOperationsController.prototype;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, operations.dashboard)).toEqual(['ai.view']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, operations.jobs)).toEqual(['ai.configure']);
    expect(Reflect.getMetadata(RECENT_AUTH_KEY, operations.jobs)).toBe(true);
  });
});
