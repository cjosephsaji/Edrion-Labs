import { Global, Module } from '@nestjs/common';
import { assertRestrictedApplicationDatabase, createDatabase, createTenantAwareDatabase, type Database } from '@edrion/database';
import { createAuditWriter } from '@edrion/audit';
import { loadApiEnv, type ApiEnv } from '@edrion/config';
import { createErrorReporter, createLogger, type ErrorReporter, type Logger } from '@edrion/observability';
import { API_ENV, AUDIT_WRITER, DATABASE, ERROR_REPORTER, LOGGER } from './tokens';
import { StructuredLogger } from './logger';
import { PetrosDocumentDatabase } from './petros-document-database';

/**
 * Global providers: validated env, the database pool, the append-only audit writer, and the
 * observability seam (structured logger + error reporter). One database connection is shared
 * process-wide; the API is the sole writer.
 *
 * The DATABASE handle is tenant-aware (see {@link createTenantAwareDatabase}): when the portal
 * request path opens an institution-scoped transaction (PortalTenantInterceptor), every query —
 * including the audit writer's — is routed there so Postgres RLS binds. Outside that context it is
 * the plain pool, so the platform control-plane path is unchanged.
 */
@Global()
@Module({
  providers: [
    StructuredLogger,
    PetrosDocumentDatabase,
    { provide: API_ENV, useFactory: (): ApiEnv => loadApiEnv() },
    { provide: DATABASE, useFactory: async (): Promise<Database> => {
      const base = createDatabase();
      await assertRestrictedApplicationDatabase(base);
      return createTenantAwareDatabase(base);
    } },
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
  exports: [API_ENV, DATABASE, AUDIT_WRITER, StructuredLogger, LOGGER, ERROR_REPORTER, PetrosDocumentDatabase],
})
export class CoreModule {}
