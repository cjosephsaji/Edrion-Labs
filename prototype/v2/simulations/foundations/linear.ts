/** A deliberately transparent one-weight model, alongside the preserved tanh network. */
export function linearObservation(
  input: number,
  weight: number,
  target: number,
) {
  const prediction = input * weight;
  const error = prediction - target;
  return { prediction, error, loss: 0.5 * error ** 2, gradient: error * input };
}
