'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalClientProvider } from '@/lib/portal-client';
import { ScopeProvider } from '@/lib/scope';
import { webEnv } from '@/lib/env';

/**
 * Client providers: one TanStack Query client per app instance, the typed Portal API client,
 * then the global scope context (institution vs campus) that narrows everything below it.
 */
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
      <PortalClientProvider baseUrl={webEnv.apiBaseUrl} devUserEmail={webEnv.devUserEmail}>
        <ScopeProvider>{children}</ScopeProvider>
      </PortalClientProvider>
    </QueryClientProvider>
  );
}
