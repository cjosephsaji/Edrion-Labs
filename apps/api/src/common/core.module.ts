import { Global, Module } from '@nestjs/common';
import { createDatabase, type Database } from '@edrion/database';
import { createAuditWriter } from '@edrion/audit';
import { loadApiEnv, type ApiEnv } from '@edrion/config';
import { createErrorReporter, createLogger, type ErrorReporter, type Logger } from '@edrion/observability';
import { API_ENV, AUDIT_WRITER, DATABASE, ERROR_REPORTER, LOGGER } from './tokens';
import { StructuredLogger } from './logger';

/**
 * Global providers: validated env, the database pool, the append-only audit writer, and the
 * observability seam (structured logger + error reporter). One database connection is shared
 * process-wide; the API is the sole writer.
 */
@Global()
@Module({
  providers: [
    StructuredLogger,
    { provide: API_ENV, useFactory: (): ApiEnv => loadApiEnv() },
    { provide: DATABASE, useFactory: (): Database => createDatabase() },
    {
      provide: AUDIT_WRITER,
      useFactory: (db: Database) => createAuditWriter(db),
      inject: [DATABASE],
    },
    {
      provide: LOGGER,
      useFactory: (env: ApiEnv): Logger =>
        createLogger({ level: env.LOG_LEVEL, base: { service: 'edrion-api', env: env.NODE_ENV } }),
      inject: [API_ENV],
    },
    {
      provide: ERROR_REPORTER,
      useFactory: (env: ApiEnv, logger: Logger): ErrorReporter =>
        createErrorReporter({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, logger }),
      inject: [API_ENV, LOGGER],
    },
  ],
  exports: [API_ENV, DATABASE, AUDIT_WRITER, StructuredLogger, LOGGER, ERROR_REPORTER],
})
export class CoreModule {}
