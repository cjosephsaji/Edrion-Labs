'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { StudentApiProvider } from '@/lib/api-client';
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
