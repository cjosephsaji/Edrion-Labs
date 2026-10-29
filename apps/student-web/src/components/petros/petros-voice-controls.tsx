import type { usePetrosVoice } from './use-petros-voice';
import { petrosStatus } from './petros-speech-cloud';

export function PetrosVoiceControls({ voice, paused = false }: { voice: ReturnType<typeof usePetrosVoice>; paused?: boolean }) {
  return <div data-petros-voice-controls><p role="status">{petrosStatus({ recording: voice.listening, transcribing: voice.transcribing,
    preparing: voice.preparing, speaking: voice.speaking, paused, questionReady: !paused })}</p>
    <details><summary>Speech voice</summary>
    <label>Speaking voice<select aria-label="Speaking voice" value={voice.selectedVoice} disabled={voice.voiceOptions?.state !== 'ready'} onChange={event => voice.selectVoice(event.target.value)}>
      {!voice.voiceOptions?.voices.includes(voice.selectedVoice) && <option value={voice.selectedVoice} disabled>{voice.selectedVoice} — unavailable</option>}
      {voice.voiceOptions?.voices.map(name => <option key={name} value={name}>{name}</option>)}
    </select></label>
    {voice.selectionReason && <p role="status">{voice.selectionReason}</p>}
    {voice.voiceOptions?.modelKey && <p>Available: {voice.voiceOptions.providerKey} / {voice.voiceOptions.modelKey}</p>}
    {voice.receipt && <p>Last generated audio: {voice.receipt.effective.voice} / {voice.receipt.effective.modelKey} / {voice.receipt.effective.providerKey}</p>}
  </details></div>;
}
