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
import { useAcademicYearOptions } from './academics';
import { useTermOptionsByProgrammeLevel } from './academics';

const STORAGE_KEY = 'edrion.portal.academic-context';

export interface AcademicContextValue {
  academicYearId: string;
  termId: string;
  setAcademicYearId: (id: string) => void;
  setTermId: (id: string) => void;
  academicYearLabel: string;
  termLabel: string;
}

const AcademicContext = createContext<AcademicContextValue | null>(null);

function readStored(): { academicYearId: string; termId: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { academicYearId?: string; termId?: string };
    if (parsed.academicYearId) return { academicYearId: parsed.academicYearId, termId: parsed.termId ?? '' };
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Global academic year / term context for list filters and rollups. Defaults to the institution's
 * current year and term when available; persisted in localStorage.
 */
export function AcademicContextProvider({ children }: { children: ReactNode }) {
  const { data: years } = useAcademicYearOptions();
  const yearItems = years?.items ?? [];
  const currentYear = yearItems.find((y) => y.isCurrent) ?? yearItems[0];
  const { data: terms } = useTermOptionsByProgrammeLevel();
  const termItems = terms?.items ?? [];
  const currentTerm = termItems.find((t) => t.isCurrent) ?? termItems[0];

  const [academicYearId, setAcademicYearIdState] = useState('');
  const [termId, setTermIdState] = useState('');

  useEffect(() => {
    const stored = readStored();
    const validYear = stored?.academicYearId && yearItems.some((y) => y.id === stored.academicYearId);
    const validTerm = stored?.termId && termItems.some((t) => t.id === stored.termId);
    setAcademicYearIdState(validYear ? stored!.academicYearId : (currentYear?.id ?? ''));
    setTermIdState(validTerm ? stored!.termId : (currentTerm?.id ?? ''));
  }, [currentYear?.id, currentTerm?.id, yearItems, termItems]);

  const persist = useCallback((year: string, term: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ academicYearId: year, termId: term }));
    } catch {
      /* ignore */
    }
  }, []);

  const setAcademicYearId = useCallback(
    (id: string) => {
      setAcademicYearIdState(id);
      persist(id, termId);
    },
    [persist, termId],
  );

  const setTermId = useCallback(
    (id: string) => {
      setTermIdState(id);
      persist(academicYearId, id);
    },
    [academicYearId, persist],
  );

  const academicYearLabel = yearItems.find((y) => y.id === academicYearId)?.name ?? 'All years';
  const termLabel = termItems.find((t) => t.id === termId)?.name ?? 'All terms';

  const value = useMemo(
    () => ({
      academicYearId,
      termId,
      setAcademicYearId,
      setTermId,
      academicYearLabel,
      termLabel,
    }),
    [academicYearId, termId, setAcademicYearId, setTermId, academicYearLabel, termLabel],
  );

  return <AcademicContext.Provider value={value}>{children}</AcademicContext.Provider>;
}

export function useAcademicContext(): AcademicContextValue {
  const ctx = useContext(AcademicContext);
  if (!ctx) throw new Error('useAcademicContext must be used within AcademicContextProvider');
  return ctx;
}

/** Filter map for list hooks that respect the global academic context. */
export function useAcademicContextFilters(): Record<string, string | undefined> {
  const { academicYearId, termId } = useAcademicContext();
  return {
    ...(academicYearId ? { academicYearId } : {}),
    ...(termId ? { termId } : {}),
  };
}
