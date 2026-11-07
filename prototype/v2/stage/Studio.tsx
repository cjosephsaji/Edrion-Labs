'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  SMAA,
  Vignette,
  N8AO,
  ToneMapping,
} from '@react-three/postprocessing';
import {
  ToneMappingMode,
  type EffectComposer as Composer,
} from 'postprocessing';
import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Quality } from '../world-v3/store';
import { palette } from './palette';
import { CappedBloom } from './CappedBloom';
import { ColorSMAA } from './ColorSMAA';
import { setDepthResolvePolicy } from './smaa-effect';
export function StageEffects({
  quality,
  bloomHeight,
}: {
  quality: Quality;
  bloomHeight?: number;
}) {
  const { gl, size } = useThree();
  const filmHeight =
    gl.domElement
      .closest('[data-presentation="stage"]')
      ?.getBoundingClientRect().height ?? size.height;
  const croppedBloomHeight = bloomHeight
    ? (bloomHeight * size.height) / Math.max(1, filmHeight)
    : undefined;
  const configureBuffers = useCallback(
    (composer: Composer | null) => {
      if (composer)
        setDepthResolvePolicy(
          composer,
          !(bloomHeight && quality === 'balanced'),
        );
    },
    [bloomHeight, quality],
  );
  if (quality === 'low') return null;
  return (
    <EffectComposer
      ref={configureBuffers}
      multisampling={4}
      frameBufferType={T.HalfFloatType}
      enableNormalPass={false}
    >
      {quality === 'high' ? (
        <N8AO
          ref={(pass) => {
            if (pass) {
              pass.autoDetectTransparency = false;
              pass.configuration.transparencyAware = false;
            }
          }}
          halfRes
          aoRadius={0.5}
          intensity={0.65}
          aoSamples={4}
          denoiseSamples={2}
        />
      ) : (
        <></>
      )}
      {bloomHeight ? (
        <CappedBloom height={croppedBloomHeight!} />
      ) : (
        <Bloom
          luminanceThreshold={0.95}
          mipmapBlur
          intensity={0.42}
          radius={0.7}
          height={256}
        />
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {bloomHeight && quality === 'balanced' ? <ColorSMAA /> : <SMAA />}
      <Vignette eskil={false} offset={0.23} darkness={0.19} />
    </EffectComposer>
  );
}
export function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}
export function Glow({
  position,
  scale,
  color,
  opacity,
  flat = false,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  opacity: number;
  flat?: boolean;
}) {
  const map = useMemo(radialTexture, []);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh
      position={position}
      scale={scale}
      rotation={flat ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      renderOrder={4}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={map}
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        fog={false}
        blending={T.AdditiveBlending}
      />
    </mesh>
  );
}
export function Studio({
  quality,
  reduced,
}: {
  quality: Quality;
  reduced: boolean;
}) {
  const { gl, scene, camera, size } = useThree();
  useEffect(() => {
    // Three r170's native transmission pass reads camera.viewport ONLY to size
    // its offscreen target, clears it while drawing, then restores it. The main
    // composer remains full DPR2 / HalfFloat / 4x MSAA. Half-size refraction is
    // ample for these small spheres and avoids a second full-retina MSAA buffer.
    // See node_modules/three/src/renderers/WebGLRenderer.js:renderTransmissionPass.
    const c = camera as T.Camera & { viewport?: T.Vector4 },
      previous = c.viewport;
    if (quality === 'balanced')
      c.viewport = new T.Vector4(
        0,
        0,
        Math.ceil(size.width * gl.getPixelRatio() * 0.5),
        Math.ceil(size.height * gl.getPixelRatio() * 0.5),
      );
    return () => {
      if (previous) c.viewport = previous;
      else delete c.viewport;
    };
  }, [camera, gl, quality, size.width, size.height]);
  useEffect(() => {
    const environment = new RoomEnvironment(),
      generator = new T.PMREMGenerator(gl),
      target = generator.fromScene(environment, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.6;
    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
      environment.dispose();
    };
  }, [gl, scene]);
  const key = useRef<T.DirectionalLight>(null),
    lastShadow = useRef(-1);
  useFrame(({ clock }) => {
    if (
      key.current &&
      clock.elapsedTime - lastShadow.current >
        (quality === 'high' ? 1 / 24 : 1 / 8)
    ) {
      key.current.shadow.needsUpdate = true;
      lastShadow.current = clock.elapsedTime;
    }
  });
  const dust = useRef<T.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      a[i * 3] = Math.sin(i * 78.23) * 7.5;
      a[i * 3 + 1] = (Math.sin(i * 34.67) * 0.5 + 0.5) * 6.5;
      a[i * 3 + 2] = Math.cos(i * 45.12) * 4.5;
    }
    return a;
  }, []);
  useFrame((_, dt) => {
    if (dust.current && !reduced) dust.current.rotation.y += dt * 0.012;
  });
  const veil = useMemo(
    () =>
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { color: { value: new T.Color(palette.bg) } },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'uniform vec3 color;varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float a=(.60+.16*smoothstep(0.,.35,r))*(1.-smoothstep(.35,1.,r));gl_FragColor=vec4(color,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}',
      }),
    [],
  );
  useEffect(() => () => veil.dispose(), [veil]);
  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, 22, 60]} />
      <directionalLight
        ref={key}
        shadow-autoUpdate={false}
        color="#fff0dc"
        intensity={2.6}
        position={[4.5, 8, 6]}
        castShadow={quality !== 'low'}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={24}
      />
      <directionalLight
        color="#7f9bff"
        intensity={2.2}
        position={[-6, 3.5, -6]}
      />
      <Glow
        position={[0, 3.2, -9]}
        scale={[30, 17, 1]}
        color={palette.backdrop}
        opacity={0.38}
      />
      <Glow
        position={[4, 2, -8.5]}
        scale={[16, 9, 1]}
        color="#ff9a5a"
        opacity={0.07}
      />
      <mesh
        position={[0, -0.352, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={5}
        material={veil}
      >
        <circleGeometry args={[9, 64]} />
      </mesh>
      <Glow
        position={[0, -0.349, 0]}
        scale={[12, 12, 1]}
        color={palette.pool}
        opacity={0.22}
        flat
      />
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.028}
          color={palette.muted}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </points>
    </>
  );
}
/** Local diagnostics only, like World FrameTelemetry; no transmission/network. Full-pass totals. */
export function StageMetrics({ quality }: { quality: Quality }) {
  const { gl, scene } = useThree(),
    frames = useRef<number[]>([]),
    last = useRef(0),
    calls = useRef({ calls: 0, triangles: 0 });
  useEffect(() => {
    gl.toneMapping =
      quality === 'low' ? T.ACESFilmicToneMapping : T.NoToneMapping;
    gl.toneMappingExposure = 1.08;
  }, [gl, quality]);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    gl.info.reset();
  }, -100);
  useFrame((s, dt) => {
    if (quality === 'low') gl.render(scene, s.camera);
    frames.current.push(dt * 1000);
    calls.current = {
      calls: Math.max(calls.current.calls, gl.info.render.calls),
      triangles: Math.max(calls.current.triangles, gl.info.render.triangles),
    };
    if (s.clock.elapsedTime - last.current > 0.75) {
      const a = frames.current.sort((a, b) => a - b),
        c = gl.domElement;
      c.dataset.frameMs = String(a[Math.floor(a.length / 2)] ?? 0);
      c.dataset.p95Ms = String(a[Math.floor(a.length * 0.95)] ?? 0);
      c.dataset.drawCalls = String(calls.current.calls);
      c.dataset.triangles = String(calls.current.triangles);
      c.dataset.quality = quality;
      c.dataset.ready = 'true';
      frames.current = [];
      calls.current = { calls: 0, triangles: 0 };
      last.current = s.clock.elapsedTime;
    }
  }, 100);
  return null;
}
