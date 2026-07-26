'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { StudentMeDto } from '@edrion/schemas';
import { useStudentMe } from './hooks';

export type StudentTerminology = {
  hw: 'Homework' | 'Assignments';
  unitP: 'Classes' | 'Courses';
  instLabel: 'YOUR SCHOOL' | 'YOUR COLLEGE';
};

const PersonaContext = createContext<{
  me: StudentMeDto | undefined;
  isLoading: boolean;
  terms: StudentTerminology;
} | null>(null);

function termsForPersona(persona: StudentMeDto['persona'] | undefined): StudentTerminology {
  if (persona === 'college') {
    return { hw: 'Assignments', unitP: 'Courses', instLabel: 'YOUR COLLEGE' };
  }
  if (persona === 'school') {
    return { hw: 'Homework', unitP: 'Classes', instLabel: 'YOUR SCHOOL' };
  }
  return { hw: 'Homework', unitP: 'Classes', instLabel: 'YOUR SCHOOL' };
}

export function PersonaProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useStudentMe();
  const terms = useMemo(() => termsForPersona(me?.persona), [me?.persona]);
  const value = useMemo(() => ({ me, isLoading, terms }), [me, isLoading, terms]);
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider');
  return ctx;
}

/** Nav label map keyed by persona — port of the design's `T` map. */
export function useStudentTerm(): StudentTerminology {
  return usePersona().terms;
}
