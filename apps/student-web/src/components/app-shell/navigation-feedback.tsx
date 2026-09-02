'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import styles from './navigation-feedback.module.css';

const MINIMUM_VISIBLE_MS = 280;
const SAFETY_TIMEOUT_MS = 15_000;

type PendingNavigation = {
  anchor: HTMLAnchorElement;
  fromHref: string;
  label: string;
  previousAriaBusy: string | null;
  startedAt: number;
};

function navigationLabel(anchor: HTMLAnchorElement) {
  const raw = anchor.getAttribute('aria-label') || anchor.textContent || 'your next page';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 72) || 'your next page';
}

function eligibleNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download') || anchor.dataset.noNavigationFeedback === 'true') return null;

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return null;
  if (!['http:', 'https:'].includes(destination.protocol)) return null;

  const current = new URL(window.location.href);
  const samePage = destination.pathname === current.pathname && destination.search === current.search;
  if (samePage) return null;
  return destination;
}

export function NavigationFeedback() {
  const pathname = usePathname();
  const pendingRef = useRef<PendingNavigation | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const [pending, setPending] = useState<PendingNavigation | null>(null);

  const clearPending = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    delete current.anchor.dataset.routePending;
    if (current.previousAriaBusy === null) current.anchor.removeAttribute('aria-busy');
    else current.anchor.setAttribute('aria-busy', current.previousAriaBusy);
    delete document.documentElement.dataset.routePending;
    pendingRef.current = null;
    setPending(null);
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = null;
  }, []);

  const finishAfterMinimum = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - current.startedAt));
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(clearPending, remaining);
  }, [clearPending]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;

      const destination = eligibleNavigation(event, anchor);
      if (!destination) return;

      if (pendingRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const next: PendingNavigation = {
        anchor,
        fromHref: window.location.href,
        label: navigationLabel(anchor),
        previousAriaBusy: anchor.getAttribute('aria-busy'),
        startedAt: performance.now(),
      };
      pendingRef.current = next;
      anchor.dataset.routePending = 'true';
      anchor.setAttribute('aria-busy', 'true');
      document.documentElement.dataset.routePending = 'true';
      setPending(next);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const watchLocation = window.setInterval(() => {
      if (window.location.href !== pending.fromHref) {
        window.clearInterval(watchLocation);
        finishAfterMinimum();
      }
    }, 50);
    const safetyTimeout = window.setTimeout(clearPending, SAFETY_TIMEOUT_MS);
    return () => {
      window.clearInterval(watchLocation);
      window.clearTimeout(safetyTimeout);
    };
  }, [clearPending, finishAfterMinimum, pending]);

  useEffect(() => {
    if (pendingRef.current) finishAfterMinimum();
  }, [finishAfterMinimum, pathname]);

  useEffect(() => () => {
    const current = pendingRef.current;
    if (current) {
      delete current.anchor.dataset.routePending;
      if (current.previousAriaBusy === null) current.anchor.removeAttribute('aria-busy');
      else current.anchor.setAttribute('aria-busy', current.previousAriaBusy);
    }
    delete document.documentElement.dataset.routePending;
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
  }, []);

  return (
    <div className={styles.layer} data-active={pending ? 'true' : undefined}>
      <div className={styles.track} aria-hidden="true"><span /></div>
      {pending ? (
        <>
          <div className={styles.shield} aria-hidden="true" />
          <div className={styles.notice} role="status" aria-live="assertive" aria-atomic="true">
            <LoaderCircle aria-hidden="true" />
            <span>Opening {pending.label}…</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
