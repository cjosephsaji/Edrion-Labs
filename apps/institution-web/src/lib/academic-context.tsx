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
import { useAcademicYearOptions } from './academics';
import { useTermOptionsByProgrammeLevel } from './academics';
import { usePermissions } from './permissions';

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
 * Global academic year context for list filters and rollups. Defaults to the institution's
 * current year when available; persisted in localStorage.
 * Term/semester stays available for page-level filters but is not set from the topbar.
 */
export function AcademicContextProvider({ children }: { children: ReactNode }) {
  const { can, ready } = usePermissions();
  const canViewAcademics = ready && can('academics.view');
  const { data: years } = useAcademicYearOptions(canViewAcademics);
  const [academicYearId, setAcademicYearIdState] = useState('');
  const [termId, setTermIdState] = useState('');
  const hydratedRef = useRef(false);

  // Terms kept for label/API helpers when a page sets termId explicitly.
  const { data: terms } = useTermOptionsByProgrammeLevel(
    undefined,
    canViewAcademics,
    academicYearId || undefined,
  );

  const yearItems = useMemo(() => years?.items ?? [], [years?.items]);
  const termItems = useMemo(() => terms?.items ?? [], [terms?.items]);
  const currentYear = yearItems.find((y) => y.isCurrent) ?? yearItems[0];

  // Hydrate once from storage (or current year) after options have loaded.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (canViewAcademics && !years) return;
    const stored = readStored();
    const validYear = stored?.academicYearId && yearItems.some((y) => y.id === stored.academicYearId);
    setAcademicYearIdState(validYear ? stored!.academicYearId : (currentYear?.id ?? ''));
    // Do not restore or default a global term — topbar is year-only for now.
    setTermIdState('');
    hydratedRef.current = true;
  }, [canViewAcademics, years, yearItems, currentYear?.id]);

  // Prune invalid year when options change. Never re-reads storage.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (yearItems.length === 0) return;

    setAcademicYearIdState((prev) => {
      if (!prev) return currentYear?.id ?? '';
      if (yearItems.some((y) => y.id === prev)) return prev;
      return currentYear?.id ?? '';
    });
  }, [yearItems, currentYear?.id]);

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
      setTermIdState('');
      persist(id, '');
    },
    [persist],
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

/** Year-only facet — use on directory screens that already expose their own term filter (e.g. classes). */
export function useAcademicYearContextFilter(): Record<string, string | undefined> {
  const { academicYearId } = useAcademicContext();
  return academicYearId ? { academicYearId } : {};
}

export type AcademicScopeMode = 'year+term' | 'year' | 'none';

/**
 * Merge global academic context into list filters.
 * Truthy page filters win — an unset facet that emits `''` must not clobber the context term/year.
 *
 * Reads context optionally so callers with `academicScope: 'none'` (including
 * AcademicContextProvider itself via useAcademicYearOptions / useTermOptionsByProgrammeLevel)
 * do not throw before the provider value is mounted.
 */
export function useAcademicScopedParams<T extends { filters?: Record<string, string | undefined>; academicScope?: AcademicScopeMode }>(
  params: T,
  mode: AcademicScopeMode,
): T {
  const ctxValue = useContext(AcademicContext);
  const effective = params.academicScope ?? mode;
  if (effective === 'none') return params;
  if (!ctxValue) {
    throw new Error('useAcademicContext must be used within AcademicContextProvider');
  }

  const { academicYearId, termId } = ctxValue;
  const ctx: Record<string, string | undefined> = {};
  if (academicYearId && (effective === 'year' || effective === 'year+term')) {
    ctx.academicYearId = academicYearId;
  }
  if (termId && effective === 'year+term') {
    ctx.termId = termId;
  }

  const pageFilters = params.filters ?? {};
  const merged: Record<string, string | undefined> = { ...ctx };
  for (const [k, v] of Object.entries(pageFilters)) {
    if (v) merged[k] = v;
  }
  return { ...params, filters: merged };
}

/** Stable key fragment for bespoke hooks that build query keys by hand. */
export function useAcademicContextKey(): string {
  const { academicYearId, termId } = useAcademicContext();
  return `year:${academicYearId || 'all'}|term:${termId || 'all'}`;
}
