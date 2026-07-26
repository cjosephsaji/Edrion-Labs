'use client';
import { useMemo } from 'react';
import { useStudentMe } from '@/lib/hooks';
import { en, type Messages } from './en';

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

/** Reads the user's language preference; falls back to English strings for now. */
export function useT(): {
  t: (path: string, vars?: Record<string, string | number>) => string;
  messages: Messages;
} {
  const { data: me } = useStudentMe();
  const lang = me?.preferences.language ?? 'en';

  return useMemo(() => {
    const messages = en;
    void lang;

    function get(obj: Record<string, unknown>, path: string): unknown {
      return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in acc) {
          return (acc as Record<string, unknown>)[key];
        }
        return undefined;
      }, obj);
    }

    function t(path: string, vars?: Record<string, string | number>): string {
      const value = get(messages as unknown as Record<string, unknown>, path);
      if (typeof value === 'string') return vars ? interpolate(value, vars) : value;
      return path;
    }

    return { t, messages };
  }, [lang]);
}
