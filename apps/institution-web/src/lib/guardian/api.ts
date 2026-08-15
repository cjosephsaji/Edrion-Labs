/**
 * Typed fetch client for the Parent Portal API (`/v1/parent/*`). Uses the same session cookie as
 * the institution portal; in dev optionally sends `x-institution-user-email`.
 */
import { webEnv } from '@/lib/env';

const BASE = `${webEnv.apiBaseUrl}/v1`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public correlationId?: string,
  ) {
    super(message);
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (webEnv.devUserEmail) h['x-institution-user-email'] = webEnv.devUserEmail;
  return h;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? res.statusText, body.correlationId);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string): Promise<T> =>
    fetch(`${BASE}/parent${path}`, { headers: headers(), credentials: 'include', cache: 'no-store' }).then(handle<T>),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> =>
    fetch(`${BASE}/parent${path}`, {
      method: 'POST',
      headers: headers(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined),
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(handle<T>),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    fetch(`${BASE}/parent${path}`, {
      method: 'PUT',
      headers: headers(),
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(handle<T>),
};

export const money = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
