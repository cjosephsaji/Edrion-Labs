'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ApiError } from '@edrion/shared-types';
import type { InstitutionScope } from './types';

export class PortalClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'PortalClientError';
  }
}

/** Serialise the active scope to the header the API parses (`institution` | `campus:<id>`). */
export function scopeHeader(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

/**
 * Thin typed fetch wrapper for the Institution Portal API (`/v1/portal/*`). Sends credentials
 * (HTTP-only cookie) and the active scope header; in dev it also forwards the impersonation
 * header. The browser never talks to the database — only to this API, which re-checks every
 * permission and scope.
 */
export class PortalClient {
  constructor(
    private readonly baseUrl: string,
    private readonly devUserEmail?: string,
  ) {}

  async request<T>(path: string, scope: InstitutionScope, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-institution-scope', scopeHeader(scope));
    if (this.devUserEmail) headers.set('x-institution-user-email', this.devUserEmail);

    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });

    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as ApiError;
      throw new PortalClientError(
        res.status,
        err.code ?? 'ERROR',
        err.message ?? res.statusText,
        err.correlationId,
      );
    }
    return body as T;
  }

  get<T>(path: string, scope: InstitutionScope): Promise<T> {
    return this.request<T>(path, scope, { method: 'GET' });
  }

  post<T>(path: string, scope: InstitutionScope, body: unknown): Promise<T> {
    return this.request<T>(path, scope, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  patch<T>(path: string, scope: InstitutionScope, body: unknown): Promise<T> {
    return this.request<T>(path, scope, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  }

  put<T>(path: string, scope: InstitutionScope, body: unknown): Promise<T> {
    return this.request<T>(path, scope, { method: 'PUT', body: JSON.stringify(body ?? {}) });
  }

  /** DELETE, optionally with a JSON body (the portal sends `{ version }` for concurrency). */
  del<T>(path: string, scope: InstitutionScope, body?: unknown): Promise<T> {
    return this.request<T>(path, scope, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /**
   * Upload a raw binary file. Sent as `application/octet-stream` (never JSON) with the name/type in
   * headers, matching the API's raw-body attachment endpoint. Cookie + scope + dev-header still ride
   * along; the JSON body parser leaves an octet-stream body untouched.
   */
  async upload<T>(path: string, scope: InstitutionScope, file: File): Promise<T> {
    const headers = new Headers();
    headers.set('content-type', 'application/octet-stream');
    headers.set('x-institution-scope', scopeHeader(scope));
    headers.set('x-file-name', encodeURIComponent(file.name));
    if (file.type) headers.set('x-file-type', file.type);
    if (this.devUserEmail) headers.set('x-institution-user-email', this.devUserEmail);

    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: file,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as ApiError;
      throw new PortalClientError(res.status, err.code ?? 'ERROR', err.message ?? res.statusText, err.correlationId);
    }
    return body as T;
  }

  /** Absolute URL for a portal resource — used for `<a href>` downloads (cookie auth applies). */
  fileUrl(path: string): string {
    return `${this.baseUrl}/v1${path}`;
  }
}

const PortalClientContext = createContext<PortalClient | null>(null);

export function PortalClientProvider({
  baseUrl,
  devUserEmail,
  children,
}: {
  baseUrl: string;
  devUserEmail?: string;
  children: ReactNode;
}) {
  const client = useMemo(() => new PortalClient(baseUrl, devUserEmail), [baseUrl, devUserEmail]);
  return <PortalClientContext.Provider value={client}>{children}</PortalClientContext.Provider>;
}

export function usePortalClient(): PortalClient {
  const client = useContext(PortalClientContext);
  if (!client) throw new Error('usePortalClient must be used within PortalClientProvider');
  return client;
}
