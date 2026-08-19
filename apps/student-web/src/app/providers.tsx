'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StudentApiError, StudentApiProvider } from '@/lib/api-client';
import { StudentPreferencesProvider } from '@/lib/preferences';

const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3007'
).replace(/\/$/, '');

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            /*
             * Never retry a request the server has already answered. A disabled module
             * returns 403 immediately, but the default three retries with backoff left the
             * student staring at a loading skeleton for several seconds before the
             * "you don't have access" message appeared.
             */
            retry: (failureCount, error) => {
              if (error instanceof StudentApiError && error.status >= 400 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StudentApiProvider
        baseUrl={API_BASE}
        devStudentEmail={
          process.env.NEXT_PUBLIC_DEV_STUDENT_EMAIL ?? process.env.NEXT_PUBLIC_DEV_STUDENT_USER
        }
      >
        <StudentPreferencesProvider>{children}</StudentPreferencesProvider>
      </StudentApiProvider>
    </QueryClientProvider>
  );
}
