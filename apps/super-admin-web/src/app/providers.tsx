'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider } from '@edrion/api-client';
import { webEnv } from '@/lib/env';
import { SupportSessionProvider, useSupportSession } from '@/lib/support-session';
import { SupportBanner } from '@/components/support-banner';

/**
 * Client providers: one TanStack Query client per app instance + the typed API client.
 * Sensible cache defaults so navigation doesn't refetch unchanged data.
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
      <SupportSessionProvider>
        <ApiClientBridge>{children}</ApiClientBridge>
      </SupportSessionProvider>
    </QueryClientProvider>
  );
}

/**
 * Bridges the active support session into the API client so its id rides on every request,
 * and renders the persistent support banner above all app content when a session is live.
 */
function ApiClientBridge({ children }: { children: ReactNode }) {
  const { active } = useSupportSession();
  return (
    <ApiClientProvider
      baseUrl={webEnv.apiBaseUrl}
      devEmployeeEmail={webEnv.devEmployeeEmail}
      supportSessionId={active?.sessionId}
    >
      <div className="flex h-screen flex-col overflow-hidden">
        <SupportBanner />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </ApiClientProvider>
  );
}
