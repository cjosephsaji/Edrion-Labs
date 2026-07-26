import type { ApiError } from '@edrion/shared-types';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Dev-only impersonation header; production relies on the session cookie. */
  devEmployeeEmail?: string;
  /** Support-access session id, attached so server audit can attribute portal actions. */
  supportSessionId?: string;
}

/**
 * Thin typed fetch wrapper. Sends credentials (HTTP-only cookie), normalises errors into
 * ApiClientError, and forwards correlation + support-session headers. The browser never
 * talks to the database — only to this API.
 */
export class ApiClient {
  constructor(private readonly opts: ApiClientOptions) {}

  private headers(extra?: HeadersInit): Headers {
    const h = new Headers(extra);
    h.set('content-type', 'application/json');
    if (this.opts.devEmployeeEmail) h.set('x-employee-email', this.opts.devEmployeeEmail);
    if (this.opts.supportSessionId) h.set('x-support-session-id', this.opts.supportSessionId);
    return h;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: this.headers(init.headers),
    });

    if (res.status === 204) return undefined as T;

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as ApiError;
      throw new ApiClientError(
        res.status,
        err.code ?? 'ERROR',
        err.message ?? res.statusText,
        err.details,
        err.correlationId,
      );
    }
    return body as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  /** Fetch a non-JSON body (e.g. a CSV export) as text, with auth headers attached. */
  async getText(path: string): Promise<string> {
    const res = await fetch(`${this.opts.baseUrl}/v1${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = body as ApiError;
      throw new ApiClientError(res.status, err.code ?? 'ERROR', err.message ?? res.statusText, err.details, err.correlationId);
    }
    return res.text();
  }
  post<T>(path: string, data?: unknown, headers?: HeadersInit): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers,
    });
  }
  patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined });
  }
}

/** Build a query string from a filter object, dropping empty values. */
export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
