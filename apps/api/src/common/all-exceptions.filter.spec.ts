import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

const noopLogger = {
  child: () => noopLogger,
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  level: 'info' as const,
};

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const reporter = { captureException: vi.fn(), captureMessage: vi.fn(), flush: vi.fn() };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ context: { correlationId: 'corr-1' } }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter(noopLogger as never, reporter as never).catch(exception, host);
  return { status, body: json.mock.calls[0]?.[0] as Record<string, unknown>, reporter };
}

describe('AllExceptionsFilter', () => {
  it('passes through an HttpException envelope (code + message)', () => {
    const { status, body } = run(new ForbiddenException({ code: 'FORBIDDEN', message: 'nope' }));
    expect(status).toHaveBeenCalledWith(403);
    expect(body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN', message: 'nope', correlationId: 'corr-1' });
  });

  it('passes through activeSessionId on conflict responses', () => {
    const { status, body } = run(
      new ConflictException({
        code: 'SESSION_ACTIVE',
        message: 'You already have a lesson in progress.',
        activeSessionId: 'c796132a-5457-46b4-a867-b0cfa731d56e',
      }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(body).toMatchObject({
      code: 'SESSION_ACTIVE',
      activeSessionId: 'c796132a-5457-46b4-a867-b0cfa731d56e',
    });
  });

  it('maps an express payload-too-large error to 413 PAYLOAD_TOO_LARGE', () => {
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });
    const { status, body } = run(err);
    expect(status).toHaveBeenCalledWith(413);
    expect(body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('maps a malformed-body parse error to 400 BAD_REQUEST', () => {
    const err = Object.assign(new Error('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const { status, body } = run(err);
    expect(status).toHaveBeenCalledWith(400);
    expect(body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });

  it('falls back to 500 INTERNAL_ERROR for an unknown error without leaking detail', () => {
    const { status, body, reporter } = run(new Error('boom with secret'));
    expect(status).toHaveBeenCalledWith(500);
    expect(body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong' });
    expect(JSON.stringify(body)).not.toContain('secret');
    // 5xx is captured to the error sink with the correlation id.
    expect(reporter.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ correlationId: 'corr-1', status: 500 }),
    );
  });

  it('does NOT capture client errors (4xx) to the error sink', () => {
    const { reporter } = run(new ForbiddenException({ code: 'FORBIDDEN', message: 'nope' }));
    expect(reporter.captureException).not.toHaveBeenCalled();
  });
});
