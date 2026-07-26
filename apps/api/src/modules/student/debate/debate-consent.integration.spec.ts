import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { DebateConsentService } from './debate-consent.service';
import { DebateCaptureService } from './debate-capture.service';

describe('debate consent integration', () => {
  it('blocks capture without consent (403)', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'p1', consentId: null }]),
          }),
        }),
      }),
    };
    const consent = new DebateConsentService(db as never, {} as never);
    await expect(consent.assertCaptureConsent('d1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows capture when consent scopes include recording', async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'p1', consentId: 'c1' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'c1',
                  revokedAt: null,
                  scopes: { record_audio: true, store_transcript: true },
                },
              ]),
            }),
          }),
        }),
    };
    const consent = new DebateConsentService(db as never, {} as never);
    await expect(consent.assertCaptureConsent('d1', 'p1')).resolves.toBeUndefined();
  });
});

describe('debate capture consent gate', () => {
  it('invokes assertCaptureConsent before upload', async () => {
    const assertCaptureConsent = vi.fn().mockRejectedValue(
      new ForbiddenException({ code: 'CONSENT_REQUIRED', message: 'Recording consent required.' }),
    );
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'p1', participantKind: 'human' }]),
        }),
      }),
      update: vi.fn(),
    };
    const capture = new DebateCaptureService(
      db as never,
      {
        requireDebate: vi.fn().mockResolvedValue({ id: 'd1', currentTurnIndex: 0 }),
        requireTurn: vi.fn().mockResolvedValue({ turnIndex: 0, audioSeam: { chunks: [] } }),
      } as never,
      { assertCaptureConsent } as never,
      {} as never,
      {} as never,
    );
    const principal = { kind: 'independent', independentUserId: 'u1' } as const;
    await expect(
      capture.uploadChunk(principal as never, 'd1', 't1', 0, 'audio/webm', Buffer.from('x')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assertCaptureConsent).toHaveBeenCalled();
  });
});
