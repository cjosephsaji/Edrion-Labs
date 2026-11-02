'use client';
import { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from './store';
export function Plume({
  throttle,
  enabled,
}: {
  throttle: number;
  enabled: boolean;
}) {
  const quality = useWorld((s) => s.quality),
    count = quality === 'high' ? 420 : quality === 'balanced' ? 220 : 70;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry(),
      positions = new Float32Array(count * 3),
      seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds.set(
        [
          ((i * 73.37) % 100) / 100,
          ((i * 17.53) % 100) / 100,
          ((i * 43.17) % 100) / 100,
        ],
        i * 3,
      );
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { time: { value: 0 }, throttle: { value: throttle } },
        vertexShader: `attribute vec3 seed;uniform float time;uniform float throttle;varying float life;void main(){float t=fract(seed.x+time*1.3);life=1.-t;float a=seed.y*6.283;float r=seed.z*(.03+t*.3);vec3 p=vec3(cos(a)*r,-t*(.4+throttle*2.5),sin(a)*r);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=(20.+seed.z*20.)*life/max(1.,-mv.z*.15);}`,
        fragmentShader: `varying float life;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,0.,d)*life*.6;vec3 color=mix(vec3(.8,.14,.025),vec3(1.,.72,.25),life);gl_FragColor=vec4(color*2.,a);}`,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    material.uniforms.time.value = clock.elapsedTime;
    material.uniforms.throttle.value = throttle;
  });
  return enabled ? (
    <points geometry={geometry} material={material} frustumCulled={false} />
  ) : null;
}
export function Stars() {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry(),
      a = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      const theta = i * 2.39996,
        y = 0.15 + (i % 31) / 40,
        r = 130;
      a.set(
        [
          Math.cos(theta) * r * Math.sqrt(1 - y * y),
          y * r,
          Math.sin(theta) * r * Math.sqrt(1 - y * y),
        ],
        i * 3,
      );
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  return (
    <points geometry={geom}>
      <pointsMaterial
        color="#eddac0"
        size={0.16}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
      />
    </points>
  );
}
