'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ApiError } from '@edrion/shared-types';

export class StudentClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'StudentClientError';
  }
}

export type SseHandlers = {
  onMessage?: (data: unknown) => void;
  onError?: (err: unknown) => void;
  onOpen?: () => void;
};

export type SseConnection = {
  close: () => void;
};

/**
 * Typed fetch wrapper for the Student Portal API (`/v1/student/*`). Sends credentials
 * (HTTP-only cookie); in dev it also forwards the impersonation header.
 */
export class StudentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly devStudentUser?: string,
  ) {}

  private headers(extra?: HeadersInit, json = true): Headers {
    const headers = new Headers(extra);
    if (json) headers.set('content-type', 'application/json');
    if (this.devStudentUser) headers.set('x-student-email', this.devStudentUser);
    return headers;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/v1/student${path}`, {
      ...init,
      credentials: 'include',
      headers: this.headers(init.headers),
    });

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text.trim()) {
      if (!res.ok) {
        throw new StudentClientError(res.status, 'ERROR', res.statusText);
      }
      return undefined as T;
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new StudentClientError(res.status, 'INVALID_JSON', 'Response was not valid JSON');
    }
    if (!res.ok) {
      const err = body as ApiError;
      throw new StudentClientError(
        res.status,
        err.code ?? 'ERROR',
        err.message ?? res.statusText,
        err.correlationId,
      );
    }
    return body as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  }

  del<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Raw-binary upload — kind is sent as a query param for the storage pipeline. */
  async upload<T>(kind: string, file: File): Promise<T> {
    const headers = new Headers();
    headers.set('content-type', file.type || 'application/octet-stream');
    if (this.devStudentUser) headers.set('x-student-email', this.devStudentUser);

    const qs = new URLSearchParams({ kind, filename: file.name });
    const res = await fetch(`${this.baseUrl}/v1/student/uploads?${qs}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: file,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as ApiError;
      throw new StudentClientError(res.status, err.code ?? 'ERROR', err.message ?? res.statusText, err.correlationId);
    }
    return body as T;
  }

  fileUrl(id: string): string {
    return `${this.baseUrl}/v1/student/storage/${id}/download`;
  }

  /**
   * Fetch-based SSE reader — supports cookie auth and dev `x-student-email` header
   * (native EventSource cannot send custom headers).
   */
  sse(path: string, handlers: SseHandlers, init?: { method?: 'GET' | 'POST'; body?: unknown }): SseConnection {
    const url = `${this.baseUrl}/v1/student${path}`;
    const controller = new AbortController();
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      controller.abort();
    };

    void (async () => {
      try {
        const method = init?.method ?? 'GET';
        const res = await fetch(url, {
          method,
          credentials: 'include',
          headers: this.headers(undefined, method === 'POST'),
          body: method === 'POST' && init?.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          handlers.onError?.(new Error(`SSE failed: ${res.status}`));
          return;
        }
        handlers.onOpen?.();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const line = frame
              .split('\n')
              .find((l) => l.startsWith('data: '));
            if (!line) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') {
              handlers.onMessage?.('[DONE]');
              close();
              return;
            }
            try {
              handlers.onMessage?.(JSON.parse(payload));
            } catch {
              handlers.onMessage?.(payload);
            }
          }
        }
      } catch (err) {
        if (!closed && (err as Error).name !== 'AbortError') {
          handlers.onError?.(err);
        }
      }
    })();

    return { close };
  }
}

const StudentClientContext = createContext<StudentClient | null>(null);

export function StudentClientProvider({
  baseUrl,
  devStudentUser,
  children,
}: {
  baseUrl: string;
  devStudentUser?: string;
  children: ReactNode;
}) {
  const client = useMemo(() => new StudentClient(baseUrl, devStudentUser), [baseUrl, devStudentUser]);
  return <StudentClientContext.Provider value={client}>{children}</StudentClientContext.Provider>;
}

export function useStudentClient(): StudentClient {
  const client = useContext(StudentClientContext);
  if (!client) throw new Error('useStudentClient must be used within StudentClientProvider');
  return client;
}
