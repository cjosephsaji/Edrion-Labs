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
  type RefCallback,
} from 'react';

export interface PetrosTargetRegistration {
  id: string;
  element: HTMLElement;
  rect: DOMRectReadOnly;
  available: boolean;
}

type TargetRegistryValue = {
  targets: ReadonlyMap<string, PetrosTargetRegistration>;
  register: (id: string) => RefCallback<HTMLElement>;
  refresh: () => void;
};

const TargetRegistryContext = createContext<TargetRegistryValue | null>(null);

export function TeachingTargetRegistry({ children }: { children: ReactNode }) {
  const elements = useRef(new Map<string, HTMLElement>());
  const observers = useRef(new Map<string, ResizeObserver>());
  const frame = useRef<number>();
  const [targets, setTargets] = useState<ReadonlyMap<string, PetrosTargetRegistration>>(new Map());

  const refresh = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const next = new Map<string, PetrosTargetRegistration>();
      elements.current.forEach((element, id) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        next.set(id, {
          id,
          element,
          rect,
          available:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden',
        });
      });
      setTargets(next);
      frame.current = undefined;
    });
  }, []);

  const register = useCallback(
    (id: string): RefCallback<HTMLElement> => (element) => {
      observers.current.get(id)?.disconnect();
      observers.current.delete(id);
      if (!element) {
        elements.current.delete(id);
        refresh();
        return;
      }
      elements.current.set(id, element);
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(refresh);
        observer.observe(element);
        observers.current.set(id, observer);
      }
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    const passive = { passive: true } as const;
    const fonts = document.fonts;
    const activeObservers = observers.current;
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, passive);
    fonts?.addEventListener?.('loadingdone', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh);
      fonts?.removeEventListener?.('loadingdone', refresh);
      activeObservers.forEach((observer) => observer.disconnect());
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [refresh]);

  const value = useMemo(() => ({ targets, register, refresh }), [register, refresh, targets]);
  return <TargetRegistryContext.Provider value={value}>{children}</TargetRegistryContext.Provider>;
}

export function useTeachingTargets() {
  const context = useContext(TargetRegistryContext);
  if (!context) throw new Error('useTeachingTargets must be used inside TeachingTargetRegistry');
  return context;
}

export function useTeachingTarget(id: string): RefCallback<HTMLElement> {
  const { register } = useTeachingTargets();
  return useMemo(() => register(id), [id, register]);
}

export function TeachingTarget({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useTeachingTarget(id);
  return (
    <span ref={ref} className={className} data-petros-target={id}>
      {children}
    </span>
  );
}
