/**
 * Typed fetch client for the Parent Portal API. In dev it authenticates via the
 * `x-institution-user-email` header (PORTAL_AUTH_DEV_HEADER=true on the API); in production the
 * HTTP-only session cookie is sent (credentials: 'include'). Every mutation may carry an
 * Idempotency-Key.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/v1';
const DEV_GUARDIAN = process.env.NEXT_PUBLIC_DEV_GUARDIAN ?? 'guardian.a@greenwood.edu';

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
  if (DEV_GUARDIAN) h['x-institution-user-email'] = DEV_GUARDIAN;
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
};

export const money = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
