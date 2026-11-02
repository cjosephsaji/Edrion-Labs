'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
export const worldBounds = new Map<string, THREE.Box3>();
export function Anchor({
  id,
  children,
  onTarget,
  enabled = true,
}: {
  id: string;
  children: React.ReactNode;
  onTarget?: (id: string) => void;
  enabled?: boolean;
}) {
  const ref = useRef<THREE.Group>(null),
    box = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    if (enabled && ref.current) {
      box.setFromObject(ref.current);
      if (!box.isEmpty()) worldBounds.set(id, box);
    }
  });
  useEffect(
    () => () => {
      worldBounds.delete(id);
    },
    [id],
  );
  return (
    <group
      ref={ref}
      onClick={
        onTarget
          ? (e) => {
              e.stopPropagation();
              onTarget(id);
            }
          : undefined
      }
    >
      {children}
    </group>
  );
}
export function AnchorProjector({
  root,
}: {
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!root.current) return;
    const ids = new Set<string>();
    for (const [id, box] of worldBounds) {
      ids.add(id);
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity,
        visible = false;
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z]) {
            v.set(x, y, z).project(camera);
            if (v.z > -1 && v.z < 1) visible = true;
            const px = ((v.x + 1) * size.width) / 2,
              py = ((1 - v.y) * size.height) / 2;
            left = Math.min(left, px);
            right = Math.max(right, px);
            top = Math.min(top, py);
            bottom = Math.max(bottom, py);
          }
      let el = root.current.querySelector<HTMLElement>(
        `[data-world-anchor="${id}"]`,
      );
      if (!el) {
        el = document.createElement('span');
        el.dataset.worldAnchor = id;
        el.dataset.petrosId = id;
        root.current.appendChild(el);
      }
      Object.assign(el.style, {
        display:
          visible &&
          right > 0 &&
          bottom > 0 &&
          left < size.width &&
          top < size.height
            ? 'block'
            : 'none',
        position: 'absolute',
        left: `${Math.max(0, left)}px`,
        top: `${Math.max(0, top)}px`,
        width: `${Math.max(0, Math.min(size.width, right) - Math.max(0, left))}px`,
        height: `${Math.max(0, Math.min(size.height, bottom) - Math.max(0, top))}px`,
      });
    }
    for (const el of root.current.querySelectorAll<HTMLElement>(
      '[data-world-anchor]',
    ))
      if (!ids.has(el.dataset.worldAnchor!)) el.remove();
  });
  return null;
}
