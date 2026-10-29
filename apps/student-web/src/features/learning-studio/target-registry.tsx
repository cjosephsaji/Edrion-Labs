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
  scope?: { sessionId: string; activityId: string | null; revision: number };
}

type TargetRegistryValue = {
  targets: ReadonlyMap<string, PetrosTargetRegistration>;
  register: (id: string) => RefCallback<HTMLElement>;
  refresh: () => void;
};

const TargetRegistryContext = createContext<TargetRegistryValue | null>(null);

export function TeachingTargetRegistry({
  children,
  scope,
}: {
  children: ReactNode;
  scope?: PetrosTargetRegistration['scope'];
}) {
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const elements = useRef(new Map<string, HTMLElement>());
  const observers = useRef(new Map<string, ResizeObserver>());
  const frame = useRef<number>();
  const [targets, setTargets] = useState<ReadonlyMap<string, PetrosTargetRegistration>>(new Map());

  const refresh = useCallback(() => {
    if (frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      const next = new Map<string, PetrosTargetRegistration>();
      elements.current.forEach((element, id) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        next.set(id, {
          id,
          scope: currentScope.current,
          element,
          rect,
          available:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.isConnected &&
            !element.closest('[hidden], [inert], [aria-hidden="true"]'),
        });
      });
      // Geometry/visibility changes, not every unrelated DOM mutation, publish
      // a registry revision. Face/pose/caption rendering cannot fan out a full
      // canvas rerender through this context when its targets have not changed.
      setTargets((previous) => {
        const same =
          previous.size === next.size &&
          [...next].every(([id, value]) => {
            const old = previous.get(id);
            return (
              old &&
              old.element === value.element &&
              old.available === value.available &&
              old.rect.x === value.rect.x &&
              old.rect.y === value.rect.y &&
              old.rect.width === value.rect.width &&
              old.rect.height === value.rect.height &&
              old.scope?.sessionId === value.scope?.sessionId &&
              old.scope?.activityId === value.scope?.activityId &&
              old.scope?.revision === value.scope?.revision
            );
          });
        return same ? previous : next;
      });
      frame.current = undefined;
    });
  }, []);

  useEffect(() => refresh(), [refresh, scope?.sessionId, scope?.activityId, scope?.revision]);

  const register = useCallback(
    (id: string): RefCallback<HTMLElement> => {
      let owned: HTMLElement | null = null;
      return (element) => {
        if (!element && elements.current.get(id) !== owned) return;
        owned = element;
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
      };
    },
    [refresh],
  );

  useEffect(() => {
    // Capture also observes canvas/workspace scrollports; scroll does not bubble.
    const passive = { passive: true, capture: true } as const;
    const fonts = document.fonts;
    const activeObservers = observers.current;
    // React Strict Mode reconnects effects without replacing the target nodes.
    // Reattach their observers after the development cleanup/setup cycle.
    activeObservers.forEach((observer, id) => {
      const element = elements.current.get(id);
      if (element) observer.observe(element);
    });
    const mutation = new MutationObserver(refresh);
    mutation.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'inert', 'aria-hidden', 'open', 'style', 'class'],
    });
    window.visualViewport?.addEventListener('resize', refresh);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, passive);
    fonts?.addEventListener?.('loadingdone', refresh);
    return () => {
      mutation.disconnect();
      window.visualViewport?.removeEventListener('resize', refresh);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, passive);
      fonts?.removeEventListener?.('loadingdone', refresh);
      activeObservers.forEach((observer) => observer.disconnect());
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
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
