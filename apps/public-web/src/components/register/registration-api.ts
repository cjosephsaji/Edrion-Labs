import { webEnv } from '@/lib/env';

/**
 * Thin client for the PUBLIC registration funnel. Unauthenticated (no cookie/credentials needed);
 * the draft is authorised by a signed resume token carried in `x-registration-token`. Errors are
 * normalised to `{ code, message, details }` so the UI can show friendly, field-aware feedback.
 */
const BASE = `${webEnv.apiBaseUrl}/v1/registration`;

export class RegistrationApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'RegistrationApiError';
  }
}

async function call<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('x-registration-token', token);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new RegistrationApiError('NETWORK', 'Could not reach the server. Check your connection and try again.');
  }
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RegistrationApiError(
      body?.code ?? 'ERROR',
      body?.message ?? 'Something went wrong. Please try again.',
      body?.details,
      res.status,
    );
  }
  return body as T;
}

export interface DraftView {
  id: string;
  status: string;
  publicRef: string | null;
  emailVerified: boolean;
  verifiedEmail: string | null;
  institutionInfo: Record<string, unknown> | null;
  location: Record<string, unknown> | null;
  campusInfo: Record<string, unknown> | null;
  primaryContact: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  consent: Record<string, unknown> | null;
  updatedAt: string;
}

export interface PublicPlan {
  key: string;
  name: string;
  description: string | null;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  perCampusPriceMinor: number;
}

export interface GeoGuess {
  country?: string;
  city?: string;
  timezone?: string;
}

export const registrationApi = {
  plans: () => call<PublicPlan[]>('/plans', { method: 'GET' }),
  geo: () => call<GeoGuess>('/geo', { method: 'GET' }),
  start: () => call<{ id: string; resumeToken: string; status: string }>('', { method: 'POST', body: '{}' }),
  resume: (id: string, token: string) => call<DraftView>(`/${id}`, { method: 'GET' }, token),
  resumeRequest: (email: string) =>
    call<{ sent: true; expiresInSeconds: number; resendAvailableInSeconds: number; devCode?: string }>(
      '/resume',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  resumeVerify: (email: string, code: string) =>
    call<{ id: string; resumeToken: string; draft: DraftView }>(
      '/resume/verify',
      { method: 'POST', body: JSON.stringify({ email, code }) },
    ),
  patch: (id: string, token: string, body: Record<string, unknown>) =>
    call<DraftView>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  requestOtp: (id: string, token: string, email: string) =>
    call<{ sent: true; expiresInSeconds: number; resendAvailableInSeconds: number; sendsRemaining: number }>(
      `/${id}/otp`,
      { method: 'POST', body: JSON.stringify({ email }) },
      token,
    ),
  verifyOtp: (id: string, token: string, code: string) =>
    call<{ verified: true }>(`/${id}/otp/verify`, { method: 'POST', body: JSON.stringify({ code }) }, token),
  submit: (id: string, token: string, sections: Record<string, unknown>) =>
    call<{ publicRef: string; status: string }>(
      `/${id}/submit`,
      { method: 'POST', body: JSON.stringify(sections) },
      token,
    ),
};
