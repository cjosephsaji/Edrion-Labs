import { webEnv } from '@/lib/env';

/**
 * Thin client for the PUBLIC parent admission-apply funnel. Unauthenticated (no cookie/credentials);
 * the draft is authorised by a signed resume token carried in `x-admission-token`. Errors are
 * normalised to `{ code, message, details }` so the UI can show friendly, field-aware feedback.
 * Mirrors the institution-registration funnel's `registration-api.ts`.
 */
const BASE = `${webEnv.apiBaseUrl}/v1/admissions/apply`;

export class ApplyApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApplyApiError';
  }
}

async function call<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('x-admission-token', token);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApplyApiError('NETWORK', 'Could not reach the server. Check your connection and try again.');
  }
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApplyApiError(
      body?.code ?? 'ERROR',
      body?.message ?? 'Something went wrong. Please try again.',
      body?.details,
      res.status,
    );
  }
  return body as T;
}

export interface PublicInstitution {
  id: string;
  displayName: string;
  publicId: string;
  logoUrl: string | null;
  country: string;
}

export interface InstitutionOptions {
  campuses: { id: string; name: string }[];
  academicYears: { id: string; name: string }[];
  gradeLevels: { id: string; name: string; level: number }[];
}

export interface AdmissionDraftView {
  id: string;
  institutionId: string;
  status: string;
  emailVerified: boolean;
  contactEmail: string;
  payload: {
    target?: Record<string, unknown>;
    student?: Record<string, unknown>;
    guardian?: Record<string, unknown>;
    contact?: Record<string, unknown>;
    address?: Record<string, unknown>;
    additional?: Record<string, unknown>;
  };
  submittedApplicationNo: string | null;
  updatedAt: string;
}

export const applyApi = {
  institutions: (q?: string) =>
    call<PublicInstitution[]>(`/institutions${q ? `?q=${encodeURIComponent(q)}` : ''}`, { method: 'GET' }),
  options: (institutionId: string) =>
    call<InstitutionOptions>(`/institutions/${institutionId}/options`, { method: 'GET' }),
  start: (institutionId: string, contactEmail: string) =>
    call<{ id: string; token: string; status: string }>('', {
      method: 'POST',
      body: JSON.stringify({ institutionId, contactEmail }),
    }),
  resume: (id: string, token: string) => call<AdmissionDraftView>(`/${id}`, { method: 'GET' }, token),
  patch: (id: string, token: string, body: Record<string, unknown>) =>
    call<AdmissionDraftView>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  requestOtp: (id: string, token: string, email: string) =>
    call<{
      sent: true;
      expiresInSeconds: number;
      resendAvailableInSeconds: number;
      sendsRemaining: number;
      devCode?: string;
    }>(`/${id}/otp`, { method: 'POST', body: JSON.stringify({ email }) }, token),
  verifyOtp: (id: string, token: string, code: string) =>
    call<{ verified: true }>(`/${id}/otp/verify`, { method: 'POST', body: JSON.stringify({ code }) }, token),
  submit: (id: string, token: string, sections: Record<string, unknown>) =>
    call<{ applicationNo: string; status: string }>(
      `/${id}/submit`,
      { method: 'POST', body: JSON.stringify(sections) },
      token,
    ),

  // --- staff-built info-request form the parent completes over a token link ---
  getInfoRequest: (id: string, token: string) => call<InfoRequestView>(`/info/${id}`, { method: 'GET' }, token),
  submitInfo: (id: string, token: string, responses: Record<string, unknown>) =>
    call<{ ok: true }>(`/info/${id}/submit`, { method: 'POST', body: JSON.stringify({ responses }) }, token),
  uploadInfoFile: async (id: string, token: string, file: File): Promise<InfoFileRef> => {
    const headers = new Headers();
    headers.set('content-type', 'application/octet-stream');
    headers.set('x-admission-token', token);
    headers.set('x-file-name', encodeURIComponent(file.name));
    if (file.type) headers.set('x-file-type', file.type);
    let res: Response;
    try {
      res = await fetch(`${BASE}/info/${id}/files`, { method: 'POST', headers, body: file });
    } catch {
      throw new ApplyApiError('NETWORK', 'Could not upload the file. Check your connection and try again.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApplyApiError(body?.code ?? 'ERROR', body?.message ?? 'Upload failed.', body?.details, res.status);
    return body as InfoFileRef;
  },
};

export interface InfoField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'mcq' | 'date' | 'file';
  options?: string[];
  required?: boolean;
  multiple?: boolean;
}
export interface InfoRequestView {
  id: string;
  status: string;
  message: string | null;
  fields: InfoField[];
  submitted: boolean;
}
export interface InfoFileRef {
  fileName: string;
  storageKey: string;
  sizeBytes: number;
  contentType: string | null;
}
