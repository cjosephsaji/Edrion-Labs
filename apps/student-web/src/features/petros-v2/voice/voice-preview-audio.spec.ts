import { describe, expect, it } from 'vitest';
import {
  encodeVoicePreviewWav,
  voicePreviewBase64,
} from './voice-preview-audio';

describe('canonical bounded public recording', () => {
  it('exports a stereo browser buffer as canonical mono 16 kHz PCM16 with accurate duration', () => {
    const wav = encodeVoicePreviewWav(
        [
          new Float32Array(48000).fill(0.5),
          new Float32Array(48000).fill(-0.25),
        ],
        48000,
      ),
      view = new DataView(wav);
    expect(wav.byteLength).toBe(32044);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(32000);
    expect(view.getInt16(44, true)).toBe(4096);
    expect(atob(voicePreviewBase64(wav)).slice(0, 4)).toBe('RIFF');
  });
  it('clips amplitudes, rejects empty and mismatched channels, and bounds decoding input', () => {
    const wav = encodeVoicePreviewWav([new Float32Array([2, -2, NaN])], 16000),
      view = new DataView(wav);
    expect([
      view.getInt16(44, true),
      view.getInt16(46, true),
      view.getInt16(48, true),
    ]).toEqual([32767, -32768, 0]);
    expect(() => encodeVoicePreviewWav([], 16000)).toThrow('empty');
    expect(() =>
      encodeVoicePreviewWav([new Float32Array(4), new Float32Array(5)], 16000),
    ).toThrow('30 seconds');
    expect(() =>
      encodeVoicePreviewWav([new Float32Array(16000 * 31)], 16000),
    ).toThrow('30 seconds');
  });
});
