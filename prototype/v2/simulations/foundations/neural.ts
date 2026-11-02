/** Deterministic 2→H→1 regression network. Educational, not an LLM. */
export interface NeuralState {
  input: [number, number];
  target: number;
  w1: number[][];
  b1: number[];
  w2: number[];
  b2: number;
  steps: number;
}
export interface NeuralForward {
  hidden: number[];
  prediction: number;
  error: number;
  loss: number;
}
export interface NeuralGradients {
  w1: number[][];
  b1: number[];
  w2: number[];
  b2: number;
}
const finite = (n: number) => Number.isFinite(n);
export function createNeural(
  input: [number, number] = [1, 0.5],
  target = 1,
): NeuralState {
  if (![...input, target].every(finite)) throw new Error('Non-finite input');
  return {
    input: [...input] as [number, number],
    target,
    w1: [
      [0.2, -0.1],
      [-0.3, 0.4],
      [0.6, 0.1],
    ],
    b1: [0.05, -0.02, 0.01],
    w2: [0.3, -0.25, 0.4],
    b2: 0.1,
    steps: 0,
  };
}
export function neuralForward(s: NeuralState): NeuralForward {
  const hidden = s.w1.map((row, i) =>
    Math.tanh(row[0] * s.input[0] + row[1] * s.input[1] + s.b1[i]),
  );
  const prediction = hidden.reduce((sum, h, i) => sum + h * s.w2[i], s.b2);
  const error = prediction - s.target;
  return { hidden, prediction, error, loss: 0.5 * error * error };
}
export function neuralGradients(s: NeuralState): NeuralGradients {
  const { hidden, error } = neuralForward(s);
  const delta = hidden.map((h, i) => error * s.w2[i] * (1 - h * h));
  return {
    w1: delta.map((d) => [d * s.input[0], d * s.input[1]]),
    b1: delta,
    w2: hidden.map((h) => error * h),
    b2: error,
  };
}
export function trainNeural(s: NeuralState, learningRate: number): NeuralState {
  if (!(learningRate > 0 && learningRate <= 1 && finite(learningRate)))
    throw new Error('Invalid learning rate');
  const g = neuralGradients(s);
  return {
    ...s,
    w1: s.w1.map((r, i) => r.map((v, j) => v - learningRate * g.w1[i][j])),
    b1: s.b1.map((v, i) => v - learningRate * g.b1[i]),
    w2: s.w2.map((v, i) => v - learningRate * g.w2[i]),
    b2: s.b2 - learningRate * g.b2,
    steps: s.steps + 1,
  };
}
export function setNeuralInputs(
  s: NeuralState,
  input: [number, number],
  target: number,
): NeuralState {
  if (![...input, target].every(finite))
    throw new Error('Invalid neural inputs');
  return { ...s, input: [...input] as [number, number], target };
}
