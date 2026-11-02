'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Billboard, Line, useProgress } from '@react-three/drei';
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import type { Simulation, Topic, SimTool } from '../simulations/runtime';
import type { Scene } from '../core/scene-ir';
import { useWorld, places, placePosition } from './store';
import { Asset, WorldText, firstGeometry } from './assets';
import { Anchor, AnchorProjector, worldBounds } from './anchors';
import { CameraRig } from './CameraRig';
import { PetrosGuide } from './PetrosGuide';
import {
  Sky,
  WorldLight,
  Effects,
  FrameTelemetry,
  Atmosphere,
  rendererDpr,
} from './rendering';
import { Stars } from './Particles';
import { PlacePreviews } from './PlacePreviews';
import { ambient, chime, stopAmbience } from './audio';
import c from './world.module.css';
const Neural = lazy(() =>
    import('./Heroes').then((m) => ({ default: m.NeuralHero })),
  ),
  Rocket = lazy(() =>
    import('./Heroes').then((m) => ({ default: m.RocketHero })),
  ),
  Attention = lazy(() =>
    import('./Heroes').then((m) => ({ default: m.AttentionHero })),
  ),
  Traffic = lazy(() =>
    import('./Heroes').then((m) => ({ default: m.TrafficHero })),
  ),
  Relativity = lazy(() =>
    import('./Heroes').then((m) => ({ default: m.RelativityHero })),
  );
