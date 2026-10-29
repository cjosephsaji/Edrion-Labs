'use client';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ShowcaseState } from '../teaching/types';
import { paintBoard, type BoardFrame } from './board-content';
import type { Pick, V3 } from './primitives';
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
  const { canvas, layout } = useMemo(
    () => makeBoard(state, frame),
    [
      state.visualState,
      state.teaching,
      state.completion,
      state.questionId,
      state.highlightTargetId,
      state.sourcePages,
      frame.reveal,
      frame.caption,
      frame.title,
      frame.visible,
      frame.progress,
    ],
  );
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  useEffect(() => () => texture.dispose(), [texture]);
  const { camera, size } = useThree();
  useFrame(() => {
    const corners = [
      [-BOARD_SIZE[0] / 2, BOARD_SIZE[1] / 2],
      [BOARD_SIZE[0] / 2, -BOARD_SIZE[1] / 2],
    ].map(([x, y]) =>
      new THREE.Vector3(
        BOARD_POSITION[0] + x!,
        BOARD_POSITION[1] + y!,
        BOARD_POSITION[2],
      ).project(camera),
    );
    const data = {
      x: ((corners[0]!.x + 1) * size.width) / 2,
      y: ((1 - corners[0]!.y) * size.height) / 2,
      w: ((corners[1]!.x - corners[0]!.x) * size.width) / 2,
      h: ((corners[0]!.y - corners[1]!.y) * size.height) / 2,
    };
    Object.assign(window, {
      __PETROS_BOARD__: { rect: data, layout, reveal: frame.reveal },
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
        const hit = layout.hits.find(
          (h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h,
        );
        if (hit) onPick(hit.id, hit.value);
        else if (!frame.visible) onOpen?.();
      }}
    >
      <planeGeometry args={BOARD_SIZE} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
export function BoardSemantics({
  state,
  frame,
}: {
  state: ShowcaseState;
  frame: BoardFrame;
}) {
  const { layout } = useMemo(
    () => makeBoard(state, frame),
    [
      state.visualState,
      state.teaching,
      state.completion,
      state.questionId,
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
  frame,
  onPick,
  onClose,
}: {
  state: ShowcaseState;
  frame: BoardFrame;
  onPick: Pick;
  onClose: () => void;
}) {
  const { canvas, layout } = useMemo(
    () => makeBoard(state, frame),
    [state, frame],
  );
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Focused teaching board"
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
      <div
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20 }}
      >
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
    </section>
  );
}
