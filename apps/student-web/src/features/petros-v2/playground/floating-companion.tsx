'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import type { CompanionCue, SharedCanvasState } from '@edrion/schemas';
import { CompanionRig } from '../companion/companion-rig';
import { cloudContent } from '../companion/companion-cloud';
import type { PresentationController, PresentationState } from '../presentation-controller';
import styles from './floating-companion.module.css';
import { petrosStatus } from '@/components/petros/petros-speech-cloud';

type Point = { x: number; y: number };
type Props = {
  cue: CompanionCue; canvas: SharedCanvasState; reducedMotion: boolean; generating: boolean;
  state: PresentationState; presentation: PresentationController; disabledCapabilities?: readonly string[]; assessmentSafe?: boolean;
  microphoneActive?: boolean; voicePhase?: string;
  harborHeight: number;
  workspace: RefObject<HTMLElement>; parking: RefObject<HTMLDivElement>; compactParking: RefObject<HTMLDivElement>;
  playback: RefObject<HTMLDivElement>; onHeight: (height: number) => void;
};

/** View-only placement. Dragging never changes the teaching canvas or its checkpoint. */
export function FloatingCompanion({ cue, canvas, reducedMotion, generating, state, presentation, disabledCapabilities, assessmentSafe, microphoneActive, voicePhase, harborHeight, workspace, parking, compactParking, playback, onHeight }: Props) {
  const [mounted, setMounted] = useState(false), [position, setPosition] = useState<Point | null>(null);
  const [compact, setCompact] = useState(false), [manual, setManual] = useState(false);
  const [bubbleSide, setBubbleSide] = useState<'left' | 'right'>('left'), [toolsOpen, setToolsOpen] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: Point; origin: Point } | null>(null);
  const manuallyPlaced = useRef(false), compactLayout = useRef(false), frame = useRef<number>();
  const arrange = useRef<(force?: boolean) => void>(() => {});
  const lastHeight = useRef(0);
  useEffect(() => { setMounted(true); }, []);

  function place(point: Point) {
    const rect = workspace.current?.getBoundingClientRect(), main = workspace.current?.closest('main')?.getBoundingClientRect();
    const size = widget.current?.getBoundingClientRect(), controls = playback.current?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = Math.max(8, main?.left ?? rect?.left ?? 0), right = Math.min(viewport?.width ?? innerWidth, main?.right ?? innerWidth) - 8;
    const top = Math.max(68, main?.top ?? 0), bottom = Math.min(viewport?.height ?? innerHeight, controls?.top ?? main?.bottom ?? innerHeight) - 8;
    const avatarWidth = parseFloat(widget.current ? getComputedStyle(widget.current).getPropertyValue('--avatar-size') : '') || 92, width = size?.width ?? avatarWidth;
    // Position belongs to the avatar, so changing the bubble side keeps Petros under the pointer.
    let x = Math.max(left, Math.min(point.x, right - avatarWidth));
    const side = x + avatarWidth / 2 > (left + right) / 2 ? 'left' : 'right';
    const offset = side === 'left' ? width - avatarWidth : 0;
    x = Math.max(left, Math.min(x - offset, right - width)) + offset;
    setBubbleSide(side);
    const next = { x, y: Math.max(top, Math.min(point.y, bottom - (size?.height ?? 0))) };
    setPosition(previous => previous && Math.abs(previous.x - next.x) < .5 && Math.abs(previous.y - next.y) < .5 ? previous : next);
  }
  arrange.current = (force = false) => {
    const element = widget.current;
    if (!element) return;
    if (drag.current) {
      if (!force && !generating) return;
      const pointerId = drag.current.id; drag.current = null;
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    }
    const harbor = parking.current?.getBoundingClientRect();
    const small = !harbor?.width || innerWidth <= 920;
    if (small !== compactLayout.current) { compactLayout.current = small; manuallyPlaced.current = false; setManual(false); setCompact(small); }
    if (force || generating) { manuallyPlaced.current = false; setManual(false); }
    const destination = small ? compactParking.current?.getBoundingClientRect() : harbor;
    if (!destination?.width) return;
    element.style.width = `${compact ? 158 : small ? Math.min(278, innerWidth - 24) : destination.width}px`;
    // Reserve the maximum envelope independently of the intrinsically sized cloud.
    // Caption changes therefore cannot move Send/Clear between pointer down and up.
    const reservedHeight = small ? compact ? 100 : 210 : 156;
    if (lastHeight.current !== reservedHeight) { lastHeight.current = reservedHeight; onHeight(reservedHeight); }
    if (manuallyPlaced.current) { if (position) place(position); return; }
    // The reserved harbor sits outside the generated output and the panel's scrollport.
    const avatarWidth = parseFloat(getComputedStyle(element).getPropertyValue('--avatar-size')) || 92;
    place({ x: Math.min(destination.right, innerWidth - 8) - avatarWidth, y: destination.top });
  };
  useLayoutEffect(() => { arrange.current(true); }, [mounted, canvas.lastActionSequence, generating]);
  useLayoutEffect(() => { arrange.current(); }, [compact, mounted, cue.caption, harborHeight]);
  useEffect(() => {
    if (!mounted) return;
    const update = () => { if (frame.current) cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(() => arrange.current()); };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    [widget.current, workspace.current, parking.current, compactParking.current].forEach(element => { if (element) observer?.observe(element); });
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.visualViewport?.removeEventListener('resize', update); if (frame.current) cancelAnimationFrame(frame.current); };
  }, [mounted, workspace, parking, compactParking]);
  function park() { manuallyPlaced.current = false; setManual(false); setToolsOpen(false); setCompact(compactLayout.current); requestAnimationFrame(() => arrange.current(true)); }
  function begin(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const bubble = target.closest('[data-cloud]') && !target.closest('p');
    if (generating || event.button !== 0 || !position || (!target.closest('[data-float-drag], [data-pose]') && !bubble)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: position };
    manuallyPlaced.current = true; setManual(true); setToolsOpen(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current; if (!current || current.id !== event.pointerId) return;
    place({ x: current.origin.x + event.clientX - current.start.x, y: current.origin.y + event.clientY - current.start.y });
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); arrange.current();
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    if (event.key === 'Home' || event.key === 'Escape') { event.preventDefault(); park(); }
    else if (position && arrows[event.key]) { event.preventDefault(); const delta = arrows[event.key]!, amount = event.shiftKey ? 30 : 10;
      manuallyPlaced.current = true; setManual(true); place({ x: position.x + delta.x * amount, y: position.y + delta.y * amount });
      if (generating) requestAnimationFrame(() => arrange.current(true));
    }
  }
  if (!mounted) return null;
  const compactStatus = petrosStatus({ recording: microphoneActive, transcribing: voicePhase === 'transcribing' || voicePhase === 'encoding',
    preparing: voicePhase === 'generating' || state.speech.phase === 'loading', speaking: state.speech.phase === 'speaking',
    questionReady: cue.mode === 'listening', teaching: state.status === 'playing', waiting: state.status === 'awaiting_response' || state.speech.phase === 'stalled',
    paused: state.speech.preview?.paused || state.status === 'paused' || state.status === 'interrupted' });
  return createPortal(<div ref={widget} className={styles.floating} role="region" aria-label="Floating Petros" data-compact={compact} data-bubble-side={bubbleSide} data-tools-open={toolsOpen} data-placement={manual ? 'manual' : 'parked'} data-generating={generating} data-reduced-motion={reducedMotion} data-cloud-kind={cloudContent(cue).kind}
    style={{ left: position?.x ?? 0, top: position?.y ?? 0, visibility: position ? 'visible' : 'hidden' }}
    onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDragStart={event => event.preventDefault()}
    onMouseLeave={() => { if (!drag.current) setToolsOpen(false); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setToolsOpen(false); }}>
    <button className={styles.move} data-float-drag aria-label="Move Petros" disabled={generating} title={generating ? 'Petros stays beside new content during playback. Pause to move it.' : 'Drag Petros, or use arrow keys. Home parks beside the lesson.'} onKeyDown={key} onFocus={() => setToolsOpen(true)} />
    {compact && <span className={styles.compactStatus}>{compactStatus}</span>}
    <div className={styles.controls}>
      <button className={styles.park} aria-label="Park Petros beside the lesson" title="Park beside the lesson" onClick={park}><RotateCcw size={15} /></button>
      <button aria-label={compact ? 'Expand Petros bubble' : 'Minimize Petros bubble'} title={compact ? 'Show bubble' : 'Minimize bubble'} onClick={() => { setCompact(!compact); manuallyPlaced.current = !compactLayout.current; setManual(manuallyPlaced.current); }}>
        {compact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        {compact && <span>Show text</span>}
      </button>
    </div>
    {!compact && cloudContent(cue).text && <svg className={styles.tail} data-bubble-tail aria-hidden="true" viewBox="0 0 38 34">{cloudContent(cue).kind === 'status' ? <><circle cx="8" cy="21" r="6" /><circle cx="22" cy="22" r="3" /><circle cx="32" cy="23" r="1.5" /></> : <path d="M1 14 L36 22 L1 30" />}</svg>}
    <CompanionRig cue={cue} canvas={canvas} reducedMotion={reducedMotion} state={state} presentation={presentation} disabledCapabilities={disabledCapabilities} assessmentSafe={assessmentSafe} microphoneActive={microphoneActive} statusLabel={compactStatus} />
  </div>, document.body);
}
