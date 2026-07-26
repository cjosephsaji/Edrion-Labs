/**
 * Provider-agnostic structured logger. Emits one JSON line per event with a stable shape so log
 * aggregators can index on `correlationId` / `requestId`. `child(bindings)` returns a logger that
 * stamps those bindings on every line — the API binds the per-request correlation id once and all
 * downstream logs are automatically correlated. Pure + dependency-free; the transport is a
 * single `write` function (defaults to stdout/stderr) so it is trivially testable.
 */

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const LEVEL_ORDER: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

export interface Logger {
  readonly level: LogLevel;
  child(bindings: Record<string, unknown>): Logger;
  fatal(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  trace(message: string, meta?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Bindings stamped on every line (service name, env, correlationId, …). */
  base?: Record<string, unknown>;
  /** Transport. Defaults to stderr for fatal/error, stdout otherwise. Injected in tests. */
  write?: (line: string, level: LogLevel) => void;
}

const defaultWrite = (line: string, level: LogLevel): void => {
  const stream = LEVEL_ORDER[level] >= LEVEL_ORDER.error ? process.stderr : process.stdout;
  stream.write(line + '\n');
};

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  const base = opts.base ?? {};
  const write = opts.write ?? defaultWrite;
  const threshold = LEVEL_ORDER[level];

  const log = (lvl: LogLevel, message: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    write(JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg: message, ...base, ...meta }), lvl);
  };

  return {
    level,
    child: (bindings) => createLogger({ level, base: { ...base, ...bindings }, write }),
    fatal: (m, meta) => log('fatal', m, meta),
    error: (m, meta) => log('error', m, meta),
    warn: (m, meta) => log('warn', m, meta),
    info: (m, meta) => log('info', m, meta),
    debug: (m, meta) => log('debug', m, meta),
    trace: (m, meta) => log('trace', m, meta),
  };
}
