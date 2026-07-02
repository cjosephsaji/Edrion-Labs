import type { GuardianContext } from './guardian-context';

/**
 * Augment Express' Request with the guardian context (in addition to institutionContext, which the
 * InstitutionAuthGuard sets first). Attached by GuardianScopeGuard; read by the parent decorators.
 */
declare module 'express' {
  interface Request {
    guardianContext?: GuardianContext;
  }
}
