'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CompanionCue, CompanionEvent, SharedCanvasState } from '@edrion/schemas';
import { useTeachingTargets } from '@/features/learning-studio/target-registry';
import { type CompanionPose, type CompanionDirection } from './companion-policy';
import { PetrosAvatar } from '@/components/petros/petros-avatar';
import { resolveOriginalEventPose, supportsRigCapability } from './companion-policy';
import { planCompanionPlacement, type SpatialPlan } from './companion-spatial';
import {
  CompanionController,
  type CompanionAuthority,
  type CompanionLocalState,
  type CompanionVisual,
} from './companion-controller';
import { CompanionPoseController } from './companion-controller';
import type { PresentationController, PresentationState } from '../presentation-controller';
import { CompanionCloud } from './companion-cloud';
import styles from './companion.module.css';
import { beginPetrosTiming } from '../session-performance';
const NO_DISABLED_CAPABILITIES: readonly string[] = [];

export function targetIsVisible(element: HTMLElement, rect: DOMRectReadOnly) {
  if (
    !element.isConnected ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    element.closest('[hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  for (let p: HTMLElement | null = element; p; p = p.parentElement) {
    const css = window.getComputedStyle(p);
    if (css.display === 'none' || css.visibility === 'hidden' || css.opacity === '0') return false;
  }
  let top = 0,
    bottom = window.innerHeight,
    left = 0,
    right = window.innerWidth;
  const viewport = window.visualViewport;
  if (viewport) {
    top = viewport.offsetTop;
    left = viewport.offsetLeft;
    bottom = top + viewport.height;
    right = left + viewport.width;
  }
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent),
      bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top + parent.clientTop);
      bottom = Math.min(bottom, bounds.bottom - parent.clientTop);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left + parent.clientLeft);
      right = Math.min(right, bounds.right - parent.clientLeft);
    }
  }
  // Sticky lesson chrome can cover a target even when its rectangle is inside
  // the viewport and the scrollport. Never point through the reserved harbor.
  const lesson = element.closest('[aria-label="Teaching workspace content"]')?.parentElement;
  const heading = lesson?.querySelector<HTMLElement>('[data-workspace-heading]');
  if (heading && window.getComputedStyle(heading).position === 'sticky')
    top = Math.max(top, heading.getBoundingClientRect().bottom);
  const controls = lesson
    ?.querySelector<HTMLElement>('[aria-label="Playback controls"]')
    ?.getBoundingClientRect();
  if (controls && controls.top > top) bottom = Math.min(bottom, controls.top);
  const studioBand = element
    .closest('[data-studio]')
    ?.querySelector<HTMLElement>('[data-studio-companion]');
  if (studioBand && window.getComputedStyle(studioBand).position === 'sticky')
    top = Math.max(top, studioBand.getBoundingClientRect().bottom);
  const inside =
    rect.top >= top && rect.bottom <= bottom && rect.left >= left && rect.right <= right;
  if (!inside) return false;
  for (const overlay of document.querySelectorAll<HTMLElement>(
    '[aria-modal="true"], dialog[open], [data-companion-occluder]',
  )) {
    if (overlay.contains(element) || overlay.hidden) continue;
    const box = overlay.getBoundingClientRect();
    if (
      box.left < rect.right &&
      box.right > rect.left &&
      box.top < rect.bottom &&
      box.bottom > rect.top
    )
      return false;
  }
  if (typeof document.elementsFromPoint === 'function') {
    const inset = Math.min(2, rect.width / 4, rect.height / 4);
    for (const [x, y] of [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      // Edge midpoints are painted even on rounded targets. Corner probes can
      // hit the parent through a legitimate border radius and reject real work.
      [rect.left + inset, rect.top + rect.height / 2],
      [rect.right - inset, rect.top + rect.height / 2],
      [rect.left + rect.width / 2, rect.top + inset],
      [rect.left + rect.width / 2, rect.bottom - inset],
    ]) {
      const at = document
        .elementsFromPoint(x!, y!)
        .find((e) => window.getComputedStyle(e).pointerEvents !== 'none');
      if (at && at !== element && !element.contains(at)) return false;
    }
  }
  return true;
}

