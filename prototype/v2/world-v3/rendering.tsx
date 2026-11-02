'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  SMAA,
  Vignette,
  N8AO,
  DepthOfField,
  ToneMapping,
} from '@react-three/postprocessing';
import * as THREE from 'three';
import { ToneMappingMode } from 'postprocessing';
import { useWorld, placePosition } from './store';
export function rendererDpr(quality: string) {
  const native = Math.min(
    typeof window === 'undefined' ? 2 : window.devicePixelRatio,
    2,
  );
  return quality === 'low' ? Math.min(native, 1.5) : Math.max(1.5, native);
}
export function Effects() {
  const quality = useWorld((s) => s.quality),
    moving = useWorld((s) => s.moving);
  if (quality !== 'high')
    return (
      <EffectComposer
        multisampling={4}
        frameBufferType={THREE.UnsignedByteType}
      >
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <SMAA />
        <Vignette eskil={false} offset={0.23} darkness={0.19} />
      </EffectComposer>
    );
  return (
    <EffectComposer
      multisampling={4}
      enableNormalPass={false}
      resolutionScale={quality === 'high' ? 1 : 0.5}
    >
      {quality === 'high' ? (
        <N8AO
          ref={(pass) => {
            if (pass) {
              pass.autoDetectTransparency = false;
              pass.configuration.transparencyAware = false;
              pass.configuration.denoiseIterations = 1;
            }
          }}
          halfRes
          aoRadius={0.5}
          distanceFalloff={1.2}
          intensity={0.85}
          aoSamples={4}
          denoiseSamples={2}
          denoiseRadius={4}
          depthAwareUpsampling={false}
        />
      ) : (
        <></>
      )}
      <Bloom
        height={quality === 'high' ? 256 : 128}
        luminanceThreshold={1.1}
        mipmapBlur
        intensity={0.24}
        radius={0.55}
      />
      {moving ? (
        <DepthOfField
          focusDistance={0.035}
          focalLength={0.06}
          bokehScale={1.1}
          height={quality === 'high' ? 480 : 300}
        />
      ) : (
        <></>
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette eskil={false} offset={0.23} darkness={0.19} />
    </EffectComposer>
  );
}
export function WorldLight() {
  const place = useWorld((s) => s.place),
    quality = useWorld((s) => s.quality),
    p = placePosition(place);
  const target = useMemo(() => new THREE.Object3D(), []),
    light = useRef<THREE.DirectionalLight>(null),
    shadowAt = useRef(-1);
  useFrame(({ clock }) => {
    if (
      light.current &&
      clock.elapsedTime - shadowAt.current >
        (quality === 'high' ? 1 / 24 : 1 / 8)
    ) {
      light.current.shadow.needsUpdate = true;
      shadowAt.current = clock.elapsedTime;
    }
  });
  useEffect(() => {
    target.position.set(...p);
    target.updateMatrixWorld();
  }, [place, target]);
  return (
    <>
      <hemisphereLight args={['#f6e1c0', '#8b9d9b', 0.7]} />
      <primitive object={target} />
      <directionalLight
        ref={light}
        shadow-autoUpdate={false}
        position={[p[0] + 12, p[1] + 22, p[2] + 8]}
        target={target}
        intensity={1.55}
        color="#ffdeb1"
        castShadow={quality === 'high'}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={55}
        shadow-normalBias={0.025}
        shadow-bias={-0.0001}
        shadow-radius={4}
      />
      <directionalLight
        position={[-20, 12, -10]}
        intensity={0.55}
        color="#a6c9de"
      />
    </>
  );
}
export function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader:
          'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 vDirection;void main(){float h=normalize(vDirection).y;vec3 dawn=vec3(.69,.43,.29);vec3 upper=vec3(.12,.31,.51);vec3 lower=vec3(.18,.32,.44);vec3 sky=mix(dawn,upper,smoothstep(-.05,.75,h));sky=mix(lower,sky,smoothstep(-.6,.05,h));gl_FragColor=vec4(sky,1.);}`,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh>
      <sphereGeometry args={[180, 32, 24]} />
      <primitive attach="material" object={mat} />
    </mesh>
  );
}
export function FrameTelemetry() {
  const { gl } = useThree();
  const last = useRef(0),
    values = useRef<number[]>([]);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    gl.info.reset();
  }, -100);
  useFrame((state, dt) => {
    values.current.push(dt * 1000);
    if (state.clock.elapsedTime - last.current > 0.75) {
      const sorted = values.current.sort((a, b) => a - b);
      useWorld.getState().patch({
        frame: {
          ms: sorted[Math.floor(sorted.length / 2)] ?? 0,
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          dpr: gl.getPixelRatio(),
        },
      });
      values.current = [];
      last.current = state.clock.elapsedTime;
    }
    gl.domElement.dataset.quality = useWorld.getState().quality;
    gl.domElement.dataset.travelling = String(useWorld.getState().moving);
    gl.domElement.dataset.destination = useWorld.getState().place;
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
    gl.domElement.dataset.triangles = String(gl.info.render.triangles);
  }, 100);
  return null;
}

// Fog follows the scale of the current composition, so the distant portrait
// overview stays clear while still fading the clouds beyond the islands.
export function Atmosphere() {
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, scene }) => {
    const p = placePosition(useWorld.getState().place);
    target.set(...p);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(48, camera.position.distanceTo(target) + 12);
      scene.fog.far = scene.fog.near + 102;
    }
  });
  return null;
}
