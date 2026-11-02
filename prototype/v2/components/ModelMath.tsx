import { attentionOf, observe, type Simulation } from '../simulations/runtime';
export function ModelMath({ sim }: { sim: Simulation }) {
  const o = observe(sim),
    fixed = (x: number) => x.toFixed(4);
  if (sim.id === 'attention') {
    const a = attentionOf(sim),
      q = +sim.params.query;
    return (
      <div
        style={{
          fontSize: 12,
          lineHeight: 1.8,
          overflowX: 'auto',
          color: 'var(--ink)',
        }}
      >
        <p>
          Scaled score = Q · K / √4. Mask future scores before softmax; context
          = Σ(weight × V). These deterministic 4D vectors are illustrative, with
          Q = K = V.
        </p>
        <p>
          Q({a.tokens[q]}) = [{a.queries[q].map(fixed).join(', ')}]
        </p>
        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr>
              <th>Key</th>
              <th>Q · K / 2</th>
              <th>Weight</th>
              <th>V</th>
            </tr>
          </thead>
          <tbody>
            {a.tokens.map((token, i) => (
              <tr key={i}>
                <td>{token}</td>
                <td>
                  {sim.params.causal && i > q
                    ? 'masked'
                    : fixed(
                        a.queries[q].reduce(
                          (sum, x, d) => sum + x * a.keys[i][d],
                          0,
                        ) / 2,
                      )}
                </td>
                <td>{fixed(a.weights[q][i])}</td>
                <td>[{a.values[i].map((x) => x.toFixed(2)).join(', ')}]</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Context = [{a.contexts[q].map(fixed).join(', ')}]</p>
      </div>
    );
  }
  const formulas: Record<string, string> = {
    neural:
      sim.params.model === 'linear'
        ? `ŷ = xw = ${fixed(+sim.params.x1)} × ${fixed(+sim.params.weight)} = ${fixed(+o.prediction)}; L = ½(ŷ − y)² = ${fixed(+o.loss)}; dL/dw = (ŷ − y)x = ${fixed(+o.gradient)}. Update: w ← w − η dL/dw.`
        : 'Hidden units: h = tanh(W₁x + b₁); prediction = W₂h + b₂; loss = ½(prediction − target)². Backpropagation uses the exact derivative 1 − tanh².',
    rocket: `a = thrust / (dry mass + remaining fuel) − g = ${fixed(+o.acceleration)} m/s². Integrate at 120 steps/s with midpoint fuel mass. Thrust = ${fixed(+o.thrust)} N; gravity force = ${fixed(+o.mass * +sim.params.gravity)} N. A gentle landing requires |v| ≤ 2 m/s at h = 0.`,
    traffic:
      'Intelligent Driver Model: a = a₀[1 − (v/v₀)⁴ − (s*/s)²], with s* = s₀ + max(0, vT + vΔv/(2√(a₀b))). Numerical gap clamps prevent overlap. A longer following time does not guarantee stability for every density.',
    relativity: `Earth-frame constant-velocity interval: γ = 1/√(1 − β²) = ${fixed(+o.gamma)}; ship proper interval τ = t/γ = ${fixed(+o.shipSeconds)} s for t = ${o.earthSeconds} s. Each inertial frame uses its own simultaneity slices; the Earth-frame interval is not the same event pair as a reversed ship-frame comparison. No turnaround or gravitational effect is modeled.`,
  };
  return (
    <p style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--ink)' }}>
      {formulas[sim.id]}
    </p>
  );
}
