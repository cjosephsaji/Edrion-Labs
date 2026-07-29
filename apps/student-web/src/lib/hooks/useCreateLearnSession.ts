'use client';

import { useMutation } from '@tanstack/react-query';

type CreateSessionResult = { id: string };

/**
 * Interim stub while Learn sessions are rebuilt.
 * Callers that still import useCreateSession get a clear LEARN_REBUILD failure.
 */
export function useCreateSession() {
  return useMutation<CreateSessionResult, Error, unknown>({
    mutationFn: async () => {
      throw Object.assign(new Error('Learn sessions are being rebuilt.'), {
        code: 'LEARN_REBUILD',
        status: 503,
      });
    },
  });
}

/** @deprecated Alias kept for transitional imports. */
export const useCreateEdrionLearnSession = useCreateSession;
