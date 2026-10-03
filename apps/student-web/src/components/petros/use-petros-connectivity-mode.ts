'use client';

import { useEffect, useState } from 'react';

export type PetrosConnectivityMode = 'online' | 'low_bandwidth';
const STORAGE_KEY = 'petros:connectivity-mode';

function storedMode(): PetrosConnectivityMode {
  try { return localStorage.getItem(STORAGE_KEY) === 'low_bandwidth' ? 'low_bandwidth' : 'online'; }
  catch { return 'online'; }
}

export function usePetrosConnectivityMode() {
  const [mode, setMode] = useState<PetrosConnectivityMode>('online');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setMode(storedMode());
    setReady(true);
    const update = (event: Event) => {
      const requested = (event as CustomEvent<{ mode?: PetrosConnectivityMode }>).detail?.mode;
      setMode(requested === 'low_bandwidth' || requested === 'online' ? requested : storedMode());
    };
    const crossTab = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setMode(storedMode());
    };
    window.addEventListener('petros:connectivity-mode', update);
    window.addEventListener('storage', crossTab);
    return () => {
      window.removeEventListener('petros:connectivity-mode', update);
      window.removeEventListener('storage', crossTab);
    };
  }, []);
  return { mode, ready, reducedAssets: !ready || mode === 'low_bandwidth' };
}
