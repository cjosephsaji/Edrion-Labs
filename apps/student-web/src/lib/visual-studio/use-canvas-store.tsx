'use client';

import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createVisualCanvasStore,
  type VisualCanvasStore,
  type VisualCanvasStoreActions,
  type VisualCanvasStoreState,
} from './canvas-store';

const VisualCanvasStoreContext = createContext<VisualCanvasStore | null>(null);

export function VisualCanvasStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<VisualCanvasStore>();
  if (!storeRef.current) {
    storeRef.current = createVisualCanvasStore();
  }

  return (
    <VisualCanvasStoreContext.Provider value={storeRef.current}>
      {children}
    </VisualCanvasStoreContext.Provider>
  );
}

export function useVisualCanvasStore<T>(
  selector: (state: VisualCanvasStoreState & VisualCanvasStoreActions) => T,
): T {
  const store = useContext(VisualCanvasStoreContext);
  if (!store) {
    throw new Error('useVisualCanvasStore must be used within VisualCanvasStoreProvider');
  }
  return useStore(store, selector);
}

export function useVisualCanvasStoreApi(): VisualCanvasStore {
  const store = useContext(VisualCanvasStoreContext);
  if (!store) {
    throw new Error('useVisualCanvasStoreApi must be used within VisualCanvasStoreProvider');
  }
  return store;
}
