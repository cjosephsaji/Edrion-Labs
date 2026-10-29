import { describe, expect, it, vi } from 'vitest';
import type { InstitutionRegistrationRequest } from '@edrion/database';
import { RegistrationRepository } from './registration.repository';

const institution = {
  institutionInfo: {
    legalName: 'United Indian School',
    displayName: 'UIS',
    type: 'school' as const,
  },
  location: { country: 'KW', city: 'Kuwait', address: '1 School Road', timezone: 'Asia/Kuwait' },
};
const email = 'admin@example.com';
function request(id: string, overrides: Partial<InstitutionRegistrationRequest> = {}) {
  return {
    id,
    status: 'approved',
    contactEmail: email,
    legalName: institution.institutionInfo.legalName,
    type: 'school',
    country: 'KW',
    institutionInfo: institution.institutionInfo,
    location: institution.location,
    ...overrides,
  } as InstitutionRegistrationRequest;
}
function repository(rows: InstitutionRegistrationRequest[]) {
  const where = vi.fn(async () => rows);
  const db = { select: () => ({ from: () => ({ where }) }) };
  return new RegistrationRepository(db as never);
}

describe('registration duplicate detection with a shared contact email', () => {
  it.each(['submitted', 'under_review', 'approved'] as const)(
    'allows a different institution when the earlier application is %s',
    async (status) => {
      const repo = repository([request('uis', { status })]);
      const another = {
        ...institution,
        institutionInfo: {
          ...institution.institutionInfo,
          legalName: 'Another School',
          displayName: 'Another School',
        },
      };
      expect(await repo.findDuplicateApplication(email, another, 'new-draft')).toBeUndefined();
    },
  );

  it('still blocks an identical institution application after approval', async () => {
    const existing = request('uis');
    expect(
      await repository([existing]).findDuplicateApplication(email, institution, 'new-draft'),
    ).toBe(existing);
  });

  it('ignores case and extra spaces when matching the same institution', async () => {
    const existing = request('uis', {
      legalName: '  UNITED   INDIAN SCHOOL ',
      location: { ...institution.location, address: ' 1   SCHOOL ROAD ' },
    });
    expect(
      await repository([existing]).findDuplicateApplication(email, institution, 'new-draft'),
    ).toBe(existing);
  });

  it('allows the same legal name at a different address, in another country, or with a different type', async () => {
    const repo = repository([request('uis')]);
    expect(
      await repo.findDuplicateApplication(email, {
        ...institution,
        location: { ...institution.location, address: '2 School Road' },
      }),
    ).toBeUndefined();
    expect(
      await repo.findDuplicateApplication(email, {
        ...institution,
        location: { ...institution.location, country: 'IN' },
      }),
    ).toBeUndefined();
    expect(
      await repo.findDuplicateApplication(email, {
        ...institution,
        institutionInfo: { ...institution.institutionInfo, type: 'college' },
      }),
    ).toBeUndefined();
  });

  it('excludes the draft being submitted and checks every earlier application', async () => {
    const draft = request('current-draft');
    const other = request('other', { legalName: 'Another School' });
    const duplicate = request('uis');
    expect(
      await repository([draft, other]).findDuplicateApplication(email, institution, draft.id),
    ).toBeUndefined();
    expect(
      await repository([draft, other, duplicate]).findDuplicateApplication(
        email,
        institution,
        draft.id,
      ),
    ).toBe(duplicate);
  });
});
