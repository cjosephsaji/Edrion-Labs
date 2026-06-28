import type { InstitutionContext } from '@edrion/auth';

/**
 * Augment Express' Request with the institution-portal context (separate from the platform
 * `principalContext`). Attached by InstitutionAuthGuard; read by the portal decorators.
 */
declare module 'express' {
  interface Request {
    institutionContext?: InstitutionContext;
  }
}
