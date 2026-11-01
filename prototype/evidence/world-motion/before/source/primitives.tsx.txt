'use client';
import { worldTypeface } from './typography';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
export type V3 = [number, number, number];
export type Pick = (id: string, value?: string) => void;
export function SoftBox({
  position = [0, 0, 0],
  size,
  color,
  rotation = [0, 0, 0],
  radius = 0.055,
  onClick,
  opacity = 1,
}: {
  position?: V3;
  size: V3;
  color: string;
  rotation?: V3;
  radius?: number;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const [outerW, outerH, d] = size;
    const r = Math.min(radius, outerW / 5, outerH / 5, d / 3);
    const w = outerW - 2 * r,
      h = outerH - 2 * r;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2);
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    shape.lineTo(w / 2, h / 2 - r);
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    shape.lineTo(-w / 2 + r, h / 2);
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    shape.lineTo(-w / 2, -h / 2 + r);
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: d - 2 * r,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: r,
      bevelThickness: r,
      curveSegments: 3,
    });
    g.translate(0, 0, -d / 2 + r);
    return g;
  }, [size[0], size[1], size[2], radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={rotation}
      onClick={onClick}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        roughness={0.72}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}
export function Label({
  text,
  position,
  size = [1, 0.25],
  color = '#355740',
  background = 'transparent',
  fontSize = 36,
  onClick,
}: {
  text: string;
  position: V3;
  size?: [number, number];
  color?: string;
  background?: string;
  fontSize?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.max(24, Math.round((512 * size[1]) / size[0]));
    const ctx = c.getContext('2d')!;
    if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.font = `500 ${Math.min(fontSize, c.height * 0.7)}px ${worldTypeface()}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, c.height / 2, 490);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    return t;
  }, [text, color, background, fontSize, size[0], size[1]]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={position} onClick={onClick}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
export function Rod({
  from,
  to,
  color = '#83a187',
  width = 0.025,
  dashed = false,
}: {
  from: V3;
  to: V3;
  color?: string;
  width?: number;
  dashed?: boolean;
}) {
  const a = new THREE.Vector3(...from),
    b = new THREE.Vector3(...to),
    length = a.distanceTo(b);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  if (dashed)
    return (
      <>
        {Array.from({ length: 7 }, (_, i) => (
          <Rod
            key={i}
            from={
              a
                .clone()
                .lerp(b, i / 7)
                .toArray() as V3
            }
            to={
              a
                .clone()
                .lerp(b, (i + 0.55) / 7)
                .toArray() as V3
            }
            color={color}
            width={width}
          />
        ))}
      </>
    );
  return (
    <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={q}>
      <cylinderGeometry args={[width, width, length, 6]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}
export function ButtonNode({
  position,
  label,
  color = '#edf4e4',
  selected = false,
  onClick,
  size = [0.83, 0.43],
}: {
  position: V3;
  label: string;
  color?: string;
  selected?: boolean;
  onClick: () => void;
  size?: [number, number];
}) {
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick();
  };
  return (
    <group
      position={position}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <SoftBox
        size={[size[0], size[1], 0.07]}
        color={selected ? '#c4d9ad' : color}
        onClick={click}
      />
      <Label
        text={label}
        position={[0, 0, 0.06]}
        size={[size[0] - 0.04, size[1] - 0.05]}
        color="#244b36"
        fontSize={512}
        onClick={click}
      />
    </group>
  );
}
