import { describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';
import { NoopReporter, createErrorReporter } from './reporter';

function capture() {
  const lines: Array<Record<string, unknown>> = [];
  const write = (line: string) => lines.push(JSON.parse(line));
  return { lines, write };
}

describe('createLogger', () => {
  it('emits structured JSON with base + meta', () => {
    const { lines, write } = capture();
    const log = createLogger({ level: 'info', base: { service: 'api' }, write });
    log.info('hello', { foo: 1 });
    expect(lines[0]).toMatchObject({ level: 'info', msg: 'hello', service: 'api', foo: 1 });
    expect(lines[0]!.ts).toBeTypeOf('string');
  });

  it('filters below the configured level', () => {
    const { lines, write } = capture();
    const log = createLogger({ level: 'warn', write });
    log.info('skip');
    log.error('keep');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.msg).toBe('keep');
  });

  it('child() stamps correlation bindings on every line', () => {
    const { lines, write } = capture();
    const log = createLogger({ level: 'info', write }).child({ correlationId: 'c1' });
    log.info('a');
    log.error('b');
    expect(lines.every((l) => l.correlationId === 'c1')).toBe(true);
  });
});

describe('error reporter', () => {
  it('NoopReporter logs the capture so the path is observable', () => {
    const { lines, write } = capture();
    const reporter = new NoopReporter(createLogger({ level: 'info', write }));
    reporter.captureException(new Error('boom'), { correlationId: 'c2' });
    expect(lines[0]!).toMatchObject({ msg: 'error.captured', sink: 'noop', error: 'boom', correlationId: 'c2' });
  });

  it('createErrorReporter returns a Noop sink when no DSN is set', () => {
    const reporter = createErrorReporter({ logger: createLogger({ write: vi.fn() }) });
    expect(reporter).toBeInstanceOf(NoopReporter);
  });
});
