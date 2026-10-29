'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Link2, MessageCircle, Maximize2, Pencil, Redo2, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { CanvasElement, CanvasOperation } from '@edrion/schemas';
import { useTeachingTarget, useTeachingTargets } from '@/features/learning-studio/target-registry';
import type { PresentationController, PresentationState } from '../presentation-controller';
import { connectionPort, fittedDiagramView, roundedPath, routeDiagram, NODE_WIDTH, NODE_HEIGHT, LABEL_WIDTH, LABEL_HEIGHT, type PortSide } from './diagram-routing';
import type { FeedbackState } from '../feedback-state';
import styles from './teaching-canvas.module.css';

type Node = Extract<CanvasElement, { kind: 'node' }>;
type Edge = Extract<CanvasElement, { kind: 'edge' }>;
type Point = { x: number; y: number };
type View = Point & { width: number; height: number };
type Editing = { id: string; value: string; version: number };
type Gesture = { pointerId: number; start: Point; kind: 'move' | 'connect' | 'pan'; node?: Node; view: View; moved: boolean; capture: Element; revision: number; side?: PortSide };
const W = NODE_WIDTH, H = NODE_HEIGHT, LW = LABEL_WIDTH, LH = LABEL_HEIGHT;
const bounded = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
function displayPoint(node: Point, vertical: boolean): Point {
  return vertical ? { x: 155 + (node.y - 160) * 1.45, y: 100 + (node.x - 90) * 1.1 }
    : { x: 140 + (node.x - 90) * 1.8, y: 70 + (node.y - 35) * 1.5 };
}
function logicalPoint(point: Point, vertical: boolean): Point {
  return vertical ? { x: bounded(90 + (point.y - 100) / 1.1, 90, 510), y: bounded(160 + (point.x - 155) / 1.45, 35, 285) }
    : { x: bounded(90 + (point.x - 140) / 1.8, 90, 510), y: bounded(35 + (point.y - 70) / 1.5, 35, 285) };
}
function NodeTarget({ node, selected, highlighted, editable, editing, connected, destination, dragging, onSelect, onFocus, onRename, onStart, onHandle, onKey, onValue, onSave, onCancel }: {
  node: Node; selected: boolean; highlighted: boolean; editable: boolean; editing: Editing | null; connected: boolean; destination: boolean; dragging: boolean;
  onSelect: () => void; onFocus: () => void; onRename: () => void; onStart: (event: PointerEvent) => void; onHandle: (event: PointerEvent, side: PortSide) => void;
  onKey: (event: KeyboardEvent) => void; onValue: (value: string) => void; onSave: () => void; onCancel: () => void;
}) {
  const ref = useTeachingTarget(node.id);
  const editor = useRef<HTMLInputElement>(null), pointerType = useRef('mouse');
  useLayoutEffect(() => { if (editing?.id === node.id) editor.current?.focus({ preventScroll: true }); }, [editing?.id, node.id]);
  return <g className={styles.nodeGroup} data-selected={selected} data-destination={destination} data-dragging={dragging}>
    <foreignObject x={node.x - W / 2} y={node.y - H / 2} width={W} height={H}>
      {editing?.id === node.id ? <input ref={editor} className={styles.nodeInput} aria-label={`Rename ${node.text}`} maxLength={120} value={editing.value}
        onChange={e => onValue(e.target.value)} onPointerDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); onSave(); } if (e.key === 'Escape') { e.preventDefault(); onCancel(); } }} />
        : <button ref={ref} className={styles.node} data-element-id={node.id} data-selected={selected} data-highlighted={highlighted} data-editable={editable} data-destination={destination}
          aria-pressed={selected} aria-label={node.text} title={editable ? 'Arrow keys move. C connects. Renaming is available only when invited.' : 'Teaching node · editing opens at Your turn'}
          onFocus={onFocus} onPointerDown={e => { pointerType.current = e.pointerType; onStart(e); }} onClick={onSelect} onDoubleClick={() => { if (pointerType.current !== 'touch') onRename(); }} onKeyDown={onKey}>{node.text}</button>}
    </foreignObject>
    {editable && (['top', 'bottom', 'left', 'right'] as PortSide[]).map(side => { const p = connectionPort(node, side, 0, 0); return <foreignObject key={side} x={p.x - 22} y={p.y - 22} width={44} height={44}>
      <button className={styles.handle} data-connect-handle={node.id} data-port={side} aria-label={`Connect from ${node.text} (${side})`} title={`Drag to connect · ${side} port`} aria-pressed={connected}
        onPointerDown={e => onHandle(e, side)} onClick={e => { e.stopPropagation(); onHandle(e as unknown as PointerEvent, side); }}><span /></button>
    </foreignObject>; })}
  </g>;
}
function EdgeTarget({ edge, position, selected, highlighted, editable, editing, feedback, select, rename, value, save, cancel }: {
  feedback?: FeedbackState; edge: Edge; position: Point; selected: boolean; highlighted: boolean; editable: boolean; editing: Editing | null;
  select: () => void; rename: () => void; value: (v: string) => void; save: () => void; cancel: () => void;
}) {
  const ref = useTeachingTarget(edge.id);
  const editor = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => { if (editing?.id === edge.id) editor.current?.focus({ preventScroll: true }); }, [editing?.id, edge.id]);
  return <foreignObject {...position} width={LW} height={LH} data-feedback={feedback} data-edge-label={edge.id}>
    {editing?.id === edge.id ? <select ref={editor} className={styles.relationInput} aria-label="Relationship label" value={editing.value} onChange={e => value(e.target.value)}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') cancel(); }} >
      {['provides', 'connects', 'supports'].map(relation => <option key={relation}>{relation}</option>)}</select>
      : <button ref={ref} className={styles.edgeLabel} data-element-id={edge.id} aria-pressed={selected} data-highlighted={highlighted} data-selected={selected} onFocus={select} onPointerDown={e => e.stopPropagation()} onClick={select} onDoubleClick={rename}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); rename(); } }} title={editable ? 'Edit relationship label' : 'Protected teaching relationship'}>{edge.text}</button>}
  </foreignObject>;
}
export type DiagramControls = Pick<PresentationController, 'edit'|'select'|'getSnapshot'|'undo'|'redo'|'canUndo'|'canRedo'|'timeline'>;
export function DiagramEditor({ state, controller, onAsk, reducedMotion, feedback = {} }: { feedback?: Record<string, FeedbackState>; state: PresentationState; controller: DiagramControls; onAsk: () => void; reducedMotion: boolean }) {
  const marker = useId().replaceAll(':', ''), svg = useRef<SVGSVGElement>(null), stage = useRef<HTMLDivElement>(null), toolbarElement = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 360 });
  const [toolbarSize, setToolbarSize] = useState({ width: 136, height: 52 });
  const [visibleStage, setVisibleStage] = useState({ top: 0, bottom: 360 });
  const vertical = size.width < 550;
  const [view, setView] = useState<View>({ x: 0, y: 0, width: 1000, height: 480 });
  const [editing, setEditing] = useState<Editing | null>(null), [preview, setPreview] = useState<Node | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null), [fromSide, setFromSide] = useState<PortSide>('right'), [relation, setRelation] = useState<'provides' | 'connects' | 'supports'>('provides'), [pointer, setPointer] = useState<Point | null>(null);
  const [notice, setNotice] = useState(''), [moving, setMoving] = useState(false), [textOpen, setTextOpen] = useState(false);
  const [portPreferences, setPortPreferences] = useState<ReadonlyMap<string, { from: PortSide; to: PortSide }>>(new Map());
  const previewRef = useRef<Node | null>(null), frame = useRef<number>();
  const { refresh } = useTeachingTargets();
  const gesture = useRef<Gesture | null>(null), manualView = useRef(false), suppressClick = useRef(false);
  const framed = useRef(false), previousVertical = useRef(vertical);
  const original = useMemo(() => state.canvas.elements.filter((e): e is Node => e.kind === 'node'), [state.canvas.elements]);
  const edges = useMemo(() => state.canvas.elements.filter((e): e is Edge => e.kind === 'edge'), [state.canvas.elements]);
  const nodes = useMemo(() => original.map(n => { const actual = preview?.id === n.id ? preview : n; return { ...actual, ...displayPoint(actual, vertical) }; }), [original, preview, vertical]);
  const paths = useMemo(() => routeDiagram(nodes, edges, portPreferences), [nodes, edges, portPreferences]);
  const invitation = state.canvas.invitation, open = Boolean(invitation && !invitation.submitted && state.progress === 1);
  const permitted = (id: string) => Boolean(open && invitation?.editableIds.includes(id) && state.canvas.elements.find(e => e.id === id)?.editable);
  const selected = state.canvas.elements.find(e => e.id === state.selectedId);
  const selectedNode = nodes.find(n => n.id === state.selectedId);
  const toolbarVisible = visibleStage.bottom - visibleStage.top >= 64;
  const canDelete = Boolean(selected && permitted(selected.id) && invitation?.allowedOperations.includes('erase') &&
    !edges.some(e => (e.from === selected.id || e.to === selected.id) && !permitted(e.id)));
  useLayoutEffect(() => {
    const element = toolbarElement.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width && height) setToolbarSize(current => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [state.selectedId, editing?.id, open, moving, toolbarVisible]);
  function attempt(fn: () => void) { try { fn(); setNotice(''); return true; } catch (error) { const message = error instanceof Error ? error.message : 'This edit is unavailable.'; setNotice(message.includes('Stale') ? 'This element changed during your edit. Your draft is kept here; cancel to review the current version.' : message); return false; } }
  function edit(operations: CanvasOperation[]) { return attempt(() => controller.edit(operations)); }
  function fit(smooth = false) {
    const target = fittedDiagramView(nodes, [...paths.values()], size);
    if (frame.current) cancelAnimationFrame(frame.current);
    if (!smooth || reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true') { setView(target); return; }
    const start = view, started = performance.now();
    const animate = (now: number) => { const t = Math.min(1, (now - started) / 180), ease = 1 - (1 - t) ** 3;
      setView({ x: start.x + (target.x - start.x) * ease, y: start.y + (target.y - start.y) * ease, width: start.width + (target.width - start.width) * ease, height: start.height + (target.height - start.height) * ease });
      if (t < 1) frame.current = requestAnimationFrame(animate); else frame.current = undefined;
    }; frame.current = requestAnimationFrame(animate);
  }
  useEffect(() => { refresh(); }, [view, paths, refresh]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => { const bounds = entries[0]?.contentRect; if (bounds) setSize({ width: bounds.width, height: bounds.height }); });
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    let frame: number | undefined;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.height) return;
      let top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY) && parent.clientHeight) {
          const rect = parent.getBoundingClientRect();
          top = Math.max(top, rect.top + parent.clientTop);
          bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight);
        }
        const heading = parent.querySelector<HTMLElement>(':scope > [data-workspace-heading]');
        if (heading && getComputedStyle(heading).position === 'sticky') top = Math.max(top, heading.getBoundingClientRect().bottom);
        const controls = parent.querySelector<HTMLElement>(':scope > [aria-label="Playback controls"]');
        if (controls) bottom = Math.min(bottom, controls.getBoundingClientRect().top);
      }
      const next = { top: Math.max(0, top - bounds.top), bottom: Math.max(0, bottom - bounds.top) };
      setVisibleStage(current => current.top === next.top && current.bottom === next.bottom ? current : next);
    };
    const schedule = () => { if (frame) cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    return () => { if (frame) cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [size.width, size.height]);
  const structure = state.canvas.elements.map(e => e.id).join(':');
  useEffect(() => {
    if (previousVertical.current !== vertical && !gesture.current && !editing) { manualView.current = false; framed.current = false; previousVertical.current = vertical; }
    if (!manualView.current && !gesture.current && !editing && (!framed.current || state.canvas.draftRevision === 0)) { fit(framed.current); framed.current = true; }
  }, [structure, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps
  function zoom(factor: number) {
    manualView.current = true;
    setView(current => { const width = bounded(current.width * factor, 200, 2800), height = current.height * width / current.width;
      return { x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height }; });
  }
  function point(event: { clientX: number; clientY: number }): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: p.x, y: p.y };
  }
  function begin(event: PointerEvent, kind: Gesture['kind'], node?: Node, side?: PortSide) {
    if (event.button !== 0) return;
    if (kind !== 'pan') event.stopPropagation();
    if (kind !== 'pan' && (!node || !permitted(node.id))) return;
    event.preventDefault(); event.stopPropagation();
    if (frame.current) cancelAnimationFrame(frame.current);
    if (node) controller.select(node.id);
    gesture.current = { pointerId: event.pointerId, kind, node, start: point(event), view, moved: false, capture: event.currentTarget, revision: state.canvas.revision, side };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (kind === 'connect' && node) { setConnectFrom(node.id); setFromSide(side ?? 'right'); setPointer(connectionPort(displayPoint(node, vertical), side ?? 'right')); }
  }
  function beginConnection(node: Node, side: PortSide = 'right') { if (permitted(node.id)) { controller.select(node.id); setConnectFrom(node.id); setFromSide(side); setNotice('Choose a destination node, or drag the connection handle. Escape cancels.'); } }
  function connect(to: string, destination?: Point) {
    if (!connectFrom) return;
    if (connectFrom === to || !permitted(to)) { setNotice('Choose a different node in the editable checkpoint.'); return; }
    const fromNode = original.find(n => n.id === connectFrom)!;
    const target = nodes.find(n => n.id === to)!;
    const toward = destination && Math.max(Math.abs(destination.x - target.x) / W, Math.abs(destination.y - target.y) / H) > .3 ? destination : nodes.find(n => n.id === connectFrom)!;
    const toSide: PortSide = Math.abs(toward.x - target.x) / W > Math.abs(toward.y - target.y) / H ? toward.x < target.x ? 'left' : 'right' : toward.y < target.y ? 'top' : 'bottom';
    if (edit([{ type: 'connect_elements', element: { id: `student-edge-${state.canvas.revision + 1}`, version: 1, label: 'Student relationship', sourceId: fromNode.sourceId, kind: 'edge', from: connectFrom, to, relation, text: relation, editable: true } }])) {
      const id = `student-edge-${state.canvas.revision + 1}`;
      setPortPreferences(current => new Map(current).set(id, { from: fromSide, to: toSide }));
      controller.select(id); setConnectFrom(null); setPointer(null); setNotice('Connection added.');
    }
  }
  function focusNode(id: string) { requestAnimationFrame(() => stage.current?.querySelector<HTMLButtonElement>(`[data-element-id="${id}"]`)?.focus({ preventScroll: true })); }
  const canRename = (element: CanvasElement) => !!invitation?.allowedOperations.includes('replace_content') || element.kind === 'edge' && !!invitation?.allowedOperations.includes('disconnect') && !!invitation?.allowedOperations.includes('connect_elements');
  function rename(element: CanvasElement) { if (canRename(element) && permitted(element.id) && (element.kind === 'node' || element.kind === 'edge')) setEditing({ id: element.id, version: element.version, value: element.text }); }
  function cancel() { const id = editing?.id; setEditing(null); if (id) focusNode(id); }
  function cancelConnection() { const g = gesture.current; if (g) { if (g.capture.hasPointerCapture(g.pointerId)) g.capture.releasePointerCapture(g.pointerId); gesture.current = null; suppressClick.current = true; } setConnectFrom(null); setPointer(null); setPreview(null); previewRef.current = null; }
  useEffect(() => {
    if (state.selectedId !== null) return;
    cancelConnection(); setEditing(null); setMoving(false); setNotice('');
  }, [state.selectedId]);
  function save() { if (!editing) return; if (!editing.value.trim()) { setNotice('Enter a label before saving.'); return; } if (edit([{ type: 'replace_content', id: editing.id, expectedVersion: editing.version, text: editing.value.trim() }])) { cancel(); setNotice('Label saved.'); } }
  function remove(element = selected) {
    if (!element || !permitted(element.id) || !invitation?.allowedOperations.includes('erase')) return;
    const incident = edges.filter(e => e.from === element.id || e.to === element.id);
    if (incident.some(e => !permitted(e.id))) { setNotice('This node has a protected teaching connection.'); return; }
    const operations: CanvasOperation[] = [...incident, element].map(e => ({ type: 'erase', id: e.id, expectedVersion: e.version }));
    if (edit(operations)) { setEditing(null); setConnectFrom(null); focusNode(original.find(n => n.id !== element.id)?.id ?? ''); }
  }
  function move(node: Node, dx: number, dy: number) {
    const next = { ...node, x: bounded(node.x + dx, 90, 510), y: bounded(node.y + dy, 35, 285) }, p = displayPoint(next, vertical);
    if (original.some(n => n.id !== node.id && Math.abs(displayPoint(n, vertical).x - p.x) < W + 20 && Math.abs(displayPoint(n, vertical).y - p.y) < H + 18)) { setNotice('Those nodes would overlap. Try another direction.'); return; }
    if (next.x !== node.x || next.y !== node.y) edit([{ type: 'move_element', id: node.id, expectedVersion: node.version, x: next.x, y: next.y }]);
  }
  function moveOnScreen(node: Node, dx: number, dy: number) {
    const p = displayPoint(node, vertical), next = logicalPoint({ x: p.x + dx, y: p.y + dy }, vertical);
    move(node, next.x - node.x, next.y - node.y);
  }
  function nodeKey(event: KeyboardEvent, node: Node) {
    if (!permitted(node.id)) return;
    const directions: Record<string, Point> = { ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 }, ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 } };
    if (event.key in directions) {
      event.preventDefault(); event.stopPropagation(); const d = directions[event.key]!;
      moveOnScreen(node, d.x * (event.shiftKey ? 3 : 1), d.y * (event.shiftKey ? 3 : 1));
    } else if (event.key === 'Enter' && connectFrom && connectFrom !== node.id) { event.preventDefault(); connect(node.id); }
    else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); rename(node); }
    else if (event.key.toLowerCase() === 'c') { event.preventDefault(); beginConnection(node); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); remove(node); }
  }
  function onMove(event: PointerEvent) {
    const g = gesture.current; if (!g || g.pointerId !== event.pointerId) return;
    const p = point(event); g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > 3;
    if (g.kind === 'move' && g.node) { const start = displayPoint(g.node, vertical); const next = { ...g.node, ...logicalPoint({ x: start.x + p.x - g.start.x, y: start.y + p.y - g.start.y }, vertical) }; previewRef.current = next; setPreview(next); }
    else if (g.kind === 'connect') setPointer(p);
    else { manualView.current = true; const scale = Math.min(size.width / g.view.width, size.height / g.view.height);
      const startScreen = new DOMPoint(g.start.x, g.start.y).matrixTransform(svg.current!.getScreenCTM()!);
      setView({ ...g.view, x: view.x - (event.clientX - startScreen.x) / scale, y: view.y - (event.clientY - startScreen.y) / scale }); }
  }
  function end(event: PointerEvent, cancelled = false) {
    const g = gesture.current; if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null; if (g.capture.hasPointerCapture(event.pointerId)) g.capture.releasePointerCapture(event.pointerId);
    if (g.kind !== 'pan' && g.revision !== controller.getSnapshot().canvas.revision) { setNotice('The diagram changed during this gesture. Your saved work is preserved; try the gesture again.'); cancelled = true; }
    suppressClick.current = g.moved;
    const draft = previewRef.current;
    if (!cancelled && g.kind === 'move' && g.node && draft && g.moved) {
      let candidate = draft;
      // Resolve only the dragged node's overlap; never rearrange the student's other nodes.
      const overlaps = (p: Node) => original.some(n => n.id !== p.id && Math.abs(displayPoint(n, vertical).x - displayPoint(p, vertical).x) < W + 20 && Math.abs(displayPoint(n, vertical).y - displayPoint(p, vertical).y) < H + 18);
      if (overlaps(candidate)) {
        const options: Node[] = [];
        for (let x = 90; x <= 510; x += 20) for (let y = 35; y <= 285; y += 25) options.push({ ...draft, x, y });
        candidate = options.filter(p => !overlaps(p)).sort((a, b) => Math.hypot(a.x - draft.x, a.y - draft.y) - Math.hypot(b.x - draft.x, b.y - draft.y))[0] ?? g.node;
      }
      move(g.node, candidate.x - g.node.x, candidate.y - g.node.y);
    }
    if (!cancelled && g.kind === 'connect' && g.moved) {
      const p = point(event), target = nodes.find(n => Math.abs(n.x - p.x) <= W / 2 + 22 && Math.abs(n.y - p.y) <= H / 2 + 22);
      if (target && target.id !== connectFrom && permitted(target.id)) connect(target.id, p);
      else { setConnectFrom(null); setNotice('Connection cancelled: release on an editable destination node.'); }
    }
    if (cancelled) setConnectFrom(null);
    previewRef.current = null; setPreview(null); setPointer(null);
  }
  const scale = Math.min(size.width / view.width, size.height / view.height);
  const offset = { x: (size.width - view.width * scale) / 2, y: (size.height - view.height * scale) / 2 };
  const anchorPoint = selectedNode ?? (selected?.kind === 'edge' ? paths.get(selected.id)?.label : null);
  const toolbarHeight = toolbarSize.height;
  const toolbarWidth = Math.min(size.width - 16, toolbarSize.width);
  const anchorX = anchorPoint ? (anchorPoint.x - view.x) * scale + offset.x : 0;
  const anchorY = anchorPoint ? (anchorPoint.y - view.y) * scale + offset.y : 0;
  const above = anchorY - (selectedNode ? H / 2 * scale : 0) - toolbarHeight - 8;
  const toolbarTop = visibleStage.top + 8, toolbarBottom = Math.max(toolbarTop, visibleStage.bottom - toolbarHeight - 8);
  const toolbar = anchorPoint && toolbarVisible ? { maxHeight: visibleStage.bottom - visibleStage.top - 16, left: bounded(anchorX - toolbarWidth / 2, 8, Math.max(8, size.width - toolbarWidth - 8)),
    top: selected?.kind === 'edge' ? toolbarTop : bounded(above >= toolbarTop ? above : anchorY + (selectedNode ? H / 2 * scale : LH * scale) + 8, toolbarTop, toolbarBottom) } : null;
  return <div className={styles.diagram} data-semantic-feedback={Object.keys(feedback).length > 0}>
    <div className={styles.diagramBar} role="toolbar" aria-label="Diagram navigation">
      <span className={styles.diagramState} title={open ? 'Only invited student elements can be edited.' : 'Select and ask about teaching elements. Editing opens at Your turn.'}>{open ? state.canvas.draftRevision ? 'Editing' : 'Your turn' : invitation?.submitted ? 'Reviewing' : state.status === 'paused' || state.status === 'interrupted' ? 'Paused' : 'Teaching'}</span>
      <button aria-label="Undo diagram edit" title="Undo edit (Ctrl/⌘ Z)" disabled={!controller.canUndo()} onClick={() => attempt(controller.undo)}><Undo2 size={17} /></button>
      <button aria-label="Redo diagram edit" title="Redo edit (Ctrl/⌘ Shift Z)" disabled={!controller.canRedo()} onClick={() => attempt(controller.redo)}><Redo2 size={17} /></button>
      <button aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1.2)}><ZoomOut size={17} /></button>
      <button aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1 / 1.2)}><ZoomIn size={17} /></button>
      <button aria-label="Fit diagram to view" title="Fit diagram to view" onClick={() => { manualView.current = true; fit(); }}><Maximize2 size={17} /></button>
      <button aria-label="Text version and keyboard help" title="Text version and keyboard help" aria-expanded={textOpen} onClick={() => setTextOpen(!textOpen)}>Text<ChevronDown size={13} /></button>
    </div>
    {open && <label className={styles.connectionChoice}>New relationship <select aria-label="New connection relationship" value={relation} onChange={e => setRelation(e.target.value as typeof relation)}>{['provides', 'connects', 'supports'].map(r => <option key={r}>{r}</option>)}</select><span>Drag a port or select Connect</span></label>}
    <div ref={stage} className={styles.diagramStage} tabIndex={0} aria-label="Diagram editing surface" data-layout={vertical ? 'vertical' : 'horizontal'}
      onPointerMove={onMove} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)}
      onKeyDown={e => {
        if ((e.target as HTMLElement).matches('input, select, textarea')) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); attempt(e.shiftKey ? controller.redo : controller.undo); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); attempt(controller.redo); }
        if (e.key === 'Escape') { cancel(); cancelConnection(); setNotice('Connection cancelled.'); }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected?.kind === 'edge') { e.preventDefault(); remove(); }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1 / 1.2); }
        if (e.key === '-') { e.preventDefault(); zoom(1.2); }
        if ((e.target === stage.current || e.altKey) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); manualView.current = true;
          setView(v => ({ ...v, x: v.x + (e.key === 'ArrowRight' ? 30 : e.key === 'ArrowLeft' ? -30 : 0), y: v.y + (e.key === 'ArrowDown' ? 30 : e.key === 'ArrowUp' ? -30 : 0) })); }
      }}>
      <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="group" aria-label="Editable service relationship diagram" onPointerDown={event => { if (event.target === event.currentTarget) begin(event, 'pan'); }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          event.stopPropagation();
          if (suppressClick.current) { suppressClick.current = false; return; }
          controller.select(null); stage.current?.focus({ preventScroll: true });
        }}>
        <defs><marker id={marker} markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="context-stroke" /></marker></defs>
        {edges.map(edge => <g key={edge.id} data-feedback={feedback[edge.id]}><path d={paths.get(edge.id)!.path} className={styles.edgeHit} data-edge-hit={edge.id} onPointerDown={e => e.stopPropagation()} onClick={() => controller.select(edge.id)} fill="none" /><path d={paths.get(edge.id)!.path} className={styles.edge} data-edge-line={edge.id} data-highlighted={state.canvas.highlightedIds.includes(edge.id)} data-selected={state.selectedId === edge.id} markerEnd={`url(#${marker})`} pathLength={1} strokeDasharray={1} strokeDashoffset={state.canvas.completedActionIds.at(-1) === controller.timeline.beats[state.index]?.action.actionId && controller.timeline.beats[state.index]?.action.operations.some(op => op.type === 'connect_elements' && op.element.id === edge.id) ? 1 - state.progress : 0} fill="none" /></g>)}
        {connectFrom && pointer && nodes.find(n => n.id === connectFrom) && (() => { const source = nodes.find(n => n.id === connectFrom)!;
          const target = nodes.find(n => n.id !== connectFrom && permitted(n.id) && Math.abs(n.x - pointer.x) < W / 2 + 22 && Math.abs(n.y - pointer.y) < H / 2 + 22);
          const a = connectionPort(source, fromSide), side: PortSide = target ? Math.abs(pointer.x - target.x) / W > Math.abs(pointer.y - target.y) / H ? pointer.x < target.x ? 'left' : 'right' : pointer.y < target.y ? 'top' : 'bottom' : 'left';
          const b = target ? connectionPort(target, side) : pointer;
          return <path className={styles.pendingEdge} data-connection-preview="true" d={roundedPath([a, fromSide === 'left' || fromSide === 'right' ? { x: (a.x + b.x) / 2, y: a.y } : { x: a.x, y: (a.y + b.y) / 2 }, fromSide === 'left' || fromSide === 'right' ? { x: (a.x + b.x) / 2, y: b.y } : { x: b.x, y: (a.y + b.y) / 2 }, b])} markerEnd={`url(#${marker})`} fill="none" />; })()}
        {nodes.map(node => { const actual = original.find(n => n.id === node.id)!; return <NodeTarget key={node.id} node={node} selected={state.selectedId === node.id} highlighted={state.canvas.highlightedIds.includes(node.id)} editable={permitted(node.id)} editing={editing} connected={connectFrom === node.id} dragging={preview?.id === node.id} destination={Boolean(connectFrom && connectFrom !== node.id && permitted(node.id) && pointer && Math.abs(node.x - pointer.x) < W / 2 + 22 && Math.abs(node.y - pointer.y) < H / 2 + 22)}
          onFocus={() => controller.select(node.id)} onStart={e => begin(e, 'move', actual)} onSelect={() => { if (suppressClick.current) { suppressClick.current = false; return; } if (connectFrom && connectFrom !== node.id) connect(node.id); else controller.select(node.id); }}
          onRename={() => rename(actual)} onHandle={(e, side) => { if (e.type === 'click') { if (!suppressClick.current) beginConnection(actual, side); suppressClick.current = false; } else begin(e, 'connect', actual, side); }} onKey={e => nodeKey(e, actual)}
          onValue={value => setEditing(current => current ? { ...current, value } : null)} onSave={save} onCancel={cancel} />; })}
        {edges.map(edge => <EdgeTarget key={edge.id} feedback={feedback[edge.id]} edge={edge} position={paths.get(edge.id)!.label} selected={state.selectedId === edge.id} highlighted={state.canvas.highlightedIds.includes(edge.id)} editable={permitted(edge.id)} editing={editing}
          select={() => controller.select(edge.id)} rename={() => rename(edge)} value={value => setEditing(current => current ? { ...current, value } : null)} save={save} cancel={cancel} />)}
      </svg>
      {editing && <div className={styles.editActions} role="toolbar" aria-label="Save or cancel label"><button onClick={save}>Save label</button><button onClick={cancel}>Cancel</button></div>}
      {selected && toolbar && !editing && <div ref={toolbarElement} className={styles.contextToolbar} style={toolbar} data-editable={permitted(selected.id)} role="toolbar" aria-label={`Edit ${selected.kind === 'node' || selected.kind === 'edge' ? selected.text : selected.label}`} onPointerDown={e => e.stopPropagation()}>
        <button className={styles.diagramAsk} aria-label="Ask Petros about selected element" title="Ask Petros about this element" onClick={onAsk}><MessageCircle size={16} aria-hidden="true" />Ask</button>
        {permitted(selected.id) && <><button disabled={!canRename(selected)} title="Edit label" aria-label={selected.kind === 'edge' ? 'Edit relationship' : 'Rename node'} onClick={() => rename(selected)}><Pencil size={16} /></button>
        {selected.kind === 'node' && <><button title="Connect to another node" aria-label="Connect selected node" aria-pressed={Boolean(connectFrom)} onClick={() => beginConnection(selected)}><Link2 size={16} /></button><button title="Move using direction buttons" aria-label="Move selected node" aria-expanded={moving} onClick={() => setMoving(!moving)}><ArrowUp size={16} /><ArrowRight size={16} /></button></>}
        <button aria-label="Delete selected element" disabled={!canDelete} title={canDelete ? 'Delete from this practice copy' : 'Protected teaching connections must remain'} onClick={() => remove()}><Trash2 size={16} /></button></>}
        <button className={styles.diagramClear} aria-label="Clear diagram selection" title="Clear selection" onClick={() => controller.select(null)}><X size={16} /></button>
        {moving && permitted(selected.id) && selected.kind === 'node' && <div className={styles.nudge}>{[[ArrowLeft, -12, 0, 'left'], [ArrowUp, 0, -12, 'up'], [ArrowDown, 0, 12, 'down'], [ArrowRight, 12, 0, 'right']].map(([Icon, dx, dy, label]) => { const Direction = Icon as typeof ArrowLeft; return <button key={String(label)} aria-label={`Move ${label}`} onClick={() => moveOnScreen(selected, Number(dx), Number(dy))}><Direction size={16} /></button>; })}</div>}
      </div>}
    </div>
    {notice || connectFrom ? <p className={styles.diagramHint} role="status">{notice || 'Choose a destination node. Escape cancels.'}</p> : null}
    {textOpen && <div className={styles.diagramText} role="region" aria-label="Diagram text version and keyboard help">
      <p className={styles.diagramHint}>Tab to select a node. Enter/F2 renames; arrows move; C starts a connection, then focus a destination and Enter/Space. Ctrl/⌘ Z undoes, Shift Z redoes. Focus the surface to pan with arrows and zoom with +/−. Escape cancels. Touch: tap a node, then Rename, Move or Connect. Protected teaching content can be selected and discussed.</p>
      <ul className={styles.relationships} aria-label="Diagram text alternative">{edges.map(edge => <li key={edge.id}><button className={styles.textRelationship} onClick={() => controller.select(edge.id)} aria-pressed={state.selectedId === edge.id}><span>{nodes.find(n => n.id === edge.from)?.text}</span><span className={styles.textRelation}>{edge.text}<ArrowRight size={14} /></span><span>{nodes.find(n => n.id === edge.to)?.text}</span></button></li>)}
        {nodes.map(node => <li key={node.id}><button className={styles.textRelationship} onClick={() => { if (connectFrom && connectFrom !== node.id) connect(node.id); else controller.select(node.id); }} aria-pressed={state.selectedId === node.id}>{node.text}</button></li>)}
      </ul>
    </div>}
  </div>;
}
