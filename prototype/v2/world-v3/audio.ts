let context: AudioContext | undefined;
let master: GainNode | undefined;
const oscillators: OscillatorNode[] = [];
const analysers = new Set<{
  audio: HTMLMediaElement;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  silent: GainNode;
}>();
function ctx() {
  if (!context && typeof AudioContext !== 'undefined')
    context = new AudioContext();
  return context;
}
export function tapSpeech(audio: HTMLMediaElement) {
  const start = () => {
    try {
      const c = ctx();
      if (!c) return;
      void c.resume();
      const stream =
        audio.srcObject instanceof MediaStream
          ? audio.srcObject
          : (
              audio as HTMLMediaElement & { captureStream?: () => MediaStream }
            ).captureStream?.();
      if (!stream?.getAudioTracks().length) return;
      const source = c.createMediaStreamSource(stream),
        analyser = c.createAnalyser(),
        silent = c.createGain();
      silent.gain.value = 0;
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(silent);
      silent.connect(c.destination);
      const entry = { audio, analyser, source, silent };
      analysers.add(entry);
      const clean = () => {
        source.disconnect();
        analyser.disconnect();
        silent.disconnect();
        analysers.delete(entry);
      };
      audio.addEventListener('ended', clean, { once: true });
      audio.addEventListener('emptied', clean, { once: true });
    } catch {
      /* Visual analysis must never break existing playback. */
    }
  };
  audio.addEventListener('playing', start, { once: true });
}
const samples = new Float32Array(256);
export function speechAmplitude() {
  let peak = 0;
  for (const { audio, analyser } of analysers) {
    if (audio.paused) continue;
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const x of samples) energy += x * x;
    peak = Math.max(peak, Math.sqrt(energy / samples.length));
  }
  return Math.min(1, peak * 8);
}
export function ambient(on: boolean, place = 'hub') {
  const c = ctx();
  if (!c) return;
  if (!master) {
    master = c.createGain();
    master.gain.value = 0;
    master.connect(c.destination);
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = 'sine';
      g.gain.value = 0.045 / (i + 1);
      o.connect(g);
      g.connect(master);
      o.start();
      oscillators.push(o);
    }
  }
  void c.resume();
  const root =
    (
      {
        hub: 130.81,
        neural: 146.83,
        rocket: 110,
        attention: 164.81,
        traffic: 174.61,
        relativity: 98,
      } as Record<string, number>
    )[place] ?? 130.81;
  oscillators.forEach((o, i) =>
    o.frequency.setTargetAtTime(root * [1, 1.5, 2][i], c.currentTime, 0.8),
  );
  master.gain.setTargetAtTime(on ? 0.15 : 0, c.currentTime, 0.2);
}
export function chime() {
  const c = ctx();
  if (!c) return;
  const o = c.createOscillator(),
    g = c.createGain();
  o.type = 'sine';
  o.frequency.value = 660;
  g.gain.setValueAtTime(0.014, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.28);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.3);
}
export function stopAmbience() {
  if (context && master)
    master.gain.setTargetAtTime(0, context.currentTime, 0.1);
}
