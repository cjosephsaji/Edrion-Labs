import type { Logger } from './logger';

/** Context attached to a captured error — correlation ids, actor, endpoint, etc. */
export type ReportContext = Record<string, unknown>;

/**
 * Error-reporting seam. The app depends on this interface; the concrete sink is chosen at boot.
 * With a `SENTRY_DSN` set it forwards to Sentry; otherwise a no-op reporter records the capture
 * to the structured log so the path is observable in every environment.
 */
export interface ErrorReporter {
  captureException(error: unknown, context?: ReportContext): void;
  captureMessage(message: string, context?: ReportContext): void;
  flush(timeoutMs?: number): Promise<void>;
}

/** No-op sink (no DSN). Still logs the capture so wiring is provable without an external service. */
export class NoopReporter implements ErrorReporter {
  constructor(private readonly logger: Logger) {}
  captureException(error: unknown, context?: ReportContext): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error('error.captured', { sink: 'noop', error: message, ...context });
  }
  captureMessage(message: string, context?: ReportContext): void {
    this.logger.warn('message.captured', { sink: 'noop', message, ...context });
  }
  async flush(): Promise<void> {
    /* nothing buffered */
  }
}

/** The slice of the Sentry SDK we use — kept local so the package needs no Sentry types. */
interface SentryLike {
  init(options: { dsn: string; environment?: string; tracesSampleRate?: number }): void;
  captureException(error: unknown, hint?: { extra?: ReportContext }): void;
  captureMessage(message: string, hint?: { extra?: ReportContext }): void;
  flush(timeoutMs?: number): Promise<boolean>;
}

/**
 * Sentry sink. Lazy-loads `@sentry/node` so the dependency is only required when a DSN is
 * configured; if the package is absent it degrades to the no-op sink with a warning. Keeps the
 * observability package free of a hard Sentry dependency.
 */
export class SentryReporter implements ErrorReporter {
  private sentry: SentryLike | null = null;
  private readonly fallback: NoopReporter;
  private ready: Promise<void>;

  constructor(
    private readonly opts: { dsn: string; environment?: string; logger: Logger },
  ) {
    this.fallback = new NoopReporter(opts.logger);
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      // Indirected specifier so bundlers/TS don't require the module to exist at build time.
      const mod = '@sentry/node';
      const sentry = (await import(/* @vite-ignore */ mod)) as unknown as SentryLike;
      sentry.init({ dsn: this.opts.dsn, environment: this.opts.environment, tracesSampleRate: 0 });
      this.sentry = sentry;
      this.opts.logger.info('observability.sentry.initialised', { environment: this.opts.environment });
    } catch {
      this.opts.logger.warn('observability.sentry.unavailable', { note: '@sentry/node not installed; using noop' });
    }
  }

  captureException(error: unknown, context?: ReportContext): void {
    if (this.sentry) this.sentry.captureException(error, { extra: context });
    else this.fallback.captureException(error, context);
  }
  captureMessage(message: string, context?: ReportContext): void {
    if (this.sentry) this.sentry.captureMessage(message, { extra: context });
    else this.fallback.captureMessage(message, context);
  }
  async flush(timeoutMs = 2000): Promise<void> {
    await this.ready;
    if (this.sentry) await this.sentry.flush(timeoutMs);
  }
}

export function createErrorReporter(opts: {
  dsn?: string;
  environment?: string;
  logger: Logger;
}): ErrorReporter {
  if (opts.dsn) return new SentryReporter({ dsn: opts.dsn, environment: opts.environment, logger: opts.logger });
  return new NoopReporter(opts.logger);
}
