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
import { usePortalMe } from './hooks';
import type { CampusOption, InstitutionScope } from './types';

const STORAGE_KEY = 'edrion.portal.scope';

interface ScopeContextValue {
  scope: InstitutionScope;
  setScope: (scope: InstitutionScope) => void;
  /** Campuses the switcher may offer. */
  campuses: CampusOption[];
  /** Whether "Entire Institution" is selectable (institution-wide users only). */
  canSelectEntireInstitution: boolean;
  /** Human label for the active scope, e.g. "Entire Institution" or "North Campus". */
  activeLabel: string;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

function readStored(): InstitutionScope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InstitutionScope;
    if (parsed.mode === 'institution' || (parsed.mode === 'campus' && parsed.campusId)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Pick the initial scope once campuses and permissions are known. */
function defaultScope(campuses: CampusOption[], canSelectEntireInstitution: boolean): InstitutionScope {
  if (campuses.length === 1) {
    return { mode: 'campus', campusId: campuses[0]!.id };
  }
  if (canSelectEntireInstitution) {
    return { mode: 'institution' };
  }
  if (campuses[0]) {
    return { mode: 'campus', campusId: campuses[0].id };
  }
  return { mode: 'institution' };
}

/**
 * Holds the global viewing scope (Entire Institution vs a specific campus) and persists it. The
 * scope narrows every dashboard, table, report and analytic. Confined users (e.g. Campus Admin)
 * cannot select "Entire Institution" and default to their first allowed campus. When the
 * institution has only one campus, that campus is selected by default (even for institution-wide
 * users) because "Entire Institution" would be redundant.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const { data: me } = usePortalMe();
  const [scope, setScopeState] = useState<InstitutionScope>({ mode: 'institution' });

  const campuses = useMemo(() => me?.campuses ?? [], [me]);
  const canSelectEntireInstitution = me?.isInstitutionWide ?? false;

  // Hydrate from storage / fall back to a valid scope once `me` is known.
  useEffect(() => {
    if (!me) return;
    const allowedIds = new Set(campuses.map((c) => c.id));
    const stored = readStored();
    const singleCampus = campuses.length === 1;

    const isValid = (s: InstitutionScope | null): s is InstitutionScope =>
      !!s &&
      ((s.mode === 'institution' && canSelectEntireInstitution && !singleCampus) ||
        (s.mode === 'campus' && allowedIds.has(s.campusId)));

    if (isValid(stored)) {
      setScopeState(stored);
    } else {
      const next = defaultScope(campuses, canSelectEntireInstitution);
      setScopeState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const setScope = useCallback((next: InstitutionScope) => {
    setScopeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const activeLabel = useMemo(() => {
    if (scope.mode === 'institution') return 'Entire Institution';
    return campuses.find((c) => c.id === scope.campusId)?.name ?? 'Campus';
  }, [scope, campuses]);

  const value: ScopeContextValue = {
    scope,
    setScope,
    campuses,
    canSelectEntireInstitution,
    activeLabel,
  };
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope must be used within ScopeProvider');
  return ctx;
}
