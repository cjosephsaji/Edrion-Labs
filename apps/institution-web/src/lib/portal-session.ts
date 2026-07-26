import type { QueryClient } from '@tanstack/react-query';

const SCOPE_STORAGE_KEY = 'edrion.portal.scope';

const ACADEMIC_CONTEXT_KEY = 'edrion.portal.academic-context';

/** Drop cached portal identity/scope after sign-in so dev impersonation cannot leak into a real session. */
export function finalizePortalSignIn(qc: QueryClient) {
  try {
    localStorage.removeItem(SCOPE_STORAGE_KEY);
    localStorage.removeItem(ACADEMIC_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
  qc.removeQueries({ queryKey: ['portal'] });
  qc.removeQueries({ queryKey: ['academics'] });
}

/** Clear client-side portal state on sign-out. */
export function clearPortalSession(qc: QueryClient) {
  try {
    localStorage.removeItem(SCOPE_STORAGE_KEY);
    localStorage.removeItem(ACADEMIC_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
  qc.removeQueries({ queryKey: ['portal'] });
  qc.removeQueries({ queryKey: ['academics'] });
}
