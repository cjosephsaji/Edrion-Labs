/** Canonical mono PCM16 WAV. The server independently verifies its duration and
 * byte size before reserving spend; client-declared duration is not authority. */
export function encodeVoicePreviewWav(
  channels: readonly Float32Array[],
  sourceRate: number,
): ArrayBuffer {
  if (
    !channels.length ||
    !channels[0]?.length ||
    !Number.isFinite(sourceRate) ||
    sourceRate < 8000
  )
    throw new Error(
      'The recording is empty or unsupported. Type your question instead.',
    );
  const sampleRate = 16000;
  const frames = channels[0].length;
  if (
    frames / sourceRate > 30.1 ||
    channels.some((channel) => channel.length !== frames)
  )
    throw new Error('Record up to 30 seconds at a time.');
  const length = Math.floor((frames * sampleRate) / sourceRate);
  if (!length)
    throw new Error('The recording is empty. Try speaking a little longer.');
  const buffer = new ArrayBuffer(44 + length * 2),
    view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const position = (i * sourceRate) / sampleRate,
      left = Math.floor(position),
      right = Math.min(frames - 1, left + 1),
      mix = position - left;
    const amplitude =
      channels.reduce(
        (sum, channel) =>
          sum +
          (Number.isFinite(channel[left]) ? channel[left]! : 0) * (1 - mix) +
          (Number.isFinite(channel[right]) ? channel[right]! : 0) * mix,
        0,
      ) / channels.length;
    const clipped = Math.min(
      1,
      Math.max(-1, Number.isFinite(amplitude) ? amplitude : 0),
    );
    view.setInt16(
      44 + i * 2,
      Math.round(clipped * (clipped < 0 ? 32768 : 32767)),
      true,
    );
  }
  return buffer;
}

export function voicePreviewBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

export async function prepareVoicePreviewRecording(
  blob: Blob,
  maxBytes: number,
  maxSeconds: number,
) {
  if (!blob.size)
    throw new Error(
      'The recording is empty. Check your microphone or type your question.',
    );
  if (typeof AudioContext === 'undefined')
    throw new Error(
      'This browser cannot prepare a safe voice preview recording. Type your question instead.',
    );
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frameLimit = Math.floor(decoded.sampleRate * maxSeconds);
    const wav = encodeVoicePreviewWav(
      Array.from({ length: decoded.numberOfChannels }, (_, index) =>
        decoded.getChannelData(index).subarray(0, frameLimit),
      ),
      decoded.sampleRate,
    );
    if (wav.byteLength > maxBytes)
      throw new Error('The recording is too large. Record a shorter question.');
    return {
      dataBase64: voicePreviewBase64(wav),
      mimeType: 'audio/wav' as const,
    };
  } finally {
    await context.close();
  }
}
