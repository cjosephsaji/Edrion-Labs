import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationService } from './registration.service';
import { signHs256 } from '../../common/jwt';
import type { ActionContext } from '../../common/action-context';
import type { EdrionRequestContext } from '../../common/request-context';

const SECRET = 'unit-test-secret-1234567890';
const EMAIL = 'head@greenwood.edu';
const ID = 'req-1';

const reqCtx: EdrionRequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  apiEndpoint: 'POST /registration',
};

function token(draftId = ID, purpose = 'registration_draft') {
  return signHs256({ draftId, purpose }, SECRET, 3600);
}

const SECTIONS = {
  institutionInfo: { legalName: 'Greenwood', displayName: 'Greenwood High', type: 'school' as const },
  location: { country: 'US', region: 'US-IL', city: 'Springfield', address: '1 Elm St', timezone: 'UTC' },
  campusInfo: { currentCampuses: 1, firstCampusName: 'Main', expectedStudents: 500 },
  primaryContact: { fullName: 'Head Teacher', email: EMAIL, phone: '+12175550123' },
  subscription: {},
  consent: { termsAccepted: true as const, privacyAccepted: true as const, marketingOptIn: false },
};

function makeService() {
  const repo = {
    findById: vi.fn(),
    update: vi.fn(),
    updateWithVersion: vi.fn(),
    findDuplicateApplication: vi.fn().mockResolvedValue(undefined),
    maxRefSeqForYear: vi.fn().mockResolvedValue(0),
    publicRefExists: vi.fn().mockResolvedValue(false),
    insertReview: vi.fn().mockResolvedValue({}),
    reviewsFor: vi.fn().mockResolvedValue([]),
    auditEventsFor: vi.fn().mockResolvedValue([]),
  };
  const otp = { issue: vi.fn(), verify: vi.fn().mockResolvedValue(undefined) };
  const emails = {
    sendOtp: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
    sendSubmitted: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
    sendReviewStarted: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
    sendRejected: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const env = { SESSION_COOKIE_SECRET: SECRET } as never;
  const geoLookup = { detectLocation: vi.fn().mockResolvedValue({}) };
  const service = new RegistrationService(repo as never, otp as never, emails as never, audit as never, env, geoLookup as never);
  return { service, repo, otp, emails, audit };
}

const adminCtx = {
  principalContext: {
    principal: {
      employeeId: 'emp-1',
      fullName: 'Reviewer',
      roleKeys: ['onboarding_specialist'],
      permissions: { keys: new Set<string>(), hasWildcard: false },
      lastAuthAt: new Date(),
    },
  },
  request: reqCtx,
} as unknown as ActionContext;

describe('RegistrationService resume token', () => {
  it('rejects a tampered/foreign token', async () => {
    const { service, repo } = makeService();
    repo.findById.mockResolvedValue({ id: ID, status: 'draft' });
    await expect(service.getDraft(ID, token('other-id'))).rejects.toMatchObject({
      response: { code: 'INVALID_RESUME_TOKEN' },
    });
  });
});

describe('RegistrationService.patchDraft audit details', () => {
  it('records changed section and field names without field values', async () => {
    const { service, repo, audit } = makeService();
    const draft = {
      id: ID,
      status: 'draft',
      institutionInfo: { legalName: 'Old Legal Name', displayName: 'Greenwood', type: 'school' },
      location: null,
      campusInfo: null,
      primaryContact: null,
      subscription: null,
      consent: null,
      verifiedEmail: null,
      updatedAt: new Date(),
    };
    repo.findById.mockResolvedValue(draft);
    repo.update.mockImplementation(async (_id, patch) => ({ ...draft, ...patch }));

    await service.patchDraft(
      ID,
      token(),
      { institutionInfo: { legalName: 'New Legal Name', displayName: 'Greenwood' } } as never,
      reqCtx,
    );

    expect(audit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'registration.updated',
        newState: {
          changedSections: [{ key: 'institutionInfo', fields: ['legalName'] }],
        },
      }),
    );
  });
});

