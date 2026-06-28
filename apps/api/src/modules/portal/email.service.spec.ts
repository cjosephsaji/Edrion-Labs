import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '@edrion/config';
import type { Logger } from '@edrion/observability';
import { EmailService } from './email.service';

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as unknown as Logger;
}

const baseEnv = { EMAIL_FROM: 'Edrion <no-reply@edrion.local>' } as unknown as ApiEnv;

describe('EmailService', () => {
  it('uses the log transport when SMTP_URL is unset and returns a message id', async () => {
    const logger = fakeLogger();
    const svc = new EmailService({ ...baseEnv, SMTP_URL: undefined } as ApiEnv, logger);
    const sent = await svc.send({ to: 'a@b.c', subject: 'hi', text: 'body' });
    expect(sent.transport).toBe('log');
    expect(sent.messageId).toMatch(/[0-9a-f-]{36}/);
    expect(logger.info).toHaveBeenCalled();
  });

  it('uses the smtp transport when SMTP_URL is configured', async () => {
    const svc = new EmailService({ ...baseEnv, SMTP_URL: 'smtp://user:pass@host:587' } as ApiEnv, fakeLogger());
    const sent = await svc.send({ to: 'a@b.c', subject: 'hi', text: 'body' });
    expect(sent.transport).toBe('smtp');
  });

  it('mints a distinct message id per send', async () => {
    const svc = new EmailService({ ...baseEnv, SMTP_URL: undefined } as ApiEnv, fakeLogger());
    const a = await svc.send({ to: 'a@b.c', subject: 's', text: 't' });
    const b = await svc.send({ to: 'a@b.c', subject: 's', text: 't' });
    expect(a.messageId).not.toBe(b.messageId);
  });
});
