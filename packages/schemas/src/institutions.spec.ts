import { describe, expect, it } from 'vitest';
import { InstitutionStatus } from '@edrion/shared-types';
import { canTransition, createInstitutionSchema } from './institutions';

describe('institution status transitions', () => {
  it('allows valid lifecycle moves', () => {
    expect(canTransition(InstitutionStatus.Trial, InstitutionStatus.Active)).toBe(true);
    expect(canTransition(InstitutionStatus.Active, InstitutionStatus.Suspended)).toBe(true);
    expect(canTransition(InstitutionStatus.Suspended, InstitutionStatus.Active)).toBe(true);
  });

  it('rejects invalid moves', () => {
    expect(canTransition(InstitutionStatus.Archived, InstitutionStatus.Active)).toBe(false);
    expect(canTransition(InstitutionStatus.Lead, InstitutionStatus.Active)).toBe(false);
  });
});

describe('createInstitutionSchema', () => {
  it('accepts a minimal valid payload and applies defaults', () => {
    const parsed = createInstitutionSchema.parse({
      legalName: 'Riverside Trust',
      displayName: 'Riverside',
      type: 'school',
      country: 'US',
      primaryContact: { name: 'Priya', email: 'priya@riverside.edu' },
    });
    expect(parsed.timezone).toBe('UTC');
    expect(parsed.currency).toBe('USD');
    expect(parsed.supportTier).toBe('standard');
  });

  it('rejects a bad country code and email', () => {
    const r = createInstitutionSchema.safeParse({
      legalName: 'X',
      displayName: 'X',
      type: 'school',
      country: 'USA',
      primaryContact: { name: 'A', email: 'not-an-email' },
    });
    expect(r.success).toBe(false);
  });
});