describe('RegistrationService.submit', () => {
  let h: ReturnType<typeof makeService>;
  beforeEach(() => {
    h = makeService();
  });

  it('blocks submission when the contact email is not verified', async () => {
    h.repo.findById.mockResolvedValue({ id: ID, status: 'draft', emailVerifiedAt: null, verifiedEmail: null });
    await expect(h.service.submit(ID, token(), SECTIONS as never, reqCtx)).rejects.toMatchObject({
      response: { code: 'EMAIL_NOT_VERIFIED' },
    });
  });

  it('blocks a duplicate application for the same institution', async () => {
    h.repo.findById.mockResolvedValue({
      id: ID,
      status: 'draft',
      emailVerifiedAt: new Date(),
      verifiedEmail: EMAIL,
    });
    h.repo.findDuplicateApplication.mockResolvedValue({ id: 'other' });
    await expect(h.service.submit(ID, token(), SECTIONS as never, reqCtx)).rejects.toMatchObject({
      response: { code: 'DUPLICATE_REGISTRATION' },
    });
  });

  it('allows the contact email to be reused for another institution', async () => {
    h.repo.findById.mockResolvedValue({
      id: ID,
      status: 'draft',
      emailVerifiedAt: new Date(),
      verifiedEmail: EMAIL,
    });
    h.repo.findDuplicateApplication.mockResolvedValue(undefined);
    h.repo.update.mockImplementation(async (_id, patch) => ({ id: ID, ...patch }));

    const result = await h.service.submit(ID, token(), SECTIONS as never, reqCtx);

    expect(result.status).toBe('submitted');
    expect(h.repo.findDuplicateApplication).toHaveBeenCalledWith(EMAIL, SECTIONS, ID);
  });

  it('assigns a reference, audits, and emails on success', async () => {
    h.repo.findById.mockResolvedValue({
      id: ID,
      status: 'draft',
      emailVerifiedAt: new Date(),
      verifiedEmail: EMAIL,
      publicRef: null,
    });
    h.repo.update.mockImplementation(async (_id, patch) => ({ id: ID, displayName: 'Greenwood High', ...patch }));

    const res = await h.service.submit(ID, token(), SECTIONS as never, reqCtx);

    expect(res.status).toBe('submitted');
    expect(res.publicRef).toMatch(/^EDR-REG-\d{4}-000001$/);
    expect(h.emails.sendSubmitted).toHaveBeenCalledWith(EMAIL, 'Greenwood High', res.publicRef);
    expect(h.repo.update).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({
        institutionInfo: SECTIONS.institutionInfo,
        location: SECTIONS.location,
        campusInfo: SECTIONS.campusInfo,
        primaryContact: SECTIONS.primaryContact,
        subscription: SECTIONS.subscription,
        consent: expect.objectContaining(SECTIONS.consent),
        administrativeDivisionCode: 'US-IL',
        contactPhoneE164: '+12175550123',
      }),
    );
    const actions = h.audit.logAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('registration.submitted');
  });

  it('is idempotent for an already-submitted draft', async () => {
    h.repo.findById.mockResolvedValue({ id: ID, status: 'submitted', publicRef: 'EDR-REG-2026-000009' });
    const res = await h.service.submit(ID, token(), SECTIONS as never, reqCtx);
    expect(res.publicRef).toBe('EDR-REG-2026-000009');
    expect(h.repo.update).not.toHaveBeenCalled();
  });
});

describe('RegistrationService.startReview', () => {
  it('moves to under_review, audits, and emails the applicant', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue({
      id: ID,
      status: 'submitted',
      version: 1,
      contactEmail: EMAIL,
      displayName: 'Greenwood High',
      publicRef: 'EDR-REG-2026-000001',
    });
    h.repo.updateWithVersion.mockResolvedValue({
      id: ID,
      status: 'under_review',
      version: 2,
      contactEmail: EMAIL,
      displayName: 'Greenwood High',
      publicRef: 'EDR-REG-2026-000001',
    });

    await h.service.startReview(ID, { version: 1 }, adminCtx);

    expect(h.emails.sendReviewStarted).toHaveBeenCalledWith(
      EMAIL,
      'Greenwood High',
      'EDR-REG-2026-000001',
    );
    const actions = h.audit.logAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('registration.start_review');
    expect(actions).toContain('registration.email_sent');
  });
});

describe('RegistrationService.reject', () => {
  it('records the decision, writes audit and emails the applicant', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue({ id: ID, status: 'under_review', version: 2, contactEmail: EMAIL, displayName: 'Greenwood High' });
    h.repo.updateWithVersion.mockResolvedValue({
      id: ID,
      status: 'rejected',
      version: 3,
      contactEmail: EMAIL,
      displayName: 'Greenwood High',
    });

    await h.service.reject(ID, { version: 2, reason: 'Outside service region' }, adminCtx);

    expect(h.repo.insertReview).toHaveBeenCalledWith(expect.objectContaining({ action: 'rejected' }));
    expect(h.emails.sendRejected).toHaveBeenCalledWith(EMAIL, 'Greenwood High', 'Outside service region');
    const actions = h.audit.logAudit.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('registration.rejected');
  });

  it('blocks rejection before review has started', async () => {
    const h = makeService();
    h.repo.findById.mockResolvedValue({ id: ID, status: 'submitted', version: 1, contactEmail: EMAIL });
    await expect(h.service.reject(ID, { version: 1, reason: 'Too early' }, adminCtx)).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS' },
    });
  });
});
