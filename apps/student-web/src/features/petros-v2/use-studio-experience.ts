'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { M4Snapshot } from '@edrion/schemas';
import { PresentationController } from './presentation-controller';
import { studioCue, studioPassages, studioSourceKey, studioTimeline } from './studio-presentation';
import {
  defaultStudioPreferences,
  readStudioPreferences,
  studioPreferenceKey,
  type StudioPreferences,
} from './studio-preferences';

/** Coordinates an authorized session with the existing presentation owner.
 * Stores only reading position locally. Never restores content or academic state. */
export function useStudioExperience(snapshot: M4Snapshot, asking: boolean) {
  const [preferences, setPreferences] = useState(defaultStudioPreferences),
    [preferencesReady, setPreferencesReady] = useState(false),
    [systemReducedMotion, setSystemReducedMotion] = useState(false),
    [pageHidden, setPageHidden] = useState(false);
  const { textOnly, hidden, compact } = preferences;
  const reducedMotion = systemReducedMotion || preferences.reducedMotion;
  const setPreference = (key: keyof StudioPreferences, value: boolean) =>
    setPreferences((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    try {
      setPreferences(readStudioPreferences(localStorage.getItem(studioPreferenceKey)));
    } catch {
      // Restricted storage still permits all controls for this mounted session.
    }
    setPreferencesReady(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    try {
      localStorage.setItem(studioPreferenceKey, JSON.stringify(preferences));
    } catch {
      // Presentation preferences are optional; committed work remains server-owned.
    }
  }, [preferences, preferencesReady]);
  const sourceKey = studioSourceKey(snapshot);
  const introduction = useRef<{
    controller: PresentationController;
    fresh: boolean;
    started: boolean;
  } | null>(null);
  const lesson = snapshot.teaching ? null : snapshot.lesson;
  // Source pins and text change together; revision-only saves preserve the reading position.
  const controller = useMemo(
    () => {
      if (!lesson || !studioPassages(lesson).length) return null;
      try {
        return new PresentationController(studioTimeline(lesson));
      } catch {
        // A valid publication can exceed the smaller presentation capability
        // budget (for example heavily escaped text). Keep exact text available.
        return null;
      }
    },
    // sourceKey includes the complete current lesson and exact source references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey, Boolean(snapshot.teaching)],
  );
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.getSnapshot ?? (() => null),
    controller?.getSnapshot ?? (() => null),
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    const visibility = () => {
      setPageHidden(document.hidden);
      if (document.hidden) controller?.interrupt();
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [controller]);
  useEffect(() => {
    if (!controller) return;
    const storageKey = `petros-studio-reading:${snapshot.id}`;
    let count = 1;
    let fresh = false;
    let selectedId: string | null = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      fresh = saved?.source !== sourceKey;
      if (saved?.source === sourceKey && Number.isInteger(saved.count)) {
        count = Math.min(controller.timeline.beats.length, Math.max(1, saved.count));
        if (typeof saved.selectedId === 'string') selectedId = saved.selectedId;
      }
    } catch {
      /* Storage is optional. The authoritative task/draft is on the server. */
    }
    if (introduction.current?.controller !== controller)
      introduction.current = { controller, fresh, started: false };
    for (let i = controller.getSnapshot().canvas.elements.length; i < count; i++) controller.step();
    if (
      selectedId &&
      controller.getSnapshot().canvas.elements.some((element) => element.id === selectedId)
    )
      controller.select(selectedId);
    return () => {
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({
            source: sourceKey,
            count: controller.getSnapshot().canvas.elements.length,
            selectedId: controller.getSnapshot().selectedId,
          }),
        );
      } catch {
        /* Optional reading position only. */
      }
      controller.dispose();
    };
  }, [controller, sourceKey, snapshot.id]);
  useEffect(() => {
    if (!controller) return;
    controller.configure({
      reducedMotion: reducedMotion || textOnly,
      save: () => {
        try {
          sessionStorage.setItem(
            `petros-studio-reading:${snapshot.id}`,
            JSON.stringify({
              source: sourceKey,
              count: controller.getSnapshot().canvas.elements.length,
              selectedId: controller.getSnapshot().selectedId,
            }),
          );
        } catch {
          /* optional */
        }
      },
    });
    controller.interrupt();
  }, [
    controller,
    snapshot.epoch,
    snapshot.status,
    snapshot.task?.taskId,
    reducedMotion,
    textOnly,
    snapshot.id,
    sourceKey,
  ]);
  useEffect(() => {
    const entry = introduction.current;
    if (!controller || !preferencesReady || entry?.controller !== controller || entry.started)
      return;
    if (pageHidden) return;
    entry.started = true;
    if (
      !entry.fresh ||
      snapshot.status !== 'active' ||
      snapshot.task ||
      asking ||
      reducedMotion ||
      textOnly
    )
      return;
    // One authored, source-backed introduction on a fresh entry. Progress,
    // highlighting and supported poses all use the existing presentation clock.
    // A saved checkpoint, interruption or accessibility preference never autoplays.
    controller.restart();
    controller.play();
  }, [
    controller,
    preferencesReady,
    snapshot.status,
    snapshot.task,
    asking,
    pageHidden,
    reducedMotion,
    textOnly,
  ]);
  const cue =
    state && controller
      ? studioCue(snapshot, state, controller.timeline.beats[state.index]!.action.cue, asking)
      : null;
  return {
    controller,
    state,
    cue,
    reducedMotion,
    systemReducedMotion,
    setReducedMotion: (value: boolean) => setPreference('reducedMotion', value),
    textOnly,
    setTextOnly: (value: boolean) => setPreference('textOnly', value),
    hidden,
    setHidden: (value: boolean) => setPreference('hidden', value),
    compact,
    setCompact: (value: boolean) => setPreference('compact', value),
    pageHidden,
  };
}
