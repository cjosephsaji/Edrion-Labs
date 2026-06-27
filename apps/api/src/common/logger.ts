import { ConsoleLogger, Injectable } from '@nestjs/common';

/**
 * Structured JSON logger. Swap the transport for pino/Sentry in production; the interface is
 * what the app depends on. Never logs secrets or full sensitive records.
 */
@Injectable()
export class StructuredLogger extends ConsoleLogger {
  json(level: 'info' | 'warn' | 'error', message: string, meta: Record<string, unknown> = {}): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...meta });
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }
}
