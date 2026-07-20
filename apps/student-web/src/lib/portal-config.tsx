'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import type { StudentPortalConfigResponse } from '@edrion/schemas';
import { useStudentClient } from './student-client';
import { usePersona } from './persona';

type ConfigState = {
  config?: StudentPortalConfigResponse;
  loading: boolean;
  offline: boolean;
  stale: boolean;
  refresh: () => Promise<void>;
};
const Context = createContext<ConfigState | null>(null);

export function PortalConfigProvider({ children }: { children: ReactNode }) {
  const client = useStudentClient();
  const { me } = usePersona();
  const owner = me ? `${me.kind}:${me.id}` : 'unknown';
  const key = `student-portal-config:${owner}`;
  const [config, setConfig] = useState<StudentPortalConfigResponse>();
  const [etag, setEtag] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const result = await client.getWithEtag<StudentPortalConfigResponse>('/portal-config', etag);
      if (result.data) {
        setConfig(result.data); setEtag(result.etag); setUpdatedAt(Date.now());
        await set(key, { config: result.data, etag: result.etag, updatedAt: Date.now() });
      } else if (result.notModified) setUpdatedAt(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally { setLoading(false); }
  }, [client, etag, key]);

  useEffect(() => {
    let active = true;
    void get<{ config: StudentPortalConfigResponse; etag?: string; updatedAt: number }>(key).then((cached) => {
      if (!active || !cached) return;
      setConfig(cached.config); setEtag(cached.etag); setUpdatedAt(cached.updatedAt); setLoading(false);
    }).finally(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [key]); // refresh intentionally follows the owner cache load

  useEffect(() => {
    const onFocus = () => { if (Date.now() - updatedAt >= 15 * 60_000) void refresh(); };
    const onDisabled = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('edrion:module-disabled', onDisabled);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('edrion:module-disabled', onDisabled); };
  }, [refresh, updatedAt]);

  const value = useMemo(() => ({ config, loading, offline, stale: Boolean(config && (offline || Date.now() - updatedAt > 15 * 60_000)), refresh }), [config, loading, offline, refresh, updatedAt]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePortalConfig() {
  const value = useContext(Context); if (!value) throw new Error('usePortalConfig requires PortalConfigProvider'); return value;
}

export function useTerminology() {
  const { config } = usePortalConfig();
  return useCallback((key: keyof StudentPortalConfigResponse['terminology'], options?: { case?: 'lower' }) => {
    const fallback: StudentPortalConfigResponse['terminology'] = { term_period:'Semester',term_period_plural:'Semesters',group_unit:'Section',internal_assessment:'Internal Marks',marks_word:'Marks',teacher_title:'Professor',head_role:'Registrar',student_id_word:'Register Number',timetable_word:'Timetable',exam_word:'Exam',homework_word:'Assignment',holiday_word:'Holiday',fee_word:'Fees',campus_word:'Campus' };
    const value = config?.terminology[key] ?? fallback[key] ?? String(key);
    return options?.case === 'lower' ? value.toLowerCase() : value;
  }, [config]);
}