interface Props {
  disclosure: string;
  sim: Simulation;
  scene: Scene;
  phase: string;
  assessment?: string;
  speaking: boolean;
  thinking: boolean;
  onTarget: (id: string) => void;
  onTopic: (id: Topic) => void;
  onAction: (tool: SimTool, args?: Record<string, unknown>) => void;
  onBegin: () => void;
  onBeat: (index: number) => void;
  onPause: () => void;
  onReset: () => void;
  onMute: () => void;
}
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className={c.error}>
        <h1>The world needs a fresh start.</h1>
        <p>Your saved lesson is still here.</p>
        <button onClick={() => location.reload()}>Reload Petros World</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Clouds() {
  const quality = useWorld((s) => s.quality),
    count = quality === 'high' ? 18 : quality === 'balanced' ? 12 : 6;
  const { geometry, material } = firstGeometry('cloud'),
    ref = useRef<THREE.InstancedMesh>(null),
    dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996,
        r = 27 + (i % 4) * 11;
      dummy.position.set(
        Math.cos(a) * r,
        -5 -
          (i % 4) * 2 +
          Math.sin(
            (useWorld.getState().reducedMotion ? 0 : clock.elapsedTime) * 0.07 +
              i,
          ) *
            0.15,
        Math.sin(a) * r,
      );
      dummy.scale.setScalar(1.8 + (i % 4) * 0.6);
      dummy.rotation.set(0, i * 0.8, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[geometry, material, count]} />;
}
function WorldLabels({ visit }: { visit: (id: Topic) => void }) {
  const place = useWorld((s) => s.place);
  if (place !== 'hub') return null;
  return (
    <>
      {places.map((p, i) => (
        <group
          key={p.id}
          position={[p.position[0], p.position[1] + 5.4, p.position[2]]}
        >
          <Billboard>
            <WorldText
              display
              fontSize={0.65}
              color="#375448"
              maxWidth={8}
              textAlign="center"
              onClick={() => visit(p.id)}
            >
              {p.title}
            </WorldText>
            {place === 'hub' && (
              <WorldText
                position={[0, -0.65, 0]}
                fontSize={0.2}
                color="#536b5d"
                onClick={() => visit(p.id)}
              >{`0${i + 1} · ${p.short.toUpperCase()}`}</WorldText>
            )}
          </Billboard>
        </group>
      ))}
    </>
  );
}
function SceneNotes({ scene }: { scene: Scene }) {
  const place = useWorld((s) => s.place),
    p = placePosition(place);
  if (place === 'hub') return null;
  const objects = scene.objects.filter((o) => o.revealed),
    cols = objects.length > 4 ? 3 : 2,
    gap = cols === 3 ? 3.3 : 4.8,
    position = (i: number): [number, number, number] => [
      (-(cols - 1) * gap) / 2 + (i % cols) * gap,
      5.5 + Math.floor(i / cols) * 0.75,
      1.6,
    ];
  return (
    <group position={p}>
      {objects.map((o, i) => (
        <Anchor id={o.id} key={o.id}>
          <Billboard position={position(i)}>
            <WorldText
              fontSize={cols === 3 ? 0.17 : 0.21}
              maxWidth={cols === 3 ? 3.1 : 4}
              textAlign="center"
              color="#335748"
              outlineWidth={0.008}
              outlineColor="#e8ddc2"
            >
              {o.content}
            </WorldText>
          </Billboard>
        </Anchor>
      ))}
      {scene.edges.map((edge, i) => {
        const a = objects.findIndex((o) => o.id === edge.fromId),
          b = objects.findIndex((o) => o.id === edge.toId);
        if (a < 0 || b < 0) return null;
        const from = new THREE.Vector3(...position(a)),
          to = new THREE.Vector3(...position(b)),
          direction = to.clone().sub(from).normalize();
        from.addScaledVector(direction, 0.8);
        to.addScaledVector(direction, -0.8);
        return (
          <Line key={i} points={[from, to]} color="#83a494" lineWidth={1.5} />
        );
      })}
    </group>
  );
}
function FloatingNote({ id, text }: { id: string; text: string }) {
  const ref = useRef<THREE.Group>(null),
    point = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const box = worldBounds.get(id);
    if (ref.current) {
      ref.current.visible = !!box;
      if (box) {
        box.getCenter(point);
        point.y = box.max.y + 0.35;
        ref.current.position.copy(point);
      }
    }
  });
  return (
    <group ref={ref}>
      <Billboard>
        <WorldText
          fontSize={0.17}
          maxWidth={3.3}
          color="#826842"
          outlineWidth={0.012}
          outlineColor="#ecdfc5"
          textAlign="center"
        >
          {text}
        </WorldText>
      </Billboard>
    </group>
  );
}
function Ready() {
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      useWorld.getState().patch({ ready: true }),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
function Loader() {
  const { progress, active } = useProgress(),
    ready = useWorld((s) => s.ready);
  if (ready && !active) return null;
  return (
    <div
      className={ready ? c.placeLoading : c.loading}
      role="status"
      aria-label="Loading Petros World"
    >
      <span className={c.loadMark}>p</span>
      <span className={c.loadTitle}>A little wonder is taking shape.</span>
      <span className={c.loadTrack}>
        <i style={{ width: `${Math.max(3, progress)}%` }} />
      </span>
      <small>
        {progress < 100
          ? `${Math.round(progress)}% · opening the islands`
          : 'Finishing the light and details…'}
      </small>
    </div>
  );
}
export default function WorldExperience(props: Props) {
  const root = useRef<HTMLDivElement>(null),
    quality = useWorld((s) => s.quality),
    place = useWorld((s) => s.place),
    opening = useWorld((s) => s.opening),
    ready = useWorld((s) => s.ready),
    tour = useWorld((s) => s.tour),
    muted = useWorld((s) => s.muted),
    settings = useWorld((s) => s.infoOpen),
    callbacks = useRef(props);
  callbacks.current = props;
  const tourTimers = useRef<ReturnType<typeof setTimeout>[]>([]),
    priorTopic = useRef(props.sim.id);
  const visit = (id: Topic) => {
    priorTopic.current = id;
    useWorld.getState().setPlace(id);
    props.onTopic(id);
    if (!muted) chime();
  };
  useEffect(() => {
    if (priorTopic.current !== props.sim.id) {
      priorTopic.current = props.sim.id;
      useWorld.getState().setPlace(props.sim.id);
    }
  }, [props.sim.id]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () =>
      useWorld.getState().patch({ reducedMotion: media.matches });
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    ambient(!muted, place);
    return () => stopAmbience();
  }, [muted, place]);
  const stopTour = () => {
    tourTimers.current.forEach(clearTimeout);
    tourTimers.current = [];
    useWorld.getState().patch({ tour: false, moving: false });
    props.onPause();
  };
  const startTour = () => {
    stopTour();
    useWorld.getState().patch({ opening: false, tour: true, muted: false });
    ambient(true);
    places.forEach((p, i) => {
      const start = i * 24000;
      for (const [delay, fn] of [
        [
          start,
          () => {
            priorTopic.current = p.id;
            useWorld.getState().patch({ place: p.id, opening: false });
            callbacks.current.onTopic(p.id);
          },
        ],
        [start + 5200, () => callbacks.current.onBegin()],
        [start + 10500, () => callbacks.current.onBeat(1)],
        [start + 15500, () => callbacks.current.onBeat(2)],
        [start + 20500, () => callbacks.current.onBeat(3)],
      ] as [number, () => void][]) {
        tourTimers.current.push(setTimeout(fn, delay));
      }
    });
    tourTimers.current.push(
      setTimeout(() => useWorld.getState().patch({ tour: false }), 120000),
    );
  };
  useEffect(() => {
    if (!tour) {
      tourTimers.current.forEach(clearTimeout);
      tourTimers.current = [];
    }
  }, [tour]);
  useEffect(
    () => () => {
      tourTimers.current.forEach(clearTimeout);
      stopAmbience();
    },
    [],
  );
  const enter = () => {
    useWorld.getState().patch({ opening: false, muted: false });
    ambient(true);
  };
  const reset = () => {
    stopTour();
    priorTopic.current = 'neural';
    props.onReset();
    useWorld.getState().reset();
  };
  const heroProps = {
      sim: props.sim,
      onTarget: props.onTarget,
      onAction: props.onAction,
    },
    p = placePosition(props.sim.id);
  return (
    <>
      <div
        ref={root}
        className={c.canvasHost}
        data-testid="petros-world"
        data-petros-id="teaching-surface"
        tabIndex={0}
        aria-label="Petros World. Drag to look around. Scroll to zoom. Choose an island to travel."
      >
        <Boundary>
          <Canvas
            dpr={rendererDpr(quality)}
            shadows={quality !== 'low' ? 'soft' : false}
            camera={{ position: [11, 9, 23], fov: 44, near: 0.1, far: 450 }}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
            }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.92;
              gl.setClearColor('#b7c2c7');
            }}
          >
            <Sky />
            <Stars />
            <fog attach="fog" args={['#c7bcb1', 48, 150]} />
            <WorldLight />
            <Atmosphere />
            <Suspense fallback={null}>
              <Environment
                files="/world-v3/environment.hdr"
                environmentIntensity={0.35}
              />
              <Asset name="archipelago" />
              <Clouds />
              <PlacePreviews />
              <WorldLabels visit={visit} />
              <PetrosGuide
                speaking={props.speaking}
                thinking={props.thinking}
                focus={props.scene.focus}
                phase={props.phase}
                assessment={props.assessment}
              />
              <Ready />
            </Suspense>
            {place !== 'hub' && (
              <group position={p}>
                <Suspense fallback={null}>
                  {props.sim.id === 'neural' ? (
                    <Neural {...heroProps} />
                  ) : props.sim.id === 'rocket' ? (
                    <Rocket {...heroProps} />
                  ) : props.sim.id === 'attention' ? (
                    <Attention {...heroProps} />
                  ) : props.sim.id === 'traffic' ? (
                    <Traffic {...heroProps} />
                  ) : (
                    <Relativity {...heroProps} />
                  )}
                </Suspense>
              </group>
            )}
            <Suspense fallback={null}>
              <SceneNotes scene={props.scene} />
              {props.scene.annotations.map((a) => (
                <FloatingNote key={a.targetId} id={a.targetId} text={a.text} />
              ))}
            </Suspense>
            <CameraRig />
            <AnchorProjector root={root} />
            <Effects />
            <FrameTelemetry />
          </Canvas>
        </Boundary>
      </div>
      <Loader />
      <div className={c.tools} aria-label="World controls">
        <button
          onClick={() =>
            useWorld.getState().patch({ askOpen: !useWorld.getState().askOpen })
          }
          aria-label="Ask Petros a question"
        >
          ?
        </button>
        <button
          onClick={() => {
            props.onMute();
            useWorld.getState().patch({ muted: !muted });
          }}
          aria-label={muted ? 'Unmute world sound' : 'Mute world sound'}
        >
          {muted ? '♪̸' : '♪'}
        </button>
        <button
          onClick={() => useWorld.getState().patch({ infoOpen: !settings })}
          aria-label="World settings and information"
        >
          ⚙
        </button>
      </div>
      {settings && (
        <div className={c.settings}>
          <label>
            Rendering quality
            <select
              aria-label="World quality"
              value={quality}
              onChange={(e) =>
                useWorld.getState().setQuality(e.target.value as any)
              }
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low</option>
            </select>
          </label>
          <p>
            {quality === 'low'
              ? 'Reduced effects, 1K maps and 1.5× resolution on retina displays.'
              : quality === 'high'
                ? '2× retina, screen occlusion, bloom and soft 2K shadows.'
                : '2× retina, baked occlusion and soft contact shadows.'}
          </p>
          <button onClick={() => useWorld.getState().setPlace('hub')}>
            Return to the atrium
          </button>
          <button onClick={reset}>Reset World</button>
          <a className={c.regularTutor} href="/prototype?view=2d">
            Open regular tutor (2D) ↗
          </a>
          <details>
            <summary>Model assumptions & saved session</summary>
            <p>{props.disclosure}</p>
            <p>Progress is local to this browser; no mastery is inferred.</p>
          </details>
        </div>
      )}
      {!opening && (
        <div className={c.tourControl} data-tour-control>
          {tour ? (
            <button onClick={stopTour}>Ⅱ Stop the tour</button>
          ) : (
            <button onClick={startTour}>Start the tour ↗</button>
          )}
          <span>
            {tour
              ? 'A two-minute guided visit · explore at any time'
              : 'Drag to look around · scroll to come closer'}
          </span>
        </div>
      )}
      {opening && ready && (
        <section
          className={c.opening}
          aria-label="Welcome to Petros World"
          data-tour-control
        >
          <span className={c.kicker}>A WORLD FOR YOUR CURIOSITY</span>
          <h1>A world to wonder in.</h1>
          <p>Five islands of discovery. Your little guide is ready.</p>
          <div>
            <button className={c.startTour} onClick={startTour}>
              Start the tour <span>↗</span>
            </button>
            <button className={c.explore} onClick={enter}>
              Explore the islands
            </button>
          </div>
          <small>Learning, at your own pace.</small>
        </section>
      )}
    </>
  );
}
