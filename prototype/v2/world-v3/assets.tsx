'use client';
import { useLoader, useThree } from '@react-three/fiber';
import { useMemo, useEffect } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
export const uiFont = '/world-v3/fonts/ui-sdf.ttf',
  displayFont = '/world-v3/fonts/display.ttf';
const transcoders = new WeakMap<THREE.WebGLRenderer, KTX2Loader>();
export function useAsset(name: string) {
  const gl = useThree((s) => s.gl);
  return useLoader(GLTFLoader, `/world-v3/${name}.glb`, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    let ktx = transcoders.get(gl);
    if (!ktx) {
      ktx = new KTX2Loader()
        .setTranscoderPath('/world-v3/basis/')
        .setWorkerLimit(2)
        .detectSupport(gl);
      transcoders.set(gl, ktx);
    }
    loader.setKTX2Loader(ktx);
  });
}
export function Asset({
  name,
  tint,
  ...props
}: {
  name: string;
  position?: [number, number, number];
  scale?: number | [number, number, number];
  rotation?: [number, number, number];
  tint?: string;
}) {
  const gltf = useAsset(name);
  const copy = useMemo(() => {
    const o = gltf.scene.clone(true);
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = c.receiveShadow = true;
        if (tint) {
          c.material = (c.material as THREE.MeshStandardMaterial).clone();
          (c.material as THREE.MeshStandardMaterial).color.set(tint);
        }
        for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
          (m as THREE.MeshStandardMaterial).aoMapIntensity =
            name === 'archipelago' ? 0.28 : 0.75;
          for (const key of ['map', 'aoMap', 'normalMap', 'roughnessMap']) {
            const t = (m as any)[key];
            if (t) {
              t.anisotropy = 12;
              t.generateMipmaps = t.isCompressedTexture ? false : true;
            }
          }
        }
      }
    });
    return o;
  }, [gltf, tint]);
  useEffect(
    () => () => {
      if (tint)
        copy.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
    },
    [copy, tint],
  );
  return <primitive object={copy} {...props} dispose={null} />;
}
export function firstGeometry(name: string) {
  const gltf = useAsset(name);
  const result = useMemo(() => {
    let geo: THREE.BufferGeometry | undefined,
      material: THREE.Material | undefined;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!geo && o instanceof THREE.Mesh) {
        const baked = o.geometry.clone();
        for (const key of ['position', 'normal']) {
          const a = baked.getAttribute(key);
          if (a) {
            const values = new Float32Array(a.count * a.itemSize);
            for (let i = 0; i < a.count; i++)
              for (let j = 0; j < a.itemSize; j++)
                values[i * a.itemSize + j] = a.getComponent(i, j);
            baked.setAttribute(
              key,
              new THREE.BufferAttribute(values, a.itemSize),
            );
          }
        }
        baked.applyMatrix4(o.matrixWorld);
        geo = baked;
        material = o.material as THREE.Material;
      }
    });
    return { geometry: geo!, material: material! };
  }, [gltf]);
  useEffect(() => () => result.geometry.dispose(), [result]);
  return result;
}
export function WorldText({
  children,
  display = false,
  ...props
}: React.ComponentProps<typeof Text> & { display?: boolean }) {
  return (
    <Text
      font={display ? displayFont : uiFont}
      characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?%x+=/()"
      color="#294b3e"
      anchorX="center"
      anchorY="middle"
      outlineWidth={0}
      material-toneMapped={false}
      material-depthTest={false}
      renderOrder={10}
      outlineColor="#eadfc8"
      {...props}
    >
      {children}
    </Text>
  );
}
