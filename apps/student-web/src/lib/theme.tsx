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
import type { StudentPreferencesDto } from '@edrion/schemas';
import { useStudentClient } from './student-client';
import { useStudentMe } from './hooks';

export type StudentThemeName = StudentPreferencesDto['theme'];

const THEME_STORAGE_KEY = 'edrion-student-theme';

type ThemeContextValue = {
  theme: StudentThemeName;
  matchSystem: boolean;
  reducedMotion: boolean;
  textSize: StudentPreferencesDto['textSize'];
  setTheme: (theme: StudentThemeName) => void;
  setMatchSystem: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setTextSize: (size: StudentPreferencesDto['textSize']) => void;
  effectiveTheme: StudentThemeName;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(theme: StudentThemeName, matchSystem: boolean): StudentThemeName {
  if (!matchSystem) return theme;
  const dark = readSystemDark();
  if (dark) return 'dark';
  return theme === 'dark' ? 'dark' : theme === 'dim' ? 'dim' : 'standard';
}

function textSizeClass(size: StudentPreferencesDto['textSize']): string {
  if (size === 'S') return 'text-size-s';
  if (size === 'L') return 'text-size-l';
  return 'text-size-m';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const client = useStudentClient();
  const { data: me } = useStudentMe();

  const [theme, setThemeState] = useState<StudentThemeName>('standard');
  const [matchSystem, setMatchSystemState] = useState(false);
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [textSize, setTextSizeState] = useState<StudentPreferencesDto['textSize']>('M');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as StudentThemeName | null;
    if (stored === 'standard' || stored === 'dim' || stored === 'dark') {
      setThemeState(stored);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!me?.preferences) return;
    setThemeState(me.preferences.theme);
    setMatchSystemState(me.preferences.matchSystem);
    setReducedMotionState(me.preferences.reducedMotion);
    setTextSizeState(me.preferences.textSize);
  }, [me?.preferences]);

  const effectiveTheme = useMemo(() => resolveTheme(theme, matchSystem), [theme, matchSystem]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setSystemReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const effectiveReducedMotion = reducedMotion || systemReducedMotion;

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.setAttribute('data-student-theme', effectiveTheme);
    root.setAttribute('data-reduced-motion', effectiveReducedMotion ? 'true' : 'false');
    root.setAttribute('data-persona', me?.persona ?? 'independent');
    root.classList.remove('text-size-s', 'text-size-m', 'text-size-l');
    root.classList.add(textSizeClass(textSize));
  }, [effectiveTheme, effectiveReducedMotion, textSize, me?.persona, hydrated]);

  useEffect(() => {
    if (!matchSystem) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-student-theme', resolveTheme(theme, true));
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [matchSystem, theme]);

  const persistPreferences = useCallback(
    async (patch: Partial<StudentPreferencesDto>) => {
      try {
        await client.patch('/preferences', patch);
      } catch {
        // optimistic UI — preferences sync on next /me fetch
      }
    },
    [client],
  );

  const setTheme = useCallback(
    (next: StudentThemeName) => {
      setThemeState(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
      void persistPreferences({ theme: next });
    },
    [persistPreferences],
  );

  const setMatchSystem = useCallback(
    (v: boolean) => {
      setMatchSystemState(v);
      void persistPreferences({ matchSystem: v });
    },
    [persistPreferences],
  );

  const setReducedMotion = useCallback(
    (v: boolean) => {
      setReducedMotionState(v);
      void persistPreferences({ reducedMotion: v });
    },
    [persistPreferences],
  );

  const setTextSize = useCallback(
    (size: StudentPreferencesDto['textSize']) => {
      setTextSizeState(size);
      void persistPreferences({ textSize: size });
    },
    [persistPreferences],
  );

  const value = useMemo(
    () => ({
      theme,
      matchSystem,
      reducedMotion: effectiveReducedMotion,
      textSize,
      setTheme,
      setMatchSystem,
      setReducedMotion,
      setTextSize,
      effectiveTheme,
    }),
    [
      theme,
      matchSystem,
      effectiveReducedMotion,
      textSize,
      setTheme,
      setMatchSystem,
      setReducedMotion,
      setTextSize,
      effectiveTheme,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
