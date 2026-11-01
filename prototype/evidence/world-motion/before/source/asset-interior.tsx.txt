'use client';
import { useEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { V3 } from './primitives';
import type { Station } from '../teaching/types';
import versions from '../assets/realism/runtime-versions.json';

const assetUrl = (id: string) =>
  `/prototype/api/asset/${id}?v=${versions[id as keyof typeof versions]}`;
export function useAsset(id: string) {
  return useLoader(GLTFLoader, assetUrl(`${id}.glb`), (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
}
// Clone transforms, while retaining the shared imported geometry and PBR maps.
export function Asset({
  id,
  position = [0, 0, 0],
  rotation = 0,
  scale = 1,
  onClick,
}: {
  id: string;
  position?: V3;
  rotation?: number;
  scale?: number | V3;
  onClick?: () => void;
}) {
  const gltf = useAsset(id);
  const copy = useMemo(() => {
    const object = gltf.scene.clone(true);
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = child.receiveShadow = true;
        for (const m of Array.isArray(child.material)
          ? child.material
          : [child.material]) {
          if (m instanceof THREE.MeshStandardMaterial) {
            for (const texture of [m.map, m.normalMap, m.roughnessMap])
              if (texture) texture.anisotropy = 8;
          }
        }
      }
    });
    return object;
  }, [gltf]);
  return (
    <group
      position={position}
      rotation={[0, rotation, 0]}
      scale={scale}
      dispose={null}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      onPointerOver={
        onClick
          ? () => {
              document.body.style.cursor = 'pointer';
            }
          : undefined
      }
      onPointerOut={
        onClick
          ? () => {
              document.body.style.cursor = '';
            }
          : undefined
      }
    >
      <primitive object={copy} />
    </group>
  );
}
export function ImportedBook({
  variant = 0,
  height = 0.3,
}: {
  variant?: number;
  height?: number;
}) {
  const gltf = useAsset('book_encyclopedia_set_01');
  const book = useMemo(() => {
    const source = gltf.scene.getObjectByName(
      `book_encyclopedia_set_01_book${String((variant % 20) + 1).padStart(2, '0')}`,
    )!;
    const copy = source.clone(true);
    const bounds = new THREE.Box3().setFromObject(copy);
    const center = bounds.getCenter(new THREE.Vector3());
    const factor = height / (bounds.max.y - bounds.min.y);
    const group = new THREE.Group();
    group.add(copy);
    copy.position.sub(center);
    group.scale.setScalar(factor);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
    return group;
  }, [gltf, variant, height]);
  return <primitive object={book} dispose={null} />;
}
function EnvironmentLighting() {
  const [texture, sky] = useLoader(RGBELoader, [
    assetUrl('studio_small_03.hdr'),
    assetUrl('spruit_sunrise.hdr'),
  ]) as [THREE.DataTexture, THREE.DataTexture];
  const { gl, scene, invalidate } = useThree();
  const shelfTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.set(-3.4, 1.4, -3.7);
    return target;
  }, []);
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromEquirectangular(texture);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.22;
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    scene.backgroundBlurriness = 0.035;
    scene.backgroundIntensity = 0.6;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.92;
    invalidate();
    return () => {
      scene.environment = null;
      environment.dispose();
      generator.dispose();
    };
  }, [texture, sky, scene, gl, invalidate]);
  return (
    <>
      <hemisphereLight args={['#dce9f6', '#a9957e', 0.68]} />
      <directionalLight
        position={[4.1, 2.65, 1.6]}
        color="#fff3dc"
        intensity={2.0}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-normalBias={0.015}
        shadow-bias={-0.0002}
        shadow-radius={3}
      />
      <primitive object={shelfTarget} />
      <spotLight
        position={[-3.4, 2.8, -2.5]}
        target={shelfTarget}
        color="#ffdfae"
        intensity={5}
        angle={0.65}
        penumbra={1}
        distance={4}
      />
      <pointLight
        position={[-3.4, 1.3, 0.7]}
        color="#ffe2b6"
        intensity={1.1}
        distance={2.5}
      />
    </>
  );
}
function LibraryBooks() {
  const levels = [0.715, 1.375, 2.03];
  return (
    <>
      {levels.map((y, row) =>
        [-3.94, -3.35, -2.76].map((center, col) =>
          col === 1
            ? null
            : Array.from({ length: 8 }, (_, i) => {
                const h = 0.37 + ((i + row) % 3) * 0.018;
                return (
                  <group
                    key={`${row}-${col}-${i}`}
                    position={[center - 0.215 + i * 0.061, y + h / 2, -3.56]}
                  >
                    <ImportedBook variant={row * 7 + col * 3 + i} height={h} />
                  </group>
                );
              }),
        ),
      )}
      {[0, 1, 2].map((i) => (
        <group
          key={i}
          position={[-3.35, 0.75 + i * 0.058, -3.56]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <ImportedBook variant={i + 3} height={0.38} />
        </group>
      ))}
      {[0.715, 1.375, 2.03].map((y, row) =>
        Array.from({ length: 22 }, (_, i) => {
          const h = 0.36 + (i % 3) * 0.018;
          return (
            <group
              key={`side-${row}-${i}`}
              position={[-4.2, y + h / 2, -1.15 + i * 0.067]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <ImportedBook variant={row * 5 + i} height={h} />
            </group>
          );
        }),
      )}
    </>
  );
}
export function Interior({
  onStation,
}: {
  onStation: (station: Station) => void;
}) {
  return (
    <group>
      <EnvironmentLighting />
      <Asset id="classroom-shell" />
      <Asset
        id="wooden_display_shelves_01"
        onClick={() => onStation('bookshelf')}
        position={[-3.35, 0, -3.7]}
        rotation={-Math.PI / 2}
        scale={1.72}
      />
      <Asset
        id="wooden_display_shelves_01"
        onClick={() => onStation('bookshelf')}
        position={[-4.34, 0, -0.4]}
        scale={1.72}
      />
      <LibraryBooks />
      <Asset
        id="SchoolDesk_01"
        onClick={() => onStation('desk')}
        position={[-3.1, 0, 0.95]}
        scale={[1.7, 1, 1.4]}
      />
      <Asset id="SchoolChair_01" position={[-3.1, 0, 1.7]} rotation={Math.PI} />
      <Asset
        id="desk_lamp_arm_01"
        position={[-3.48, 0.95, 0.78]}
        scale={0.62}
        rotation={0.5}
      />
      <Asset
        id="WoodenTable_01"
        onClick={() => onStation('experiment')}
        position={[2.3, 0, -0.1]}
        scale={[1.3, 1.5, 1.95]}
      />
      <Asset
        id="SchoolDesk_01"
        position={[-3.15, 0, -1.7]}
        scale={[0.9, 1, 0.9]}
      />
      <Asset
        id="modern_wooden_cabinet"
        position={[4.14, 0, -2.2]}
        rotation={-Math.PI / 2}
        scale={0.9}
      />
      <Asset id="potted_plant_02" position={[3.95, 0.62, -2.3]} scale={1.1} />
      <Asset id="potted_plant_02" position={[-4.18, 0, 2.8]} scale={1.5} />
    </group>
  );
}
export function BoardFixture() {
  const gltf = useAsset('teaching-board');
  const fixture = useMemo(() => {
    const object = gltf.scene.clone(true);
    object.position.set(-0.89688, -1.33438, 3.28033);
    object.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
    return object;
  }, [gltf]);
  return (
    <group position={[0.8, 1.61, -3.73]} scale={[1.92, 1.92, 1]} dispose={null}>
      <primitive object={fixture} />
    </group>
  );
}
