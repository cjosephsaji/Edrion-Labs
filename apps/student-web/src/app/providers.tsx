'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudentClientProvider } from '@/lib/student-client';
import { ThemeProvider } from '@/lib/theme';
import { PersonaProvider } from '@/lib/persona';
import { webEnv } from '@/lib/env';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StudentClientProvider baseUrl={webEnv.apiBaseUrl} devStudentUser={webEnv.devStudentUser}>
        <ThemeProvider>
          <PersonaProvider>{children}</PersonaProvider>
        </ThemeProvider>
      </StudentClientProvider>
    </QueryClientProvider>
  );
}
