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
  location: { country: 'US', city: 'Springfield', address: '1 Elm St', timezone: 'UTC' },
  campusInfo: { currentCampuses: 1, firstCampusName: 'Main', expectedStudents: 500 },
  primaryContact: { fullName: 'Head Teacher', email: EMAIL },
  subscription: {},
  consent: { termsAccepted: true as const, privacyAccepted: true as const, marketingOptIn: false },
};

function makeService() {
  const repo = {
    findById: vi.fn(),
    update: vi.fn(),
    updateWithVersion: vi.fn(),
    findActiveByEmail: vi.fn().mockResolvedValue(undefined),
    countRefsForYear: vi.fn().mockResolvedValue(0),
    insertReview: vi.fn().mockResolvedValue({}),
    reviewsFor: vi.fn().mockResolvedValue([]),
    auditEventsFor: vi.fn().mockResolvedValue([]),
  };
  const otp = { issue: vi.fn(), verify: vi.fn().mockResolvedValue(undefined) };
  const emails = {
    sendOtp: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
    sendSubmitted: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
    sendRejected: vi.fn().mockResolvedValue({ messageId: 'm', transport: 'log' }),
  };
  const audit = { logAudit: vi.fn().mockResolvedValue(undefined) };
  const env = { SESSION_COOKIE_SECRET: SECRET } as never;
  const service = new RegistrationService(repo as never, otp as never, emails as never, audit as never, env);
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

  it('blocks a duplicate active application for the same email', async () => {
    h.repo.findById.mockResolvedValue({
      id: ID,
      status: 'draft',
      emailVerifiedAt: new Date(),
      verifiedEmail: EMAIL,
    });
    h.repo.findActiveByEmail.mockResolvedValue({ id: 'other' });
    await expect(h.service.submit(ID, token(), SECTIONS as never, reqCtx)).rejects.toMatchObject({
      response: { code: 'DUPLICATE_REGISTRATION' },
    });
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
});
