'use client';
import { useEffect, useRef, useState } from 'react';
import {
  attentionOf,
  observe,
  trafficFront,
  type Simulation,
} from '../simulations/runtime';
import { SimulationViewport } from './SimulationViewport';
export function FocusScene({
  sim,
  onTarget,
}: {
  sim: Simulation;
  onTarget: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    [small, setSmall] = useState(false);
  useEffect(() => {
    const r = new ResizeObserver(([e]) => setSmall(e.contentRect.width < 520));
    if (root.current) r.observe(root.current);
    return () => r.disconnect();
  }, []);
  const w = small ? 400 : 800,
    h = small ? 330 : 370,
    o = observe(sim);
  const anchor = (id: string) => ({
    'data-petros-id': id,
    role: 'button',
    tabIndex: 0,
    'aria-label': `Point to ${id}`,
    onClick: () => onTarget(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') onTarget(id);
    },
  });
  const text = (
    x: number,
    y: number,
    value: string,
    size = 15,
    color = '#4f6559',
    center = true,
  ) => (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={color}
      textAnchor={center ? 'middle' : 'start'}
    >
      {value}
    </text>
  );
  const arrow = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = '#af8650',
  ) => (
    <path
      d={`M${x1} ${y1} L${x2} ${y2}`}
      stroke={color}
      strokeWidth="3"
      markerEnd="url(#focus-arrow)"
      fill="none"
    />
  );
  let drawing;
  if (sim.id === 'neural') {
    if (sim.params.model !== 'linear')
      return <SimulationViewport sim={sim} onTarget={onTarget} />;
    const xs = [w * 0.14, w * 0.5, w * 0.85],
      y = h * 0.43,
      radius = small ? 37 : 48;
    drawing = (
      <>
        {text(
          w / 2,
          29,
          'ONE INPUT. ONE WEIGHT. ONE LEARNING MOMENT.',
          small ? 10 : 12,
        )}
        <path
          d={`M${xs[0] + radius} ${y} C${w * 0.35} ${y},${w * 0.65} ${y},${xs[2] - radius} ${y}`}
          stroke="#abc0a7"
          strokeWidth="9"
          fill="none"
        />
        <path
          d={`M${xs[0] + radius} ${y} H${xs[2] - radius - 8}`}
          stroke="#4f8061"
          strokeWidth="2"
          markerEnd="url(#focus-arrow)"
          strokeDasharray="5 8"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="52"
            to="0"
            dur="2s"
            repeatCount="indefinite"
          />
        </path>
        <g {...anchor('input-0')}>
          <circle
            cx={xs[0]}
            cy={y}
            r={radius}
            fill="#e8efe1"
            stroke="#97b08c"
          />
          {text(xs[0], y + 9, Number(sim.params.x1).toFixed(1), 28)}
          {text(xs[0], y + radius + 27, 'input', 13)}
        </g>
        <g {...anchor('weight')}>
          <rect
            x={xs[1] - (small ? 48 : 65)}
            y={y - 24}
            width={small ? 96 : 130}
            height="48"
            rx="24"
            fill="#f7ecd0"
            stroke="#cfb06e"
          />
          {text(
            xs[1],
            y + 6,
            `× ${Number(sim.params.weight).toFixed(2)}`,
            small ? 20 : 25,
            '#8c6a32',
          )}
          {text(xs[1], y + 65, 'adjustable weight', 13)}
        </g>
        <g {...anchor('prediction')}>
          <circle cx={xs[2]} cy={y} r={radius} fill="#355f49" />
          {text(xs[2], y + 9, Number(o.prediction).toFixed(1), 28, '#fffaf0')}
          {text(xs[2], y + radius + 27, 'prediction', 13)}
        </g>
        <g {...anchor('target')}>
          {text(
            w / 2,
            h - 72,
            `Our target is ${Number(sim.params.target).toFixed(1)}`,
            21,
            '#315940',
          )}
        </g>
        <g {...anchor('loss')}>
          {text(
            w / 2,
            h - 37,
            `½ × (${Number(o.prediction).toFixed(1)} − ${Number(sim.params.target).toFixed(1)})² = ${Number(o.loss).toFixed(3)}`,
            small ? 16 : 20,
            '#a2774c',
          )}
          {text(
            w / 2,
            h - 13,
            'half squared error · smaller means a closer prediction',
            small ? 10 : 12,
          )}
        </g>
      </>
    );
  } else if (sim.id === 'attention') {
    const a = attentionOf(sim),
      n = a.tokens.length,
      q = +sim.params.query,
      columns = small ? Math.min(3, n) : Math.min(6, n),
      gap = (w - 40) / columns;
    const pos = (i: number) => ({
      x: 20 + gap * (i % columns) + gap / 2,
      y: 165 + Math.floor(i / columns) * 75,
    });
    drawing = (
      <>
        {text(w / 2, 28, 'A WORD GATHERS ITS CONTEXT', 13)}
        <g {...anchor('context')}>
          <rect
            x={w / 2 - 70}
            y="57"
            width="140"
            height="49"
            rx="17"
            fill="#d9b875"
          />
          {text(w / 2, 88, a.tokens[q], 24, '#463f29')}
          {text(w / 2, 128, 'QUERY · where we are looking', 11)}
        </g>
        {a.tokens.map((token, i) => {
          const p = pos(i),
            share = a.weights[q][i];
          return (
            <g key={i} {...anchor(`token-${i}`)}>
              <path
                d={`M${w / 2} 107 Q${p.x} 119 ${p.x} ${p.y}`}
                stroke={share === 0 ? '#d9ded5' : '#4c8467'}
                strokeWidth={1 + share * 12}
                fill="none"
                opacity={share === 0 ? 0.25 : 0.7}
              />
              <rect
                x={p.x - gap * 0.41}
                y={p.y}
                width={gap * 0.82}
                height="43"
                rx="12"
                fill={i === q ? '#f4e7c7' : '#e6eee3'}
                stroke="#c0cfb9"
              />
              {text(p.x, p.y + 27, token, small ? 16 : 20)}
              {text(
                p.x,
                p.y + 61,
                share === 0 ? 'masked' : `${(share * 100).toFixed(1)}%`,
                12,
                share === 0 ? '#9b9f93' : '#54785b',
              )}
            </g>
          );
        })}
        {text(
          w / 2,
          h - 16,
          'Toy vectors · each share is computed · tap a word to inspect',
          small ? 10 : 12,
        )}
      </>
    );
  } else if (sim.id === 'rocket') {
    const r = sim.data.rocket!,
      base = h - 43,
      ry = Math.max(
        91,
        base - (r.altitude / Math.max(140, +sim.params.altitude)) * (h - 150),
      ),
      rx = w * 0.4;
    drawing = (
      <>
        <rect width={w} height={h} rx="16" fill="url(#focus-sky)" />
        <path
          d={`M0 ${base - 38} L${w * 0.15} ${base - 75} L${w * 0.32} ${base - 30} L${w * 0.52} ${base - 60} L${w * 0.75} ${base - 25} L${w} ${base - 65} V${h} H0Z`}
          fill="#d4ddd0"
        />
        <path
          d={`M0 ${base} Q${w / 2} ${base - 20} ${w} ${base} V${h} H0Z`}
          fill="#b4c0a4"
        />
        <g {...anchor('ground')}>
          <ellipse
            cx={rx}
            cy={base}
            rx={small ? 57 : 85}
            ry="13"
            fill="#5d6b62"
            stroke="#e5e5cf"
            strokeWidth="3"
          />
          <path
            d={`M${rx - 22} ${base} H${rx + 22} M${rx} ${base - 8} V${base + 8}`}
            stroke="#eee4bd"
            strokeWidth="3"
          />
        </g>
        <g
          {...anchor('rocket')}
          transform={`translate(${rx},${Math.min(base - 30, ry)})`}
        >
          <path
            d="M-14 18 L-29 38 L-25 9 L-12 -4 M14 18 L29 38 L25 9 L12 -4"
            fill="#446e59"
            stroke="#2c4e3d"
          />
          <path
            d="M-14 23 V-31 Q-14 -49 0 -62 Q14 -49 14 -31 V23Z"
            fill="#f8f6ed"
            stroke="#536759"
            strokeWidth="1.8"
          />
          <path d="M-14 -21 H14 M-14 13 H14" stroke="#bb9860" strokeWidth="5" />
          <circle cy="-7" r="7" fill="#80aebe" stroke="#3f697b" />
          {r.fuelMass > 0 &&
            +sim.params.throttle > 0 &&
            r.status === 'flying' && (
              <path
                d={`M-9 25 Q0 ${42 + +sim.params.throttle * 35} 9 25Z`}
                fill="#e8a24d"
              >
                <animate
                  attributeName="opacity"
                  values=".65;1;.65"
                  dur=".3s"
                  repeatCount="indefinite"
                />
              </path>
            )}
          {arrow(-43, -10, -43, 44, '#b37559')}
          {arrow(43, 33, 43, 33 - +sim.params.throttle * 88, '#547e5b')}
        </g>
        {text(w * 0.15, 33, '↓ GRAVITY', 11, '#9c684d')}
        {text(w * 0.43, 33, '↑ THRUST', 11, '#456c54')}
        <g {...anchor('altitude')}>
          {text(w * 0.8, 92, `${r.altitude.toFixed(1)} m`, small ? 22 : 32)}
          {text(w * 0.8, 116, 'ALTITUDE', 10)}
        </g>
        <g {...anchor('velocity')}>
          {text(
            w * 0.8,
            163,
            `${r.velocity.toFixed(1)}`,
            small ? 25 : 32,
            '#a76d4b',
          )}
          {text(w * 0.8, 187, 'VELOCITY · m/s', 10)}
        </g>
        <g {...anchor('fuel')}>
          {text(w * 0.8, 228, `${r.fuelMass.toFixed(0)} kg`, 20)}
          {text(w * 0.8, 249, 'FUEL REMAINING', 10)}
        </g>
        {text(
          w / 2,
          h - 12,
          'Vertical-flight model · upward is positive · distance compressed',
          small ? 10 : 12,
          '#f9f7e9',
        )}
      </>
    );
  } else if (sim.id === 'traffic') {
    const cx = w / 2,
      cy = h / 2 + 7,
      rx = w * 0.39,
      ry = h * 0.33,
      front = trafficFront(sim),
      cars = sim.data.traffic!.cars;
    drawing = (
      <>
        <rect width={w} height={h} rx="16" fill="#eff0e6" />
        <ellipse cx={cx} cy={cy} rx={rx + 17} ry={ry + 17} fill="#cad7bf" />
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke="#5c6965"
          strokeWidth="32"
          fill="#e1e6d7"
          {...anchor('ring')}
        />
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke="#e6dfb7"
          strokeWidth="1.5"
          strokeDasharray="8 12"
          fill="none"
        />
        {Array.from({ length: small ? 4 : 8 }, (_, i) => (
          <g
            key={i}
            transform={`translate(${cx - (small ? 65 : 160) + i * (small ? 45 : 47)},${cy + 41})`}
          >
            <rect
              x="-12"
              y="-20"
              width="27"
              height={i % 2 ? 35 : 26}
              fill={i % 2 ? '#adbcb1' : '#c5c9b7'}
              rx="3"
            />
            <rect x="-7" y="-17" width="5" height="8" fill="#e9ecdf" />
            <rect x="4" y="-17" width="5" height="8" fill="#e9ecdf" />
          </g>
        ))}
        {cars.map((c) => {
          const a = (c.position / 350) * Math.PI * 2;
          return (
            <g
              key={c.id}
              {...anchor(c.id)}
              transform={`translate(${cx + rx * Math.cos(a)},${cy + ry * Math.sin(a)}) rotate(${(a * 180) / Math.PI + 90})`}
            >
              <rect
                x="-7"
                y="-13"
                width="14"
                height="26"
                rx="4"
                fill={
                  c.speed < 6
                    ? '#c87858'
                    : c.id === 'car_0'
                      ? '#e6be61'
                      : '#89b29d'
                }
                stroke="#354d46"
                strokeWidth=".8"
              />
              <rect x="-5" y="-8" width="10" height="6" rx="1" fill="#e0edf0" />
              <rect x="-5" y="5" width="10" height="4" rx="1" fill="#54747a" />
              <path
                d="M-6 -12 H-3 M3 -12 H6"
                stroke="#fff8d3"
                strokeWidth="2"
              />
            </g>
          );
        })}
        {front.exists && (
          <g {...anchor('jam-front')}>
            <circle
              cx={cx + rx * Math.cos((front.car.position / 350) * Math.PI * 2)}
              cy={cy + ry * Math.sin((front.car.position / 350) * Math.PI * 2)}
              r="22"
              fill="none"
              stroke="#c77850"
              strokeWidth="3"
              strokeDasharray="4 3"
            />
          </g>
        )}
        {!front.exists && (
          <g {...anchor('jam-front')}>
            <circle cx={cx} cy={cy} r="1" fill="transparent" />
          </g>
        )}
        {text(
          cx,
          cy - 20,
          `${Number(o.meanSpeed).toFixed(1)} m/s`,
          small ? 25 : 35,
        )}
        {text(cx, cy + 2, 'mean speed · 350 m one-lane road', small ? 10 : 12)}
        {text(
          cx,
          25,
          'CARS TRAVEL →   ·   A SLOWDOWN CAN TRAVEL ←',
          small ? 10 : 12,
        )}
        {text(
          cx,
          h - 10,
          'gold = briefly braked car · terracotta = slow cars',
          small ? 10 : 12,
        )}
      </>
    );
  } else {
    const gamma = +o.gamma,
      moving = sim.time > 0 ? sim.time : +sim.params.duration;
    const clock = (
      x: number,
      y: number,
      id: string,
      time: number,
      title: string,
      color: string,
    ) => (
      <g {...anchor(id)}>
        <rect
          x={x - (small ? 70 : 103)}
          y={y - 45}
          width={small ? 140 : 206}
          height="100"
          rx="17"
          fill="#faf9f0"
          stroke={color}
          strokeWidth="1.5"
        />
        {text(x, y - 18, title, small ? 11 : 13, color)}
        {text(x, y + 23, `${time.toFixed(2)} s`, small ? 27 : 35, '#3b5546')}
      </g>
    );
    drawing = (
      <>
        <rect width={w} height={h} rx="16" fill="#1e3640" />
        {Array.from({ length: 48 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 137.5 + 17) % w}
            cy={(i * 61.3 + 29) % (h - 40)}
            r={i % 5 === 0 ? 1.7 : 0.8}
            fill="#f1e8d2"
            opacity={0.25 + (i % 5) * 0.14}
          />
        ))}
        <g>
          <circle cx={w * 0.22} cy="101" r={small ? 37 : 49} fill="#77b8c7" />
          <path
            d={`M${w * 0.22 - 30} 80 q22 -22 40 -2 l-9 20 17 5 -17 27 -21 -6 6 -24 -16 -9Z`}
            fill="#8aaf7e"
          />
          <circle
            cx={w * 0.22}
            cy="101"
            r={small ? 40 : 52}
            fill="none"
            stroke="#b3dce0"
            opacity=".45"
          />
          {text(w * 0.22, 164, 'EARTH', 11, '#c9e2dc')}
        </g>
        <g
          transform={`translate(${w * (0.66 + 0.18 * Math.min(1, sim.time / +sim.params.duration))},104)`}
        >
          <path
            d="M-58 10 L-20 -5 15 -43 22 -39 16 -6 52 2 64 9 28 19 -12 15 -40 33 -48 29 -27 11Z"
            fill="#e9e9da"
            stroke="#96aba6"
            strokeWidth="1.4"
          />
          <path d="M-4 1 L18 -4 32 3 9 5Z" fill="#6895a7" />
          <path d="M-59 6 L-82 10 -59 15Z" fill="#dfac65" />
          {arrow(-30, -62, 54, -62, '#dcb86f')}
          {text(
            0,
            60,
            `${Number(sim.params.beta).toFixed(3)}c →`,
            13,
            '#e4ca8c',
          )}
        </g>
        {clock(
          w * 0.24,
          h - 108,
          'earth-clock',
          moving,
          'EARTH COORDINATE TIME',
          '#6f947f',
        )}
        {clock(
          w * 0.76,
          h - 108,
          'ship-clock',
          moving / gamma,
          'SHIP PROPER TIME',
          '#b8944f',
        )}
        <g {...anchor('gamma')}>
          {text(
            w / 2,
            h - 29,
            `Earth frame · γ = ${gamma.toFixed(4)} · τ = t / γ`,
            small ? 12 : 16,
            '#e2d4a8',
          )}
        </g>
        {text(
          w / 2,
          h - 10,
          sim.time === 0
            ? 'Preview of the selected constant-velocity interval'
            : 'Constant velocity · no gravity or turnaround',
          10,
          '#afc7c5',
        )}
        <g {...anchor('worldline')}>
          <path
            d={`M${w * 0.24} 177 H${w * 0.76}`}
            stroke="#b29458"
            strokeDasharray="4 6"
          />
        </g>
        <g {...anchor('light-cone')}>
          <path
            d={`M${w / 2 - 4} 175 l4 -5 4 5`}
            stroke="#d8ccaa"
            fill="none"
          />
        </g>
      </>
    );
  }
  return (
    <div ref={root} style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${sim.id} live simulation`}
        style={{
          display: 'block',
          width: '100%',
          maxHeight: 420,
          fontFamily: 'inherit',
        }}
      >
        <defs>
          <marker
            id="focus-arrow"
            markerWidth="6"
            markerHeight="6"
            refX="4"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 L5 3 L0 6" fill="none" stroke="context-stroke" />
          </marker>
          <linearGradient id="focus-sky" x2="0" y2="1">
            <stop stopColor="#dceaf0" />
            <stop offset="1" stopColor="#f0eee0" />
          </linearGradient>
        </defs>
        {drawing}
      </svg>
    </div>
  );
}
