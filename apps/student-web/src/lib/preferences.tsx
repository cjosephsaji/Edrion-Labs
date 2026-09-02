'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type StudentTheme = 'standard' | 'dim' | 'dark';
export type TextSize = 'S' | 'M' | 'L';

type Preferences = {
  theme: StudentTheme;
  matchSystem: boolean;
  reduceMotion: boolean;
  textSize: TextSize;
  quickNav: string[] | null;
};

type PreferencesContextValue = Preferences & {
  setTheme: (theme: StudentTheme) => void;
  setMatchSystem: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  setTextSize: (size: TextSize) => void;
  setQuickNav: (hrefs: string[]) => void;
  resetQuickNav: () => void;
};

const STORAGE_KEY = 'edrion.student.preferences.v2';
const defaults: Preferences = {
  theme: 'standard',
  matchSystem: false,
  reduceMotion: false,
  textSize: 'M',
  quickNav: null,
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function isTheme(value: unknown): value is StudentTheme {
  return value === 'standard' || value === 'dim' || value === 'dark';
}

function isTextSize(value: unknown): value is TextSize {
  return value === 'S' || value === 'M' || value === 'L';
}

export function StudentPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Preferences>;
      setPreferences({
        theme: isTheme(saved.theme) ? saved.theme : defaults.theme,
        matchSystem: Boolean(saved.matchSystem),
        reduceMotion: Boolean(saved.reduceMotion),
        textSize: isTextSize(saved.textSize) ? saved.textSize : defaults.textSize,
        quickNav: Array.isArray(saved.quickNav)
          ? [...new Set(saved.quickNav.filter((href): href is string => typeof href === 'string' && href.startsWith('/')))]
          : defaults.quickNav,
      });
    } catch {
      setPreferences(defaults);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Preferences still work for this visit when browser storage is unavailable.
    }
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolvedTheme = preferences.matchSystem
      ? systemDark
        ? 'dark'
        : 'standard'
      : preferences.theme;
    document.documentElement.dataset.studentTheme = resolvedTheme;
    document.documentElement.dataset.reducedMotion = String(preferences.reduceMotion);
    document.documentElement.dataset.textSize = preferences.textSize.toLowerCase();
  }, [preferences, ready]);

  useEffect(() => {
    if (!preferences.matchSystem) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.studentTheme = media.matches ? 'dark' : 'standard';
    };
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.matchSystem]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      setTheme: (theme) => setPreferences((current) => ({ ...current, theme, matchSystem: false })),
      setMatchSystem: (matchSystem) =>
        setPreferences((current) => ({ ...current, matchSystem })),
      setReduceMotion: (reduceMotion) =>
        setPreferences((current) => ({ ...current, reduceMotion })),
      setTextSize: (textSize) => setPreferences((current) => ({ ...current, textSize })),
      setQuickNav: (quickNav) => setPreferences((current) => ({ ...current, quickNav: [...new Set(quickNav)] })),
      resetQuickNav: () => setPreferences((current) => ({ ...current, quickNav: null })),
    }),
    [preferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useStudentPreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useStudentPreferences must be used within StudentPreferencesProvider');
  return value;
}
