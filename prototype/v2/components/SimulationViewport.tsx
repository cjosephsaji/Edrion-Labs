'use client';
import { useEffect, useRef, useState } from 'react';
import {
  attentionOf,
  observe,
  trafficFront,
  type Simulation,
} from '../simulations/runtime';
import { neuralForward } from '../simulations/foundations/neural';
const fmt = (n: number, d = 2) => n.toFixed(d);
export function SimulationViewport({
  sim,
  onTarget,
}: {
  sim: Simulation;
  onTarget: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [compact, setCompact] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) =>
      setCompact(e.contentRect.width < 510),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const w = compact ? 360 : 720;
  let h = compact ? 330 : 380;
  if (sim.id === 'attention') {
    const n = String(sim.params.tokens).trim().split(/\s+/).length;
    h = Math.max(h, n * Math.min(compact ? 35 : 43, (w - 100) / n) + 150);
  }
  const anchor = (id: string) => ({
    'data-petros-id': id,
    onClick: () => onTarget(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') onTarget(id);
    },
    tabIndex: 0,
    role: 'button',
    'aria-label': `Point to ${id}`,
  });
  const o = observe(sim);
  let content;
  if (sim.id === 'neural') {
    const s = sim.data.neural!,
      f = neuralForward(s),
      xs = [w * 0.14, w * 0.5, w * 0.86],
      ys = [85, h / 2, h - 85];
    const node = (
      x: number,
      y: number,
      value: number,
      id: string,
      label: string,
    ) => (
      <g key={id} {...anchor(id)}>
        <circle
          cx={x}
          cy={y}
          r={compact ? 25 : 33}
          fill={value >= 0 ? '#e0ebdd' : '#f6dfcf'}
          stroke={value >= 0 ? '#427450' : '#b77553'}
          strokeWidth="1.5"
        />
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fontSize={compact ? 14 : 18}
          fill="var(--ink)"
        >
          {fmt(value)}
        </text>
        <text
          x={x}
          y={y + 49}
          textAnchor="middle"
          fontSize={compact ? 12 : 14}
          fill="var(--muted)"
        >
          {label}
        </text>
      </g>
    );
    content = (
      <>
        <text x={xs[0]} y="25" textAnchor="middle">
          INPUT
        </text>
        <text x={xs[1]} y="25" textAnchor="middle">
          TANH LAYER
        </text>
        <text x={xs[2]} y="25" textAnchor="middle">
          OUTPUT
        </text>
        {s.w1.flatMap((row, i) =>
          row.map((weight, j) => (
            <path
              key={`in-${i}-${j}`}
              data-edge-from={`input-${j}`}
              data-edge-to={`hidden-${i}`}
              d={`M${xs[0] + 25} ${h * (j ? 0.67 : 0.33)} C${w * 0.33} ${h * (j ? 0.67 : 0.33)},${w * 0.33} ${ys[i]},${xs[1] - 25} ${ys[i]}`}
              stroke={weight > 0 ? '#6c9c77' : '#d69d7e'}
              strokeWidth={1 + Math.min(3, Math.abs(weight) * 3)}
              opacity=".7"
              fill="none"
            />
          )),
        )}
        {s.w2.map((weight, i) => (
          <path
            key={i}
            data-edge-from={`hidden-${i}`}
            data-edge-to="prediction"
            d={`M${xs[1] + 25} ${ys[i]} C${w * 0.7} ${ys[i]},${w * 0.7} ${h / 2},${xs[2] - 25} ${h / 2}`}
            stroke={weight > 0 ? '#6c9c77' : '#d69d7e'}
            strokeWidth={1 + Math.min(3, Math.abs(weight) * 3)}
            fill="none"
          />
        ))}
        {s.input.map((v, i) =>
          node(xs[0], h * (i ? 0.67 : 0.33), v, `input-${i}`, `x${i + 1}`),
        )}
        {f.hidden.map((v, i) =>
          node(xs[1], ys[i], v, `hidden-${i}`, `h${i + 1}`),
        )}
        {node(xs[2], h / 2, f.prediction, 'prediction', 'prediction')}
        <text x={w / 2} y={h - 5} textAnchor="middle" fontSize="13">
          green = positive weight · terracotta = negative weight
        </text>
      </>
    );
  } else if (sim.id === 'rocket') {
    const r = sim.data.rocket!,
      top = 35,
      ground = h - 40,
      scale =
        (ground - top) / Math.max(+sim.params.altitude * 1.15, r.altitude + 15),
      y = ground - r.altitude * scale;
    content = (
      <>
        <path
          d={`M30 ${ground} H${w - 25}`}
          stroke="#899c82"
          strokeWidth="2"
          {...anchor('ground')}
        />
        <path
          d={`M${w * 0.25} ${top} V${ground}`}
          stroke="var(--line)"
          strokeDasharray="4 5"
        />
        <text x="30" y="22" fontSize="13">
          VERTICAL FLIGHT / UP IS POSITIVE
        </text>
        <g
          {...anchor('rocket')}
          transform={`translate(${w * 0.48},${Math.min(ground - 25, y)})`}
        >
          <path
            d="M-18 25 L-31 39 L-28 7 L-15 -5 M18 25 L31 39 L28 7 L15 -5"
            fill="#42664d"
          />
          <path
            d="M-17 27 V-20 Q-15 -43 0 -54 Q15 -43 17 -20 V27Z"
            fill="#f9f7ed"
            stroke="#55715b"
            strokeWidth="2"
          />
          <path
            d="M-16 -17 Q0 -25 16 -17"
            fill="none"
            stroke="#c79b4c"
            strokeWidth="5"
          />
          <circle cx="0" cy="-5" r="7" fill="#a4c6cf" stroke="#55715b" />
          {r.fuelMass > 0 &&
            +sim.params.throttle > 0 &&
            r.status === 'flying' && (
              <path
                d={`M-11 28 Q0 ${50 + 35 * +sim.params.throttle} 11 28`}
                fill="#e5ad50"
                opacity=".9"
              />
            )}
        </g>
        <g {...anchor('altitude')}>
          <text
            x={w * 0.72}
            y={h * 0.4}
            fontSize={compact ? 22 : 32}
            fill="var(--ink)"
          >
            {fmt(r.altitude, 1)} m
          </text>
          <text x={w * 0.72} y={h * 0.4 + 23} fontSize="14">
            altitude
          </text>
        </g>
        <g {...anchor('velocity')}>
          <text
            x={w * 0.72}
            y={h * 0.64}
            fontSize={compact ? 20 : 27}
            fill="#ae704a"
          >
            {fmt(r.velocity, 1)}
          </text>
          <text x={w * 0.72} y={h * 0.64 + 22} fontSize="13">
            m/s velocity
          </text>
        </g>
        <g {...anchor('fuel')}>
          <rect x="40" y="65" width="10" height="100" fill="#e7e8dc" rx="5" />
          <rect
            x="40"
            y={165 - (100 * r.fuelMass) / Math.max(1, +sim.params.fuel)}
            width="10"
            height={(100 * r.fuelMass) / Math.max(1, +sim.params.fuel)}
            fill="#6b8d5d"
            rx="5"
          />
          <text x="30" y="188" fontSize="12">
            fuel
          </text>
        </g>
        <text x="30" y={h - 10} fontSize="14">
          {r.status === 'flying'
            ? `t = ${r.time.toFixed(2)} s`
            : r.status === 'landed'
              ? 'Soft touchdown'
              : 'Impact — try a different burn'}
        </text>
      </>
    );
  } else if (sim.id === 'attention') {
    const a = attentionOf(sim),
      n = a.tokens.length,
      q = Math.min(+sim.params.query, n - 1),
      cell = Math.min(compact ? 35 : 43, (w - 100) / n),
      left = (w - n * cell) / 2 + 12,
      top = 65;
    content = (
      <>
        <text x={w / 2} y="22" textAnchor="middle" fontSize="14">
          SCALED DOT PRODUCT → SOFTMAX → CONTEXT
        </text>
        {a.tokens.map((t, i) => (
          <g key={i} {...anchor(`token-${i}`)}>
            <text
              x={left - 9}
              y={top + i * cell + cell * 0.64}
              textAnchor="end"
              fontSize={compact ? 11 : 14}
              fill={i === q ? 'var(--green)' : 'var(--muted)'}
            >
              {t}
            </text>
            <text
              transform={`translate(${left + i * cell + cell * 0.6},${top - 9}) rotate(-35)`}
              fontSize={compact ? 11 : 13}
            >
              {t}
            </text>
          </g>
        ))}
        <g {...anchor('attention-matrix')}>
          {a.weights.flatMap((row, i) =>
            row.map((v, j) => (
              <g key={`${i}-${j}`}>
                <rect
                  x={left + j * cell}
                  y={top + i * cell}
                  width={cell - 3}
                  height={cell - 3}
                  rx="5"
                  fill={
                    v === 0 ? '#eae9df' : `rgba(55,110,77,${0.15 + 0.85 * v})`
                  }
                  stroke={i === q ? '#bd9143' : 'none'}
                  strokeWidth="1.5"
                />
                <text
                  x={left + j * cell + (cell - 3) / 2}
                  y={top + i * cell + cell * 0.6}
                  textAnchor="middle"
                  fontSize={compact ? 10 : 12}
                  fill={v > 0.5 ? '#fff' : '#36513e'}
                >
                  {v === 0 ? '—' : v.toFixed(2)}
                </text>
              </g>
            )),
          )}
        </g>
        <g {...anchor('context')}>
          <text
            x={w / 2}
            y={Math.min(h - 38, top + n * cell + 35)}
            textAnchor="middle"
            fontSize={compact ? 13 : 16}
          >
            context({a.tokens[q]}) = [
            {a.contexts[q].map((v) => v.toFixed(2)).join(', ')}]
          </text>
          <text
            x={w / 2}
            y={Math.min(h - 14, top + n * cell + 58)}
            textAnchor="middle"
            fontSize="12"
          >
            row = query · column = key · each row sums to 1
          </text>
        </g>
      </>
    );
  } else if (sim.id === 'traffic') {
    const cars = sim.data.traffic!.cars,
      cx = w / 2,
      cy = h / 2,
      rx = w * 0.35,
      ry = h * 0.34,
      slowest = trafficFront(sim).car;
    content = (
      <>
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke="#e5e6db"
          strokeWidth="34"
          fill="none"
          {...anchor('ring')}
        />
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke="#bfc8b6"
          strokeWidth="1"
          fill="none"
          strokeDasharray="6 9"
        />
        {cars.map((c) => {
          const angle = (c.position / 350) * Math.PI * 2,
            x = cx + rx * Math.cos(angle),
            y = cy + ry * Math.sin(angle);
          return (
            <g key={c.id} {...anchor(c.id)}>
              <g
                transform={`translate(${x},${y}) rotate(${(angle * 180) / Math.PI + 90})`}
              >
                <rect
                  x="-6"
                  y="-11"
                  width="12"
                  height="22"
                  rx="4"
                  fill={
                    c.speed < 6
                      ? '#bf805d'
                      : c.id === 'car_0'
                        ? '#c5a04b'
                        : '#547f60'
                  }
                />
                <rect
                  x="-4"
                  y="-6"
                  width="8"
                  height="5"
                  rx="1"
                  fill="#e4ebe1"
                />
              </g>
            </g>
          );
        })}
        <g {...anchor('jam-front')}>
          <circle
            cx={cx + rx * Math.cos((slowest.position / 350) * Math.PI * 2)}
            cy={cy + ry * Math.sin((slowest.position / 350) * Math.PI * 2)}
            r="17"
            fill="transparent"
            stroke="#bd7954"
            strokeWidth="2"
            strokeDasharray="3 3"
          />
        </g>
        <text
          x={cx}
          y={cy - 13}
          textAnchor="middle"
          fontSize={compact ? 27 : 40}
          fill="var(--ink)"
        >
          {Number(o.meanSpeed).toFixed(1)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="14">
          mean speed · m/s
        </text>
        <text x={cx} y={cy + 36} textAnchor="middle" fontSize="12">
          350 m / one lane
        </text>
        <text x={w / 2} y={h - 9} textAnchor="middle" fontSize="12">
          gold = braked car · dashed = downstream speed boundary
        </text>
      </>
    );
  } else {
    const beta = +sim.params.beta,
      gamma = +o.gamma,
      shipFrame = sim.params.frame === 'ship',
      origin = { x: w * 0.5, y: h - 32 },
      span = h - 80,
      tilt = shipFrame ? -beta : beta;
    const clock = (
      x: number,
      y: number,
      id: string,
      name: string,
      t: number,
    ) => {
      const a = ((t % 12) / 12) * Math.PI * 2;
      return (
        <g {...anchor(id)}>
          <circle
            cx={x}
            cy={y}
            r={compact ? 29 : 37}
            fill="#f8f6ec"
            stroke={id === 'ship-clock' ? '#b58d46' : '#70916c'}
            strokeWidth="2"
          />
          <path
            d={`M${x} ${y} L${x + Math.sin(a) * 23} ${y - Math.cos(a) * 23}`}
            stroke="#375e43"
            strokeWidth="2"
          />
          <circle cx={x} cy={y} r="3" fill="#375e43" />
          <text x={x} y={y + 57} textAnchor="middle" fontSize="13">
            {name}
          </text>
          <text
            x={x}
            y={y + 77}
            textAnchor="middle"
            fontSize="17"
            fill="var(--ink)"
          >
            {t.toFixed(2)} s
          </text>
        </g>
      );
    };
    content = (
      <>
        <path
          d={`M${origin.x} ${origin.y} V45 M30 ${origin.y} H${w - 22}`}
          stroke="#bec7b7"
        />
        <path
          d={`M${origin.x - span} ${origin.y - span} L${origin.x} ${origin.y} L${origin.x + span} ${origin.y - span}`}
          fill="none"
          stroke="#d4bc7d"
          strokeDasharray="5 6"
          {...anchor('light-cone')}
        />
        <path
          d={`M${origin.x} ${origin.y} L${origin.x + tilt * span} ${origin.y - span}`}
          stroke="#b98a43"
          strokeWidth="3"
          {...anchor('worldline')}
        />
        <path
          d={`M${origin.x} ${origin.y} V${origin.y - span}`}
          stroke="#557f60"
          strokeWidth="3"
        />
        <text x={origin.x + 10} y="31" fontSize="13">
          ct · s
        </text>
        <text x={w - 43} y={h - 9} fontSize="13">
          x · ls
        </text>
        {clock(
          w * 0.19,
          105,
          'earth-clock',
          shipFrame ? 'Earth · ship slice' : 'Earth clock',
          shipFrame ? sim.time / (gamma * gamma) : sim.time,
        )}
        {clock(
          w * 0.79,
          105,
          'ship-clock',
          shipFrame ? 'Ship frame clock' : 'Ship proper time',
          sim.time / gamma,
        )}
        <g {...anchor('gamma')}>
          <text
            x={w * 0.2}
            y={h * 0.74}
            fontSize={compact ? 22 : 32}
            fill="var(--ink)"
          >
            γ = {gamma.toFixed(3)}
          </text>
          <text x={w * 0.2} y={h * 0.74 + 24} fontSize="12">
            τ = t / γ
          </text>
        </g>
      </>
    );
  }
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${sim.id} live simulation`}
        style={{
          width: '100%',
          display: 'block',
          maxHeight: 420,
          fontFamily: 'inherit',
          fontSize: compact ? 11 : 13,
          fill: 'var(--muted)',
        }}
      >
        {content}
      </svg>
    </div>
  );
}