export function CompanionRig({
  cue,
  canvas,
  reducedMotion,
  state,
  presentation,
  disabledCapabilities = NO_DISABLED_CAPABILITIES,
  assessmentSafe = false,
  microphoneActive = false,
  statusLabel,
  layout = 'default',
  event,
  authority,
  local,
}: {
  cue: CompanionCue;
  canvas: SharedCanvasState;
  reducedMotion: boolean;
  state: PresentationState;
  presentation?: PresentationController;
  disabledCapabilities?: readonly string[];
  assessmentSafe?: boolean;
  microphoneActive?: boolean;
  statusLabel?: string;
  layout?: 'default' | 'studio';
  event?: CompanionEvent;
  authority?: CompanionAuthority;
  local?: CompanionLocalState;
}) {
  const dock = useRef<HTMLDivElement>(null),
    { targets } = useTeachingTargets();
  const avatar = useRef<HTMLDivElement>(null);
  // A fresh replay owns a fresh action history. Pausing the same presentation
  // retains its history, so Continue still cannot repeat an admitted gesture.
  const governor = useRef<CompanionPoseController | null>(null);
  useLayoutEffect(() => {
    governor.current = new CompanionPoseController();
  }, [presentation]);
  const owner = useRef(new CompanionController());
  const [visual, setVisual] = useState<CompanionVisual | null>(null);
  const [direction, setDirection] = useState<CompanionDirection | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!visual?.nextAt) return;
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(1, visual.nextAt - Date.now()));
    return () => clearTimeout(timer);
  }, [visual?.nextAt]);
  useEffect(() => {
    if (!event) return;
    const expiry = setTimeout(
      () => setTick((n) => n + 1),
      Math.max(1, event.expiresAt - Date.now() + 1),
    );
    return () => clearTimeout(expiry);
  }, [event]);
  const recoveredSession = useRef<string | null>(null);
  const [pose, setPose] = useState<CompanionPose>('neutral');
  const [visibleTarget, setVisibleTarget] = useState<string | null>(null);
  const [placement, setPlacement] = useState<SpatialPlan | null>(null);
  const targetId = event ? event.targetId : cue.targetId;
  const target = targetId ? targets.get(targetId) : undefined;
  useLayoutEffect(() => {
    const rect = avatar.current?.getBoundingClientRect(),
      bounds = target?.element.getBoundingClientRect();
    const visible = target?.available && bounds && targetIsVisible(target.element, bounds);
    const region = dock.current?.getBoundingClientRect();
    if (region && rect) {
      // The reserved harbor contains both the image and its caption. With the
      // selected originals every proposed trip falls back to this same harbor;
      // no transform is applied to the complete PNG to simulate locomotion.
      const footprint = { x: region.x, y: region.y, width: region.width, height: region.height };
      const next = planCompanionPlacement({
        region: footprint,
        home: footprint,
        viewportWidth: window.visualViewport?.width ?? window.innerWidth,
        requested: visible && targetId ? 'EXPLAIN' : 'HOME',
        exclusions: bounds
          ? [{ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }]
          : [],
        studentInput: !!local && local.interaction !== 'idle',
        reducedMotion,
        supportsDockTransition: supportsRigCapability('short-dock-transition'),
        supportsWalking: supportsRigCapability('walking'),
      });
      setPlacement((old) => (old && JSON.stringify(old) === JSON.stringify(next) ? old : next));
    }
    const validTarget =
      visible &&
      canvas.elements.some((e) => e.id === cue.targetId) &&
      (canvas.highlightedIds.includes(cue.targetId ?? '') || canvas.focusedId === cue.targetId);
    const m6Target = event?.targetId;
    const selectedTarget = event ? m6Target : cue.targetId;
    const scopeCurrent =
      !target?.scope ||
      (!!authority &&
        target.scope.sessionId === authority.sessionId &&
        target.scope.revision === authority.activityRevision &&
        target.scope.activityId === canvas.activityId);
    const validM6Target =
      visible &&
      scopeCurrent &&
      canvas.elements.some((e) => e.id === selectedTarget) &&
      (canvas.highlightedIds.includes(selectedTarget ?? '') || canvas.focusedId === selectedTarget);
    setVisibleTarget((event ? validM6Target : validTarget) ? (selectedTarget ?? null) : null);
    if (event && authority && local) {
      const admitted = beginPetrosTiming('cue_admission');
      const key = `petros-m6-displayed:${event.sessionId}`;
      if (recoveredSession.current !== event.sessionId) {
        recoveredSession.current = event.sessionId;
        try {
          if (sessionStorage.getItem(key) === event.eventId) owner.current.settle(event.eventId);
        } catch {
          /* Optional presentation history. */
        }
      }
      const next = owner.current.resolve(
        event,
        authority,
        local,
        Date.now(),
        validM6Target ? (selectedTarget ?? null) : null,
      );
      setVisual(next);
      admitted();
      try {
        if (next.eventId && sessionStorage.getItem(key) !== next.eventId)
          sessionStorage.setItem(key, next.eventId);
      } catch {
        /* Optional presentation history. */
      }
      if (next.targetId && rect && bounds) {
        const dx = bounds.left + bounds.width / 2 - (rect.left + rect.width / 2);
        const dy = bounds.top + bounds.height / 2 - (rect.top + rect.height / 2);
        setDirection(
          Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
        );
      } else setDirection(null);
      // The M6 admission owner is exclusive. The compatible fixture governor yields.
      setPose('neutral');
      return;
    } else setVisual(null);
    let direction: CompanionDirection | null = null;
    // A narrow pane still has real teaching targets. Geometry and clipping,
    // rather than a desktop breakpoint, decide whether a pose has a target.
    if (visible && rect) {
      const dx = bounds.left + bounds.width / 2 - (rect.left + rect.width / 2),
        dy = bounds.top + bounds.height / 2 - (rect.top + rect.height / 2);
      if (Math.abs(dx) > rect.width || Math.abs(dy) > rect.height)
        direction =
          Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    }
    setPose(
      governor.current?.resolve(
        state,
        validTarget ? cue : { ...cue, targetId: null, gesture: 'neutral' },
        direction,
        state.interactionCue?.id ?? canvas.completedActionIds.at(-1) ?? '',
        performance.now(),
        { reducedMotion, disabledCapabilities, assessmentSafe },
      ) ?? 'neutral',
    );
  }, [
    state,
    cue,
    canvas,
    target,
    targetId,
    reducedMotion,
    disabledCapabilities,
    assessmentSafe,
    presentation,
    event,
    authority,
    local,
    tick,
  ]);
  useEffect(() => {
    const element = target?.element;
    if (
      !element ||
      !visual?.targetId ||
      local?.interaction !== 'idle' ||
      local?.paused ||
      local?.visibility === 'hidden'
    )
      return;
    element.setAttribute('data-companion-attention', visual.attentionPhase ?? 'look');
    return () => element.removeAttribute('data-companion-attention');
  }, [target, visual, local]);
  const displayed = visual
    ? resolveOriginalEventPose(visual, direction, {
        assessmentSafe: assessmentSafe || !!authority?.assessment,
        reducedMotion: reducedMotion || placement?.anchor === 'DOCKED_MOBILE',
        speaking: state.speech.phase === 'speaking',
        disabledCapabilities,
      })
    : microphoneActive && !assessmentSafe
      ? 'listening'
      : pose;
  // Attributes describe the artwork actually shown, not unsupported event proposals.
  const renderedGesture = displayed.startsWith('point-') ? 'point' : 'settled';
  return (
    <section
      ref={dock}
      className={styles.dock}
      aria-label="Petros companion"
      data-cue-id={visual?.eventId ?? undefined}
      data-gesture={renderedGesture}
      data-input={local?.interaction ?? 'idle'}
      data-attention-phase={visual?.attentionPhase}
      data-layout={layout}
      data-anchor={placement?.anchor ?? 'HOME'}
      data-requested-anchor={placement?.requested ?? 'HOME'}
      data-travel={placement?.reason ?? 'settled'}
      data-mode={
        visual
          ? visual.intent === 'processing'
            ? 'thinking'
            : visual.intent === 'waiting'
              ? 'waiting'
              : visual.intent === 'listening'
                ? 'listening'
                : visual.intent === 'paused' || visual.intent === 'blocked'
                  ? 'paused'
                  : 'teaching'
          : cue.mode
      }
      data-reduced-motion={reducedMotion}
      data-target={
        visual
          ? (visual.targetId ?? undefined)
          : visibleTarget === cue.targetId
            ? (cue.targetId ?? undefined)
            : undefined
      }
      data-speech={state.speech.phase}
      data-microphone={microphoneActive ? 'recording' : 'inactive'}
      data-suspended={
        event
          ? !!local?.paused || !!local?.revoked || local?.visibility === 'hidden'
          : state.status !== 'playing'
      }
    >
      <CompanionCloud
        cue={
          visual
            ? {
                mode:
                  visual.intent === 'processing'
                    ? 'thinking'
                    : visual.intent === 'listening'
                      ? 'listening'
                      : 'waiting',
                gesture: 'neutral',
                targetId: null,
                caption: visual.caption,
              }
            : cue
        }
        microphoneActive={microphoneActive}
        statusLabel={statusLabel}
      />
      <div
        ref={avatar}
        className={styles.avatar}
        data-pose={displayed}
        data-pose-transition={false}
        data-rig="original-authored-poses"
        data-idle-artwork="static"
      >
        <PetrosAvatar
          pose={displayed}
          speaking={displayed === 'speaking'}
          idle={false}
          animate={false}
          transition={false}
          mouthOverlay={false}
          reducedMotion={reducedMotion}
        />
      </div>
    </section>
  );
}
