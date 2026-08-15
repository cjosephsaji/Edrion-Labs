export type QualityApiAuth = {
  sessionCookie?: string;
  sessionCookieName?: string;
  employeeEmail?: string;
};

/**
 * Quality calls authenticate exactly like the Edrion API: an API session cookie in deployed
 * environments, or the explicitly enabled employee-email escape hatch in local development.
 * Provider credentials never enter the harness.
 */
export function qualityApiAuthHeaders(auth: QualityApiAuth): Record<string, string> {
  if (auth.sessionCookie) {
    const name = auth.sessionCookieName?.trim() || 'edrion_session';
    return { cookie: `${name}=${encodeURIComponent(auth.sessionCookie)}` };
  }
  if (auth.employeeEmail) return { 'x-employee-email': auth.employeeEmail };
  throw new Error('QUALITY_API_AUTH_REQUIRED: set PETROS_QUALITY_SESSION_COOKIE or, in local development only, PETROS_QUALITY_EMPLOYEE_EMAIL');
}
