'use client';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ShowcaseState } from '../teaching/types';
import { paintBoard, type BoardFrame } from './board-content';
import type { Pick, V3 } from './primitives';
import { MotionTrack, recordFrame } from './motion';
import { boardKey, boardOperation, presentationStatus, type BoardOperation } from './board-motion';
import { useWorldMotion } from './motion-context';
import { boardUniforms, boardVertex, boardFragment } from './board-material';
import { worldTypeface } from './typography';
import { tinyModel, minimax } from '../teaching/algorithms';
import { activeTree } from '../teaching/tree-variant';
import { VisualEngine } from '../components/visual-engine';
import type { Patch } from '../teaching/types';
import { TeachingCycle } from '../components/teaching-cycle';
import { resolveLesson } from '../teaching/lesson-registry';
export const BOARD_POSITION: V3 = [0.8, 1.61, -3.6];
export const BOARD_SIZE: [number, number] = [4.25, 2.390625];
export function makeBoard(state: ShowcaseState, frame: BoardFrame) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const layout = paintBoard(canvas.getContext('2d')!, state, frame);
  return { canvas, layout };
}
export function BoardSurface({
  state,
  frame,
  onPick,
  onOpen,
}: {
  state: ShowcaseState;
  frame: BoardFrame;
  onPick: Pick;
  onOpen?: () => void;
}) {
  const motion = useWorldMotion();
  const { invalidate } = useThree();
  const resource = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const atlas = document.createElement('canvas');
    atlas.width = 1024;
    atlas.height = 512;
    const atlasTexture = new THREE.CanvasTexture(atlas);
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    atlasTexture.generateMipmaps = false;
    atlasTexture.minFilter = THREE.LinearFilter;
    texture.name = 'Computed whiteboard';
    atlasTexture.name = 'Computed numeric transition';
    return {
      canvas,
      texture,
      atlas,
      atlasTexture,
      uniforms: boardUniforms(texture, texture),
    };
  }, []);
  const layout = useRef<ReturnType<typeof paintBoard> | null>(null);
  const previous = useRef<ShowcaseState | null>(null),
    identity = useRef('');
  const run = useRef<null | {
    state: ShowcaseState;
    frame: BoardFrame;
    op: BoardOperation;
    clock: MotionTrack;
    last: number;
  }>(null);
  function draw() {
    const task = run.current;
    if (!task) return;
    const status = presentationStatus(task.state);
    const finalReveal = ['network', 'kb'].includes(task.state.visualState.kind)
      ? status === 'INTRODUCING' &&
        task.state.visualState.kind === 'network' &&
        task.state.questionId === 'AI-Q01'
        ? 1
        : 4
      : task.frame.reveal;
    layout.current = paintBoard(resource.canvas.getContext('2d')!, task.state, {
      ...task.frame,
      reveal: finalReveal,
      animation: undefined,
    });
    resource.texture.needsUpdate = true;
  }
  useEffect(() => {
    // A replacement canvas (including development refresh) needs its initial paint.
    identity.current = '';
    previous.current = null;
    run.current = null;
    if (motion) {
      motion.signals.assets.boardTexturesCreated++;
    }
    return () => {
      resource.texture.dispose();
      resource.atlasTexture.dispose();
      if (motion) motion.signals.assets.boardTexturesDisposed++;
    };
  }, [resource]);
  useEffect(() => {
    // Prepare the first stable board behind the portal, even while World is inactive.
    // Subsequent paused operations must preserve the exact displayed frame.
    if (motion?.paused && run.current) {
      if (motion) motion.signals.board.status = 'paused';
      return;
    }
    const key = boardKey(state, frame.reveal, frame.visible);
    if (key !== identity.current) {
      const op = boardOperation(state, previous.current);
      const oldIds = new Set(layout.current?.hits.map((h) => h.id) ?? []);
      run.current = {
        state,
        frame,
        op,
        clock: new MotionTrack(op.duration / 1000),
        last: performance.now(),
      };
      // Paint once per committed state; use that same layout for masks and picking.
      draw();
      const final = layout.current!;
      identity.current = key;
      previous.current = state;
      const uniforms = resource.uniforms;
      uniforms.operation.value =
        op.kind === 'network-build'
          ? 1
          : op.kind === 'rule-link'
            ? 2
            : op.kind === 'value-pass'
              ? 3
              : op.kind === 'network-update'
                ? 4
                : op.kind === 'highlight'
                  ? 5
                  : 0;
      uniforms.durationMs.value = op.duration;
      const added = final.hits.filter((h) => !oldIds.has(h.id)).slice(0, 8);
      uniforms.revealCount.value = added.length;
      added.forEach((h, i) =>
        uniforms.revealRects.value[i]!.set(h.x - 4, h.y - 4, h.w + 8, h.h + 8),
      );
      uniforms.valueRect.value.set(0, 0, 0, 0);
      const highlighted = final.hits.find((h) => h.id === state.highlightTargetId);
      if (highlighted)
        uniforms.highlightRect.value.set(
          highlighted.x - 4,
          highlighted.y - 4,
          highlighted.w + 8,
          highlighted.h + 8,
        );
      else uniforms.highlightRect.value.set(0, 0, 0, 0);
      const v = state.visualState;
      if (v.kind === 'network') {
        uniforms.weightAfter.value = v.weight;
        uniforms.weightBefore.value = op.before?.kind === 'network' ? op.before.weight : v.weight;
      }
      if (op.kind === 'value-pass' && v.kind === 'tree') {
        if (v.example?.revealAnswer) {
          const ex = v.example,
            value = ex.role === 'MAX' ? Math.max(...ex.values) : Math.min(...ex.values),
            x = 350 + (ex.values.indexOf(value) * 900) / Math.max(1, ex.values.length - 1);
          uniforms.valueRect.value.set(x - 90, 650, 180, 100);
          uniforms.valueFrom.value.set(x, 700);
          uniforms.valueTo.value.set(800, 440);
        } else {
          const qi = Number(state.questionId?.slice(-2));
          if (qi >= 4 && qi <= 7) {
            const tree = activeTree(v),
              result = minimax(tree),
              b = qi === 7 ? result.best : qi - 4,
              x = [320, 800, 1280][b]!,
              leaf = x + (tree[b]!.indexOf(result.children[b]!) === 0 ? -98 : 98);
            uniforms.valueRect.value.set(leaf - 80, 652, 160, 96);
            uniforms.valueFrom.value.set(qi === 7 ? x : leaf, qi === 7 ? 490 : 700);
            uniforms.valueTo.value.set(qi === 7 ? 800 : x, qi === 7 ? 305 : 490);
          }
        }
      }
    }
    const task = run.current;
    if (task) {
      task.last = performance.now();
      if (motion?.reduced) task.clock.finish();
      resource.uniforms.timeMs.value = task.clock.elapsed * 1000;
      if (task.op.kind === 'network-update') drawNumbers();
      invalidate();
    }
  }, [
    state.visualState,
    state.teaching,
    state.completion,
    state.questionId,
    state.learning,
    state.studentResponse,
    state.highlightTargetId,
    frame.reveal,
    frame.visible,
    motion?.paused,
    motion?.reduced,
    invalidate,
  ]);
  const lastNumbers = useRef(0);
  function drawNumbers() {
    const task = run.current;
    if (!task || task.state.visualState.kind !== 'network' || task.op.before?.kind !== 'network')
      return;
    const v = task.state.visualState,
      p = task.clock.progress,
      w = Number(
        (
          task.op.before.weight +
          (v.weight - task.op.before.weight) * (p * p * (3 - 2 * p))
        ).toFixed(2),
      ),
      output = tinyModel(v.input, w);
    const ctx = resource.atlas.getContext('2d')!;
    const rows = [
      {
        text: `Weight ${w.toFixed(2)} -> ${v.weight.toFixed(1)}`,
        w: 422,
        h: 117,
        font: 38,
        bg: task.state.highlightTargetId === 'weight' ? '#d2e4c2' : '#e6ecd4',
      },
      { text: output.toFixed(2), w: 282, h: 117, font: 68, bg: '#e9f0e8' },
      {
        text: `${v.input} x ${w.toFixed(2)} = ${output.toFixed(2)}`,
        w: 1340,
        h: 80,
        font: 46,
        bg: '#f8f9f2',
      },
      {
        text: `Target ${v.target} - absolute error ${Math.abs(output - v.target).toFixed(2)}`,
        w: 1340,
        h: 90,
        font: 46,
        bg: '#f8f9f2',
      },
    ];
    rows.forEach((r, i) => {
      ctx.save();
      ctx.translate(0, i * 128);
      ctx.scale(1024 / r.w, 128 / r.h);
      ctx.fillStyle = r.bg;
      ctx.fillRect(0, 0, r.w, r.h);
      ctx.font = `500 ${r.font}px ${worldTypeface()}`;
      ctx.fillStyle = '#254e40';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.text, r.w / 2, r.h / 2, r.w - 10);
      ctx.restore();
    });
    resource.atlasTexture.needsUpdate = true;
    resource.uniforms.numbers.value = resource.atlasTexture;
  }
  useFrame(() => {
    const task = run.current;
    if (!task || motion?.paused) return;
    const now = performance.now(),
      delta = (now - task.last) / 1000;
    task.last = now;
    if (!task.clock.done) {
      task.clock.advance(delta, false, motion?.reduced);
      if (motion) recordFrame(motion.signals.frameTimes.board, delta);
      if (task.op.kind === 'network-update' && now - lastNumbers.current >= 40) {
        lastNumbers.current = now;
        drawNumbers();
      }
      resource.uniforms.timeMs.value = task.clock.elapsed * 1000;
      invalidate();
    }
    if (motion)
      motion.signals.board = {
        key: task.op.key + ':' + task.op.kind,
        elapsed: task.clock.elapsed * 1000,
        duration: task.op.duration,
        status: task.clock.done ? 'idle' : 'moving',
      };
  });
  const { camera, size } = useThree();
  useFrame(() => {
    const corners = [
      [-BOARD_SIZE[0] / 2, BOARD_SIZE[1] / 2],
      [BOARD_SIZE[0] / 2, -BOARD_SIZE[1] / 2],
    ].map(([x, y]) =>
      new THREE.Vector3(BOARD_POSITION[0] + x!, BOARD_POSITION[1] + y!, BOARD_POSITION[2]).project(
        camera,
      ),
    );
    const data = {
      x: ((corners[0]!.x + 1) * size.width) / 2,
      y: ((1 - corners[0]!.y) * size.height) / 2,
      w: ((corners[1]!.x - corners[0]!.x) * size.width) / 2,
      h: ((corners[0]!.y - corners[1]!.y) * size.height) / 2,
    };
    Object.assign(window, {
      __PETROS_BOARD__: {
        rect: data,
        layout: layout.current,
        reveal: frame.reveal,
      },
    });
  });
  return (
    <mesh
      position={BOARD_POSITION}
      onClick={(e) => {
        e.stopPropagation();
        if (!e.uv) return;
        const x = e.uv.x * 1600,
          y = (1 - e.uv.y) * 900;
        const hit = layout.current?.hits.find(
          (h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h,
        );
        if (hit) onPick(hit.id, hit.value);
        else if (!frame.visible) onOpen?.();
      }}
    >
      <planeGeometry args={BOARD_SIZE} />
      <shaderMaterial
        uniforms={resource.uniforms}
        vertexShader={boardVertex}
        fragmentShader={boardFragment}
        toneMapped={false}
      />
    </mesh>
  );
}
export function BoardSemantics({ state, frame }: { state: ShowcaseState; frame: BoardFrame }) {
  const { layout } = useMemo(
    () => makeBoard(state, frame),
    [
      state.visualState,
      state.teaching,
      state.completion,
      state.questionId,
      state.learning,
      state.studentResponse,
      state.highlightTargetId,
      frame.reveal,
      frame.caption,
      frame.visible,
    ],
  );
  return (
    <div className="sr-only" aria-label="Whiteboard text equivalent">
      <p>{layout.text.join('. ')}</p>
    </div>
  );
}
export function FocusBoard({
  state,
  patch,
  frame,
  onPick,
  onClose,
}: {
  state: ShowcaseState;
  patch: Patch;
  frame: BoardFrame;
  onPick: Pick;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  const { canvas, layout } = useMemo(() => makeBoard(state, frame), [state, frame]);
  const lesson = resolveLesson(state);
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Focused teaching board"
      ref={dialog}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(
          dialog.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) ?? [],
        );
        const first = buttons[0],
          last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      style={{
        position: 'absolute',
        inset: '84px 16px 80px',
        zIndex: 20,
        background: '#f8f9f2',
        padding: 18,
        overflow: 'auto',
        borderRadius: 16,
        border: '1px solid #bdcbb9',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <strong>Teaching board · readable view</strong>
        <button onClick={onClose}>Return to room</button>
      </header>
      {state.visualState.kind === 'topic' && state.visualState.visual ? (
        <>
          <VisualEngine state={state} patch={patch} />
          {lesson && <TeachingCycle state={state} lesson={lesson} patch={patch} />}
        </>
      ) : (
        <>
          <img
            alt="Current teaching board; equivalent interactive text follows"
            src={canvas.toDataURL()}
            style={{
              width: '100%',
              maxWidth: 1200,
              display: 'block',
              margin: '18px auto',
            }}
          />
          <p style={{ fontSize: 16, lineHeight: 1.6 }}>{frame.caption}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}>
            {layout.hits.map((h) => (
              <button
                key={h.id}
                onClick={() => onPick(h.id, h.value)}
                style={{ fontSize: 17, padding: '12px 16px' }}
              >
                {h.id}: {h.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
