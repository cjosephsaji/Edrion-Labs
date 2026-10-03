'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createElement } from 'react';

export type ApiErrorBody = {
  code?: string;
  message?: string;
  correlationId?: string;
  details?: unknown;
  meta?: Record<string, unknown>;
};

export type PetrosPredictionAssistance = 'none_observed' | 'petros_help' | 'external_declared' | 'unknown';

export type PetrosPredictionChallenge = {
  challengeId: string;
  checkpointId: string;
  programRevision: number;
  experimentVersion: number;
  modelId: string;
  capabilityId: string;
  targetTime: number;
  outputPort: string;
  unit: string;
  prompt: string;
  priorExploration: boolean;
  assistanceStatus: 'external_help_unknown';
  evidenceEligibility: 'observation_only';
  replayed: boolean;
};

export type PetrosPredictionEvaluation = {
  status: 'evaluated';
  challenge: Omit<PetrosPredictionChallenge, 'replayed'>;
  result: 'within_tolerance' | 'outside_tolerance';
  referenceValue: number;
  tolerance: number;
  predictedValue: number;
  assistance: PetrosPredictionAssistance;
  externalHelp: 'unknown';
  masteryAdmitted: false;
  replayed: boolean;
};

export class StudentApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly correlationId?: string,
    readonly details?: unknown,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StudentApiError';
  }
}

/** A non-JSON body from an otherwise successful response is not worth throwing over. */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class StudentApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly devStudentEmail?: string,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    opts?: { rawBody?: boolean },
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (
      !opts?.rawBody &&
      init.body !== undefined &&
      !headers.has('content-type')
    ) {
      headers.set('content-type', 'application/json');
    }
    if (this.devStudentEmail) headers.set('x-student-email', this.devStudentEmail);

    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });

    if (res.status === 204) return undefined as T;

    /*
     * Nest serialises a handler that returns null as a 200 with an empty body. Parsing that
     * as `{}` invents an object the server never sent, and callers then read undefined
     * fields off it — a student with no learning path was shown "undefined · undefined".
     * An empty body means null, and callers can check for it.
     */
    const raw = await res.text();
    const body = (raw ? safeJson(raw) : null) as ApiErrorBody | null;
    if (!res.ok) {
      throw new StudentApiError(
        res.status,
        body?.code ?? 'ERROR',
        body?.message ?? res.statusText,
        body?.correlationId,
        body?.details,
        body?.meta,
      );
    }
    return body as T;
  }

  get<T>(path: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: 'GET', signal, headers });
  }

  post<T>(path: string, body?: unknown, headers?: Record<string, string>, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      signal,
    });
  }

  issuePetrosWorkspacePrediction(
    sessionId: string,
    blockId: string,
    request: { requestId: string; modelId: string },
  ): Promise<{ status: 'challenge' } & PetrosPredictionChallenge> {
    return this.post(
      `/student/petros/sessions/${encodeURIComponent(sessionId)}/blocks/${encodeURIComponent(blockId)}/workspace/predictions`,
      request,
    );
  }

  answerPetrosWorkspacePrediction(
    sessionId: string,
    blockId: string,
    answer: { requestId: string; challengeId: string; predictedValue: number; assistance: PetrosPredictionAssistance },
  ): Promise<PetrosPredictionEvaluation> {
    return this.post(
      `/student/petros/sessions/${encodeURIComponent(sessionId)}/blocks/${encodeURIComponent(blockId)}/workspace/predictions/answer`,
      answer,
    );
  }

  put<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /**
   * A write that must survive the page going away.
   *
   * Normal fetches are cancelled when a tab closes, so anything still in flight — or still
   * sitting behind a debounce — was simply lost. `keepalive` hands the request to the
   * browser to finish after unload. Fire-and-forget by design: there is no page left to
   * show an error to.
   */
  keepalive(path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): void {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.devStudentEmail) headers['x-student-email'] = this.devStudentEmail;
    try {
      void fetch(`${this.baseUrl}/v1${path}`, {
        method,
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Never let a best-effort save break the unload path.
    }
  }

  del<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'DELETE',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async upload(
    kind: string,
    file: File,
  ): Promise<{ id: string; filename: string | null; mimeType: string; sizeBytes: number }> {
    const params = new URLSearchParams({ kind });
    if (file.name) params.set('filename', file.name);
    return this.request(
      `/student/uploads?${params.toString()}`,
      {
        method: 'POST',
        body: file,
        headers: {
          'content-type': file.type || 'application/octet-stream',
        },
      },
      { rawBody: true },
    );
  }

  async uploadPetrosMedia(
    path: string,
    file: Blob,
    options: {
      idempotencyKey: string;
      rotationDegrees?: 0 | 90 | 180 | 270;
      crop?: { x: number; y: number; width: number; height: number } | null;
    },
  ): Promise<unknown> {
    const params = new URLSearchParams({
      idempotencyKey: options.idempotencyKey,
      rotationDegrees: String(options.rotationDegrees ?? 0),
    });
    if (options.crop) params.set('crop', JSON.stringify(options.crop));
    return this.request(
      `${path}?${params.toString()}`,
      {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      },
      { rawBody: true },
    );
  }

  fileUrl(path: string): string {
    return `${this.baseUrl}/v1${path}`;
  }
}

const StudentApiContext = createContext<StudentApiClient | null>(null);

export function StudentApiProvider({
  baseUrl,
  devStudentEmail,
  children,
}: {
  baseUrl: string;
  devStudentEmail?: string;
  children: ReactNode;
}) {
  const client = useMemo(
    () => new StudentApiClient(baseUrl, devStudentEmail),
    [baseUrl, devStudentEmail],
  );
  return createElement(StudentApiContext.Provider, { value: client }, children);
}

export function useStudentApi(): StudentApiClient {
  const ctx = useContext(StudentApiContext);
  if (!ctx) throw new Error('useStudentApi must be used within StudentApiProvider');
  return ctx;
}

export function formatApiError(err: unknown): string {
  if (err instanceof StudentApiError) return err.message;
  if (err instanceof Error) return err.message;
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof err.message === 'string' &&
    err.message.trim()
  ) {
    return err.message;
  }
  return 'Something went wrong.';
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
