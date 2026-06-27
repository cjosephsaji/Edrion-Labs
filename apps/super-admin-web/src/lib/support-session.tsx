'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'edrion.support-session';

/** The minimal active-session shape the banner + API client need on the client. */
export interface ActiveSupportSession {
  sessionId: string;
  institutionId: string;
  institutionName: string;
  employeeName: string;
  accessLevel: string;
  reason: string;
  /** ISO 8601 hard-expiry; the banner counts down to it. */
  expiresAt: string;
}

interface SupportSessionContextValue {
  active: ActiveSupportSession | null;
  enter: (session: ActiveSupportSession) => void;
  leave: () => void;
}

const SupportSessionContext = createContext<SupportSessionContextValue | null>(null);

/**
 * Holds the employee's active support-access session client-side (persisted to localStorage so
 * a page reload keeps support mode). The id flows into the API client as `x-support-session-id`
 * so the server attributes every portal action to the session. State only — never calls the API.
 */
export function SupportSessionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveSupportSession | null>(null);

  // Rehydrate once on mount; drop a persisted session that already expired.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ActiveSupportSession;
      if (new Date(parsed.expiresAt).getTime() > Date.now()) setActive(parsed);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const enter = useCallback((session: ActiveSupportSession) => {
    setActive(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, []);

  const leave = useCallback(() => {
    setActive(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ active, enter, leave }), [active, enter, leave]);
  return <SupportSessionContext.Provider value={value}>{children}</SupportSessionContext.Provider>;
}

export function useSupportSession(): SupportSessionContextValue {
  const ctx = useContext(SupportSessionContext);
  if (!ctx) throw new Error('useSupportSession must be used within <SupportSessionProvider>');
  return ctx;
}
