import { useEffect, useState } from 'react';
/** RMS of actual decoded samples at the media owner's playback position. */
export function decodedAmplitude(
  channels: readonly Float32Array[],
  sampleRate: number,
  seconds: number,
) {
  if (
    !channels.length ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0
  )
    return 0;
  const start = Math.floor(seconds * sampleRate),
    end = Math.min(channels[0]!.length, start + Math.floor(sampleRate * 0.04));
  if (end <= start) return 0;
  let sum = 0,
    count = 0;
  for (const channel of channels)
    for (let i = start; i < end; i++) {
      const value = channel[i] ?? 0;
      if (Number.isFinite(value)) {
        sum += value * value;
        count++;
      }
    }
  return count ? Math.sqrt(sum / count) : 0;
}
/** Passive analysis only; never creates another player or reroutes the audio output. */
export function useAmplitudeMouth(
  audio: HTMLAudioElement | null | undefined,
  playing: boolean,
  reduced: boolean,
) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    setLevel(0);
    if (!audio || !playing || reduced || typeof AudioContext === 'undefined') return;
    const url = audio.currentSrc || audio.src;
    if (
      !url.startsWith('blob:') &&
      !(
        new URL(url, location.href).origin === location.origin &&
        new URL(url, location.href).pathname.startsWith('/petros/audio/')
      )
    )
      return;
    let live = true,
      timer: ReturnType<typeof setTimeout> | undefined,
      previous = 0;
    const abort = new AbortController();
    const context = new AudioContext();
    void (async () => {
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 16 * 1024 * 1024) return;
        const decoded = await context.decodeAudioData(bytes);
        const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
          decoded.getChannelData(i),
        );
        const sample = () => {
          if (!live) return;
          const rms =
            audio.paused || audio.ended
              ? 0
              : decodedAmplitude(channels, decoded.sampleRate, audio.currentTime);
          previous = rms === 0 ? 0 : previous * 0.35 + rms * 0.65;
          setLevel(previous);
          timer = setTimeout(sample, 80);
        };
        sample();
      } catch {
        /* Missing analysis leaves a closed mouth and uninterrupted audio. */
      } finally {
        await context.close();
      }
    })();
    return () => {
      live = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [audio, playing, reduced]);
  return playing && !reduced ? level : 0;
}
