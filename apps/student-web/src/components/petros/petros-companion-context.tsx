'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  resolvePetrosRoute,
  type PetrosCompanionMessage,
  type PetrosEntityType,
  type PetrosPageCandidate,
  type PetrosSurface,
} from '@edrion/schemas';

/** What a page tells Petros about one thing on screen. */
export type PetrosCandidateInput = {
  ref: string;
  entityType: PetrosEntityType;
  entityId?: string;
  title: string;
  summary?: string;
  href?: string;
};

export type PetrosPageRegistration = {
  title: string;
  summary?: string;
  candidates: PetrosCandidateInput[];
};

type CompanionState = {
  open: boolean;
  route: string;
  surface: PetrosSurface;
  label: string;
  support: 'supported' | 'unavailable' | 'hidden';
  reason?: string;
  page: PetrosPageRegistration | null;
  focusRef: string | null;
  threadId: string | null;
  messages: PetrosCompanionMessage[];
  pendingQuestion: string;
};

type CompanionApi = CompanionState & {
  candidates: PetrosPageCandidate[];
  focus: PetrosCandidateInput | null;
  registerPage: (registration: PetrosPageRegistration | null) => void;
  setOpen: (open: boolean) => void;
  /** Explicit selection. Nothing else may change focus. */
  select: (ref: string | null) => void;
  /** Select an item and open the panel with a starter question. */
  askAbout: (ref: string, question?: string) => void;
  setThread: (threadId: string | null, messages: PetrosCompanionMessage[]) => void;
  appendMessages: (messages: PetrosCompanionMessage[]) => void;
  consumePendingQuestion: () => string;
};

const CompanionContext = createContext<CompanionApi | null>(null);

/**
 * Owns companion state for the whole portal: which page is registered, what the student
 * selected, and the live thread. Mounted once in AppShell so the panel survives navigation.
 *
 * Focus is only ever set by an explicit student action. Array position is never the
 * selection algorithm, which is what made the previous assistant always talk about the
 * first card on the screen.
 */
export function PetrosCompanionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const rule = useMemo(() => resolvePetrosRoute(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PetrosPageRegistration | null>(null);
  const [focusRef, setFocusRef] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PetrosCompanionMessage[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const routeRef = useRef(pathname);

  // A new page owns its own candidates; a stale selection must not leak across routes.
  useEffect(() => {
    if (routeRef.current === pathname) return;
    routeRef.current = pathname;
    setPage(null);
    setFocusRef(null);
  }, [pathname]);

  const registerPage = useCallback((registration: PetrosPageRegistration | null) => {
    setPage(registration);
    setFocusRef((current) => {
      if (!current) return current;
      // Keep the selection only while the item is still on screen.
      return registration?.candidates.some((candidate) => candidate.ref === current)
        ? current
        : null;
    });
  }, []);

  const select = useCallback((ref: string | null) => setFocusRef(ref), []);

  const askAbout = useCallback((ref: string, question?: string) => {
    setFocusRef(ref);
    if (question) setPendingQuestion(question);
    setOpen(true);
  }, []);

  const setThread = useCallback((id: string | null, next: PetrosCompanionMessage[]) => {
    setThreadId(id);
    setMessages(next);
  }, []);

  const appendMessages = useCallback((next: PetrosCompanionMessage[]) => {
    setMessages((current) => {
      const seen = new Set(current.map((message) => message.id));
      return [...current, ...next.filter((message) => !seen.has(message.id))];
    });
  }, []);

  const consumePendingQuestion = useCallback(() => {
    const question = pendingQuestion;
    setPendingQuestion('');
    return question;
  }, [pendingQuestion]);

  const candidates = useMemo<PetrosPageCandidate[]>(
    () =>
      (page?.candidates ?? []).slice(0, 40).map((candidate) => ({
        ref: candidate.ref,
        entityType: candidate.entityType,
        title: candidate.title,
        summary: candidate.summary ?? '',
        availableActions: [],
        ...(candidate.entityId ? { entityId: candidate.entityId } : {}),
        ...(candidate.href ? { href: candidate.href } : {}),
      })),
    [page],
  );

  const focus = useMemo(
    () => page?.candidates.find((candidate) => candidate.ref === focusRef) ?? null,
    [page, focusRef],
  );

  const value = useMemo<CompanionApi>(
    () => ({
      open,
      route: rule.route,
      surface: rule.surface,
      label: rule.label,
      support: rule.support,
      ...(rule.reason ? { reason: rule.reason } : {}),
      page,
      focusRef,
      threadId,
      messages,
      pendingQuestion,
      candidates,
      focus,
      registerPage,
      setOpen,
      select,
      askAbout,
      setThread,
      appendMessages,
      consumePendingQuestion,
    }),
    [
      appendMessages,
      askAbout,
      candidates,
      consumePendingQuestion,
      focus,
      focusRef,
      messages,
      open,
      page,
      pendingQuestion,
      registerPage,
      rule,
      select,
      setThread,
      threadId,
    ],
  );

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>;
}

export function usePetrosCompanion() {
  const context = useContext(CompanionContext);
  if (!context) throw new Error('usePetrosCompanion must be used inside PetrosCompanionProvider');
  return context;
}

/** Optional access, for components that render outside the portal shell (tests, storybook). */
export function usePetrosCompanionOptional() {
  return useContext(CompanionContext);
}

/**
 * Registers what a page is showing. Pass a memoized registration, or `null` while loading —
 * Petros then says he cannot see anything yet rather than guessing.
 */
export function usePetrosPage(registration: PetrosPageRegistration | null) {
  const companion = usePetrosCompanionOptional();
  const register = companion?.registerPage;
  // Registrations are value objects; comparing serialized form keeps a page that rebuilds
  // its array every render from looping.
  const signature = registration
    ? JSON.stringify([registration.title, registration.summary, registration.candidates])
    : '';

  useEffect(() => {
    if (!register) return;
    register(registration);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, signature]);
}
