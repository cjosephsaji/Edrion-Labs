'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalClientProvider } from '@/lib/portal-client';
import { ScopeProvider } from '@/lib/scope';
import { AcademicContextProvider } from '@/lib/academic-context';
import { webEnv } from '@/lib/env';
import { PORTAL_SESSION_CHANGE_KEY } from '@/lib/portal-session';
import { ToastProvider } from '@edrion/ui';

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

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key === PORTAL_SESSION_CHANGE_KEY) window.location.reload();
    };
    window.addEventListener('storage', syncSession);
    return () => window.removeEventListener('storage', syncSession);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PortalClientProvider baseUrl={webEnv.apiBaseUrl} devUserEmail={webEnv.devUserEmail}>
        <ScopeProvider>
          <AcademicContextProvider>
            <ToastProvider>{children}</ToastProvider>
          </AcademicContextProvider>
        </ScopeProvider>
      </PortalClientProvider>
    </QueryClientProvider>
  );
}
