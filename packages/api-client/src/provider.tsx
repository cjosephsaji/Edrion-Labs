'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ApiClient } from './client';

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({
  baseUrl,
  devEmployeeEmail,
  supportSessionId,
  children,
}: {
  baseUrl: string;
  devEmployeeEmail?: string;
  supportSessionId?: string;
  children: ReactNode;
}) {
  const client = useMemo(
    () => new ApiClient({ baseUrl, devEmployeeEmail, supportSessionId }),
    [baseUrl, devEmployeeEmail, supportSessionId],
  );
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used within <ApiClientProvider>');
  return client;
}
